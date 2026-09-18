export const STATUS_AGENDAMENTO = [
  "agendado",
  "confirmado",
  "em_atendimento",
  "concluido",
  "cancelado",
];

const TRANSICOES_AGENDAMENTO = {
  agendado: ["confirmado", "em_atendimento", "concluido", "cancelado"],
  confirmado: ["em_atendimento", "concluido", "cancelado"],
  em_atendimento: ["concluido", "cancelado"],
  concluido: [],
  cancelado: [],
};

const MARCOS_AGENDAMENTO = {
  confirmado: "confirmadoEm",
  em_atendimento: "iniciadoEm",
  concluido: "concluidoEm",
  cancelado: "canceladoEm",
};

export const transicoesPermitidasAgendamento = (status) =>
  [...(TRANSICOES_AGENDAMENTO[status] || [])];

export const podeTransicionarStatusAgendamento = (atual, proximo) =>
  transicoesPermitidasAgendamento(atual).includes(proximo);

export const podeEditarDadosAgendamento = (status) =>
  status === "agendado" || status === "confirmado";

export const obterMarcoTransicaoAgendamento = (atual, proximo) =>
  podeTransicionarStatusAgendamento(atual, proximo)
    ? MARCOS_AGENDAMENTO[proximo] || null
    : null;

export const montarAtualizacaoStatusAgendamento = (agendamento, proximo, timestamp) => {
  const marco = obterMarcoTransicaoAgendamento(agendamento?.status, proximo);
  if (!marco || Object.hasOwn(agendamento, marco)) return null;
  return { status: proximo, [marco]: timestamp, atualizadoEm: timestamp };
};

export const normalizarStatusAgendamento = (status = "agendado") => {
  const statusTratado = String(status || "agendado").trim().toLowerCase();

  return STATUS_AGENDAMENTO.includes(statusTratado) ? statusTratado : "agendado";
};

export const horarioParaMinutos = (hora = "") => {
  if (!/^\d{2}:\d{2}$/.test(String(hora))) return null;
  const [horas, minutos] = String(hora || "").split(":").map(Number);

  if (
    !Number.isInteger(horas) ||
    !Number.isInteger(minutos) ||
    horas < 0 ||
    horas > 23 ||
    minutos < 0 ||
    minutos > 59
  ) {
    return null;
  }

  return horas * 60 + minutos;
};

export const minutosParaHorario = (minutos) => {
  if (!Number.isInteger(minutos) || minutos < 0 || minutos >= 1440) return "";
  return `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;
};

export const calcularDuracaoAgendamento = (horaInicio, horaFim) => {
  const inicio = horarioParaMinutos(horaInicio);
  const fim = horarioParaMinutos(horaFim);
  return inicio !== null && fim !== null && fim > inicio ? fim - inicio : null;
};

export const sugerirHoraFim = (horaInicio, duracaoMinutos) => {
  const inicio = horarioParaMinutos(horaInicio);
  const duracao = Number(duracaoMinutos);
  return inicio !== null && Number.isInteger(duracao) && duracao > 0
    ? minutosParaHorario(inicio + duracao)
    : "";
};

export const obterHoraFimAgendamento = (agendamento = {}) => {
  if (horarioParaMinutos(agendamento.horaFim) !== null) return agendamento.horaFim;
  return sugerirHoraFim(agendamento.horaInicio, agendamento.duracaoMinutos);
};

export const obterSnapshotServicoAgendamento = (agendamento, servico) => {
  if (agendamento?.servicoId === servico?.id) {
    return {
      servicoId: agendamento.servicoId,
      servicoNome: String(agendamento.servicoNome || ""),
      valorServico: Number(agendamento.valorServico ?? 0),
      ...(agendamento.servicoFiscalSnapshot ? { servicoFiscalSnapshot: agendamento.servicoFiscalSnapshot } : {}),
    };
  }
  if (!servico) return null;
  const fiscal = servico.fiscal;
  return {
    servicoId: servico.id,
    servicoNome: String(servico.nome || "").trim(),
    valorServico: Number(servico.valor || 0),
    ...(fiscal ? { servicoFiscalSnapshot: {
      versao: 1,
      codigoTributacaoNacional: String(fiscal.codigoTributacaoNacional || "").trim(),
      codigoTributacaoMunicipal: String(fiscal.codigoTributacaoMunicipal || "").trim(),
      nbs: String(fiscal.nbs || "").trim(),
      descricaoFiscal: String(fiscal.descricaoFiscal || "").trim(),
    } } : {}),
  };
};

export const compararAgendamentosPorHorario = (a, b) => {
  const dataA = `${a.data || "9999-12-31"} ${a.horaInicio || "23:59"}`;
  const dataB = `${b.data || "9999-12-31"} ${b.horaInicio || "23:59"}`;
  return dataA.localeCompare(dataB);
};

export const obterIntervaloAgendamento = (agendamento = {}) => {
  const inicio = horarioParaMinutos(agendamento.horaInicio);
  const fimHorario = obterHoraFimAgendamento(agendamento);
  const fim = horarioParaMinutos(fimHorario);
  if (inicio === null || fim === null || fim <= inicio) return null;

  return {
    inicio,
    fim,
  };
};

export const agendamentosSobrepostos = (a = {}, b = {}) => {
  if (!a.data || !b.data || a.data !== b.data) return false;
  if (normalizarStatusAgendamento(a.status) === "cancelado") return false;
  if (normalizarStatusAgendamento(b.status) === "cancelado") return false;

  const intervaloA = obterIntervaloAgendamento(a);
  const intervaloB = obterIntervaloAgendamento(b);

  if (!intervaloA || !intervaloB) return false;

  return intervaloA.inicio < intervaloB.fim && intervaloB.inicio < intervaloA.fim;
};

export const existeConflitoAgendamento = (
  agendamento = {},
  agendamentos = [],
  { ignorarId = "" } = {}
) =>
  agendamentos.some((atual) => {
    if (ignorarId && atual.id === ignorarId) return false;

    return agendamentosSobrepostos(agendamento, atual);
  });
