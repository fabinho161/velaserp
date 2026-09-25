const STATUS_OCUPAM_HORARIO = new Set([
  "agendado",
  "confirmado",
  "em_atendimento",
  "concluido",
]);

const texto = (valor) => String(valor ?? "").trim();

const normalizarItemServicoAgendamento = (item = {}) => {
  const servicoId = texto(item.servicoId);
  const servicoNome = texto(item.servicoNome);
  const duracaoMinutos = Number(item.duracaoMinutos);
  const valorUnitario = Number(item.valorUnitario);
  if (!servicoId || !servicoNome || !Number.isInteger(duracaoMinutos) || duracaoMinutos < 0 ||
      typeof item.valorUnitario !== "number" || !Number.isFinite(valorUnitario) || valorUnitario < 0) {
    return null;
  }
  return { servicoId, servicoNome, duracaoMinutos, valorUnitario };
};

const possuiServicosDuplicados = (servicos = []) => {
  if (!Array.isArray(servicos)) return false;
  const ids = servicos.map((item) => texto(item?.servicoId)).filter(Boolean);
  return new Set(ids).size !== ids.length;
};

const normalizarServicosAgendamento = (agendamento = {}) => {
  const snapshots = agendamento.servicosSnapshot;
  if (Array.isArray(snapshots) && snapshots.length > 0 && !possuiServicosDuplicados(snapshots)) {
    const normalizados = snapshots.map(normalizarItemServicoAgendamento);
    if (normalizados.every(Boolean)) return normalizados;
  }
  const legado = normalizarItemServicoAgendamento({
    servicoId: agendamento.servicoId,
    servicoNome: agendamento.servicoNome,
    duracaoMinutos: agendamento.duracaoMinutos,
    valorUnitario: agendamento.valorServico,
  });
  return legado ? [legado] : [];
};

const calcularValorTotalServicos = (servicos = []) => {
  if (!Array.isArray(servicos)) return null;
  let total = 0;
  for (const item of servicos) {
    if (typeof item?.valorUnitario !== "number" ||
        !Number.isFinite(item.valorUnitario) || item.valorUnitario < 0) return null;
    total += item.valorUnitario;
  }
  return total;
};

const calcularDuracaoTotalServicos = (servicos = []) => {
  if (!Array.isArray(servicos)) return null;
  let total = 0;
  for (const item of servicos) {
    if (!Number.isInteger(item?.duracaoMinutos) || item.duracaoMinutos < 0) return null;
    total += item.duracaoMinutos;
  }
  return total;
};

const resumirServicosAgendamento = (servicos = []) => {
  if (!Array.isArray(servicos) || servicos.length === 0) return "";
  const primeiroNome = texto(servicos[0]?.servicoNome);
  if (!primeiroNome) return "";
  const adicionais = servicos.length - 1;
  return adicionais === 0
    ? primeiroNome
    : `${primeiroNome} + ${adicionais} ${adicionais === 1 ? "serviço" : "serviços"}`;
};

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

const montarSnapshotServicoMultisservico = (id, servico = {}) => {
  const valorUnitario = Number(servico.valor);
  const duracaoMinutos = Number(servico.tempoEstimadoMinutos);
  if (!id || !texto(servico.nome) || typeof servico.valor !== "number" ||
      !Number.isFinite(valorUnitario) || valorUnitario < 0 ||
      typeof servico.tempoEstimadoMinutos !== "number" ||
      !Number.isInteger(duracaoMinutos) || duracaoMinutos < 0) {
    const error = new Error("Servico invalido.");
    error.status = 422;
    error.codigo = "agenda_servico_invalido";
    throw error;
  }
  return { servicoId: id, servicoNome: texto(servico.nome), duracaoMinutos, valorUnitario };
};

const montarCamposCompatibilidadeMultisservico = (servicosSnapshot = []) => {
  const normalizados = normalizarServicosAgendamento({ servicosSnapshot });
  if (normalizados.length !== servicosSnapshot.length || normalizados.length === 0) {
    const error = new Error("Servicos invalidos.");
    error.status = 422;
    error.codigo = "agenda_servico_invalido";
    throw error;
  }
  return {
    servicosSnapshot: normalizados,
    valorTotalServicos: calcularValorTotalServicos(normalizados),
    duracaoTotalServicos: calcularDuracaoTotalServicos(normalizados),
    servicoId: normalizados[0].servicoId,
    servicoNome: resumirServicosAgendamento(normalizados),
    valorServico: calcularValorTotalServicos(normalizados),
  };
};

module.exports = {
  agendamentosConflitam,
  calcularDuracaoTotalServicos,
  calcularValorTotalServicos,
  existeConflitoAgenda,
  montarSnapshotCliente,
  montarSnapshotServico,
  montarSnapshotServicoMultisservico,
  montarCamposCompatibilidadeMultisservico,
  normalizarServicosAgendamento,
  possuiServicosDuplicados,
  resumirServicosAgendamento,
  validarIntervaloAgenda,
};
