import { auth } from "../firebase";

const API_URL =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  "http://localhost:10000";

const lerJsonSeguro = async (response) => {
  try {
    return await response.json();
  } catch {
    return {};
  }
};

const obterToken = async () => {
  const usuario = auth.currentUser;

  if (!usuario) {
    throw new Error("Usuário autenticado não encontrado.");
  }

  return usuario.getIdToken();
};

const mensagemErroFaturamento = (status, data = {}) => {
  if (status === 401) return "Sua sessão expirou. Entre novamente para continuar.";
  if (status === 403) return "Você não tem permissão para acessar faturamento.";
  if (status === 404) return "Faturamento não encontrado.";

  if (status === 409 && data.codigo === "faturamento_com_pendencias") {
    return "O faturamento ainda possui pendências.";
  }

  if (status === 400) return data.error || "Dados fiscais inválidos.";
  if (status >= 500) return "Não foi possível conectar ao servidor. Tente novamente.";

  return data.error || "Não foi possível concluir a operação.";
};

const requisitarFaturamento = async (path, opcoes = {}) => {
  const token = await obterToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...opcoes,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(opcoes.body ? { "Content-Type": "application/json" } : {}),
      ...(opcoes.headers || {}),
    },
  });
  const data = await lerJsonSeguro(response);

  if (!response.ok || data.ok === false) {
    const error = new Error(mensagemErroFaturamento(response.status, data));
    error.status = response.status;
    error.codigo = data.codigo;
    error.data = data;
    throw error;
  }

  return data;
};

export const listarFaturamentos = ({ empresaId }) => {
  const params = new URLSearchParams({ empresaId });
  return requisitarFaturamento(`/api/faturamentos?${params.toString()}`);
};

export const obterFaturamento = ({ empresaId, faturamentoId }) => {
  const params = new URLSearchParams({ empresaId });
  return requisitarFaturamento(
    `/api/faturamentos/${encodeURIComponent(faturamentoId)}?${params.toString()}`
  );
};

export const criarFaturamento = ({ empresaId, vendaId }) =>
  requisitarFaturamento("/api/faturamentos", {
    method: "POST",
    body: JSON.stringify({ empresaId, vendaId }),
  });

export const salvarContextoOperacional = ({ empresaId, faturamentoId, contexto }) =>
  requisitarFaturamento(
    `/api/faturamentos/${encodeURIComponent(faturamentoId)}/contexto-operacional`,
    {
      method: "PUT",
      body: JSON.stringify({
        empresaId,
        ...contexto,
      }),
    }
  );

export const prepararFaturamento = ({ empresaId, faturamentoId }) =>
  requisitarFaturamento(
    `/api/faturamentos/${encodeURIComponent(faturamentoId)}/preparar`,
    {
      method: "POST",
      body: JSON.stringify({ empresaId }),
    }
  );

export const determinarFiscalFaturamento = ({ empresaId, faturamentoId }) =>
  requisitarFaturamento(
    `/api/faturamentos/${encodeURIComponent(faturamentoId)}/determinar-fiscal`,
    {
      method: "POST",
      body: JSON.stringify({ empresaId }),
    }
  );

export const classificarTributacaoFaturamento = ({ empresaId, faturamentoId }) =>
  requisitarFaturamento(
    `/api/faturamentos/${encodeURIComponent(faturamentoId)}/classificar-tributacao`,
    {
      method: "POST",
      body: JSON.stringify({ empresaId }),
    }
  );

export const cancelarFaturamento = ({ empresaId, faturamentoId, motivoCancelamento }) =>
  requisitarFaturamento(
    `/api/faturamentos/${encodeURIComponent(faturamentoId)}/cancelar`,
    {
      method: "POST",
      body: JSON.stringify({ empresaId, motivoCancelamento }),
    }
  );
