const express = require("express");
const authFirebase = require("../middlewares/authFirebase");
const { FieldValue, getDb } = require("../firebaseAdmin");
const {
  classificarTributacaoFaturamento,
  criarContextoOperacionalFaturamento,
  criarFaturamentoVenda,
  ehFaturamentoServico,
  determinarFiscalFaturamento,
  validarPreparacaoFaturamento,
} = require("../shared/faturamento.cjs");
const { normalizarRoleEmpresa } = require("../utils/perfisEmpresa");
const { CATALOGO_IBS_CBS_2025_002_V1_60 } = require("../shared/catalogoTributario.cjs");
const { classificarManualmente } = require("../shared/classificacaoManual.cjs");
const { revisarContextoFiscalServico } = require("../shared/contextoFiscalServico.cjs");
const { CATALOGO_SERVICOS_NFSE_V1_01_20260122 } = require("../shared/catalogoServicos.cjs");
const { normalizarSegmentoEmpresa } = require("../utils/segmentosEmpresa");

const router = express.Router();

const ROLES_PREPARACAO_FATURAMENTO = new Set([
  "administrador_empresa",
  "financeiro",
  "comercial",
]);
const ROLES_LEITURA_FATURAMENTO = new Set([
  "administrador_empresa",
  "financeiro",
  "comercial",
  "visualizacao",
]);
const ROLES_CANCELAMENTO_FATURAMENTO = new Set([
  "administrador_empresa",
  "financeiro",
]);
const ROLES_DETERMINACAO_FISCAL = new Set([
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

const validarQueryListagemFaturamento = (query = {}) => ({
  empresaId: validarIdFirestore("empresaId", query.empresaId),
});

const validarQueryDetalheFaturamento = ({ params = {}, query = {} } = {}) => ({
  empresaId: validarIdFirestore("empresaId", query.empresaId),
  faturamentoId: validarIdFirestore("faturamentoId", params.faturamentoId),
});

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

const validarPayloadFaturamentoMinimo = ({ params = {}, body = {} } = {}) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw criarErroHttp(400, "Requisicao invalida.", "payload_invalido");
  }

  return {
    empresaId: validarIdFirestore("empresaId", body.empresaId),
    faturamentoId: validarIdFirestore("faturamentoId", params.faturamentoId),
  };
};

const validarPayloadContextoOperacionalFaturamento = ({ params = {}, body = {} } = {}) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw criarErroHttp(400, "Requisicao invalida.", "payload_invalido");
  }

  return {
    empresaId: validarIdFirestore("empresaId", body.empresaId),
    faturamentoId: validarIdFirestore("faturamentoId", params.faturamentoId),
    dadosContexto: body,
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

const usuarioAtivoPodeLerFaturamento = ({
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
    ROLES_LEITURA_FATURAMENTO.has(role);
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

const usuarioAtivoPodeDeterminarFiscal = ({
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
    ROLES_DETERMINACAO_FISCAL.has(role);
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

const criarIdFaturamentoAtendimento = (agendamentoId) =>
  `atendimento_${agendamentoId}_preparacao_v${VERSAO_PREPARACAO}`;

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

const obterMillisOrdenacao = (valor) => {
  if (!valor) return 0;
  if (typeof valor.toMillis === "function") return valor.toMillis();
  if (valor instanceof Date) return valor.getTime();

  const data = Date.parse(valor);
  return Number.isFinite(data) ? data : 0;
};

const ordenarFaturamentosRecentes = (a = {}, b = {}) => {
  const dataA = obterMillisOrdenacao(
    a.contextoFiscal?.operacao?.dataOperacao || a.criadoEm || a.atualizadoEm
  );
  const dataB = obterMillisOrdenacao(
    b.contextoFiscal?.operacao?.dataOperacao || b.criadoEm || b.atualizadoEm
  );

  if (dataA !== dataB) return dataB - dataA;
  return String(b.id || "").localeCompare(String(a.id || ""));
};

const listarFaturamentosEmpresa = async (empresaRef) => {
  const snapshot = await empresaRef.collection("faturamentos").get();

  return snapshot.docs
    .map((docSnapshot) => ({
      id: docSnapshot.id,
      ...dadosSnapshot(docSnapshot),
    }))
    .sort(ordenarFaturamentosRecentes);
};

const criarHandlerListarFaturamentos = ({
  getDb: getDbDependencia = getDb,
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
    payload = validarQueryListagemFaturamento(req.query);
  } catch (error) {
    montarRespostaErro(res, error);
    return;
  }

  const db = getDbDependencia();

  try {
    const acesso = await db.runTransaction(async (transaction) => {
      const dadosAcesso = await resolverAcessoEmpresa({
        db,
        transaction,
        atorUid,
        empresaId: payload.empresaId,
      });

      if (!usuarioAtivoPodeLerFaturamento({
        atorUid,
        ownerUid: dadosAcesso.ownerUid,
        atorData: dadosAcesso.atorData,
        vinculoUsuarioEmpresa: dadosAcesso.vinculoUsuarioEmpresa,
      })) {
        throw criarErroHttp(
          403,
          "Voce nao tem permissao para acessar faturamentos.",
          "sem_permissao"
        );
      }

      return {
        empresaRef: dadosAcesso.empresaRef,
      };
    });
    const faturamentos = await listarFaturamentosEmpresa(acesso.empresaRef);

    res.status(200).json({
      ok: true,
      faturamentos,
    });
  } catch (error) {
    console.error("Erro ao listar faturamentos", {
      atorUid,
      empresaId: payload?.empresaId,
      statusCode: error.statusCode || 500,
      codigo: error.codigo || null,
    });
    montarRespostaErro(res, error);
  }
};

const criarHandlerObterFaturamento = ({
  getDb: getDbDependencia = getDb,
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
    payload = validarQueryDetalheFaturamento({
      params: req.params,
      query: req.query,
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

      if (!usuarioAtivoPodeLerFaturamento({
        atorUid,
        ownerUid,
        atorData,
        vinculoUsuarioEmpresa,
      })) {
        throw criarErroHttp(
          403,
          "Voce nao tem permissao para acessar faturamentos.",
          "sem_permissao"
        );
      }

      if (!snapshotExiste(faturamentoSnapshot)) {
        throw criarErroHttp(404, "Faturamento nao encontrado.", "faturamento_nao_encontrado");
      }

      return {
        id: faturamentoSnapshot.id,
        ...dadosSnapshot(faturamentoSnapshot),
      };
    });

    res.status(200).json({
      ok: true,
      faturamento: resultado,
    });
  } catch (error) {
    console.error("Erro ao obter faturamento", {
      atorUid,
      empresaId: payload?.empresaId,
      faturamentoId: payload?.faturamentoId,
      statusCode: error.statusCode || 500,
      codigo: error.codigo || null,
    });
    montarRespostaErro(res, error);
  }
};

const criarHandlerCriarFaturamentoAtendimento = () => async (req, res) => {
  const atorUid = normalizarId(req.user?.uid);
  if (!atorUid) return res.status(401).json({ ok: false, codigo: "token_ausente" });
  return res.status(410).json({
    ok: false,
    error: "Faturamento fiscal de atendimentos foi descontinuado.",
    codigo: "faturamento_atendimento_descontinuado",
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

const criarHandlerSalvarContextoOperacionalFaturamento = ({
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
    payload = validarPayloadContextoOperacionalFaturamento({
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
          "Voce nao tem permissao para preencher contexto fiscal.",
          "sem_permissao"
        );
      }

      if (!snapshotExiste(faturamentoSnapshot)) {
        throw criarErroHttp(404, "Faturamento nao encontrado.", "faturamento_nao_encontrado");
      }

      const faturamento = dadosSnapshot(faturamentoSnapshot);
      const statusAtual = String(faturamento.status || "rascunho").trim().toLowerCase();

      if (statusAtual !== "rascunho") {
        throw criarErroHttp(
          409,
          "Status do faturamento nao permite alterar contexto fiscal.",
          "status_invalido"
        );
      }

      if (ehFaturamentoServico(faturamento)) {
        throw criarErroHttp(409, "Contexto fiscal de servico ainda nao disponivel.", "servico_aguarda_contexto");
      }

      let operacao;

      try {
        operacao = criarContextoOperacionalFaturamento({
          faturamento,
          payload: payload.dadosContexto,
        });
      } catch (error) {
        throw criarErroHttp(
          400,
          error.message || "Contexto fiscal operacional invalido.",
          error.codigo || "contexto_operacional_invalido"
        );
      }

      const timestamp = criarTimestampServidor();

      transaction.update(faturamentoRef, {
        "contextoFiscal.operacao": operacao,
        contextoOperacionalAtualizadoEm: timestamp,
        contextoOperacionalAtualizadoPor: atorUid,
        atualizadoEm: timestamp,
      });

      return {
        faturamentoId: faturamentoRef.id,
        status: statusAtual,
        operacao,
      };
    });

    res.status(200).json({
      ok: true,
      faturamentoId: resultado.faturamentoId,
      status: resultado.status,
      contextoFiscal: {
        operacao: resultado.operacao,
      },
    });
  } catch (error) {
    console.error("Erro ao salvar contexto operacional do faturamento", {
      atorUid,
      empresaId: payload?.empresaId,
      faturamentoId: payload?.faturamentoId,
      statusCode: error.statusCode || 500,
      codigo: error.codigo || null,
    });
    montarRespostaErro(res, error);
  }
};

const criarHandlerDeterminarFiscalFaturamento = ({
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
    payload = validarPayloadFaturamentoMinimo({
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

      if (!usuarioAtivoPodeDeterminarFiscal({
        atorUid,
        ownerUid,
        atorData,
        vinculoUsuarioEmpresa,
      })) {
        throw criarErroHttp(
          403,
          "Voce nao tem permissao para determinar fiscalmente o faturamento.",
          "sem_permissao"
        );
      }

      if (!snapshotExiste(faturamentoSnapshot)) {
        throw criarErroHttp(404, "Faturamento nao encontrado.", "faturamento_nao_encontrado");
      }

      const faturamento = dadosSnapshot(faturamentoSnapshot);
      const statusAtual = String(faturamento.status || "rascunho").trim().toLowerCase();

      if (statusAtual !== "rascunho") {
        throw criarErroHttp(
          409,
          "Status do faturamento nao permite determinacao fiscal.",
          "status_invalido"
        );
      }

      if (ehFaturamentoServico(faturamento)) {
        throw criarErroHttp(409, "Determinacao CFOP nao se aplica a servico.", "servico_sem_cfop");
      }
      const determinacaoFiscal = determinarFiscalFaturamento({
        id: faturamentoSnapshot.id,
        ...faturamento,
      });
      const timestamp = criarTimestampServidor();

      transaction.update(faturamentoRef, {
        determinacaoFiscal,
        determinacaoFiscalAtualizadaEm: timestamp,
        determinacaoFiscalAtualizadaPor: atorUid,
        atualizadoEm: timestamp,
      });

      return {
        faturamentoId: faturamentoRef.id,
        status: statusAtual,
        determinacaoFiscal,
      };
    });

    res.status(200).json({
      ok: true,
      faturamentoId: resultado.faturamentoId,
      status: resultado.status,
      determinacaoFiscal: resultado.determinacaoFiscal,
    });
  } catch (error) {
    console.error("Erro ao determinar fiscalmente o faturamento", {
      atorUid,
      empresaId: payload?.empresaId,
      faturamentoId: payload?.faturamentoId,
      statusCode: error.statusCode || 500,
      codigo: error.codigo || null,
    });
    montarRespostaErro(res, error);
  }
};

const criarHandlerClassificarTributacaoFaturamento = ({
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
    payload = validarPayloadFaturamentoMinimo({
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

      if (!usuarioAtivoPodeDeterminarFiscal({
        atorUid,
        ownerUid,
        atorData,
        vinculoUsuarioEmpresa,
      })) {
        throw criarErroHttp(
          403,
          "Voce nao tem permissao para classificar tributariamente o faturamento.",
          "sem_permissao"
        );
      }

      if (!snapshotExiste(faturamentoSnapshot)) {
        throw criarErroHttp(404, "Faturamento nao encontrado.", "faturamento_nao_encontrado");
      }

      const faturamento = dadosSnapshot(faturamentoSnapshot);
      const statusAtual = String(faturamento.status || "rascunho").trim().toLowerCase();

      if (statusAtual !== "rascunho") {
        throw criarErroHttp(
          409,
          "Status do faturamento nao permite classificacao tributaria.",
          "status_invalido"
        );
      }

      if (faturamento.classificacaoTributaria?.itens?.some((item) =>
        item.origemClassificacao === "manual")) {
        return { faturamentoId: faturamentoRef.id, status: statusAtual,
          classificacaoTributaria: faturamento.classificacaoTributaria };
      }

      if (ehFaturamentoServico(faturamento)) {
        throw criarErroHttp(409, "Classificacao automatica de servico indisponivel.", "servico_aguarda_classificacao");
      }
      const classificacaoTributaria = classificarTributacaoFaturamento({
        id: faturamentoSnapshot.id,
        ...faturamento,
      });
      const timestamp = criarTimestampServidor();

      transaction.update(faturamentoRef, {
        classificacaoTributaria,
        classificacaoTributariaAtualizadaEm: timestamp,
        classificacaoTributariaAtualizadaPor: atorUid,
        atualizadoEm: timestamp,
      });

      return {
        faturamentoId: faturamentoRef.id,
        status: statusAtual,
        classificacaoTributaria,
      };
    });

    res.status(200).json({
      ok: true,
      faturamentoId: resultado.faturamentoId,
      status: resultado.status,
      classificacaoTributaria: resultado.classificacaoTributaria,
    });
  } catch (error) {
    console.error("Erro ao classificar tributariamente o faturamento", {
      atorUid,
      empresaId: payload?.empresaId,
      faturamentoId: payload?.faturamentoId,
      statusCode: error.statusCode || 500,
      codigo: error.codigo || null,
    });
    montarRespostaErro(res, error);
  }
};

const criarHandlerListarCatalogoTributario = ({ getDb: getDbDependencia = getDb } = {}) => async (req, res) => {
  const atorUid = normalizarId(req.user?.uid);
  if (!atorUid) return res.status(401).json({ ok: false, codigo: "token_ausente" });
  try {
    const empresaId = validarIdFirestore("empresaId", req.query?.empresaId);
    const db = getDbDependencia();
    await db.runTransaction(async (transaction) => {
      const acesso = await resolverAcessoEmpresa({ db, transaction, atorUid, empresaId });
      if (!usuarioAtivoPodeLerFaturamento({ atorUid, ...acesso })) {
        throw criarErroHttp(403, "Sem permissao.", "sem_permissao");
      }
    });
    const catalogo = CATALOGO_IBS_CBS_2025_002_V1_60;
    return res.status(200).json({ ok: true, versao: catalogo.versaoCatalogo,
      csts: catalogo.csts.map(({ cst, nome }) => ({ cst, nome })),
      itens: catalogo.itens.map(({ cst, cClassTrib, descricao, inicioVigencia, fimVigencia }) =>
        ({ cst, cClassTrib, descricao, inicioVigencia, fimVigencia })) });
  } catch (error) {
    return montarRespostaErro(res, error);
  }
};

const criarHandlerListarCatalogoServicos = ({ getDb: getDbDependencia = getDb } = {}) => async (req, res) => {
  const atorUid = normalizarId(req.user?.uid);
  if (!atorUid) return res.status(401).json({ ok: false, codigo: "token_ausente" });
  try {
    const empresaId = validarIdFirestore("empresaId", req.query?.empresaId);
    const db = getDbDependencia();
    await db.runTransaction(async (transaction) => {
      const acesso = await resolverAcessoEmpresa({ db, transaction, atorUid, empresaId });
      if (normalizarSegmentoEmpresa(acesso.empresa.segmento) !== "clientes" ||
          !usuarioAtivoPodeLerFaturamento({ atorUid, ...acesso })) {
        throw criarErroHttp(403, "Sem permissao.", "sem_permissao");
      }
    });
    const catalogo = CATALOGO_SERVICOS_NFSE_V1_01_20260122;
    return res.status(200).json({
      ok: true,
      tipo: catalogo.tipo,
      versao: catalogo.versaoCatalogo,
      referencia: catalogo.referencia,
      itens: catalogo.itens.map(({ codigoTributacaoNacional, descricao }) =>
        ({ codigoTributacaoNacional, descricao })),
    });
  } catch (error) {
    return montarRespostaErro(res, error);
  }
};

const criarHandlerSalvarClassificacaoManual = ({
  getDb: getDbDependencia = getDb,
  agora = () => new Date().toISOString(),
} = {}) => async (req, res) => {
  const atorUid = normalizarId(req.user?.uid);
  if (!atorUid) return res.status(401).json({ ok: false, codigo: "token_ausente" });
  try {
    const { empresaId, faturamentoId } = validarPayloadFaturamentoMinimo({ params: req.params, body: req.body });
    if (!Array.isArray(req.body.itens)) throw criarErroHttp(400, "Itens invalidos.", "itens_invalidos");
    const db = getDbDependencia();
    const resultado = await db.runTransaction(async (transaction) => {
      const acesso = await resolverAcessoEmpresa({ db, transaction, atorUid, empresaId });
      if (!usuarioAtivoPodeDeterminarFiscal({ atorUid, ...acesso })) {
        throw criarErroHttp(403, "Sem permissao.", "sem_permissao");
      }
      const ref = acesso.empresaRef.collection("faturamentos").doc(faturamentoId);
      const snapshot = await transaction.get(ref);
      if (!snapshotExiste(snapshot)) throw criarErroHttp(404, "Faturamento nao encontrado.", "faturamento_nao_encontrado");
      const faturamento = dadosSnapshot(snapshot);
      if (ehFaturamentoServico(faturamento)) {
        throw criarErroHttp(409, "Classificacao manual de servico ainda nao disponivel.", "servico_aguarda_classificacao");
      }
      if (String(faturamento.status || "rascunho").trim().toLowerCase() !== "rascunho") {
        throw criarErroHttp(409, "Status nao permite classificacao.", "status_invalido");
      }
      let calculo;
      try {
        calculo = classificarManualmente({ faturamento, solicitacoes: req.body.itens,
          catalogo: CATALOGO_IBS_CBS_2025_002_V1_60, usuarioId: atorUid, dataAuditoria: agora() });
      } catch (error) {
        throw criarErroHttp(400, "Classificacao invalida.", error.codigo || "classificacao_invalida");
      }
      if (calculo.alterou) transaction.update(ref, { classificacaoTributaria: calculo.classificacaoTributaria,
        classificacaoTributariaAtualizadaEm: FieldValue.serverTimestamp(),
        classificacaoTributariaAtualizadaPor: atorUid });
      return { faturamentoId, classificacaoTributaria: calculo.classificacaoTributaria, alterou: calculo.alterou };
    });
    return res.status(200).json({ ok: true, ...resultado });
  } catch (error) {
    return montarRespostaErro(res, error);
  }
};

const criarHandlerSalvarContextoServico = ({
  getDb: getDbDependencia = getDb,
  agora = () => new Date().toISOString(),
  catalogoServicos = CATALOGO_SERVICOS_NFSE_V1_01_20260122,
} = {}) => async (req, res) => {
  const atorUid = normalizarId(req.user?.uid);
  if (!atorUid) return res.status(401).json({ ok: false, codigo: "token_ausente" });
  try {
    const { empresaId, faturamentoId } = validarPayloadFaturamentoMinimo({ params: req.params, body: req.body });
    const revisao = req.body.revisao;
    const db = getDbDependencia();
    const resultado = await db.runTransaction(async (transaction) => {
      const acesso = await resolverAcessoEmpresa({ db, transaction, atorUid, empresaId });
      if (normalizarSegmentoEmpresa(acesso.empresa.segmento) !== "clientes" ||
          !usuarioAtivoPodeDeterminarFiscal({ atorUid, ...acesso })) {
        throw criarErroHttp(403, "Sem permissao.", "sem_permissao");
      }
      const ref = acesso.empresaRef.collection("faturamentos").doc(faturamentoId);
      const snapshot = await transaction.get(ref);
      if (!snapshotExiste(snapshot)) throw criarErroHttp(404, "Faturamento nao encontrado.", "faturamento_nao_encontrado");
      const faturamento = dadosSnapshot(snapshot);
      if (faturamento.origem?.tipo !== "atendimento" || !ehFaturamentoServico(faturamento)) {
        throw criarErroHttp(409, "Faturamento nao e de servico.", "origem_invalida");
      }
      if (faturamento.status !== "rascunho") {
        throw criarErroHttp(409, "Status nao permite revisao.", "status_invalido");
      }
      let revisado;
      try {
        revisado = revisarContextoFiscalServico({
          faturamento, revisao, atorUid, agora: agora(), catalogoServicos,
        });
      } catch (error) {
        throw criarErroHttp(400, "Revisao fiscal invalida.", error.codigo || "revisao_invalida");
      }
      if (revisado.alterou) transaction.update(ref, {
        ...revisado.atualizacoes,
        atualizadoEm: FieldValue.serverTimestamp(),
        atualizadoPor: atorUid,
      });
      return { faturamentoId, alterou: revisado.alterou };
    });
    return res.status(200).json({ ok: true, ...resultado });
  } catch (error) {
    return montarRespostaErro(res, error);
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

router.get("/catalogo-tributario", authFirebase, criarHandlerListarCatalogoTributario());
router.get("/catalogo-servicos", authFirebase, criarHandlerListarCatalogoServicos());
router.get("/", authFirebase, criarHandlerListarFaturamentos());
router.get("/:faturamentoId", authFirebase, criarHandlerObterFaturamento());
router.post("/", authFirebase, criarHandlerCriarFaturamento());
router.post("/atendimento", authFirebase, criarHandlerCriarFaturamentoAtendimento());
router.put(
  "/:faturamentoId/contexto-operacional",
  authFirebase,
  criarHandlerSalvarContextoOperacionalFaturamento()
);
router.post("/:faturamentoId/preparar", authFirebase, criarHandlerPrepararFaturamento());
router.post(
  "/:faturamentoId/determinar-fiscal",
  authFirebase,
  criarHandlerDeterminarFiscalFaturamento()
);
router.post(
  "/:faturamentoId/classificar-tributacao",
  authFirebase,
  criarHandlerClassificarTributacaoFaturamento()
);
router.put("/:faturamentoId/classificacao-tributaria", authFirebase, criarHandlerSalvarClassificacaoManual());
router.put("/:faturamentoId/contexto-servico", authFirebase, criarHandlerSalvarContextoServico());
router.post("/:faturamentoId/cancelar", authFirebase, criarHandlerCancelarFaturamento());

module.exports = router;
module.exports.criarHandlerListarFaturamentos = criarHandlerListarFaturamentos;
module.exports.criarHandlerObterFaturamento = criarHandlerObterFaturamento;
module.exports.criarHandlerListarCatalogoServicos = criarHandlerListarCatalogoServicos;
module.exports.criarHandlerCriarFaturamento = criarHandlerCriarFaturamento;
module.exports.criarHandlerCriarFaturamentoAtendimento = criarHandlerCriarFaturamentoAtendimento;
module.exports.criarHandlerPrepararFaturamento = criarHandlerPrepararFaturamento;
module.exports.criarHandlerDeterminarFiscalFaturamento =
  criarHandlerDeterminarFiscalFaturamento;
module.exports.criarHandlerClassificarTributacaoFaturamento =
  criarHandlerClassificarTributacaoFaturamento;
module.exports.criarHandlerSalvarClassificacaoManual = criarHandlerSalvarClassificacaoManual;
module.exports.criarHandlerSalvarContextoServico = criarHandlerSalvarContextoServico;
module.exports.criarHandlerListarCatalogoTributario = criarHandlerListarCatalogoTributario;
module.exports.criarHandlerSalvarContextoOperacionalFaturamento =
  criarHandlerSalvarContextoOperacionalFaturamento;
module.exports.criarHandlerCancelarFaturamento = criarHandlerCancelarFaturamento;
module.exports._internals = {
  criarIdFaturamento,
  criarIdFaturamentoAtendimento,
  criarIdempotencyKey,
  sanitizarMotivoCancelamento,
  validarPayloadOperacaoFaturamento,
  validarPayloadContextoOperacionalFaturamento,
  validarPayloadCriacaoFaturamento,
  validarPayloadFaturamentoMinimo,
  validarQueryDetalheFaturamento,
  validarQueryListagemFaturamento,
  vendaEstaCancelada,
};
