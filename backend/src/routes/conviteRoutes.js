const express = require("express");
const authFirebase = require("../middlewares/authFirebase");
const { FieldValue, getDb } = require("../firebaseAdmin");
const { enviarEmailConvite } = require("../services/emailConvites");
const {
  calcularVagasOcupadas,
  montarPayloadControleUsuarios,
  obterControleUsuariosEmpresaRef,
  resolverLimiteUsuariosEmpresa,
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

const normalizarEmail = (email) => String(email || "").trim().toLowerCase();

const normalizarStatus = (status) => String(status || "").trim().toLowerCase();
const normalizarTexto = (valor) =>
  String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");
const PRIORIDADE_STATUS_USUARIO = {
  ativo: 0,
  pendente: 1,
  inativo: 2,
  removido: 3,
};

const prioridadeUsuarioEmpresa = (usuarioEmpresa = {}) => {
  const status = normalizarStatus(usuarioEmpresa.status);
  return PRIORIDADE_STATUS_USUARIO[status] ?? 4;
};

const ordenarUsuariosEmpresaPorAcesso = (a, b) => {
  const prioridadeA = prioridadeUsuarioEmpresa(a);
  const prioridadeB = prioridadeUsuarioEmpresa(b);

  if (prioridadeA !== prioridadeB) return prioridadeA - prioridadeB;

  const dataA = a.atualizadoEm?.toMillis?.() || a.criadoEm?.toMillis?.() || 0;
  const dataB = b.atualizadoEm?.toMillis?.() || b.criadoEm?.toMillis?.() || 0;

  return dataB - dataA;
};

const toDate = (valor) => {
  if (!valor) return null;
  if (valor.toDate) return valor.toDate();
  if (valor instanceof Date) return valor;

  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data;
};

const getFrontendBaseUrl = () =>
  (process.env.FRONTEND_BASE_URL || "http://localhost:5173").replace(/\/+$/, "");

const criarErroHttp = (statusCode, message, codigo = null, extras = {}) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.codigo = codigo;
  error.extras = extras;
  return error;
};

const montarRespostaErro = (res, error, mensagemPadrao) => {
  const statusCode = error.statusCode || 500;

  res.status(statusCode).json({
    ok: false,
    error: statusCode >= 500
      ? mensagemPadrao
      : error.message,
    codigo: error.codigo || null,
    ...(error.extras || {}),
  });
};

const validarAdminMaster = async (db, uid) => {
  const snapshot = await db.collection("users").doc(uid).get();
  const data = snapshot.exists ? snapshot.data() : {};

  return data?.role === "admin_master";
};

const carregarUsuarioEmpresaAtual = async (empresaRef, uid) => {
  const snapshot = await empresaRef
    .collection("usuariosEmpresa")
    .where("uidAuth", "==", uid)
    .get();

  if (snapshot.empty) return null;

  return snapshot.docs
    .map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }))
    .sort(ordenarUsuariosEmpresaPorAcesso)[0];
};

const podeEnviarConvite = async ({ db, empresaRef, uid }) => {
  if (await validarAdminMaster(db, uid)) {
    return true;
  }

  const usuarioEmpresa = await carregarUsuarioEmpresaAtual(empresaRef, uid);
  const role = normalizarRoleEmpresa(usuarioEmpresa);

  return Boolean(
    usuarioEmpresa &&
    normalizarStatus(usuarioEmpresa.status) === "ativo" &&
    isRoleAdminEmpresa(role)
  );
};

const carregarPermissaoGerenciarUsuarios = async ({ empresaRef, ownerUid, uid }) => {
  if (ownerUid === uid) {
    return {
      permitido: true,
      motivo: "dono",
    };
  }

  const usuarioEmpresa = await carregarUsuarioEmpresaAtual(empresaRef, uid);
  const role = normalizarRoleEmpresa(usuarioEmpresa);

  return {
    permitido: Boolean(
      usuarioEmpresa &&
        normalizarStatus(usuarioEmpresa.status) === "ativo" &&
        isRoleAdminEmpresa(role)
    ),
    motivo: role,
    usuarioEmpresa,
  };
};

const registrarLogEnvio = async ({
  db,
  conviteRef,
  usuarioEmpresaRef,
  uid,
  emailDestino,
  statusEnvio,
  provider = null,
  erro = "",
}) => {
  const enviadoEm = FieldValue.serverTimestamp();
  const log = {
    enviadoEm,
    enviadoPor: uid,
    emailDestino,
    statusEnvio,
    provider,
    erro,
  };
  const logRef = db
    .collection("logs")
    .doc("convitesEmail")
    .collection("envios")
    .doc();
  const batch = db.batch();

  batch.set(logRef, {
    ...log,
    convitePath: conviteRef.path,
    usuarioEmpresaPath: usuarioEmpresaRef.path,
  });

  batch.set(
    conviteRef,
    {
      ultimoEnvioConvite: log,
      emailConviteStatus: statusEnvio,
      emailConviteEnviadoEm: enviadoEm,
      emailConviteEnviadoPor: uid,
      emailConviteDestino: emailDestino,
      emailConviteErro: erro,
      atualizadoEm: enviadoEm,
    },
    { merge: true }
  );

  batch.set(
    usuarioEmpresaRef,
    {
      ultimoEnvioConvite: log,
      emailConviteStatus: statusEnvio,
      emailConviteEnviadoEm: enviadoEm,
      emailConviteEnviadoPor: uid,
      emailConviteDestino: emailDestino,
      emailConviteErro: erro,
      atualizadoEm: enviadoEm,
    },
    { merge: true }
  );

  await batch.commit();
};

const snapshotParaLista = (snapshot) =>
  (snapshot?.docs || []).map((docSnap) => ({
    ...(docSnap.data() || {}),
    id: docSnap.id,
  }));

const encontrarUsuarioAtor = (usuariosEmpresa, uid) =>
  usuariosEmpresa.find(
    (usuarioEmpresa) =>
      String(usuarioEmpresa.uidAuth || "").trim() === uid &&
      normalizarStatus(usuarioEmpresa.status) === "ativo"
  ) || null;

const validarAutorizacaoTransacional = ({ atorUid, ownerUid, atorData, usuariosEmpresa }) => {
  if (atorUid === ownerUid) return true;
  if (atorData?.role === "admin_master") return true;

  const usuarioAtor = encontrarUsuarioAtor(usuariosEmpresa, atorUid);

  return Boolean(usuarioAtor && isRoleAdminEmpresa(normalizarRoleEmpresa(usuarioAtor)));
};

const isRoleProtegidaUsuarioEmpresa = (usuarioEmpresa) =>
  ["owner", "dono", "admin_master"].includes(
    normalizarTexto(usuarioEmpresa?.role || usuarioEmpresa?.perfil || usuarioEmpresa?.profile)
  );

const isUsuarioOwnerEmpresa = ({ usuarioEmpresaId, usuarioEmpresa, ownerUid, ownerEmail }) => {
  const uidAuth = String(usuarioEmpresa?.uidAuth || "").trim();
  const email = normalizarEmail(usuarioEmpresa?.email);

  return usuarioEmpresaId === ownerUid ||
    usuarioEmpresa?.dono === true ||
    uidAuth === ownerUid ||
    (email && ownerEmail && email === ownerEmail) ||
    isRoleProtegidaUsuarioEmpresa(usuarioEmpresa);
};

const validarPonteiroEmpresa = ({ snapshot, ownerUid, empresaId, usuarioEmpresaId }) => {
  if (!snapshot.exists) return true;

  const dados = snapshot.data() || {};

  return dados.ownerUid === ownerUid &&
    dados.empresaId === empresaId &&
    dados.usuarioEmpresaId === usuarioEmpresaId;
};

const convitePertenceAoUsuarioEmpresa = ({ convite, ownerUid, empresaId, usuarioEmpresaId }) =>
  convite?.ownerUid === ownerUid &&
  convite?.empresaId === empresaId &&
  convite?.usuarioEmpresaId === usuarioEmpresaId;

const planoEspelhoForneceLimite = (empresa) => {
  const resolvido = resolverLimiteUsuariosEmpresa({
    empresa,
    assinaturaOwner: {},
  });

  return resolvido.fonteLimite === "planoEspelho";
};

const substituirUsuarioEmpresaNaLista = ({ usuariosEmpresa, usuarioEmpresaId, dadosFinais }) =>
  usuariosEmpresa.map((usuarioEmpresa) =>
    usuarioEmpresa.id === usuarioEmpresaId
      ? { ...usuarioEmpresa, ...dadosFinais }
      : usuarioEmpresa
  );

const validarSegmentoRemocao = (nomeCampo, valor) => {
  try {
    const valorNormalizado = validarSegmentoFirestore(nomeCampo, valor);

    if (valorNormalizado.length > 128) {
      throw new Error(`${nomeCampo} invalido.`);
    }

    return valorNormalizado;
  } catch {
    throw criarErroHttp(400, `${nomeCampo} invalido.`, "parametro_invalido");
  }
};

const criarPayloadRemocaoUsuarioEmpresa = ({ usuarioEmpresa, atorUid, atualizadoEm }) => ({
  status: "removido",
  convitePendente: false,
  removidoEm: usuarioEmpresa.removidoEm || atualizadoEm,
  removidoPor: usuarioEmpresa.removidoPor || atorUid,
  atualizadoEm,
  role: normalizarRoleEmpresa(usuarioEmpresa),
});

const criarPayloadPonteiroRemovido = ({
  ownerUid,
  empresaId,
  usuarioEmpresaId,
  atorUid,
  atualizadoEm,
}) => ({
  status: "removido",
  removidoEm: atualizadoEm,
  removidoPor: atorUid,
  atualizadoEm,
  ownerUid,
  empresaId,
  usuarioEmpresaId,
});

const criarPayloadConviteCancelado = ({ atorUid, atualizadoEm }) => ({
  status: "cancelado",
  canceladoEm: atualizadoEm,
  canceladoPor: atorUid,
  atualizadoEm,
});

router.post("/aceitar", authFirebase, async (req, res) => {
  const db = getDb();
  const uid = req.user.uid;
  const emailAuth = normalizarEmail(req.user.email);
  const token = String(req.body?.token || "").trim();

  if (!token) {
    res.status(400).json({
      ok: false,
      error: "Token do convite nao informado.",
    });
    return;
  }

  if (!emailAuth) {
    res.status(401).json({
      ok: false,
      error: "Usuario autenticado sem e-mail valido.",
    });
    return;
  }

  const conviteRef = db.collection("convitesEmpresa").doc(token);

  try {
    const resultado = await db.runTransaction(async (transaction) => {
      const conviteSnapshot = await transaction.get(conviteRef);

      if (!conviteSnapshot.exists) {
        const error = new Error("Convite nao encontrado.");
        error.statusCode = 404;
        throw error;
      }

      const convite = conviteSnapshot.data();
      const expiraEm = toDate(convite.expiraEm);

      if (normalizarStatus(convite.status) !== "pendente") {
        const error = new Error("Este convite ja foi usado ou cancelado.");
        error.statusCode = 409;
        throw error;
      }

      if (!expiraEm || expiraEm.getTime() < Date.now()) {
        const error = new Error("Este convite expirou.");
        error.statusCode = 409;
        throw error;
      }

      if (emailAuth !== normalizarEmail(convite.email)) {
        const error = new Error("O e-mail autenticado nao corresponde ao convite.");
        error.statusCode = 403;
        throw error;
      }

      if (!convite.ownerUid || !convite.empresaId || !convite.usuarioEmpresaId) {
        const error = new Error("Convite sem vinculo valido com empresa.");
        error.statusCode = 400;
        throw error;
      }

      const empresaRef = db
        .collection("users")
        .doc(convite.ownerUid)
        .collection("empresas")
        .doc(convite.empresaId);
      const usuarioEmpresaRef = empresaRef
        .collection("usuariosEmpresa")
        .doc(convite.usuarioEmpresaId);
      const usuariosMesmoEmailQuery = empresaRef
        .collection("usuariosEmpresa")
        .where("email", "==", normalizarEmail(convite.email));
      const usuariosMesmoUidQuery = empresaRef
        .collection("usuariosEmpresa")
        .where("uidAuth", "==", uid);
      const empresaUsuarioRef = db
        .collection("users")
        .doc(uid)
        .collection("empresas")
        .doc(convite.empresaId);
      const vinculoUsuarioRef = db
        .collection("usuariosPorAuth")
        .doc(uid)
        .collection("empresas")
        .doc(convite.empresaId);

      const [
        empresaSnapshot,
        usuarioEmpresaSnapshot,
        usuariosMesmoEmailSnapshot,
        usuariosMesmoUidSnapshot,
        empresaUsuarioSnapshot,
        vinculoUsuarioSnapshot,
      ] = await Promise.all([
        transaction.get(empresaRef),
        transaction.get(usuarioEmpresaRef),
        transaction.get(usuariosMesmoEmailQuery),
        transaction.get(usuariosMesmoUidQuery),
        transaction.get(empresaUsuarioRef),
        transaction.get(vinculoUsuarioRef),
      ]);

      if (!empresaSnapshot.exists || !usuarioEmpresaSnapshot.exists) {
        const error = new Error("Empresa ou usuario convidado nao encontrado.");
        error.statusCode = 404;
        throw error;
      }

      const empresa = empresaSnapshot.data();
      const usuarioEmpresa = usuarioEmpresaSnapshot.data();

      if (normalizarStatus(usuarioEmpresa.status) !== "pendente") {
        const error = new Error("Este usuario ja foi ativado ou removido.");
        error.statusCode = 409;
        throw error;
      }

      if (normalizarEmail(usuarioEmpresa.email) !== normalizarEmail(convite.email)) {
        const error = new Error("O email do convite nao confere com o usuario da empresa.");
        error.statusCode = 409;
        throw error;
      }

      const role = normalizarRoleEmpresa(
        convite.role ||
          usuarioEmpresa.role ||
          convite.perfil ||
          usuarioEmpresa.perfil ||
          convite.profile ||
          usuarioEmpresa.profile
      );
      const agora = FieldValue.serverTimestamp();
      const dadosVinculoBase = {
        nome: convite.nomeEmpresa || empresa?.nome || "Empresa convidada",
        ownerUid: convite.ownerUid,
        empresaId: convite.empresaId,
        usuarioEmpresaId: convite.usuarioEmpresaId,
        conviteToken: token,
        email: convite.email,
        role,
        status: "ativo",
        convitePendente: false,
        vinculadoPorConvite: true,
        atualizadoEm: agora,
      };
      const dadosEmpresaUsuario = empresaUsuarioSnapshot.exists
        ? dadosVinculoBase
        : {
            ...dadosVinculoBase,
            criadoEm: agora,
          };
      const dadosVinculoUsuario = vinculoUsuarioSnapshot.exists
        ? dadosVinculoBase
        : {
            ...dadosVinculoBase,
            criadoEm: agora,
          };
      const usuariosConflitantes = new Map();

      [...usuariosMesmoEmailSnapshot.docs, ...usuariosMesmoUidSnapshot.docs].forEach((docSnap) => {
        if (docSnap.id === usuarioEmpresaRef.id) return;

        const dados = docSnap.data();

        if (dados?.dono === true) return;

        usuariosConflitantes.set(docSnap.id, {
          ref: docSnap.ref,
          dados,
        });
      });

      transaction.update(usuarioEmpresaRef, {
        role,
        status: "ativo",
        uidAuth: uid,
        convitePendente: false,
        conviteAceitoEm: agora,
        vinculadoPorConvite: true,
        atualizadoEm: agora,
      });

      usuariosConflitantes.forEach(({ ref, dados }) => {
        transaction.set(
          ref,
          {
            status: "removido",
            convitePendente: false,
            removidoEm: dados.removidoEm || agora,
            removidoPor: dados.removidoPor || "sistema_reconvite",
            substituidoPorUsuarioEmpresaId: convite.usuarioEmpresaId,
            atualizadoEm: agora,
          },
          { merge: true }
        );

        if (dados.conviteToken && normalizarStatus(dados.status) === "pendente") {
          transaction.set(
            db.collection("convitesEmpresa").doc(dados.conviteToken),
            {
              status: "cancelado",
              canceladoEm: agora,
              canceladoPor: "sistema_reconvite",
              atualizadoEm: agora,
            },
            { merge: true }
          );
        }
      });

      transaction.update(conviteRef, {
        status: "aceito",
        aceitoEm: agora,
        uidAuth: uid,
        role,
        atualizadoEm: agora,
      });

      transaction.set(
        empresaUsuarioRef,
        {
          ...dadosEmpresaUsuario,
          vinculadaPorConvite: true,
        },
        { merge: true }
      );

      transaction.set(
        vinculoUsuarioRef,
        dadosVinculoUsuario,
        { merge: true }
      );

      return {
        empresaId: convite.empresaId,
        ownerUid: convite.ownerUid,
        usuarioEmpresaId: convite.usuarioEmpresaId,
        role,
      };
    });

    res.json({
      ok: true,
      ...resultado,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;

    console.error("Erro ao aceitar convite", {
      uid,
      token,
      statusCode,
      message: error.message,
    });

    res.status(statusCode).json({
      ok: false,
      error: error.message || "Nao foi possivel aceitar o convite.",
    });
  }
});

router.post("/enviar", authFirebase, async (req, res) => {
  const db = getDb();
  const uid = req.user.uid;
  const token = String(req.body?.token || "").trim();

  if (!token) {
    res.status(400).json({
      ok: false,
      error: "Token do convite nao informado.",
    });
    return;
  }

  const conviteRef = db.collection("convitesEmpresa").doc(token);

  try {
    logAuditoriaInfo("convites.email.enviar: solicitado", { uid, token });

    const conviteSnapshot = await conviteRef.get();

    if (!conviteSnapshot.exists) {
      res.status(404).json({
        ok: false,
        error: "Convite nao encontrado.",
      });
      return;
    }

    const convite = conviteSnapshot.data();
    const expiraEm = toDate(convite.expiraEm);

    if (normalizarStatus(convite.status) !== "pendente") {
      res.status(409).json({
        ok: false,
        error: "Apenas convites pendentes podem ser enviados por email.",
      });
      return;
    }

    if (!expiraEm || expiraEm.getTime() < Date.now()) {
      res.status(409).json({
        ok: false,
        error: "Este convite expirou. Gere um novo link antes de enviar.",
      });
      return;
    }

    if (!convite.ownerUid || !convite.empresaId || !convite.usuarioEmpresaId) {
      res.status(400).json({
        ok: false,
        error: "Convite sem vinculo valido com empresa.",
      });
      return;
    }

    const empresaRef = db
      .collection("users")
      .doc(convite.ownerUid)
      .collection("empresas")
      .doc(convite.empresaId);
    const usuarioEmpresaRef = empresaRef
      .collection("usuariosEmpresa")
      .doc(convite.usuarioEmpresaId);

    const [empresaSnapshot, usuarioEmpresaSnapshot] = await Promise.all([
      empresaRef.get(),
      usuarioEmpresaRef.get(),
    ]);

    if (!empresaSnapshot.exists || !usuarioEmpresaSnapshot.exists) {
      res.status(404).json({
        ok: false,
        error: "Empresa ou usuario convidado nao encontrado.",
      });
      return;
    }

    if (!(await podeEnviarConvite({ db, empresaRef, uid }))) {
      res.status(403).json({
        ok: false,
        error: "Voce nao tem permissao para enviar convites desta empresa.",
      });
      return;
    }

    const usuarioEmpresa = usuarioEmpresaSnapshot.data();

    if (normalizarStatus(usuarioEmpresa.status) !== "pendente") {
      res.status(409).json({
        ok: false,
        error: "Este usuario ja foi ativado ou removido.",
      });
      return;
    }

    if (normalizarEmail(usuarioEmpresa.email) !== normalizarEmail(convite.email)) {
      res.status(409).json({
        ok: false,
        error: "O email do convite nao confere com o usuario da empresa.",
      });
      return;
    }

    const emailDestino = normalizarEmail(convite.email);
    const nomeEmpresa = empresaSnapshot.data()?.nome || "Empresa Renovar ERP";
    const linkConvite = `${getFrontendBaseUrl()}/aceitar-convite/${token}`;
    const role = normalizarRoleEmpresa(
      convite.role ||
        usuarioEmpresa.role ||
        convite.perfil ||
        usuarioEmpresa.perfil ||
        convite.profile ||
        usuarioEmpresa.profile
    );
    const perfil = getRoleEmpresaLabel(role);

    try {
      const resultado = await enviarEmailConvite({
        nome: convite.nome || usuarioEmpresa.nome || emailDestino,
        nomeEmpresa,
        perfil,
        linkConvite,
        para: emailDestino,
      });

      await registrarLogEnvio({
        db,
        conviteRef,
        usuarioEmpresaRef,
        uid,
        emailDestino,
        statusEnvio: "enviado",
        provider: resultado.provider,
      });

      logAuditoriaInfo("convites.email.enviar: sucesso", {
        uid,
        token,
        emailDestino,
        provider: resultado.provider,
      });

      res.json({
        ok: true,
        statusEnvio: "enviado",
        provider: resultado.provider,
      });
    } catch (emailError) {
      const statusEnvio =
        emailError.code === "EMAIL_PROVIDER_NOT_CONFIGURED"
          ? "nao_configurado"
          : "erro";

      await registrarLogEnvio({
        db,
        conviteRef,
        usuarioEmpresaRef,
        uid,
        emailDestino,
        statusEnvio,
        erro: emailError.message || String(emailError),
      });

      logAuditoriaError("convites.email.enviar: falha no provedor", emailError, {
        uid,
        token,
        emailDestino,
        statusEnvio,
      });

      res.status(statusEnvio === "nao_configurado" ? 503 : 502).json({
        ok: false,
        statusEnvio,
        error: emailError.message || "Erro ao enviar email de convite.",
      });
    }
  } catch (error) {
    logAuditoriaError("convites.email.enviar: falha", error, { uid, token });
    await registrarErroAuditoria(db, "convites.email.enviar", error, { uid, token });

    res.status(500).json({
      ok: false,
      error: error.message || "Erro ao enviar convite por email.",
    });
  }
});

const criarHandlerRemoverUsuarioEmpresa = ({
  getDb: getDbDependencia = getDb,
  criarDataAtual = () => new Date(),
} = {}) => async (req, res) => {
  const uid = req.user?.uid || "";

  if (!uid) {
    res.status(401).json({
      ok: false,
      error: "Token Firebase nao informado.",
    });
    return;
  }

  let ownerUid;
  let empresaId;
  let usuarioEmpresaId;

  try {
    ownerUid = validarSegmentoRemocao("ownerUid", req.body?.ownerUid);
    empresaId = validarSegmentoRemocao("empresaId", req.body?.empresaId);
    usuarioEmpresaId = validarSegmentoRemocao("usuarioEmpresaId", req.body?.usuarioEmpresaId);
  } catch (error) {
    montarRespostaErro(res, error, "Nao foi possivel remover este usuario.");
    return;
  }

  const db = getDbDependencia();
  const agora = criarDataAtual();

  try {
    const resultado = await db.runTransaction(async (transaction) => {
      const ownerRef = db.collection("users").doc(ownerUid);
      const atorRef = db.collection("users").doc(uid);
      const empresaRef = ownerRef.collection("empresas").doc(empresaId);
      const usuariosEmpresaRef = empresaRef.collection("usuariosEmpresa");
      const usuarioEmpresaRef = usuariosEmpresaRef.doc(usuarioEmpresaId);
      const controleRef = obterControleUsuariosEmpresaRef({ db, ownerUid, empresaId });
      const assinaturaRef = ownerRef.collection("assinatura").doc("plano");

      await transaction.get(controleRef);
      const empresaSnapshot = await transaction.get(empresaRef);
      const ownerSnapshot = await transaction.get(ownerRef);
      const atorSnapshot = uid === ownerUid
        ? ownerSnapshot
        : await transaction.get(atorRef);
      const usuarioEmpresaSnapshot = await transaction.get(usuarioEmpresaRef);
      const usuariosSnapshot = await transaction.get(usuariosEmpresaRef);

      if (!empresaSnapshot.exists || !usuarioEmpresaSnapshot.exists) {
        throw criarErroHttp(404, "Empresa ou usuario da empresa nao encontrado.", "usuario_nao_encontrado");
      }

      const empresa = empresaSnapshot.data() || {};

      if (empresa.ownerUid && empresa.ownerUid !== ownerUid) {
        throw criarErroHttp(403, "Empresa nao pertence ao owner informado.", "owner_divergente");
      }

      const usuariosEmpresa = snapshotParaLista(usuariosSnapshot);
      const ownerData = ownerSnapshot.exists ? ownerSnapshot.data() : {};
      const atorData = atorSnapshot.exists ? atorSnapshot.data() : {};
      const ownerEmail = normalizarEmail(ownerData.email || (uid === ownerUid ? req.user?.email : ""));
      const usuarioEmpresa = {
        id: usuarioEmpresaId,
        ...(usuarioEmpresaSnapshot.data() || {}),
      };
      const uidAlvo = String(usuarioEmpresa.uidAuth || "").trim();

      if (!validarAutorizacaoTransacional({
        atorUid: uid,
        ownerUid,
        atorData,
        usuariosEmpresa,
      })) {
        throw criarErroHttp(
          403,
          "Voce nao tem permissao para remover usuarios desta empresa.",
          "sem_permissao"
        );
      }

      if (isUsuarioOwnerEmpresa({
        usuarioEmpresaId,
        usuarioEmpresa,
        ownerUid,
        ownerEmail,
      })) {
        throw criarErroHttp(403, "O dono principal da empresa nao pode ser removido.", "usuario_owner");
      }

      if (uidAlvo && uidAlvo === uid) {
        throw criarErroHttp(403, "Voce nao pode remover seu proprio usuario da empresa.", "auto_remocao");
      }

      const usuarioAuthAlvoRef = uidAlvo ? db.collection("users").doc(uidAlvo) : null;
      const empresaUsuarioRef = uidAlvo
        ? db.collection("users").doc(uidAlvo).collection("empresas").doc(empresaId)
        : null;
      const vinculoUsuarioRef = uidAlvo
        ? db.collection("usuariosPorAuth").doc(uidAlvo).collection("empresas").doc(empresaId)
        : null;
      const conviteToken = String(usuarioEmpresa.conviteToken || "").trim();
      const conviteTokenRef = conviteToken
        ? db.collection("convitesEmpresa").doc(conviteToken)
        : null;
      const convitesUsuarioQuery = db
        .collection("convitesEmpresa")
        .where("usuarioEmpresaId", "==", usuarioEmpresaId);

      const usuarioAuthAlvoSnapshot = usuarioAuthAlvoRef
        ? await transaction.get(usuarioAuthAlvoRef)
        : null;
      const empresaUsuarioSnapshot = empresaUsuarioRef
        ? await transaction.get(empresaUsuarioRef)
        : null;
      const vinculoUsuarioSnapshot = vinculoUsuarioRef
        ? await transaction.get(vinculoUsuarioRef)
        : null;
      const conviteTokenSnapshot = conviteTokenRef
        ? await transaction.get(conviteTokenRef)
        : null;
      const convitesUsuarioSnapshot = await transaction.get(convitesUsuarioQuery);
      let assinaturaSnapshot = null;

      if (!planoEspelhoForneceLimite(empresa)) {
        assinaturaSnapshot = await transaction.get(assinaturaRef);
      }

      const statusAtual = normalizarStatus(usuarioEmpresa.status);

      if (!["ativo", "pendente", "inativo", "removido"].includes(statusAtual)) {
        throw criarErroHttp(409, "Status do usuario inconsistente.", "status_inconsistente");
      }

      const roleGlobalAlvo = usuarioAuthAlvoSnapshot?.exists
        ? usuarioAuthAlvoSnapshot.data()?.role
        : null;

      if (roleGlobalAlvo === "admin_master") {
        throw criarErroHttp(
          403,
          "Admin Master SaaS nao pode ser removido por administrador da empresa.",
          "alvo_admin_master"
        );
      }

      if (empresaUsuarioSnapshot &&
        !validarPonteiroEmpresa({
          snapshot: empresaUsuarioSnapshot,
          ownerUid,
          empresaId,
          usuarioEmpresaId,
        })) {
        throw criarErroHttp(409, "Ponteiro de usuario inconsistente.", "ponteiro_inconsistente");
      }

      if (vinculoUsuarioSnapshot &&
        !validarPonteiroEmpresa({
          snapshot: vinculoUsuarioSnapshot,
          ownerUid,
          empresaId,
          usuarioEmpresaId,
        })) {
        throw criarErroHttp(409, "Ponteiro de usuario inconsistente.", "ponteiro_inconsistente");
      }

      if (conviteTokenSnapshot?.exists &&
        !convitePertenceAoUsuarioEmpresa({
          convite: conviteTokenSnapshot.data(),
          ownerUid,
          empresaId,
          usuarioEmpresaId,
        })) {
        throw criarErroHttp(409, "Convite inconsistente com o usuario da empresa.", "convite_inconsistente");
      }

      const convitesRelacionados = new Map();

      if (conviteTokenSnapshot?.exists) {
        convitesRelacionados.set(conviteTokenSnapshot.ref.path, conviteTokenSnapshot);
      }

      snapshotParaLista(convitesUsuarioSnapshot).forEach((convite) => {
        if (!convitePertenceAoUsuarioEmpresa({ convite, ownerUid, empresaId, usuarioEmpresaId })) {
          return;
        }

        convitesRelacionados.set(`convitesEmpresa/${convite.id}`, {
          id: convite.id,
          ref: db.collection("convitesEmpresa").doc(convite.id),
          data: () => convite,
          exists: true,
        });
      });

      const convitesPendentes = [...convitesRelacionados.values()].filter((conviteSnapshot) =>
        normalizarStatus(conviteSnapshot.data()?.status) === "pendente"
      );
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
      const dadosRemocao = criarPayloadRemocaoUsuarioEmpresa({
        usuarioEmpresa,
        atorUid: uid,
        atualizadoEm: agora,
      });
      const usuariosFinais = substituirUsuarioEmpresaNaLista({
        usuariosEmpresa,
        usuarioEmpresaId,
        dadosFinais: dadosRemocao,
      });
      const vagasDepois = calcularVagasOcupadas({
        ownerUid,
        ownerEmail,
        usuariosEmpresa: usuariosFinais,
        agora,
      });
      const payloadControle = montarPayloadControleUsuarios({
        quantidadeVagasOcupadas: vagasDepois.quantidadeOcupada,
        limiteAplicado: limite.limite,
        plano: limite.plano,
        statusPlano: limite.statusPlano,
        fonteLimite: limite.fonteLimite,
        ultimaOperacao: `usuariosEmpresa.remover.${statusAtual}`,
        ultimoAtorUid: uid,
        reconciliadoEm: agora,
      });

      transaction.set(usuarioEmpresaRef, dadosRemocao, { merge: true });

      if (uidAlvo) {
        const dadosPonteiroRemovido = criarPayloadPonteiroRemovido({
          ownerUid,
          empresaId,
          usuarioEmpresaId,
          atorUid: uid,
          atualizadoEm: agora,
        });

        transaction.set(empresaUsuarioRef, dadosPonteiroRemovido, { merge: true });
        transaction.set(vinculoUsuarioRef, dadosPonteiroRemovido, { merge: true });
      }

      convitesPendentes.forEach((conviteSnapshot) => {
        transaction.set(
          conviteSnapshot.ref,
          criarPayloadConviteCancelado({ atorUid: uid, atualizadoEm: agora }),
          { merge: true }
        );
      });

      transaction.set(controleRef, payloadControle, { merge: true });

      return {
        statusAnterior: statusAtual,
        status: "removido",
        uidAlvo: uidAlvo || null,
        vagasAntes: vagasAntes.quantidadeOcupada,
        vagasOcupadas: vagasDepois.quantidadeOcupada,
        limiteUsuarios: limite.limite,
        convitesCancelados: convitesPendentes.length,
      };
    });

    logAuditoriaInfo("usuariosEmpresa.remover: sucesso", {
      uid,
      ownerUid,
      empresaId,
      usuarioEmpresaId,
      uidAlvo: resultado.uidAlvo,
      statusAnterior: resultado.statusAnterior,
      convitesCancelados: resultado.convitesCancelados,
    });

    res.json({
      ok: true,
      status: "removido",
      uidAlvo: resultado.uidAlvo,
      vagasOcupadas: resultado.vagasOcupadas,
      limiteUsuarios: resultado.limiteUsuarios,
    });
  } catch (error) {
    logAuditoriaError("usuariosEmpresa.remover: falha", error, {
      uid,
      ownerUid,
      empresaId,
      usuarioEmpresaId,
      statusCode: error.statusCode || 500,
      codigo: error.codigo || null,
    });

    if (!error.statusCode && db) {
      await registrarErroAuditoria(db, "usuariosEmpresa.remover", error, {
        uid,
        ownerUid,
        empresaId,
        usuarioEmpresaId,
      });
    }

    montarRespostaErro(res, error, "Nao foi possivel remover este usuario.");
  }
};

router.post("/usuarios/remover", authFirebase, criarHandlerRemoverUsuarioEmpresa());

module.exports = router;
module.exports.criarHandlerRemoverUsuarioEmpresa = criarHandlerRemoverUsuarioEmpresa;
