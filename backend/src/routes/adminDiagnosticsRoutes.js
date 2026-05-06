const express = require("express");
const authFirebase = require("../middlewares/authFirebase");
const { getDb } = require("../firebaseAdmin");
const {
  logAuditoriaError,
  logAuditoriaInfo,
  registrarErroAuditoria,
} = require("../utils/auditoriaFirestore");

const LIMITE_REGISTROS = 30;
const STATUS_LIMPEZA_TESTE = new Set([
  "pending",
  "pendente",
  "cancelled",
  "canceled",
  "cancelado",
  "expired",
  "expirado",
]);
const STATUS_PROTEGIDOS = new Set([
  "approved",
  "active",
  "authorized",
  "aprovado",
  "ativo",
]);

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

const validarAdminMaster = async (db, uid) => {
  const adminSnapshot = await db.collection("users").doc(uid).get();
  const adminData = adminSnapshot.exists ? adminSnapshot.data() : {};

  return adminData?.role === "admin_master";
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

const normalizarStatus = (status) => {
  return String(status || "").trim().toLowerCase();
};

const getStatusAuditoria = (data = {}, colecao = "") => {
  const statusPrincipal = colecao === "pagamentos"
    ? data.statusPagamento
    : data.statusCheckout;

  return [
    statusPrincipal,
    data.statusMercadoPago,
    data.mercadoPagoStatus,
  ].filter(Boolean).map(normalizarStatus);
};

const isRegistroTesteLimpavel = (data = {}, colecao = "") => {
  const valor = Number(data.valor);
  const statusList = getStatusAuditoria(data, colecao);

  if (valor !== 1) return false;
  if (valor > 1) return false;
  if (statusList.some((status) => STATUS_PROTEGIDOS.has(status))) return false;

  return statusList.some((status) => STATUS_LIMPEZA_TESTE.has(status));
};

const carregarRegistrosLimpaveisUsuario = async (db, uid, colecao, falhas) => {
  try {
    const snapshot = await db
      .collection("users")
      .doc(uid)
      .collection(colecao)
      .get();

    return snapshot.docs
      .filter((docSnap) => isRegistroTesteLimpavel(docSnap.data(), colecao))
      .map((docSnap) => ({
        ref: docSnap.ref,
        id: docSnap.id,
        uid,
        colecao,
        path: docSnap.ref.path,
        valor: Number(docSnap.data()?.valor),
        status: getStatusAuditoria(docSnap.data(), colecao),
      }));
  } catch (error) {
    logAuditoriaError(`admin.limpeza.${colecao}: falha ao ler usuario`, error, {
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

const carregarRegistrosLimpaveis = async (db, usuarios) => {
  const falhas = [];
  const listas = await Promise.all(
    Object.keys(usuarios).flatMap((uid) => [
      carregarRegistrosLimpaveisUsuario(db, uid, "checkoutSessions", falhas),
      carregarRegistrosLimpaveisUsuario(db, uid, "pagamentos", falhas),
    ])
  );
  const registros = listas.flat();

  return {
    falhas,
    registros,
    resumo: {
      total: registros.length,
      checkoutSessions: registros.filter((registro) =>
        registro.colecao === "checkoutSessions"
      ).length,
      pagamentos: registros.filter((registro) =>
        registro.colecao === "pagamentos"
      ).length,
    },
    amostras: registros.slice(0, 10).map((registro) => ({
      path: registro.path,
      valor: registro.valor,
      status: registro.status,
      colecao: registro.colecao,
      uid: registro.uid,
    })),
  };
};

const apagarRegistrosEmLotes = async (db, registros) => {
  let apagados = 0;

  for (let index = 0; index < registros.length; index += 400) {
    const loteRegistros = registros.slice(index, index + 400);
    const batch = db.batch();

    loteRegistros.forEach((registro) => {
      batch.delete(registro.ref);
    });

    await batch.commit();
    apagados += loteRegistros.length;
  }

  return apagados;
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

    if (!(await validarAdminMaster(db, uid))) {
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

router.get("/pagamentos/limpeza-testes/preview", authFirebase, async (req, res) => {
  const db = getDb();
  const uid = req.user.uid;

  try {
    logAuditoriaInfo("admin.limpeza.preview: solicitado", { uid });

    if (!(await validarAdminMaster(db, uid))) {
      res.status(403).json({
        ok: false,
        error: "Apenas administradores master podem visualizar a limpeza de testes.",
      });
      return;
    }

    const usuarios = await carregarUsuarios(db);
    const resultado = await carregarRegistrosLimpaveis(db, usuarios);

    logAuditoriaInfo("admin.limpeza.preview: calculado", {
      uid,
      ...resultado.resumo,
      falhasParciais: resultado.falhas.length,
    });

    res.json({
      ok: true,
      parcial: resultado.falhas.length > 0,
      falhas: resultado.falhas,
      resumo: resultado.resumo,
      amostras: resultado.amostras,
    });
  } catch (error) {
    logAuditoriaError("admin.limpeza.preview: falha", error, { uid });
    await registrarErroAuditoria(db, "admin.limpeza.preview", error, { uid });

    res.status(500).json({
      ok: false,
      error: error.message || "Erro ao calcular limpeza de testes.",
    });
  }
});

router.post("/pagamentos/limpeza-testes", authFirebase, async (req, res) => {
  const db = getDb();
  const uid = req.user.uid;

  try {
    logAuditoriaInfo("admin.limpeza.executar: solicitado", { uid });

    if (!(await validarAdminMaster(db, uid))) {
      res.status(403).json({
        ok: false,
        error: "Apenas administradores master podem executar a limpeza de testes.",
      });
      return;
    }

    if (req.body?.confirmar !== true) {
      res.status(400).json({
        ok: false,
        error: "Confirmação obrigatória para executar a limpeza.",
      });
      return;
    }

    const usuarios = await carregarUsuarios(db);
    const resultado = await carregarRegistrosLimpaveis(db, usuarios);
    const apagados = await apagarRegistrosEmLotes(db, resultado.registros);

    logAuditoriaInfo("admin.limpeza.executar: concluido", {
      uid,
      apagados,
      ...resultado.resumo,
      falhasParciais: resultado.falhas.length,
    });

    res.json({
      ok: true,
      apagados,
      parcial: resultado.falhas.length > 0,
      falhas: resultado.falhas,
      resumo: resultado.resumo,
    });
  } catch (error) {
    logAuditoriaError("admin.limpeza.executar: falha", error, { uid });
    await registrarErroAuditoria(db, "admin.limpeza.executar", error, { uid });

    res.status(500).json({
      ok: false,
      error: error.message || "Erro ao executar limpeza de testes.",
    });
  }
});

module.exports = router;
