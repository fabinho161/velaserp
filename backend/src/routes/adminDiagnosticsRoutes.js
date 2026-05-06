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

const mapDoc = (docSnap, uidFallback = "") => ({
  id: docSnap.id,
  uid: uidFallback,
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

const carregarSubcolecaoUsuario = async (db, uid, colecao, falhas) => {
  try {
    const snapshot = await db
      .collection("users")
      .doc(uid)
      .collection(colecao)
      .limit(LIMITE_REGISTROS)
      .get();

    return snapshot.docs.map((docSnap) => mapDoc(docSnap, uid));
  } catch (error) {
    logAuditoriaError(`admin.diagnostico.${colecao}: falha ao ler usuario`, error, {
      uid,
      path: `users/${uid}/${colecao}`,
    });
    falhas.push({
      bloco: colecao,
      uid,
      mensagem: error.message || String(error),
      codigo: error.code || null,
    });
    return [];
  }
};

const carregarSubcolecoesUsuarios = async (db, usuarios, colecao, falhas) => {
  const listas = await Promise.all(
    Object.keys(usuarios).map((uid) =>
      carregarSubcolecaoUsuario(db, uid, colecao, falhas)
    )
  );

  return limitarRegistros(listas.flat());
};

const carregarWebhooksGlobais = async (db, falhas) => {
  try {
    const snapshot = await db
      .collection("logs")
      .doc("webhooksMercadoPago")
      .collection("eventos")
      .limit(LIMITE_REGISTROS)
      .get();

    return snapshot.docs.map((docSnap) => mapDoc(docSnap));
  } catch (error) {
    logAuditoriaError("admin.diagnostico.webhooks_globais: falha", error, {
      path: "logs/webhooksMercadoPago/eventos",
    });
    falhas.push({
      bloco: "webhooksGlobais",
      mensagem: error.message || String(error),
      codigo: error.code || null,
    });
    return [];
  }
};

const carregarWebhooks = async (db, usuarios, falhas) => {
  const [logsTecnicos, logsPorUsuario] = await Promise.all([
    carregarWebhooksGlobais(db, falhas),
    carregarSubcolecoesUsuarios(db, usuarios, "webhooksMercadoPago", falhas),
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
    const falhas = [];
    const [checkoutSessions, pagamentos, webhooks] = await Promise.all([
      carregarSubcolecoesUsuarios(db, usuarios, "checkoutSessions", falhas),
      carregarSubcolecoesUsuarios(db, usuarios, "pagamentos", falhas),
      carregarWebhooks(db, usuarios, falhas),
    ]);

    logAuditoriaInfo("admin.diagnostico: carregado", {
      uid,
      checkoutSessions: checkoutSessions.length,
      pagamentos: pagamentos.length,
      webhooks: webhooks.length,
      falhasParciais: falhas.length,
    });

    res.json({
      ok: true,
      parcial: falhas.length > 0,
      falhas,
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
