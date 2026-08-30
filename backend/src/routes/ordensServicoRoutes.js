const express = require("express");
const authFirebase = require("../middlewares/authFirebase");
const { FieldValue, getDb } = require("../firebaseAdmin");
const { normalizarRoleEmpresa } = require("../utils/perfisEmpresa");

const router = express.Router();

const SEGMENTO_OFICINA = "oficina";
const PERFIS_ESCRITA_ORDENS_SERVICO = new Set([
  "administrador_empresa",
  "comercial",
  "producao",
]);

const criarErroHttp = (statusCode, message, codigo = null) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.codigo = codigo;
  return error;
};

const normalizarId = (valor) => {
  if (typeof valor !== "string") return "";
  return valor.trim();
};

const validarIdFirestore = (nomeCampo, valor) => {
  const id = normalizarId(valor);

  if (!id || id.includes("/")) {
    throw criarErroHttp(400, `${nomeCampo} invalido.`, "parametro_invalido");
  }

  return id;
};

const normalizarTexto = (valor) => String(valor || "").trim();

const validarObjeto = (valor) =>
  valor && typeof valor === "object" && !Array.isArray(valor);

const normalizarNumeroOS = (numero) =>
  `OS-${String(numero).padStart(4, "0")}`;

const obterTimestampServidor = () => FieldValue.serverTimestamp();

const validarPayloadCriacaoOrdem = (body) => {
  if (!validarObjeto(body)) {
    throw criarErroHttp(400, "Requisicao invalida.", "payload_invalido");
  }

  const empresaId = validarIdFirestore("empresaId", body.empresaId);
  const ordem = validarObjeto(body.ordem) ? body.ordem : {};

  if (!normalizarTexto(ordem.clienteId)) {
    throw criarErroHttp(400, "Cliente invalido.", "cliente_invalido");
  }

  if (!normalizarTexto(ordem.veiculoId)) {
    throw criarErroHttp(400, "Veiculo invalido.", "veiculo_invalido");
  }

  if (!normalizarTexto(ordem.defeitoRelatado)) {
    throw criarErroHttp(400, "Informe o defeito relatado.", "defeito_invalido");
  }

  return {
    empresaId,
    ordem,
  };
};

const sanitizarDadosOrdem = (ordem) => {
  const dados = { ...ordem };

  delete dados.id;
  delete dados.numero;
  delete dados.ownerUid;
  delete dados.empresaId;
  delete dados.criadoEm;
  delete dados.atualizadoEm;
  delete dados.encerradoEm;
  delete dados.encerradoPor;

  return dados;
};

const snapshotExiste = (snapshot) => Boolean(snapshot && snapshot.exists);

const dadosSnapshot = (snapshot) =>
  snapshotExiste(snapshot) ? snapshot.data() || {} : {};

const escolherVinculoAcesso = ({ empresaUsuarioSnapshot, usuarioPorAuthSnapshot }) => {
  const empresaUsuario = dadosSnapshot(empresaUsuarioSnapshot);
  const usuarioPorAuth = dadosSnapshot(usuarioPorAuthSnapshot);

  if (snapshotExiste(usuarioPorAuthSnapshot) && normalizarId(usuarioPorAuth.ownerUid)) {
    return usuarioPorAuth;
  }

  if (snapshotExiste(empresaUsuarioSnapshot)) {
    return empresaUsuario;
  }

  return null;
};

const usuarioAtivoPodeEscreverOrdens = ({ atorUid, ownerUid, atorData, vinculoUsuarioEmpresa }) => {
  if (atorUid === ownerUid) return true;
  if (atorData?.role === "admin_master") return true;

  const status = normalizarTexto(vinculoUsuarioEmpresa?.status).toLowerCase();
  const uidAuth = normalizarId(vinculoUsuarioEmpresa?.uidAuth);
  const role = normalizarRoleEmpresa(vinculoUsuarioEmpresa);

  return uidAuth === atorUid &&
    status === "ativo" &&
    PERFIS_ESCRITA_ORDENS_SERVICO.has(role);
};

const montarRespostaErro = (res, error) => {
  const statusCode = error.statusCode || 500;

  res.status(statusCode).json({
    ok: false,
    error: error.message || "Erro interno.",
    codigo: error.codigo || "erro_interno",
  });
};

const criarHandlerCriarOrdemServico = ({
  getDb: getDbDependencia = getDb,
  criarTimestampServidor = obterTimestampServidor,
} = {}) => async (req, res) => {
  const atorUid = normalizarId(req.user?.uid);

  if (!atorUid) {
    res.status(401).json({
      ok: false,
      error: "Token Firebase nao informado.",
      codigo: "token_ausente",
    });
    return;
  }

  let payload;

  try {
    payload = validarPayloadCriacaoOrdem(req.body);
  } catch (error) {
    montarRespostaErro(res, error);
    return;
  }

  const db = getDbDependencia();

  try {
    const resultado = await db.runTransaction(async (transaction) => {
      const atorRef = db.collection("users").doc(atorUid);
      const empresaUsuarioRef = atorRef.collection("empresas").doc(payload.empresaId);
      const usuarioPorAuthRef = db
        .collection("usuariosPorAuth")
        .doc(atorUid)
        .collection("empresas")
        .doc(payload.empresaId);

      const atorSnapshot = await transaction.get(atorRef);
      const empresaUsuarioSnapshot = await transaction.get(empresaUsuarioRef);
      const usuarioPorAuthSnapshot = await transaction.get(usuarioPorAuthRef);
      const atorData = dadosSnapshot(atorSnapshot);
      const vinculoAcesso = escolherVinculoAcesso({
        empresaUsuarioSnapshot,
        usuarioPorAuthSnapshot,
      });
      const ownerUid = normalizarId(vinculoAcesso?.ownerUid) || atorUid;
      const empresaRef = db.collection("users").doc(ownerUid).collection("empresas").doc(payload.empresaId);
      const empresaSnapshot =
        ownerUid === atorUid && empresaRef.path === empresaUsuarioRef.path
          ? empresaUsuarioSnapshot
          : await transaction.get(empresaRef);

      if (!snapshotExiste(empresaSnapshot)) {
        throw criarErroHttp(404, "Empresa nao encontrada.", "empresa_nao_encontrada");
      }

      const empresa = dadosSnapshot(empresaSnapshot);

      if (empresa.ownerUid && empresa.ownerUid !== ownerUid) {
        throw criarErroHttp(403, "Empresa nao pertence ao owner resolvido.", "owner_divergente");
      }

      if (empresa.segmento !== SEGMENTO_OFICINA) {
        throw criarErroHttp(403, "Ordens de servico disponiveis somente para oficina.", "segmento_invalido");
      }

      const usuarioEmpresaId = normalizarId(vinculoAcesso?.usuarioEmpresaId) || atorUid;
      const usuarioEmpresaRef = empresaRef.collection("usuariosEmpresa").doc(usuarioEmpresaId);
      const controleRef = empresaRef.collection("controles").doc("ordensServico");
      const usuarioEmpresaSnapshot = await transaction.get(usuarioEmpresaRef);
      const controleSnapshot = await transaction.get(controleRef);
      const vinculoUsuarioEmpresa = dadosSnapshot(usuarioEmpresaSnapshot);

      if (
        atorUid !== ownerUid &&
        atorData?.role !== "admin_master" &&
        !snapshotExiste(usuarioEmpresaSnapshot)
      ) {
        throw criarErroHttp(403, "Usuario sem vinculo ativo com a empresa.", "sem_vinculo_ativo");
      }

      if (!usuarioAtivoPodeEscreverOrdens({
        atorUid,
        ownerUid,
        atorData,
        vinculoUsuarioEmpresa,
      })) {
        throw criarErroHttp(403, "Voce nao tem permissao para criar ordens de servico.", "sem_permissao");
      }

      const controle = dadosSnapshot(controleSnapshot);
      const ultimoNumero = Number.isInteger(controle.ultimoNumero) && controle.ultimoNumero >= 0
        ? controle.ultimoNumero
        : 0;
      const proximoNumero = ultimoNumero + 1;
      const numero = normalizarNumeroOS(proximoNumero);
      const ordemRef = empresaRef.collection("ordensServico").doc();
      const timestamp = criarTimestampServidor();
      const dadosOrdem = {
        ...sanitizarDadosOrdem(payload.ordem),
        numero,
        status: "aberta",
        criadoEm: timestamp,
        atualizadoEm: timestamp,
      };

      transaction.create(ordemRef, dadosOrdem);
      transaction.set(
        controleRef,
        {
          ultimoNumero: proximoNumero,
          atualizadoEm: timestamp,
        },
        { merge: true }
      );

      return {
        id: ordemRef.id,
        numero,
        ultimoNumero: proximoNumero,
      };
    });

    res.status(201).json({
      ok: true,
      ordemServicoId: resultado.id,
      numero: resultado.numero,
      ultimoNumero: resultado.ultimoNumero,
    });
  } catch (error) {
    console.error("Erro ao criar ordem de servico", {
      atorUid,
      empresaId: payload.empresaId,
      statusCode: error.statusCode || 500,
      codigo: error.codigo || null,
    });
    montarRespostaErro(res, error);
  }
};

router.post("/", authFirebase, criarHandlerCriarOrdemServico());

module.exports = router;
module.exports.criarHandlerCriarOrdemServico = criarHandlerCriarOrdemServico;
module.exports._internals = {
  normalizarNumeroOS,
  validarPayloadCriacaoOrdem,
};
