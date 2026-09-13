const express = require("express");
const authFirebase = require("../middlewares/authFirebase");
const { FieldValue, getDb } = require("../firebaseAdmin");
const {
  criarFaturamentoVenda,
  validarPreparacaoFaturamento,
} = require("../shared/faturamento.cjs");
const { normalizarRoleEmpresa } = require("../utils/perfisEmpresa");

const router = express.Router();

const SEGMENTO_EMPRESA_PADRAO = "industria";
const SEGMENTOS_EMPRESA_VALIDOS = new Set([
  "comercio",
  "industria",
  "oficina",
  "clientes",
]);
const ROLES_PREPARACAO_FATURAMENTO = new Set([
  "administrador_empresa",
  "financeiro",
  "comercial",
]);
const ROLES_CANCELAMENTO_FATURAMENTO = new Set([
  "administrador_empresa",
  "financeiro",
]);
const VERSAO_PREPARACAO = 1;
const LIMITE_MOTIVO_CANCELAMENTO = 240;

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

const validarPayloadCriacaoFaturamento = (body) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw criarErroHttp(400, "Requisicao invalida.", "payload_invalido");
  }

  return {
    empresaId: validarIdFirestore("empresaId", body.empresaId),
    vendaId: validarIdFirestore("vendaId", body.vendaId),
  };
};

const sanitizarMotivoCancelamento = (motivo) => {
  if (motivo === null || motivo === undefined) return "";
  if (typeof motivo !== "string") {
    throw criarErroHttp(400, "Motivo de cancelamento invalido.", "motivo_invalido");
  }

  const motivoTratado = motivo.replace(/\s+/g, " ").trim();

  if (motivoTratado.length > LIMITE_MOTIVO_CANCELAMENTO) {
    throw criarErroHttp(400, "Motivo de cancelamento muito longo.", "motivo_invalido");
  }

  return motivoTratado;
};

const validarPayloadOperacaoFaturamento = ({ params = {}, body = {} } = {}) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw criarErroHttp(400, "Requisicao invalida.", "payload_invalido");
  }

  return {
    empresaId: validarIdFirestore("empresaId", body.empresaId),
    faturamentoId: validarIdFirestore("faturamentoId", params.faturamentoId),
    motivoCancelamento: sanitizarMotivoCancelamento(body.motivoCancelamento),
  };
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

const normalizarSegmentoEmpresa = (segmento) => {
  const segmentoTratado = String(segmento || "").trim().toLowerCase();
  return SEGMENTOS_EMPRESA_VALIDOS.has(segmentoTratado)
    ? segmentoTratado
    : SEGMENTO_EMPRESA_PADRAO;
};

const usuarioAtivoPodePrepararFaturamento = ({
  atorUid,
  ownerUid,
  atorData,
  vinculoUsuarioEmpresa,
}) => {
  if (atorUid === ownerUid) return true;
  if (atorData?.role === "admin_master") return true;

  const uidAuth = normalizarId(vinculoUsuarioEmpresa?.uidAuth);
  const status = String(vinculoUsuarioEmpresa?.status || "").trim().toLowerCase();
  const role = normalizarRoleEmpresa(vinculoUsuarioEmpresa);

  return uidAuth === atorUid &&
    status === "ativo" &&
    ROLES_PREPARACAO_FATURAMENTO.has(role);
};

const usuarioAtivoPodeCancelarFaturamento = ({
  atorUid,
  ownerUid,
  atorData,
  vinculoUsuarioEmpresa,
}) => {
  if (atorUid === ownerUid) return true;
  if (atorData?.role === "admin_master") return true;

  const uidAuth = normalizarId(vinculoUsuarioEmpresa?.uidAuth);
  const status = String(vinculoUsuarioEmpresa?.status || "").trim().toLowerCase();
  const role = normalizarRoleEmpresa(vinculoUsuarioEmpresa);

  return uidAuth === atorUid &&
    status === "ativo" &&
    ROLES_CANCELAMENTO_FATURAMENTO.has(role);
};

const vendaEstaCancelada = (venda = {}) => {
  const statusPagamento = String(venda.statusPagamento || "").trim().toLowerCase();
  const statusExpedicao = String(venda.statusExpedicao || "").trim().toLowerCase();

  return statusPagamento === "cancelado" || statusExpedicao === "cancelado";
};

const validarVendaFaturavel = (venda = {}) => {
  if (vendaEstaCancelada(venda)) {
    throw criarErroHttp(
      409,
      "Venda cancelada nao pode gerar faturamento.",
      "venda_cancelada"
    );
  }

  if (!Array.isArray(venda.itens) || venda.itens.length === 0) {
    throw criarErroHttp(
      409,
      "Venda sem itens nao pode gerar faturamento.",
      "venda_sem_itens"
    );
  }
};

const criarIdFaturamento = ({ vendaId }) =>
  `venda_${vendaId}_preparacao_v${VERSAO_PREPARACAO}`;

const criarIdempotencyKey = ({ empresaId, tipoOrigem, vendaId }) =>
  `${empresaId}:${tipoOrigem}:${vendaId}:preparacao:v${VERSAO_PREPARACAO}`;

const resolverAcessoEmpresa = async ({ db, transaction, atorUid, empresaId }) => {
  const atorRef = db.collection("users").doc(atorUid);
  const empresaUsuarioRef = atorRef.collection("empresas").doc(empresaId);
  const usuarioPorAuthRef = db
    .collection("usuariosPorAuth")
    .doc(atorUid)
    .collection("empresas")
    .doc(empresaId);

  const atorSnapshot = await transaction.get(atorRef);
  const empresaUsuarioSnapshot = await transaction.get(empresaUsuarioRef);
  const usuarioPorAuthSnapshot = await transaction.get(usuarioPorAuthRef);
  const atorData = dadosSnapshot(atorSnapshot);
  const vinculoAcesso = escolherVinculoAcesso({
    empresaUsuarioSnapshot,
    usuarioPorAuthSnapshot,
  });
  const ownerUid = normalizarId(vinculoAcesso?.ownerUid) || atorUid;
  const empresaRef = db.collection("users").doc(ownerUid).collection("empresas").doc(empresaId);
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

  const usuarioEmpresaId = normalizarId(vinculoAcesso?.usuarioEmpresaId) || atorUid;
  const usuarioEmpresaRef = empresaRef.collection("usuariosEmpresa").doc(usuarioEmpresaId);
  const usuarioEmpresaSnapshot = await transaction.get(usuarioEmpresaRef);
  const vinculoUsuarioEmpresa = dadosSnapshot(usuarioEmpresaSnapshot);

  if (
    atorUid !== ownerUid &&
    atorData?.role !== "admin_master" &&
    !snapshotExiste(usuarioEmpresaSnapshot)
  ) {
    throw criarErroHttp(403, "Usuario sem vinculo ativo com a empresa.", "sem_vinculo_ativo");
  }

  return {
    atorData,
    ownerUid,
    empresaRef,
    empresa,
    vinculoUsuarioEmpresa,
  };
};

const montarRespostaErro = (res, error) => {
  const statusCode = error.statusCode || 500;

  res.status(statusCode).json({
    ok: false,
    error: error.message || "Erro interno.",
    codigo: error.codigo || "erro_interno",
  });
};

const criarHandlerCriarFaturamento = ({
  getDb: getDbDependencia = getDb,
  criarTimestampServidor = () => FieldValue.serverTimestamp(),
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
    payload = validarPayloadCriacaoFaturamento(req.body);
  } catch (error) {
    montarRespostaErro(res, error);
    return;
  }

  const db = getDbDependencia();

  try {
    const resultado = await db.runTransaction(async (transaction) => {
      const {
        atorData,
        ownerUid,
        empresaRef,
        empresa,
        vinculoUsuarioEmpresa,
      } = await resolverAcessoEmpresa({
        db,
        transaction,
        atorUid,
        empresaId: payload.empresaId,
      });
      const vendaRef = empresaRef.collection("vendas").doc(payload.vendaId);
      const faturamentoRef = empresaRef
        .collection("faturamentos")
        .doc(criarIdFaturamento({ vendaId: payload.vendaId }));
      const vendaSnapshot = await transaction.get(vendaRef);
      const faturamentoSnapshot = await transaction.get(faturamentoRef);

      if (!usuarioAtivoPodePrepararFaturamento({
        atorUid,
        ownerUid,
        atorData,
        vinculoUsuarioEmpresa,
      })) {
        throw criarErroHttp(
          403,
          "Voce nao tem permissao para preparar faturamento.",
          "sem_permissao"
        );
      }

      if (!snapshotExiste(vendaSnapshot)) {
        throw criarErroHttp(404, "Venda nao encontrada.", "venda_nao_encontrada");
      }

      if (snapshotExiste(faturamentoSnapshot)) {
        const faturamentoExistente = dadosSnapshot(faturamentoSnapshot);

        return {
          faturamentoId: faturamentoRef.id,
          status: faturamentoExistente.status || "rascunho",
          reutilizado: true,
        };
      }

      const venda = {
        id: vendaSnapshot.id,
        ...dadosSnapshot(vendaSnapshot),
      };

      validarVendaFaturavel(venda);

      const segmento = normalizarSegmentoEmpresa(empresa.segmento);
      const faturamentoCore = criarFaturamentoVenda({ venda, segmento });
      const idempotencyKey = criarIdempotencyKey({
        empresaId: payload.empresaId,
        tipoOrigem: faturamentoCore.origem.tipo,
        vendaId: payload.vendaId,
      });
      const timestamp = criarTimestampServidor();
      const dadosFaturamento = {
        ...faturamentoCore,
        idempotencyKey,
        criadoEm: timestamp,
        atualizadoEm: timestamp,
        criadoPor: atorUid,
        persistencia: {
          versao: 1,
          versaoPreparacao: VERSAO_PREPARACAO,
        },
      };

      transaction.create(faturamentoRef, dadosFaturamento);

      return {
        faturamentoId: faturamentoRef.id,
        status: dadosFaturamento.status,
        reutilizado: false,
      };
    });

    res.status(resultado.reutilizado ? 200 : 201).json({
      ok: true,
      faturamentoId: resultado.faturamentoId,
      status: resultado.status,
      reutilizado: resultado.reutilizado,
    });
  } catch (error) {
    console.error("Erro ao criar faturamento", {
      atorUid,
      empresaId: payload.empresaId,
      vendaId: payload.vendaId,
      statusCode: error.statusCode || 500,
      codigo: error.codigo || null,
    });
    montarRespostaErro(res, error);
  }
};

const criarHandlerPrepararFaturamento = ({
  getDb: getDbDependencia = getDb,
  criarTimestampServidor = () => FieldValue.serverTimestamp(),
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
    payload = validarPayloadOperacaoFaturamento({
      params: req.params,
      body: req.body,
    });
  } catch (error) {
    montarRespostaErro(res, error);
    return;
  }

  const db = getDbDependencia();

  try {
    const resultado = await db.runTransaction(async (transaction) => {
      const {
        atorData,
        ownerUid,
        empresaRef,
        vinculoUsuarioEmpresa,
      } = await resolverAcessoEmpresa({
        db,
        transaction,
        atorUid,
        empresaId: payload.empresaId,
      });
      const faturamentoRef = empresaRef.collection("faturamentos").doc(payload.faturamentoId);
      const faturamentoSnapshot = await transaction.get(faturamentoRef);

      if (!usuarioAtivoPodePrepararFaturamento({
        atorUid,
        ownerUid,
        atorData,
        vinculoUsuarioEmpresa,
      })) {
        throw criarErroHttp(
          403,
          "Voce nao tem permissao para preparar faturamento.",
          "sem_permissao"
        );
      }

      if (!snapshotExiste(faturamentoSnapshot)) {
        throw criarErroHttp(404, "Faturamento nao encontrado.", "faturamento_nao_encontrado");
      }

      const faturamento = dadosSnapshot(faturamentoSnapshot);
      const statusAtual = String(faturamento.status || "rascunho").trim().toLowerCase();

      if (statusAtual === "preparado") {
        return {
          faturamentoId: faturamentoRef.id,
          status: "preparado",
          reutilizado: true,
        };
      }

      if (statusAtual === "cancelado") {
        throw criarErroHttp(
          409,
          "Faturamento cancelado nao pode ser preparado.",
          "faturamento_cancelado"
        );
      }

      if (statusAtual !== "rascunho") {
        throw criarErroHttp(
          409,
          "Status do faturamento nao permite preparacao.",
          "status_invalido"
        );
      }

      const validacao = validarPreparacaoFaturamento(faturamento);

      if (!validacao.valido) {
        return {
          bloqueado: true,
          faturamentoId: faturamentoRef.id,
          status: "rascunho",
          pendencias: validacao.pendencias,
        };
      }

      const timestamp = criarTimestampServidor();

      transaction.update(faturamentoRef, {
        status: "preparado",
        pendencias: validacao.pendencias,
        preparadoEm: timestamp,
        preparadoPor: atorUid,
        atualizadoEm: timestamp,
      });

      return {
        faturamentoId: faturamentoRef.id,
        status: "preparado",
        reutilizado: false,
      };
    });

    if (resultado.bloqueado) {
      res.status(409).json({
        ok: false,
        error: "Faturamento possui pendencias para preparacao.",
        codigo: "faturamento_com_pendencias",
        faturamentoId: resultado.faturamentoId,
        status: resultado.status,
        pendencias: resultado.pendencias,
      });
      return;
    }

    res.status(200).json({
      ok: true,
      faturamentoId: resultado.faturamentoId,
      status: resultado.status,
      reutilizado: resultado.reutilizado,
    });
  } catch (error) {
    console.error("Erro ao preparar faturamento", {
      atorUid,
      empresaId: payload?.empresaId,
      faturamentoId: payload?.faturamentoId,
      statusCode: error.statusCode || 500,
      codigo: error.codigo || null,
    });
    montarRespostaErro(res, error);
  }
};

const criarHandlerCancelarFaturamento = ({
  getDb: getDbDependencia = getDb,
  criarTimestampServidor = () => FieldValue.serverTimestamp(),
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
    payload = validarPayloadOperacaoFaturamento({
      params: req.params,
      body: req.body,
    });
  } catch (error) {
    montarRespostaErro(res, error);
    return;
  }

  const db = getDbDependencia();

  try {
    const resultado = await db.runTransaction(async (transaction) => {
      const {
        atorData,
        ownerUid,
        empresaRef,
        vinculoUsuarioEmpresa,
      } = await resolverAcessoEmpresa({
        db,
        transaction,
        atorUid,
        empresaId: payload.empresaId,
      });
      const faturamentoRef = empresaRef.collection("faturamentos").doc(payload.faturamentoId);
      const faturamentoSnapshot = await transaction.get(faturamentoRef);

      if (!usuarioAtivoPodeCancelarFaturamento({
        atorUid,
        ownerUid,
        atorData,
        vinculoUsuarioEmpresa,
      })) {
        throw criarErroHttp(
          403,
          "Voce nao tem permissao para cancelar faturamento.",
          "sem_permissao"
        );
      }

      if (!snapshotExiste(faturamentoSnapshot)) {
        throw criarErroHttp(404, "Faturamento nao encontrado.", "faturamento_nao_encontrado");
      }

      const faturamento = dadosSnapshot(faturamentoSnapshot);
      const statusAtual = String(faturamento.status || "rascunho").trim().toLowerCase();

      if (statusAtual === "cancelado") {
        return {
          faturamentoId: faturamentoRef.id,
          status: "cancelado",
          reutilizado: true,
        };
      }

      if (!["rascunho", "preparado"].includes(statusAtual)) {
        throw criarErroHttp(
          409,
          "Status do faturamento nao permite cancelamento.",
          "status_invalido"
        );
      }

      const timestamp = criarTimestampServidor();

      transaction.update(faturamentoRef, {
        status: "cancelado",
        canceladoEm: timestamp,
        canceladoPor: atorUid,
        motivoCancelamento: payload.motivoCancelamento,
        atualizadoEm: timestamp,
      });

      return {
        faturamentoId: faturamentoRef.id,
        status: "cancelado",
        reutilizado: false,
      };
    });

    res.status(200).json({
      ok: true,
      faturamentoId: resultado.faturamentoId,
      status: resultado.status,
      reutilizado: resultado.reutilizado,
    });
  } catch (error) {
    console.error("Erro ao cancelar faturamento", {
      atorUid,
      empresaId: payload?.empresaId,
      faturamentoId: payload?.faturamentoId,
      statusCode: error.statusCode || 500,
      codigo: error.codigo || null,
    });
    montarRespostaErro(res, error);
  }
};

router.post("/", authFirebase, criarHandlerCriarFaturamento());
router.post("/:faturamentoId/preparar", authFirebase, criarHandlerPrepararFaturamento());
router.post("/:faturamentoId/cancelar", authFirebase, criarHandlerCancelarFaturamento());

module.exports = router;
module.exports.criarHandlerCriarFaturamento = criarHandlerCriarFaturamento;
module.exports.criarHandlerPrepararFaturamento = criarHandlerPrepararFaturamento;
module.exports.criarHandlerCancelarFaturamento = criarHandlerCancelarFaturamento;
module.exports._internals = {
  criarIdFaturamento,
  criarIdempotencyKey,
  sanitizarMotivoCancelamento,
  validarPayloadOperacaoFaturamento,
  validarPayloadCriacaoFaturamento,
  vendaEstaCancelada,
};
