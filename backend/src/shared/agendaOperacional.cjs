const STATUS_OCUPAM_HORARIO = new Set([
  "agendado",
  "confirmado",
  "em_atendimento",
  "concluido",
]);

const texto = (valor) => String(valor ?? "").trim();

const horarioParaMinutos = (hora) => {
  if (!/^\d{2}:\d{2}$/.test(texto(hora))) return null;
  const [horas, minutos] = texto(hora).split(":").map(Number);
  if (horas < 0 || horas > 23 || minutos < 0 || minutos > 59) return null;
  return horas * 60 + minutos;
};

const dataValida = (data) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto(data))) return false;
  const [ano, mes, dia] = texto(data).split("-").map(Number);
  const valor = new Date(Date.UTC(ano, mes - 1, dia));
  return valor.getUTCFullYear() === ano && valor.getUTCMonth() === mes - 1 && valor.getUTCDate() === dia;
};

const validarIntervaloAgenda = ({ data, horaInicio, horaFim, duracaoMinutos }) => {
  const inicio = horarioParaMinutos(horaInicio);
  const fim = horarioParaMinutos(horaFim);
  const duracao = Number(duracaoMinutos);
  if (!dataValida(data) || inicio === null || fim === null || fim <= inicio ||
      !Number.isInteger(duracao) || duracao <= 0 || duracao !== fim - inicio) {
    const error = new Error("Data, horario ou duracao invalidos.");
    error.status = 422;
    error.codigo = "agenda_intervalo_invalido";
    throw error;
  }
  return { data: texto(data), horaInicio: texto(horaInicio), horaFim: texto(horaFim), duracaoMinutos: duracao };
};

const agendamentosConflitam = (novo, existente) => {
  if (texto(novo?.data) !== texto(existente?.data) ||
      !STATUS_OCUPAM_HORARIO.has(texto(novo?.status || "agendado")) ||
      !STATUS_OCUPAM_HORARIO.has(texto(existente?.status || "agendado"))) return false;
  const novoInicio = horarioParaMinutos(novo.horaInicio);
  const novoFim = horarioParaMinutos(novo.horaFim);
  const existenteInicio = horarioParaMinutos(existente.horaInicio);
  const existenteFim = horarioParaMinutos(existente.horaFim);
  if ([novoInicio, novoFim, existenteInicio, existenteFim].includes(null)) return false;
  return novoInicio < existenteFim && novoFim > existenteInicio;
};

const existeConflitoAgenda = (novo, existentes = [], ignorarId = "") =>
  existentes.some((item) => item.id !== ignorarId && agendamentosConflitam(novo, item));

const montarSnapshotCliente = (id, cliente = {}) => ({
  clienteId: id,
  clienteNome: texto(cliente.nome || cliente.clienteNome || "Cliente"),
  clienteTelefone: texto(cliente.telefone),
  clienteEmail: texto(cliente.email),
});

const montarSnapshotServico = (id, servico = {}, duracaoMinutos) => {
  const valor = Number(servico.valor);
  if (!Number.isFinite(valor) || valor < 0 || !texto(servico.nome)) {
    const error = new Error("Servico invalido.");
    error.status = 422;
    error.codigo = "agenda_servico_invalido";
    throw error;
  }
  return {
    servicoId: id,
    servicoNome: texto(servico.nome),
    valorServico: valor,
    duracaoMinutos,
  };
};

module.exports = {
  agendamentosConflitam,
  existeConflitoAgenda,
  montarSnapshotCliente,
  montarSnapshotServico,
  validarIntervaloAgenda,
};
