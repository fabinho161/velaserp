const express = require("express");
const authFirebase = require("../middlewares/authFirebase");
const { FieldValue, getDb } = require("../firebaseAdmin");
const { enviarEmailConvite } = require("../services/emailConvites");
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

router.post("/usuarios/remover", authFirebase, async (req, res) => {
  const db = getDb();
  const uid = req.user.uid;
  const ownerUid = String(req.body?.ownerUid || "").trim();
  const empresaId = String(req.body?.empresaId || "").trim();
  const usuarioEmpresaId = String(req.body?.usuarioEmpresaId || "").trim();

  if (!ownerUid || !empresaId || !usuarioEmpresaId) {
    res.status(400).json({
      ok: false,
      error: "Dados da empresa ou usuario incompletos.",
    });
    return;
  }

  try {
    const empresaRef = db
      .collection("users")
      .doc(ownerUid)
      .collection("empresas")
      .doc(empresaId);
    const usuarioEmpresaRef = empresaRef
      .collection("usuariosEmpresa")
      .doc(usuarioEmpresaId);

    const [empresaSnapshot, usuarioEmpresaSnapshot] = await Promise.all([
      empresaRef.get(),
      usuarioEmpresaRef.get(),
    ]);

    if (!empresaSnapshot.exists || !usuarioEmpresaSnapshot.exists) {
      res.status(404).json({
        ok: false,
        error: "Empresa ou usuario da empresa nao encontrado.",
      });
      return;
    }

    const permissao = await carregarPermissaoGerenciarUsuarios({
      empresaRef,
      ownerUid,
      uid,
    });

    if (!permissao.permitido) {
      res.status(403).json({
        ok: false,
        error: "Voce nao tem permissao para remover usuarios desta empresa.",
      });
      return;
    }

    const usuarioEmpresa = usuarioEmpresaSnapshot.data();
    const uidAlvo = String(usuarioEmpresa.uidAuth || "").trim();

    if (usuarioEmpresa.dono === true || uidAlvo === ownerUid || usuarioEmpresaId === ownerUid) {
      res.status(403).json({
        ok: false,
        error: "O dono principal da empresa nao pode ser removido.",
      });
      return;
    }

    if (uidAlvo && uidAlvo === uid) {
      res.status(403).json({
        ok: false,
        error: "Voce nao pode remover seu proprio usuario da empresa.",
      });
      return;
    }

    if (uidAlvo) {
      const usuarioAuthSnapshot = await db.collection("users").doc(uidAlvo).get();
      const roleGlobalAlvo = usuarioAuthSnapshot.exists
        ? usuarioAuthSnapshot.data()?.role
        : null;

      if (roleGlobalAlvo === "admin_master") {
        res.status(403).json({
          ok: false,
          error: "Admin Master SaaS nao pode ser removido por administrador da empresa.",
        });
        return;
      }
    }

    const agora = FieldValue.serverTimestamp();
    const batch = db.batch();
    const dadosRemocao = {
      status: "removido",
      convitePendente: false,
      removidoEm: agora,
      removidoPor: uid,
      atualizadoEm: agora,
      role: normalizarRoleEmpresa(usuarioEmpresa),
    };

    batch.set(usuarioEmpresaRef, dadosRemocao, { merge: true });

    if (uidAlvo) {
      const empresaUsuarioRef = db
        .collection("users")
        .doc(uidAlvo)
        .collection("empresas")
        .doc(empresaId);
      const vinculoUsuarioRef = db
        .collection("usuariosPorAuth")
        .doc(uidAlvo)
        .collection("empresas")
        .doc(empresaId);

      batch.set(
        empresaUsuarioRef,
        {
          status: "removido",
          removidoEm: agora,
          removidoPor: uid,
          atualizadoEm: agora,
          ownerUid,
          empresaId,
          usuarioEmpresaId,
        },
        { merge: true }
      );

      batch.set(
        vinculoUsuarioRef,
        {
          status: "removido",
          removidoEm: agora,
          removidoPor: uid,
          atualizadoEm: agora,
          ownerUid,
          empresaId,
          usuarioEmpresaId,
        },
        { merge: true }
      );
    }

    if (usuarioEmpresa.conviteToken && normalizarStatus(usuarioEmpresa.status) === "pendente") {
      batch.set(
        db.collection("convitesEmpresa").doc(usuarioEmpresa.conviteToken),
        {
          status: "cancelado",
          canceladoEm: agora,
          canceladoPor: uid,
          atualizadoEm: agora,
        },
        { merge: true }
      );
    }

    await batch.commit();

    logAuditoriaInfo("usuariosEmpresa.remover: sucesso", {
      uid,
      ownerUid,
      empresaId,
      usuarioEmpresaId,
      uidAlvo: uidAlvo || null,
    });

    res.json({
      ok: true,
      status: "removido",
      uidAlvo: uidAlvo || null,
    });
  } catch (error) {
    logAuditoriaError("usuariosEmpresa.remover: falha", error, {
      uid,
      ownerUid,
      empresaId,
      usuarioEmpresaId,
    });
    await registrarErroAuditoria(db, "usuariosEmpresa.remover", error, {
      uid,
      ownerUid,
      empresaId,
      usuarioEmpresaId,
    });

    res.status(500).json({
      ok: false,
      error: "Nao foi possivel remover este usuario.",
    });
  }
});

module.exports = router;
