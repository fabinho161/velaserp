export const STATUS_AGENDAMENTO = [
  "agendado",
  "confirmado",
  "concluido",
  "cancelado",
];

export const normalizarStatusAgendamento = (status = "agendado") => {
  const statusTratado = String(status || "agendado").trim().toLowerCase();

  return STATUS_AGENDAMENTO.includes(statusTratado) ? statusTratado : "agendado";
};

export const horarioParaMinutos = (hora = "") => {
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

export const obterIntervaloAgendamento = (agendamento = {}) => {
  const inicio = horarioParaMinutos(agendamento.horaInicio);
  const duracao = Number(agendamento.duracaoMinutos || 0);

  if (inicio === null || !Number.isFinite(duracao) || duracao <= 0) {
    return null;
  }

  return {
    inicio,
    fim: inicio + duracao,
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
