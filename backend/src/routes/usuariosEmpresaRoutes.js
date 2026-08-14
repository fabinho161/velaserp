const crypto = require("crypto");
const express = require("express");
const authFirebase = require("../middlewares/authFirebase");
const { getDb } = require("../firebaseAdmin");
const { enviarEmailConvite } = require("../services/emailConvites");
const {
  calcularVagasOcupadas,
  montarPayloadControleUsuarios,
  normalizarEmail,
  obterControleUsuariosEmpresaRef,
  resolverLimiteUsuariosEmpresa,
  validarOperacaoLimiteUsuarios,
  validarSegmentoFirestore,
} = require("../services/limiteUsuariosEmpresa");
const {
  getRoleEmpresaLabel,
  isRoleAdminEmpresa,
  normalizarRoleEmpresa,
} = require("../utils/perfisEmpresa");
const {
  logAuditoriaError,
  logAuditoriaInfo,
  registrarErroAuditoria,
} = require("../utils/auditoriaFirestore");

const router = express.Router();

const DIAS_EXPIRACAO_CONVITE = 7;
const LIMITE_NOME_USUARIO = 120;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES_CANONICOS = new Set([
  "administrador_empresa",
  "financeiro",
  "producao",
  "comercial",
  "estoque",
  "visualizacao",
]);
const ROLE_ALIASES_VALIDOS = new Set([
  "administrador_empresa",
  "administrador_da_empresa",
  "financeiro",
  "producao",
  "comercial",
  "estoque",
  "visualizacao",
]);

const criarErroHttp = (statusCode, message, codigo = null, extras = {}) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.codigo = codigo;
  error.extras = extras;
  return error;
};

const normalizarTextoRole = (valor) =>
  String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");

const obterCampoProprio = (objeto, campo) =>
  Object.prototype.hasOwnProperty.call(objeto, campo) ? objeto[campo] : undefined;

const getFrontendBaseUrl = () =>
  (process.env.FRONTEND_BASE_URL || "http://localhost:5173").replace(/\/+$/, "");

const gerarTokenConvite = () => crypto.randomBytes(32).toString("hex");

const gerarIdDocumento = () => crypto.randomBytes(16).toString("hex");

const criarDatasConvite = (agora = new Date()) => {
  const criadoEm = new Date(agora.getTime());
  const expiraEm = new Date(criadoEm.getTime() + DIAS_EXPIRACAO_CONVITE * 24 * 60 * 60 * 1000);

  return {
    criadoEm,
    expiraEm,
  };
};

const toDate = (valor) => {
  if (!valor) return null;
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
  if (typeof valor.toDate === "function") {
    const data = valor.toDate();
    return data instanceof Date && !Number.isNaN(data.getTime()) ? data : null;
  }

  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data;
};

const normalizarStatus = (status) => String(status || "").trim().toLowerCase();

const validarPayloadConvite = (body) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw criarErroHttp(400, "Requisicao invalida.", "payload_invalido");
  }

  const camposPermitidos = new Set(["nome", "email", "role"]);
  const camposInvalidos = Object.keys(body).filter((campo) => !camposPermitidos.has(campo));

  if (camposInvalidos.length > 0) {
    throw criarErroHttp(400, "Campos nao permitidos na requisicao.", "campos_invalidos");
  }

  const nomeRaw = obterCampoProprio(body, "nome");
  const emailRaw = obterCampoProprio(body, "email");
  const roleRaw = obterCampoProprio(body, "role");
  const nome = typeof nomeRaw === "string" ? nomeRaw.trim() : "";
  const email = normalizarEmail(emailRaw);
  const roleAlias = normalizarTextoRole(roleRaw);
  const role = normalizarRoleEmpresa(roleRaw);

  if (!nome || nome.length > LIMITE_NOME_USUARIO) {
    throw criarErroHttp(400, "Nome do usuario invalido.", "nome_invalido");
  }

  if (!email || !EMAIL_REGEX.test(email)) {
    throw criarErroHttp(400, "E-mail invalido.", "email_invalido");
  }

  if (!ROLE_ALIASES_VALIDOS.has(roleAlias) || !ROLES_CANONICOS.has(role)) {
    throw criarErroHttp(400, "Perfil de usuario invalido.", "role_invalida");
  }

  return {
    nome,
    email,
    role,
  };
};

const snapshotParaLista = (snapshot) =>
  (snapshot?.docs || []).map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() || {}),
  }));

const usuarioTemEmail = (usuarioEmpresa, email) =>
  normalizarEmail(usuarioEmpresa.email) === email;

const encontrarUsuarioAtor = (usuariosEmpresa, uid) => {
  return usuariosEmpresa.find(
    (usuarioEmpresa) =>
      String(usuarioEmpresa.uidAuth || "").trim() === uid &&
      normalizarStatus(usuarioEmpresa.status) === "ativo"
  ) || null;
};

const validarAutorizacao = ({ atorUid, ownerUid, atorData, usuariosEmpresa }) => {
  if (atorUid === ownerUid) {
    return {
      autorizado: true,
      motivo: "owner",
    };
  }

  if (atorData?.role === "admin_master") {
    return {
      autorizado: true,
      motivo: "admin_master",
    };
  }

  const usuarioAtor = encontrarUsuarioAtor(usuariosEmpresa, atorUid);

  if (usuarioAtor && isRoleAdminEmpresa(normalizarRoleEmpresa(usuarioAtor))) {
    return {
      autorizado: true,
      motivo: "administrador_empresa",
      usuarioAtor,
    };
  }

  return {
    autorizado: false,
    motivo: usuarioAtor ? normalizarRoleEmpresa(usuarioAtor) : "sem_vinculo_ativo",
    usuarioAtor,
  };
};

const obterConviteExpirado = (usuarioEmpresa, agora) => {
  const expiraEm = toDate(usuarioEmpresa.conviteExpiraEm);
  return Boolean(expiraEm && expiraEm.getTime() < agora.getTime());
};

const determinarOperacao = ({
  usuariosEmpresa,
  email,
  agora,
}) => {
  const candidatos = usuariosEmpresa.filter((usuarioEmpresa) =>
    usuarioTemEmail(usuarioEmpresa, email)
  );

  if (candidatos.length > 1) {
    throw criarErroHttp(
      409,
      "Ha duplicidade de usuarios para este e-mail. Regularize antes de convidar.",
      "duplicidade_ambigua"
    );
  }

  if (candidatos.length === 0) {
    return {
      operacao: "criado",
      deltaVagas: 1,
      usuarioEmpresa: null,
      conviteExpirado: false,
    };
  }

  const usuarioEmpresa = candidatos[0];
  const status = normalizarStatus(usuarioEmpresa.status);

  if (status === "ativo") {
    throw criarErroHttp(409, "Este usuario ja esta ativo na empresa.", "usuario_ativo");
  }

  if (status === "inativo") {
    throw criarErroHttp(
      409,
      "Este usuario esta inativo. Use o fluxo de reativacao.",
      "usuario_inativo"
    );
  }

  if (status === "pendente") {
    const conviteExpirado = obterConviteExpirado(usuarioEmpresa, agora);

    return {
      operacao: "reenviado",
      deltaVagas: conviteExpirado ? 1 : 0,
      usuarioEmpresa,
      conviteExpirado,
    };
  }

  if (status === "removido") {
    return {
      operacao: "reconvidado",
      deltaVagas: 1,
      usuarioEmpresa,
      conviteExpirado: false,
    };
  }

  throw criarErroHttp(409, "Status do usuario inconsistente.", "status_inconsistente");
};

const planoEspelhoForneceLimite = (empresa) => {
  const resolvido = resolverLimiteUsuariosEmpresa({
    empresa,
    assinaturaOwner: {},
  });

  return resolvido.fonteLimite === "planoEspelho";
};

const criarDadosUsuarioEmpresa = ({
  dadosAtuais = {},
  nome,
  email,
  role,
  atorUid,
  conviteToken,
  criadoEm,
  expiraEm,
  operacao,
}) => {
  const dados = {
    nome,
    email,
    role,
    status: "pendente",
    uidAuth: null,
    atualizadoEm: criadoEm,
    criadoPor: dadosAtuais.criadoPor || atorUid,
    convitePendente: true,
    conviteToken,
    conviteCriadoEm: criadoEm,
    conviteExpiraEm: expiraEm,
    conviteAceitoEm: null,
    dono: false,
    vagaReservada: true,
  };

  if (!dadosAtuais.criadoEm || operacao === "criado") {
    dados.criadoEm = dadosAtuais.criadoEm || criadoEm;
  }

  if (operacao === "reconvidado") {
    dados.reconviteEm = criadoEm;
    dados.reconvitePor = atorUid;
  }

  return dados;
};

const criarDadosConvite = ({
  token,
  ownerUid,
  empresaId,
  usuarioEmpresaId,
  nome,
  email,
  role,
  nomeEmpresa,
  criadoEm,
  expiraEm,
}) => ({
  token,
  ownerUid,
  empresaId,
  usuarioEmpresaId,
  nome,
  email,
  role,
  nomeEmpresa: nomeEmpresa || "",
  status: "pendente",
  criadoEm,
  expiraEm,
  vagaReservada: true,
  atualizadoEm: criadoEm,
});

const montarRespostaErro = (res, error) => {
  const statusCode = error.statusCode || 500;

  res.status(statusCode).json({
    ok: false,
    error: statusCode >= 500
      ? "Erro interno ao processar convite."
      : error.message,
    codigo: error.codigo || null,
    ...(error.extras || {}),
  });
};

const criarHandlerCriarConviteUsuarioEmpresa = ({
  getDb: getDbDependencia = getDb,
  enviarEmailConvite: enviarEmailConviteDependencia = enviarEmailConvite,
  gerarToken = gerarTokenConvite,
  gerarIdUsuarioEmpresa = gerarIdDocumento,
  criarDataAtual = () => new Date(),
  getBaseUrl = getFrontendBaseUrl,
} = {}) => async (req, res) => {
  const atorUid = req.user?.uid || "";

  if (!atorUid) {
    res.status(401).json({
      ok: false,
      error: "Token Firebase nao informado.",
    });
    return;
  }

  let ownerUid;
  let empresaId;
  let payload;

  try {
    ownerUid = validarSegmentoFirestore("ownerUid", req.params?.ownerUid);
    empresaId = validarSegmentoFirestore("empresaId", req.params?.empresaId);
    payload = validarPayloadConvite(req.body);
  } catch (error) {
    montarRespostaErro(res, error.statusCode ? error : criarErroHttp(400, error.message));
    return;
  }

  const db = getDbDependencia();
  const agora = criarDataAtual();
  const { criadoEm, expiraEm } = criarDatasConvite(agora);
  const tokenNovo = gerarToken();
  const usuarioEmpresaIdNovo = gerarIdUsuarioEmpresa();

  try {
    const resultado = await db.runTransaction(async (transaction) => {
      const ownerRef = db.collection("users").doc(ownerUid);
      const atorRef = db.collection("users").doc(atorUid);
      const empresaRef = ownerRef.collection("empresas").doc(empresaId);
      const usuariosEmpresaRef = empresaRef.collection("usuariosEmpresa");
      const controleRef = obterControleUsuariosEmpresaRef({ db, ownerUid, empresaId });
      const assinaturaRef = ownerRef.collection("assinatura").doc("plano");

      const controleSnapshot = await transaction.get(controleRef);
      const empresaSnapshot = await transaction.get(empresaRef);
      const ownerSnapshot = await transaction.get(ownerRef);
      const atorSnapshot = atorUid === ownerUid
        ? ownerSnapshot
        : await transaction.get(atorRef);
      const usuariosSnapshot = await transaction.get(usuariosEmpresaRef);

      if (!empresaSnapshot.exists) {
        throw criarErroHttp(404, "Empresa nao encontrada.", "empresa_nao_encontrada");
      }

      const empresa = empresaSnapshot.data() || {};

      if (empresa.ownerUid && empresa.ownerUid !== ownerUid) {
        throw criarErroHttp(403, "Empresa nao pertence ao owner informado.", "owner_divergente");
      }

      const usuariosEmpresa = snapshotParaLista(usuariosSnapshot);
      const ownerData = ownerSnapshot.exists ? ownerSnapshot.data() : {};
      const atorData = atorSnapshot.exists ? atorSnapshot.data() : {};
      const ownerEmail = normalizarEmail(ownerData.email || (atorUid === ownerUid ? req.user?.email : ""));

      if (ownerEmail && payload.email === ownerEmail) {
        throw criarErroHttp(409, "O owner da empresa nao pode ser convidado.", "convite_owner");
      }

      const autorizacao = validarAutorizacao({
        atorUid,
        ownerUid,
        atorData,
        usuariosEmpresa,
      });

      if (!autorizacao.autorizado) {
        throw criarErroHttp(403, "Voce nao tem permissao para gerenciar usuarios desta empresa.", "sem_permissao");
      }

      let assinaturaSnapshot = null;

      if (!planoEspelhoForneceLimite(empresa)) {
        assinaturaSnapshot = await transaction.get(assinaturaRef);
      }

      const limite = resolverLimiteUsuariosEmpresa({
        empresa,
        assinaturaOwner: assinaturaSnapshot?.exists ? assinaturaSnapshot.data() : {},
      });
      const vagasAntes = calcularVagasOcupadas({
        ownerUid,
        ownerEmail,
        usuariosEmpresa,
        agora,
      });
      const operacao = determinarOperacao({
        usuariosEmpresa,
        email: payload.email,
        agora,
      });
      const usuarioEmpresaId = operacao.usuarioEmpresa?.id || usuarioEmpresaIdNovo;
      const usuarioEmpresaRef = usuariosEmpresaRef.doc(usuarioEmpresaId);
      const tokenFinal = operacao.deltaVagas === 0 && operacao.usuarioEmpresa?.conviteToken
        ? operacao.usuarioEmpresa.conviteToken
        : tokenNovo;
      const conviteRef = db.collection("convitesEmpresa").doc(tokenFinal);
      const conviteAntigoRef = operacao.usuarioEmpresa?.conviteToken &&
        operacao.usuarioEmpresa.conviteToken !== tokenFinal
        ? db.collection("convitesEmpresa").doc(operacao.usuarioEmpresa.conviteToken)
        : null;
      const conviteSnapshot = await transaction.get(conviteRef);
      const conviteAntigoSnapshot = conviteAntigoRef
        ? await transaction.get(conviteAntigoRef)
        : null;

      if (!operacao.usuarioEmpresa && conviteSnapshot.exists) {
        throw criarErroHttp(409, "Token de convite indisponivel. Tente novamente.", "token_indisponivel");
      }

      const validacao = validarOperacaoLimiteUsuarios({
        quantidadeAtual: vagasAntes.quantidadeOcupada,
        limite: limite.limite,
        deltaVagas: operacao.deltaVagas,
      });

      if (!validacao.permitido) {
        throw criarErroHttp(
          409,
          "Limite de usuarios atingido para o plano atual.",
          "limite_usuarios_atingido",
          {
            limiteUsuarios: limite.limite,
            vagasOcupadas: vagasAntes.quantidadeOcupada,
          }
        );
      }

      const vagasOcupadasResultado = validacao.quantidadeProjetada;
      const dadosUsuarioEmpresa = criarDadosUsuarioEmpresa({
        dadosAtuais: operacao.usuarioEmpresa || {},
        nome: payload.nome,
        email: payload.email,
        role: payload.role,
        atorUid,
        conviteToken: tokenFinal,
        criadoEm,
        expiraEm,
        operacao: operacao.operacao,
      });
      const dadosConvite = criarDadosConvite({
        token: tokenFinal,
        ownerUid,
        empresaId,
        usuarioEmpresaId,
        nome: payload.nome,
        email: payload.email,
        role: payload.role,
        nomeEmpresa: empresa.nome || "",
        criadoEm,
        expiraEm,
      });
      const payloadControle = montarPayloadControleUsuarios({
        quantidadeVagasOcupadas: vagasOcupadasResultado,
        limiteAplicado: limite.limite,
        plano: limite.plano,
        statusPlano: limite.statusPlano,
        fonteLimite: limite.fonteLimite,
        ultimaOperacao: `usuariosEmpresa.convite.${operacao.operacao}`,
        ultimoAtorUid: atorUid,
        reconciliadoEm: criadoEm,
      });

      transaction.set(usuarioEmpresaRef, dadosUsuarioEmpresa, { merge: operacao.operacao !== "criado" });
      transaction.set(conviteRef, dadosConvite, { merge: true });

      if (conviteAntigoRef && conviteAntigoSnapshot?.exists) {
        transaction.set(
          conviteAntigoRef,
          {
            status: "expirado",
            expiradoEm: criadoEm,
            atualizadoEm: criadoEm,
          },
          { merge: true }
        );
      }

      transaction.set(controleRef, payloadControle, { merge: true });

      return {
        usuarioEmpresaId,
        nome: payload.nome,
        email: payload.email,
        role: payload.role,
        nomeEmpresa: empresa.nome || "Empresa Renovar ERP",
        operacao: operacao.operacao,
        vagasOcupadas: vagasOcupadasResultado,
        limiteUsuarios: limite.limite,
        token: tokenFinal,
        controleExistia: controleSnapshot.exists,
      };
    });

    let conviteEnviado = false;
    let provider = null;

    try {
      const linkConvite = `${getBaseUrl()}/aceitar-convite/${resultado.token}`;
      const envio = await enviarEmailConviteDependencia({
        nome: resultado.nome,
        nomeEmpresa: resultado.nomeEmpresa,
        perfil: getRoleEmpresaLabel(resultado.role),
        linkConvite,
        para: resultado.email,
      });

      conviteEnviado = true;
      provider = envio.provider || null;
    } catch (emailError) {
      logAuditoriaError("usuariosEmpresa.convite.email: falha", emailError, {
        atorUid,
        ownerUid,
        empresaId,
        usuarioEmpresaId: resultado.usuarioEmpresaId,
        operacao: resultado.operacao,
      });
    }

    logAuditoriaInfo("usuariosEmpresa.convite: sucesso", {
      atorUid,
      ownerUid,
      empresaId,
      usuarioEmpresaId: resultado.usuarioEmpresaId,
      operacao: resultado.operacao,
      conviteEnviado,
    });

    res.status(200).json({
      ok: true,
      usuarioEmpresaId: resultado.usuarioEmpresaId,
      status: "pendente",
      operacao: resultado.operacao,
      vagasOcupadas: resultado.vagasOcupadas,
      limiteUsuarios: resultado.limiteUsuarios,
      conviteEnviado,
      provider,
    });
  } catch (error) {
    logAuditoriaError("usuariosEmpresa.convite: falha", error, {
      atorUid,
      ownerUid,
      empresaId,
      statusCode: error.statusCode || 500,
      codigo: error.codigo || null,
    });

    if (!error.statusCode && db) {
      await registrarErroAuditoria(db, "usuariosEmpresa.convite", error, {
        atorUid,
        ownerUid,
        empresaId,
      });
    }

    montarRespostaErro(res, error);
  }
};

router.post(
  "/:ownerUid/:empresaId/usuarios/convites",
  authFirebase,
  criarHandlerCriarConviteUsuarioEmpresa()
);

module.exports = router;
module.exports.criarHandlerCriarConviteUsuarioEmpresa = criarHandlerCriarConviteUsuarioEmpresa;
module.exports._internals = {
  criarDatasConvite,
  determinarOperacao,
  gerarTokenConvite,
  validarPayloadConvite,
};
