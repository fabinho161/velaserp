const express = require("express");
const authFirebase = require("../middlewares/authFirebase");
const { FieldValue, getDb } = require("../firebaseAdmin");
const {
  criarPagamentoAvulsoMercadoPago,
  getBoletoDataFromPayment,
  getPaymentIdFromResponse,
  getPaymentStatusFromResponse,
  getPixDataFromPayment,
} = require("../mercadoPago");
const { executarCommitAuditoria, logAuditoriaInfo } = require("../utils/auditoriaFirestore");
const { PLANOS_PAGOS, validarPlanoPago } = require("../utils/planos");

const PAYMENT_METHODS = {
  pix: "pix",
  boleto: "bolbradesco",
};

const getExpirationDate = (method) => {
  const days = method === "boleto" ? 3 : 1;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
};

const onlyDigits = (value) => {
  return String(value || "").replace(/\D/g, "");
};

const sanitizeBoletoPayer = (payer = {}) => {
  return {
    first_name: String(payer.first_name || "").trim(),
    last_name: String(payer.last_name || "").trim(),
    identification: {
      type: "CPF",
      number: onlyDigits(payer.identification?.number || payer.cpf),
    },
    address: {
      zip_code: onlyDigits(payer.address?.zip_code || payer.zip_code),
      street_name: String(payer.address?.street_name || payer.street_name || "").trim(),
      street_number: String(payer.address?.street_number || payer.street_number || "").trim(),
      neighborhood: String(payer.address?.neighborhood || payer.neighborhood || "").trim(),
      city: String(payer.address?.city || payer.city || "").trim(),
      federal_unit: String(payer.address?.federal_unit || payer.federal_unit || "")
        .trim()
        .toUpperCase(),
    },
  };
};

const validarBoletoPayer = (payer) => {
  const camposObrigatorios = [
    payer.first_name,
    payer.last_name,
    payer.identification.number,
    payer.address.zip_code,
    payer.address.street_name,
    payer.address.street_number,
    payer.address.neighborhood,
    payer.address.city,
    payer.address.federal_unit,
  ];

  return camposObrigatorios.every(Boolean) && payer.address.federal_unit.length === 2;
};

const createPaymentHandler = (method) => async (req, res) => {
  const uid = req.user.uid;
  const email = req.user.email || req.user.firebase?.identities?.email?.[0];
  const planoSolicitado = validarPlanoPago(req.body?.planoSolicitado || req.body?.plano);

  logAuditoriaInfo(`${method}.create: uid recebido`, {
    uid,
    email,
    planoSolicitado,
  });

  if (!planoSolicitado) {
    res.status(400).json({
      ok: false,
      error: "Escolha um plano pago valido para pagar.",
    });
    return;
  }

  if (!email) {
    res.status(400).json({
      ok: false,
      error: "O usuario autenticado precisa ter e-mail para criar o pagamento.",
    });
    return;
  }

  const payer = method === "boleto" ? sanitizeBoletoPayer(req.body?.payer) : {};

  if (method === "boleto" && !validarBoletoPayer(payer)) {
    res.status(400).json({
      ok: false,
      error: "Preencha nome, CPF e endereco completo para gerar o boleto.",
    });
    return;
  }

  try {
    const db = getDb();
    const pagamentoRef = db
      .collection("users")
      .doc(uid)
      .collection("pagamentos")
      .doc();
    const checkoutRef = db
      .collection("users")
      .doc(uid)
      .collection("checkoutSessions")
      .doc(pagamentoRef.id);
    const payment = await criarPagamentoAvulsoMercadoPago({
      uid,
      email,
      planoSolicitado,
      pagamentoId: pagamentoRef.id,
      paymentMethodId: PAYMENT_METHODS[method],
      payer,
      dateOfExpiration: getExpirationDate(method),
    });
    const mercadoPagoPaymentId = getPaymentIdFromResponse(payment);
    const status = getPaymentStatusFromResponse(payment);
    const agora = FieldValue.serverTimestamp();
    const dadosMetodo =
      method === "pix" ? getPixDataFromPayment(payment) : getBoletoDataFromPayment(payment);
    const pagamentoAuditoria = {
      gateway: "mercado_pago",
      origem: method,
      planoSolicitado,
      planoNome: PLANOS_PAGOS[planoSolicitado].nome,
      paymentId: mercadoPagoPaymentId,
      mercadoPagoPaymentId,
      statusPagamento: status,
      statusMercadoPago: status,
      metodoPagamento: method,
      valor: PLANOS_PAGOS[planoSolicitado].valor,
      userId: uid,
      checkoutSessionId: checkoutRef.id,
      criadoEm: agora,
      atualizadoEm: agora,
    };
    const checkoutAuditoria = {
      gateway: "mercado_pago",
      origem: method,
      tipoPagamento: "avulso",
      planoSolicitado,
      planoNome: PLANOS_PAGOS[planoSolicitado].nome,
      valor: PLANOS_PAGOS[planoSolicitado].valor,
      statusCheckout: status === "approved" ? "approved" : status || "pending",
      statusMercadoPago: status,
      mercadoPagoStatus: status,
      mercadoPagoPaymentId,
      paymentId: mercadoPagoPaymentId,
      metodoPagamento: method,
      pagamentoId: pagamentoRef.id,
      userId: uid,
      modo: "pagamento_avulso",
      criadoEm: agora,
      atualizadoEm: agora,
    };

    await executarCommitAuditoria({
      action: `${method}.create.persistencia_inicial`,
      db,
      uid,
      refs: {
        pagamento: pagamentoRef,
        checkoutSession: checkoutRef,
      },
      extras: {
        planoSolicitado,
        metodoPagamento: method,
        mercadoPagoPaymentId,
        status,
      },
      commit: () => db.runTransaction(async (transaction) => {
        transaction.set(pagamentoRef, pagamentoAuditoria);
        transaction.set(checkoutRef, checkoutAuditoria);
      }),
    });

    res.json({
      ok: true,
      payment_id: mercadoPagoPaymentId,
      status,
      valor: PLANOS_PAGOS[planoSolicitado].valor,
      vencimento: payment.date_of_expiration || payment.response?.date_of_expiration || null,
      ...dadosMetodo,
    });
  } catch (error) {
    console.error(`Erro ao criar pagamento Mercado Pago ${method}`, error);
    res.status(500).json({
      ok: false,
      error: error.message || "Nao foi possivel preparar o pagamento agora.",
    });
  }
};

const pixRouter = express.Router();
const boletoRouter = express.Router();

pixRouter.post("/create", authFirebase, createPaymentHandler("pix"));
boletoRouter.post("/create", authFirebase, createPaymentHandler("boleto"));

module.exports = {
  boletoRouter,
  pixRouter,
};
