const express = require("express");
const { FieldValue, getDb } = require("../firebaseAdmin");
const {
  consultarPagamentoMercadoPago,
  consultarPreapprovalMercadoPago,
} = require("../mercadoPago");
const {
  getDataInputValue,
  getPreapprovalIdFromWebhook,
  normalizarStatus,
} = require("../utils/datas");
const { PLANOS_PAGOS, normalizarPlano } = require("../utils/planos");

const router = express.Router();

const getCheckoutSessionFromExternalReference = async (db, externalReference) => {
  const match = String(externalReference || "").match(
    /^users\/([^/]+)\/checkoutSessions\/([^/]+)$/
  );

  if (!match) return null;

  const [, uid, sessionId] = match;
  const ref = db
    .collection("users")
    .doc(uid)
    .collection("checkoutSessions")
    .doc(sessionId);
  const snapshot = await ref.get();

  return snapshot.exists ? snapshot : null;
};

const getPagamentoFromExternalReference = async (db, externalReference) => {
  const match = String(externalReference || "").match(
    /^users\/([^/]+)\/pagamentos\/([^/]+)$/
  );

  if (!match) return null;

  const [, uid, pagamentoId] = match;
  const ref = db
    .collection("users")
    .doc(uid)
    .collection("pagamentos")
    .doc(pagamentoId);
  const snapshot = await ref.get();

  return snapshot.exists ? snapshot : null;
};

const localizarCheckoutSession = async (db, preapproval) => {
  const mercadoPagoPreapprovalId = preapproval.id;

  if (preapproval.external_reference) {
    const snapshot = await getCheckoutSessionFromExternalReference(
      db,
      preapproval.external_reference
    );

    if (snapshot) return snapshot;
  }

  const sessionsSnapshot = await db
    .collectionGroup("checkoutSessions")
    .where("mercadoPagoPreapprovalId", "==", mercadoPagoPreapprovalId)
    .limit(1)
    .get();

  return sessionsSnapshot.empty ? null : sessionsSnapshot.docs[0];
};

const localizarPagamento = async (db, payment) => {
  const mercadoPagoPaymentId = String(payment.id || "");

  if (payment.external_reference) {
    const snapshot = await getPagamentoFromExternalReference(
      db,
      payment.external_reference
    );

    if (snapshot) return snapshot;
  }

  const pagamentosSnapshot = await db
    .collectionGroup("pagamentos")
    .where("mercadoPagoPaymentId", "==", mercadoPagoPaymentId)
    .limit(1)
    .get();

  return pagamentosSnapshot.empty ? null : pagamentosSnapshot.docs[0];
};

const getUidFromCheckoutSnapshot = (checkoutSnapshot) => {
  return checkoutSnapshot.data()?.userId || checkoutSnapshot.ref.parent.parent?.id || null;
};

const getUidFromPagamentoSnapshot = (pagamentoSnapshot) => {
  return pagamentoSnapshot.data()?.userId || pagamentoSnapshot.ref.parent.parent?.id || null;
};

const getValorPreapproval = (preapproval, checkoutSession) => {
  const valorMercadoPago = Number(preapproval.auto_recurring?.transaction_amount);
  if (Number.isFinite(valorMercadoPago)) return valorMercadoPago;

  const valorCheckout = Number(checkoutSession.valor);
  if (Number.isFinite(valorCheckout)) return valorCheckout;

  const plano = PLANOS_PAGOS[checkoutSession.planoSolicitado];
  return plano?.valor || 0;
};

const getValorPagamento = (payment, pagamento) => {
  const valorMercadoPago = Number(payment.transaction_amount);
  if (Number.isFinite(valorMercadoPago)) return valorMercadoPago;

  const valorPagamento = Number(pagamento.valor);
  if (Number.isFinite(valorPagamento)) return valorPagamento;

  const plano = PLANOS_PAGOS[pagamento.planoSolicitado];
  return plano?.valor || 0;
};

const getWebhookResourceType = (req) => {
  const payload = req.body || {};
  const query = req.query || {};
  const rawType = String(
    payload.type ||
    payload.topic ||
    payload.action ||
    query.type ||
    query.topic ||
    ""
  ).toLowerCase();

  if (rawType.includes("payment")) return "payment";
  if (rawType.includes("preapproval") || rawType.includes("subscription")) {
    return "preapproval";
  }

  return "preapproval";
};

const getMetodoPagamento = (payment, pagamento) => {
  const metodoSalvo = String(pagamento.metodoPagamento || "").toLowerCase();
  if (metodoSalvo) return metodoSalvo;

  const paymentMethodId = String(payment.payment_method_id || "").toLowerCase();
  if (paymentMethodId === "pix") return "pix";
  if (paymentMethodId === "bolbradesco") return "boleto";

  return paymentMethodId || "mercado_pago";
};

const getVencimentoPagamentoAvulso = (payment) => {
  const base = payment.date_approved || payment.date_last_updated || new Date().toISOString();
  const date = new Date(base);

  if (Number.isNaN(date.getTime())) {
    return getDataInputValue(null);
  }

  date.setDate(date.getDate() + 30);
  return date.toISOString().slice(0, 10);
};

const processarWebhookPagamento = async ({ db, logRef, paymentId, res }) => {
  let payment = null;

  try {
    payment = await consultarPagamentoMercadoPago({ paymentId });
  } catch (error) {
    await logRef.set({
      statusProcessamento: "payment_validation_failed",
      mercadoPagoPaymentId: paymentId,
      erroValidacao: error.message,
      atualizadoEm: FieldValue.serverTimestamp(),
    }, { merge: true });

    res.status(200).json({
      ok: true,
      received: true,
      processed: false,
      reason: "mercado_pago_payment_validation_failed",
      logId: logRef.id,
    });
    return;
  }

  const statusMercadoPago = normalizarStatus(payment.status);
  const pagamentoSnapshot = await localizarPagamento(db, payment);

  if (!pagamentoSnapshot) {
    await logRef.set({
      statusProcessamento: "payment_validated_payment_not_found",
      mercadoPagoPaymentId: payment.id || paymentId,
      statusMercadoPago,
      atualizadoEm: FieldValue.serverTimestamp(),
    }, { merge: true });

    res.status(200).json({
      ok: true,
      received: true,
      processed: false,
      reason: "payment_document_not_found",
      logId: logRef.id,
    });
    return;
  }

  const pagamento = pagamentoSnapshot.data();
  const uid = getUidFromPagamentoSnapshot(pagamentoSnapshot);
  const planoSolicitado = normalizarPlano(
    pagamento.planoSolicitado || payment.metadata?.plano_solicitado
  );

  if (!uid || !PLANOS_PAGOS[planoSolicitado]) {
    await logRef.set({
      statusProcessamento: "payment_validated_invalid_document",
      mercadoPagoPaymentId: payment.id || paymentId,
      statusMercadoPago,
      pagamentoId: pagamentoSnapshot.id,
      userId: uid,
      planoSolicitado,
      atualizadoEm: FieldValue.serverTimestamp(),
    }, { merge: true });

    res.status(200).json({
      ok: true,
      received: true,
      processed: false,
      reason: "invalid_payment_document",
      logId: logRef.id,
    });
    return;
  }

  const statusAtivaPlano = statusMercadoPago === "approved";
  const valorPago = getValorPagamento(payment, pagamento);
  const metodoPagamento = getMetodoPagamento(payment, pagamento);
  const assinaturaRef = db
    .collection("users")
    .doc(uid)
    .collection("assinatura")
    .doc("plano");
  const agora = FieldValue.serverTimestamp();
  const batch = db.batch();

  batch.set(pagamentoSnapshot.ref, {
    gateway: "mercado_pago",
    origem: pagamento.origem || metodoPagamento,
    planoSolicitado,
    mercadoPagoPaymentId: String(payment.id || paymentId),
    paymentId: String(payment.id || paymentId),
    statusMercadoPago,
    statusPagamento: statusAtivaPlano ? "approved" : statusMercadoPago || "pending",
    metodoPagamento,
    valor: valorPago,
    userId: uid,
    atualizadoEm: agora,
    ultimoWebhookLogId: logRef.id,
  }, { merge: true });

  if (statusAtivaPlano) {
    batch.set(assinaturaRef, {
      plano: planoSolicitado,
      status: "active",
      vencimento: getVencimentoPagamentoAvulso(payment),
      formaPagamento: metodoPagamento,
      valorPago,
      ativadoManual: false,
      mercadoPagoPaymentId: String(payment.id || paymentId),
      gateway: "mercado_pago",
      atualizadoEm: agora,
    }, { merge: true });
  }

  batch.set(logRef, {
    statusProcessamento: statusAtivaPlano
      ? "payment_validated_subscription_activated"
      : "payment_validated_status_registered",
    mercadoPagoPaymentId: String(payment.id || paymentId),
    statusMercadoPago,
    pagamentoId: pagamentoSnapshot.id,
    userId: uid,
    planoSolicitado,
    metodoPagamento,
    assinaturaAtualizada: statusAtivaPlano,
    atualizadoEm: agora,
  }, { merge: true });

  await batch.commit();

  res.status(200).json({
    ok: true,
    received: true,
    processed: true,
    assinaturaAtualizada: statusAtivaPlano,
    statusMercadoPago,
    logId: logRef.id,
  });
};

router.post("/mercado-pago", async (req, res) => {
  const db = getDb();
  const logRef = db
    .collection("logs")
    .doc("webhooksMercadoPago")
    .collection("eventos")
    .doc();
  const payload = req.body || {};
  const preapprovalId = getPreapprovalIdFromWebhook(req);

  try {
    await logRef.set({
      gateway: "mercado_pago",
      origem: "webhook_render",
      statusProcessamento: "received",
      method: req.method,
      query: req.query || {},
      payload,
      headers: {
        userAgent: req.get("user-agent") || null,
        xRequestId: req.get("x-request-id") || null,
        xSignature: req.get("x-signature") || null,
        xMeliSignature: req.get("x-meli-signature") || null,
      },
      criadoEm: FieldValue.serverTimestamp(),
    });

    if (!preapprovalId) {
      await logRef.set({
        statusProcessamento: "ignored_missing_preapproval_id",
        atualizadoEm: FieldValue.serverTimestamp(),
      }, { merge: true });

      res.status(200).json({
        ok: true,
        received: true,
        processed: false,
        reason: "missing_preapproval_id",
        logId: logRef.id,
      });
      return;
    }

    if (getWebhookResourceType(req) === "payment") {
      await processarWebhookPagamento({
        db,
        logRef,
        paymentId: preapprovalId,
        res,
      });
      return;
    }

    let preapproval = null;

    try {
      preapproval = await consultarPreapprovalMercadoPago({ preapprovalId });
    } catch (error) {
      await logRef.set({
        statusProcessamento: "validation_failed",
        mercadoPagoPreapprovalId: preapprovalId,
        erroValidacao: error.message,
        atualizadoEm: FieldValue.serverTimestamp(),
      }, { merge: true });

      res.status(200).json({
        ok: true,
        received: true,
        processed: false,
        reason: "mercado_pago_validation_failed",
        logId: logRef.id,
      });
      return;
    }

    const statusMercadoPago = normalizarStatus(preapproval.status);
    const checkoutSnapshot = await localizarCheckoutSession(db, preapproval);

    if (!checkoutSnapshot) {
      await logRef.set({
        statusProcessamento: "validated_checkout_not_found",
        mercadoPagoPreapprovalId: preapproval.id || preapprovalId,
        statusMercadoPago,
        atualizadoEm: FieldValue.serverTimestamp(),
      }, { merge: true });

      res.status(200).json({
        ok: true,
        received: true,
        processed: false,
        reason: "checkout_session_not_found",
        logId: logRef.id,
      });
      return;
    }

    const checkoutSession = checkoutSnapshot.data();
    const uid = getUidFromCheckoutSnapshot(checkoutSnapshot);
    const planoSolicitado = normalizarPlano(checkoutSession.planoSolicitado);

    if (!uid || !PLANOS_PAGOS[planoSolicitado]) {
      await logRef.set({
        statusProcessamento: "validated_invalid_checkout_session",
        mercadoPagoPreapprovalId: preapproval.id || preapprovalId,
        statusMercadoPago,
        checkoutSessionId: checkoutSnapshot.id,
        userId: uid,
        planoSolicitado,
        atualizadoEm: FieldValue.serverTimestamp(),
      }, { merge: true });

      res.status(200).json({
        ok: true,
        received: true,
        processed: false,
        reason: "invalid_checkout_session",
        logId: logRef.id,
      });
      return;
    }

    const statusAtivaPlano = ["authorized", "active"].includes(statusMercadoPago);
    const statusCheckout = statusAtivaPlano ? "approved" : statusMercadoPago || "pending";
    const valorPago = getValorPreapproval(preapproval, checkoutSession);
    const assinaturaRef = db
      .collection("users")
      .doc(uid)
      .collection("assinatura")
      .doc("plano");
    const pagamentoRef = db
      .collection("users")
      .doc(uid)
      .collection("pagamentos")
      .doc(checkoutSnapshot.id);
    const agora = FieldValue.serverTimestamp();
    const batch = db.batch();

    batch.set(checkoutSnapshot.ref, {
      statusCheckout,
      statusMercadoPago,
      mercadoPagoStatus: statusMercadoPago,
      mercadoPagoPreapprovalId: preapproval.id || preapprovalId,
      atualizadoEm: agora,
      ultimoWebhookLogId: logRef.id,
    }, { merge: true });

    batch.set(pagamentoRef, {
      gateway: "mercado_pago",
      origem: "webhook_render",
      planoSolicitado,
      checkoutSessionId: checkoutSnapshot.id,
      mercadoPagoPreapprovalId: preapproval.id || preapprovalId,
      mercadoPagoStatus: statusMercadoPago,
      statusMercadoPago,
      statusPagamento: statusAtivaPlano ? "approved" : statusCheckout,
      valor: valorPago,
      paymentId: preapproval.id || preapprovalId,
      userId: uid,
      atualizadoEm: agora,
    }, { merge: true });

    if (statusAtivaPlano) {
      batch.set(assinaturaRef, {
        plano: planoSolicitado,
        status: "active",
        vencimento: getDataInputValue(preapproval.next_payment_date),
        formaPagamento: "mercado_pago",
        valorPago,
        ativadoManual: false,
        mercadoPagoPreapprovalId: preapproval.id || preapprovalId,
        gateway: "mercado_pago",
        atualizadoEm: agora,
      }, { merge: true });
    }

    batch.set(logRef, {
      statusProcessamento: statusAtivaPlano
        ? "validated_subscription_activated"
        : "validated_status_registered",
      mercadoPagoPreapprovalId: preapproval.id || preapprovalId,
      statusMercadoPago,
      checkoutSessionId: checkoutSnapshot.id,
      userId: uid,
      planoSolicitado,
      assinaturaAtualizada: statusAtivaPlano,
      atualizadoEm: agora,
    }, { merge: true });

    await batch.commit();

    res.status(200).json({
      ok: true,
      received: true,
      processed: true,
      assinaturaAtualizada: statusAtivaPlano,
      statusMercadoPago,
      logId: logRef.id,
    });
  } catch (error) {
    console.error("Erro ao processar webhook Mercado Pago", error);
    res.status(500).json({
      ok: false,
      error: "Erro ao processar webhook.",
      logId: logRef.id,
    });
  }
});

module.exports = router;
