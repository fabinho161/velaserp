const normalizarStatus = (status) => {
  return String(status || "").trim().toLowerCase();
};

const getDataInputValue = (value) => {
  const fallback = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const date = value ? new Date(value) : fallback;

  if (Number.isNaN(date.getTime())) {
    return fallback.toISOString().slice(0, 10);
  }

  return date.toISOString().slice(0, 10);
};

const getFrontendBaseUrl = () => {
  const configuredUrl = String(process.env.FRONTEND_BASE_URL || "").trim();
  const fallbackUrl = "http://localhost:5173";
  const baseUrl = configuredUrl || fallbackUrl;

  try {
    const url = new URL(baseUrl);

    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("FRONTEND_BASE_URL deve iniciar com http:// ou https://");
    }

    return url.origin;
  } catch (error) {
    console.warn("FRONTEND_BASE_URL invalida, usando fallback local", {
      baseUrl,
      error: error.message,
    });
    return fallbackUrl;
  }
};

const getReturnUrls = () => {
  const baseUrl = getFrontendBaseUrl();

  return {
    sucesso: new URL("/pagamento/sucesso", baseUrl).toString(),
    pendente: new URL("/pagamento/pendente", baseUrl).toString(),
    erro: new URL("/pagamento/erro", baseUrl).toString(),
  };
};

const getPreapprovalIdFromWebhook = (req) => {
  const payload = req.body || {};
  const query = req.query || {};

  const id = (
    payload.data?.id ||
    payload.id ||
    payload.preapproval_id ||
    query["data.id"] ||
    query.id ||
    query.preapproval_id ||
    null
  );

  if (Array.isArray(id)) return id[0] ? String(id[0]) : null;
  return id ? String(id) : null;
};

module.exports = {
  normalizarStatus,
  getDataInputValue,
  getFrontendBaseUrl,
  getReturnUrls,
  getPreapprovalIdFromWebhook,
};
