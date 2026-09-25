const STATUS_ATIVOS = new Set(["agendado", "confirmado", "em_atendimento"]);
const STATUS_CONHECIDOS = ["agendado", "confirmado", "em_atendimento", "concluido", "cancelado"];

const numeroSeguro = (valor) => {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
};

const minutosHorario = (hora) => {
  if (!/^\d{2}:\d{2}$/.test(String(hora || ""))) return null;
  const [h, m] = hora.split(":").map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59 ? h * 60 + m : null;
};

export const obterDataLocalISO = (data = new Date()) => {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
};

export const ordenarAgendaPorHorario = (agendamentos = []) =>
  [...agendamentos].sort((a, b) => String(a.horaInicio || "99:99").localeCompare(String(b.horaInicio || "99:99")));

export const obterAgendaHoje = (agendamentos = [], hoje) =>
  ordenarAgendaPorHorario(agendamentos.filter(
    (item) => item.data === hoje && item.status !== "cancelado"
  ));

export const obterProximoAtendimento = (agendamentos = [], hoje, agoraMinutos) =>
  obterAgendaHoje(agendamentos, hoje).find((item) => {
    const inicio = minutosHorario(item.horaInicio);
    return STATUS_ATIVOS.has(item.status) && inicio !== null && inicio >= agoraMinutos;
  }) || null;

export const resumirFinanceiroDashboard = (contas = [], prefixoMes = "") => {
  const contasAtendimento = contas.filter((conta) => conta.origem?.tipo === "atendimento");
  const pendentes = contasAtendimento.filter((conta) => conta.status === "pendente");
  const recebidasMes = contasAtendimento.filter((conta) =>
    conta.status === "recebido" &&
    String(conta.pagamento?.dataRecebimento || "").startsWith(prefixoMes)
  );
  const aReceber = pendentes.reduce((total, conta) => total + numeroSeguro(conta.valor), 0);
  const recebidoMes = recebidasMes.reduce((total, conta) => total + numeroSeguro(conta.valor), 0);
  return {
    aReceber,
    pendencias: pendentes.length,
    recebidoMes,
    recebimentosMes: recebidasMes.length,
    ticketMedioRecebido: recebidasMes.length ? recebidoMes / recebidasMes.length : 0,
  };
};

export const calcularDashboardClientes = ({
  agendamentos = [],
  contasReceber = [],
  hoje = obterDataLocalISO(),
  agoraMinutos = new Date().getHours() * 60 + new Date().getMinutes(),
} = {}) => {
  const prefixoMes = hoje.slice(0, 7);
  const agendaHoje = obterAgendaHoje(agendamentos, hoje);
  const agendamentosMes = agendamentos.filter((item) => String(item.data || "").startsWith(prefixoMes));
  const concluidos = agendamentosMes.filter((item) => item.status === "concluido");
  const cancelados = agendamentosMes.filter((item) => item.status === "cancelado");
  const estados = Object.fromEntries(STATUS_CONHECIDOS.map((status) => [status, 0]));
  for (const item of agendamentosMes) {
    if (Object.hasOwn(estados, item.status)) estados[item.status] += 1;
  }

  const evolucaoPorDia = new Map();
  const ranking = new Map();
  const clientes = new Set();
  for (const item of concluidos) {
    if (item.clienteId) clientes.add(item.clienteId);
    const dia = String(item.data || "").slice(8, 10);
    if (dia) evolucaoPorDia.set(dia, (evolucaoPorDia.get(dia) || 0) + 1);
    const nome = String(item.servicoNome || "Serviço não identificado").trim();
    const chave = item.servicoId ? `id:${item.servicoId}` : `legado:${nome}`;
    const atual = ranking.get(chave) || { servicoId: item.servicoId || null, nome, quantidade: 0 };
    atual.quantidade += 1;
    ranking.set(chave, atual);
  }

  return {
    hoje,
    agendaHoje,
    totalHoje: agendaHoje.length,
    restantesHoje: agendaHoje.filter((item) => STATUS_ATIVOS.has(item.status)).length,
    proximoAtendimento: obterProximoAtendimento(agendamentos, hoje, agoraMinutos),
    concluidosMes: concluidos.length,
    cancelamentosMes: cancelados.length,
    clientesAtendidosMes: clientes.size,
    estadosMes: estados,
    evolucao: [...evolucaoPorDia.entries()]
      .sort(([diaA], [diaB]) => diaA.localeCompare(diaB))
      .map(([dia, quantidade]) => ({ dia, quantidade })),
    servicosMaisRealizados: [...ranking.values()]
      .sort((a, b) => b.quantidade - a.quantidade || a.nome.localeCompare(b.nome, "pt-BR"))
      .slice(0, 5),
    financeiro: resumirFinanceiroDashboard(contasReceber, prefixoMes),
  };
};

export const STATUS_ATENDIMENTO_ATIVOS = STATUS_ATIVOS;

export const resolverTipoDashboard = (segmento) =>
  segmento === "clientes" ? "clientes" : "padrao";

export const obterAcoesRapidasDashboardClientes = ({
  podeVerAgenda = false,
  podeOperarAgenda = false,
  podeCriarCliente = false,
  podeCriarServico = false,
} = {}) => [
  ...(podeOperarAgenda ? [{ id: "novo_agendamento", label: "Novo agendamento", rota: "/agenda" }] : []),
  ...(podeCriarCliente ? [{ id: "novo_cliente", label: "Novo cliente", rota: "/clientes" }] : []),
  ...(podeCriarServico ? [{ id: "novo_servico", label: "Novo serviço", rota: "/servicos" }] : []),
  ...(podeVerAgenda ? [{ id: "abrir_agenda", label: "Abrir agenda", rota: "/agenda" }] : []),
];
