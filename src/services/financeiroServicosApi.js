import { auth } from "../firebase";

const API_URL = import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL || "http://localhost:10000";

const requisitar = async (path, dados) => {
  const usuario = auth.currentUser;
  if (!usuario) throw new Error("Sua sessão expirou. Entre novamente.");
  const response = await fetch(`${API_URL}/api/financeiro/servicos/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await usuario.getIdToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(dados),
  });
  const resultado = await response.json();
  if (!response.ok || resultado.ok === false) {
    const error = new Error([409, 422].includes(response.status) ? resultado.error :
      response.status === 403 ? "Você não tem permissão para esta operação." :
      "Não foi possível concluir a operação. Tente novamente.");
    error.status = response.status;
    error.pendencias = resultado.pendencias;
    throw error;
  }
  return resultado;
};

export const concluirAtendimento = (dados) => requisitar("concluir", dados);
export const sincronizarAtendimentos = (dados) => requisitar("sincronizar", dados);
export const receberAtendimento = (dados) => requisitar("receber", dados);
