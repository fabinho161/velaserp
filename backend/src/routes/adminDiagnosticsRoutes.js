const express = require("express");
const authFirebase = require("../middlewares/authFirebase");
const { getDb } = require("../firebaseAdmin");
const {
  logAuditoriaError,
  logAuditoriaInfo,
  registrarErroAuditoria,
} = require("../utils/auditoriaFirestore");

const LIMITE_REGISTROS = 30;

const router = express.Router();

const obterTempoSistema = (valor) => {
  if (!valor) return 0;
  if (valor.toDate) return valor.toDate().getTime();
  if (valor instanceof Date) return valor.getTime();

  if (typeof valor === "string") {
    const data = new Date(valor);
    return Number.isNaN(data.getTime()) ? 0 : data.getTime();
  }

  return 0;
};

const ordenarPorAtualizacao = (items) => {
  return [...items].sort((a, b) =>
    obterTempoSistema(b.atualizadoEm || b.criadoEm) -
    obterTempoSistema(a.atualizadoEm || a.criadoEm)
  );
};

const limitarRegistros = (items) => ordenarPorAtualizacao(items).slice(0, LIMITE_REGISTROS);

const getUidFromDoc = (docSnap) => {
  return docSnap.ref.parent.parent?.id || "";
};

const mapDoc = (docSnap, uidFallback = "") => ({
  id: docSnap.id,
  uid: uidFallback || getUidFromDoc(docSnap),
  path: docSnap.ref.path,
  ...docSnap.data(),
});

const carregarUsuarios = async (db) => {
  const snapshot = await db.collection("users").get();

  return snapshot.docs.reduce((acc, docSnap) => {
    acc[docSnap.id] = {
      uid: docSnap.id,
      path: docSnap.ref.path,
      ...docSnap.data(),
    };
    return acc;
  }, {});
};

const carregarCollectionGroup = async (db, colecao) => {
  const snapshot = await db
    .collectionGroup(colecao)
    .orderBy("atualizadoEm", "desc")
    .limit(LIMITE_REGISTROS)
    .get();

  return snapshot.docs.map((docSnap) => mapDoc(docSnap));
};

const carregarWebhooks = async (db, usuarios) => {
  const [logsTecnicos, logsPorUsuario] = await Promise.all([
    db
      .collection("logs")
      .doc("webhooksMercadoPago")
      .collection("eventos")
      .orderBy("atualizadoEm", "desc")
      .limit(LIMITE_REGISTROS)
      .get()
      .then((snapshot) => snapshot.docs.map((docSnap) => mapDoc(docSnap)))
      .catch((error) => {
        logAuditoriaError("admin.diagnostico.webhooks_globais: falha", error);
        return [];
      }),
    Promise.all(
      Object.keys(usuarios).map(async (uid) => {
        const snapshot = await db
          .collection("users")
          .doc(uid)
          .collection("webhooksMercadoPago")
          .orderBy("atualizadoEm", "desc")
          .limit(LIMITE_REGISTROS)
          .get();

        return snapshot.docs.map((docSnap) => mapDoc(docSnap, uid));
      })
    ).then((listas) => listas.flat()),
  ]);

  const porPathOuId = new Map();

  [...logsTecnicos, ...logsPorUsuario].forEach((webhook) => {
    const chave = webhook.path || webhook.id;
    const atual = porPathOuId.get(chave);

    if (
      !atual ||
      obterTempoSistema(webhook.atualizadoEm || webhook.criadoEm) >=
        obterTempoSistema(atual.atualizadoEm || atual.criadoEm)
    ) {
      porPathOuId.set(chave, webhook);
    }
  });

  return limitarRegistros([...porPathOuId.values()]);
};

router.get("/pagamentos/diagnostico", authFirebase, async (req, res) => {
  const db = getDb();
  const uid = req.user.uid;

  try {
    logAuditoriaInfo("admin.diagnostico: solicitado", { uid });

    const adminSnapshot = await db.collection("users").doc(uid).get();
    const adminData = adminSnapshot.exists ? adminSnapshot.data() : {};

    if (adminData?.role !== "admin_master") {
      res.status(403).json({
        ok: false,
        error: "Apenas administradores master podem acessar o diagnostico de pagamentos.",
      });
      return;
    }

    const usuarios = await carregarUsuarios(db);
    const [checkoutSessions, pagamentos, webhooks] = await Promise.all([
      carregarCollectionGroup(db, "checkoutSessions"),
      carregarCollectionGroup(db, "pagamentos"),
      carregarWebhooks(db, usuarios),
    ]);

    logAuditoriaInfo("admin.diagnostico: carregado", {
      uid,
      checkoutSessions: checkoutSessions.length,
      pagamentos: pagamentos.length,
      webhooks: webhooks.length,
    });

    res.json({
      ok: true,
      usuarios,
      checkoutSessions,
      pagamentos,
      webhooks,
    });
  } catch (error) {
    logAuditoriaError("admin.diagnostico: falha", error, { uid });
    await registrarErroAuditoria(db, "admin.diagnostico", error, { uid });

    res.status(500).json({
      ok: false,
      error: error.message || "Erro ao carregar diagnostico de pagamentos.",
    });
  }
});

module.exports = router;
