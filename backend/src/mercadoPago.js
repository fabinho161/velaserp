const { MercadoPagoConfig, Payment, PreApproval } = require("mercadopago");
const { PLANOS_PAGOS } = require("./utils/planos");

const getMercadoPagoToken = () => {
  return process.env.MERCADO_PAGO_ACCESS_TOKEN || "";
};

const allowProductionPayments = () => {
  return String(process.env.ALLOW_PRODUCTION_PAYMENTS || "false").toLowerCase() === "true";
};

const validarTokenMercadoPago = () => {
  const token = getMercadoPagoToken();

  if (!token) {
    throw new Error("MERCADO_PAGO_ACCESS_TOKEN nao configurado.");
  }

  if (!token.startsWith("TEST-") && !allowProductionPayments()) {
    throw new Error("Pagamentos em producao bloqueados. Use token TEST- ou habilite ALLOW_PRODUCTION_PAYMENTS.");
  }

  return token;
};

const getPreApprovalClient = (token) => {
  const client = new MercadoPagoConfig({ accessToken: token });
  return new PreApproval(client);
};

const getPaymentClient = (token) => {
  const client = new MercadoPagoConfig({ accessToken: token });
  return new Payment(client);
};

const criarPreapprovalMercadoPago = async ({
  uid,
  email,
  planoSolicitado,
  checkoutSessionId,
  returnUrls,
}) => {
  const token = validarTokenMercadoPago();
  const plano = PLANOS_PAGOS[planoSolicitado];
  const preApproval = getPreApprovalClient(token);

  return preApproval.create({
    body: {
      reason: `Renovar ERP - Plano ${plano.nome}`,
      external_reference: `users/${uid}/checkoutSessions/${checkoutSessionId}`,
      payer_email: email,
      back_url: returnUrls.sucesso,
      success_url: returnUrls.sucesso,
      pending_url: returnUrls.pendente,
      failure_url: returnUrls.erro,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: plano.valor,
        currency_id: "BRL",
      },
      status: "pending",
    },
  });
};

const criarPagamentoAvulsoMercadoPago = async ({
  uid,
  email,
  planoSolicitado,
  pagamentoId,
  paymentMethodId,
  payer = {},
  dateOfExpiration,
}) => {
  const token = validarTokenMercadoPago();
  const plano = PLANOS_PAGOS[planoSolicitado];
  const payment = getPaymentClient(token);
  const payerEmail = payer.email || email;

  return payment.create({
    body: {
      description: `Renovar ERP - Plano ${plano.nome}`,
      external_reference: `users/${uid}/pagamentos/${pagamentoId}`,
      payment_method_id: paymentMethodId,
      transaction_amount: plano.valor,
      installments: 1,
      date_of_expiration: dateOfExpiration,
      payer: {
        ...payer,
        email: payerEmail,
      },
      metadata: {
        user_id: uid,
        plano_solicitado: planoSolicitado,
        pagamento_id: pagamentoId,
        origem: "renovar_erp_pagamento_avulso",
      },
    },
  });
};

const consultarPreapprovalMercadoPago = async ({ preapprovalId }) => {
  const token = validarTokenMercadoPago();
  const preApproval = getPreApprovalClient(token);

  return preApproval.get({ id: preapprovalId });
};

const consultarPagamentoMercadoPago = async ({ paymentId }) => {
  const token = validarTokenMercadoPago();
  const payment = getPaymentClient(token);

  return payment.get({ id: paymentId });
};

const getPaymentIdFromResponse = (payment = {}) => {
  const id = payment.id || payment.response?.id || "";
  return id ? String(id) : null;
};

const getPaymentStatusFromResponse = (payment = {}) => {
  return payment.status || payment.response?.status || "pending";
};

const getPixDataFromPayment = (payment = {}) => {
  const transactionData =
    payment.point_of_interaction?.transaction_data ||
    payment.response?.point_of_interaction?.transaction_data ||
    {};

  return {
    qr_code: transactionData.qr_code || "",
    qr_code_base64: transactionData.qr_code_base64 || "",
    copia_cola: transactionData.qr_code || "",
  };
};

const getBoletoDataFromPayment = (payment = {}) => {
  const transactionDetails =
    payment.transaction_details ||
    payment.response?.transaction_details ||
    {};

  return {
    boleto_url: transactionDetails.external_resource_url || "",
    barcode:
      transactionDetails.digitable_line ||
      transactionDetails.barcode?.content ||
      "",
  };
};

const getCheckoutUrlFromPreapproval = (preapproval = {}) => {
  const checkoutUrl =
    preapproval.init_point ||
    preapproval.sandbox_init_point ||
    preapproval.response?.init_point ||
    preapproval.response?.sandbox_init_point ||
    "";

  return typeof checkoutUrl === "string" ? checkoutUrl : "";
};

const getPreapprovalIdFromResponse = (preapproval = {}) => {
  const id = preapproval.id || preapproval.response?.id || "";
  return id ? String(id) : null;
};

const getPreapprovalStatusFromResponse = (preapproval = {}) => {
  return preapproval.status || preapproval.response?.status || "pending";
};

const getPreapprovalDateCreatedFromResponse = (preapproval = {}) => {
  return preapproval.date_created || preapproval.response?.date_created || null;
};

module.exports = {
  consultarPreapprovalMercadoPago,
  consultarPagamentoMercadoPago,
  criarPagamentoAvulsoMercadoPago,
  criarPreapprovalMercadoPago,
  getBoletoDataFromPayment,
  getCheckoutUrlFromPreapproval,
  getMercadoPagoToken,
  getPaymentIdFromResponse,
  getPaymentStatusFromResponse,
  getPixDataFromPayment,
  getPreapprovalDateCreatedFromResponse,
  getPreapprovalIdFromResponse,
  getPreapprovalStatusFromResponse,
  validarTokenMercadoPago,
};
