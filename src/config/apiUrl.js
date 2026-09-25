const API_URL_DESENVOLVIMENTO = "http://localhost:10000";
const API_URL_PRODUCAO = "https://renovarerp-api.onrender.com";

const normalizarUrl = (valor) => String(valor || "").trim().replace(/\/+$/, "");

const isHostLocal = (url) => {
  const hostname = new URL(url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
};

export const resolverApiUrl = ({ mode, apiBaseUrl, apiUrl } = {}) => {
  const producao = mode === "production";
  const configurada = normalizarUrl(apiBaseUrl) || normalizarUrl(apiUrl);
  const resolvida = configurada || (producao ? API_URL_PRODUCAO : API_URL_DESENVOLVIMENTO);

  let url;
  try {
    url = new URL(resolvida);
  } catch {
    throw new Error(`URL da API inválida: ${resolvida}`);
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`Protocolo inválido na URL da API: ${url.protocol}`);
  }

  if (producao && isHostLocal(resolvida)) {
    throw new Error("Build de produção não pode utilizar uma URL local para a API.");
  }

  return resolvida;
};
