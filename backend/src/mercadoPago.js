const { MercadoPagoConfig, PreApproval } = require("mercadopago");
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

const consultarPreapprovalMercadoPago = async ({ preapprovalId }) => {
  const token = validarTokenMercadoPago();
  const preApproval = getPreApprovalClient(token);

  return preApproval.get({ id: preapprovalId });
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
  criarPreapprovalMercadoPago,
  getCheckoutUrlFromPreapproval,
  getMercadoPagoToken,
  getPreapprovalDateCreatedFromResponse,
  getPreapprovalIdFromResponse,
  getPreapprovalStatusFromResponse,
  validarTokenMercadoPago,
};
