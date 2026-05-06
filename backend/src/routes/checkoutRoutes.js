const express = require("express");
const authFirebase = require("../middlewares/authFirebase");
const { FieldValue, getDb } = require("../firebaseAdmin");
const {
  criarPreapprovalMercadoPago,
  getCheckoutUrlFromPreapproval,
  getPreapprovalDateCreatedFromResponse,
  getPreapprovalIdFromResponse,
  getPreapprovalStatusFromResponse,
} = require("../mercadoPago");
const { getReturnUrls } = require("../utils/datas");
const { PLANOS_PAGOS, validarPlanoPago } = require("../utils/planos");

const router = express.Router();

router.post("/mercado-pago", authFirebase, async (req, res) => {
  const uid = req.user.uid;
  const email = req.user.email || req.user.firebase?.identities?.email?.[0];
  const planoSolicitado = validarPlanoPago(req.body?.planoSolicitado || req.body?.plano);

  if (!planoSolicitado) {
    res.status(400).json({
      ok: false,
      error: "Escolha um plano pago valido para assinar.",
    });
    return;
  }

  if (!email) {
    res.status(400).json({
      ok: false,
      error: "O usuario autenticado precisa ter e-mail para criar a assinatura.",
    });
    return;
  }

  try {
    const db = getDb();
    const checkoutRef = db
      .collection("users")
      .doc(uid)
      .collection("checkoutSessions")
      .doc();
    const pagamentoRef = db
      .collection("users")
      .doc(uid)
      .collection("pagamentos")
      .doc(checkoutRef.id);
    const returnUrls = getReturnUrls();
    const preapproval = await criarPreapprovalMercadoPago({
      uid,
      email,
      planoSolicitado,
      checkoutSessionId: checkoutRef.id,
      returnUrls,
    });

    const checkoutUrl = getCheckoutUrlFromPreapproval(preapproval);
    const mercadoPagoPreapprovalId = getPreapprovalIdFromResponse(preapproval);
    const mercadoPagoStatus = getPreapprovalStatusFromResponse(preapproval);
    const mercadoPagoDateCreated = getPreapprovalDateCreatedFromResponse(preapproval);

    if (!checkoutUrl) {
      res.status(502).json({
        ok: false,
        error: "Mercado Pago criou a assinatura, mas nao retornou a URL do checkout.",
      });
      return;
    }

    const agora = FieldValue.serverTimestamp();
    const checkoutSession = {
      gateway: "mercado_pago",
      origem: "checkout_render",
      planoSolicitado,
      planoNome: PLANOS_PAGOS[planoSolicitado].nome,
      valor: PLANOS_PAGOS[planoSolicitado].valor,
      statusCheckout: "pending",
      checkoutUrl,
      mercadoPagoPreapprovalId,
      mercadoPagoStatus,
      mercadoPagoDateCreated,
      returnUrls,
      modo: "render_preapproval",
      userId: uid,
      criadoEm: agora,
      atualizadoEm: agora,
    };
    const pagamentoPendente = {
      gateway: "mercado_pago",
      origem: "checkout_render",
      planoSolicitado,
      checkoutSessionId: checkoutRef.id,
      paymentId: null,
      mercadoPagoPreapprovalId,
      mercadoPagoStatus,
      statusPagamento: "pending",
      valor: PLANOS_PAGOS[planoSolicitado].valor,
      userId: uid,
      criadoEm: agora,
      atualizadoEm: agora,
    };

    await db.runTransaction(async (transaction) => {
      transaction.set(checkoutRef, checkoutSession);
      transaction.set(pagamentoRef, pagamentoPendente);
    });

    res.json({
      ok: true,
      checkoutUrl,
      sessionId: checkoutRef.id,
      mercadoPagoPreapprovalId,
      statusCheckout: "pending",
    });
  } catch (error) {
    console.error("Erro ao criar checkout Mercado Pago", error);
    res.status(500).json({
      ok: false,
      error: error.message || "Nao foi possivel preparar o checkout agora.",
    });
  }
});

module.exports = router;
