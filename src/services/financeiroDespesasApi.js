import { API_URL } from "../config/api.js";
import { fetchAutenticado } from "./apiAutenticada.js";

export const pagarDespesa = async (dados) => {
  const response = await fetchAutenticado(`${API_URL}/api/financeiro/despesas/pagar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  const resultado = await response.json();
  if (!response.ok || resultado.ok === false) {
    const error = new Error(
      [409, 422].includes(response.status)
        ? resultado.error
        : response.status === 403
          ? "Voce nao tem permissao para esta operacao."
          : "Nao foi possivel registrar o pagamento. Tente novamente."
    );
    error.status = response.status;
    throw error;
  }
  return resultado;
};
