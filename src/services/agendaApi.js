import { auth } from "../firebase";

const API_URL = import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL || "http://localhost:10000";

const requisitar = async (path, { method = "POST", dados } = {}) => {
  const usuario = auth.currentUser;
  if (!usuario) throw new Error("Sua sessão expirou. Entre novamente.");
  const response = await fetch(`${API_URL}/api/agenda${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await usuario.getIdToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(dados),
  });
  const resultado = await response.json().catch(() => ({}));
  if (!response.ok || resultado.ok === false) {
    const mensagens = {
      agenda_conflito_horario: "Este horário acabou de ser ocupado por outro agendamento. Escolha outro horário.",
      agenda_intervalo_invalido: "Data, horário ou duração inválidos.",
      agenda_cliente_invalido: "Selecione um cliente válido.",
      agenda_servico_invalido: "Selecione um serviço ativo com valor válido.",
      agenda_payload_invalido: "Os dados do agendamento são inválidos.",
      agenda_transicao_invalida: "Este atendimento não permite essa alteração.",
      agenda_sem_permissao: "Você não tem permissão para esta operação.",
    };
    const error = new Error(mensagens[resultado.codigo] || resultado.error ||
      "Não foi possível concluir a operação.");
    error.status = response.status;
    error.codigo = resultado.codigo;
    throw error;
  }
  return resultado;
};

export const criarAgendamento = (dados) => requisitar("/", { dados });
export const editarAgendamento = (id, dados) =>
  requisitar(`/${encodeURIComponent(id)}`, { method: "PUT", dados });
export const transicionarAgendamento = (id, acao, dados) =>
  requisitar(`/${encodeURIComponent(id)}/${acao}`, { dados });
