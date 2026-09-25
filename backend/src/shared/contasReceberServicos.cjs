const FORMAS_PAGAMENTO = [
  "pix", "dinheiro", "cartao_credito", "cartao_debito", "boleto", "transferencia", "outro",
];

const {
  calcularValorTotalServicos,
  normalizarServicosAgendamento,
  possuiServicosDuplicados,
  resumirServicosAgendamento,
} = require("./agendaOperacional.cjs");

const idContaAtendimento = (agendamentoId) => `atendimento_${agendamentoId}`;

const obterComposicaoFinanceira = (agendamento = {}) => {
  if (!Object.hasOwn(agendamento, "servicosSnapshot")) {
    const valor = agendamento.valorServico;
    if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0) {
      throw new Error("Valor historico do atendimento invalido.");
    }
    if (!agendamento.servicoNome) {
      throw new Error("Dados historicos do atendimento incompletos.");
    }
    return { descricao: agendamento.servicoNome, valor };
  }

  const snapshots = agendamento.servicosSnapshot;
  const servicos = normalizarServicosAgendamento({ servicosSnapshot: snapshots });
  if (!Array.isArray(snapshots) || snapshots.length === 0 ||
      possuiServicosDuplicados(snapshots) || servicos.length !== snapshots.length) {
    throw new Error("Composicao historica dos servicos invalida.");
  }

  const valor = calcularValorTotalServicos(servicos);
  const agregado = agendamento.valorTotalServicos;
  if (valor === null || typeof agregado !== "number" || !Number.isFinite(agregado) ||
      agregado < 0 || agregado !== valor) {
    throw new Error("Valor total dos servicos diverge da composicao historica.");
  }

  return {
    descricao: resumirServicosAgendamento(servicos),
    valor,
    servicosSnapshot: servicos,
  };
};

const montarContaAtendimento = ({ agendamentoId, agendamento, atorUid, timestamp }) => {
  if (agendamento?.status !== "concluido") return null;
  const composicao = obterComposicaoFinanceira(agendamento);
  const { valor } = composicao;
  if (valor === 0) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(agendamento.data || "")) ||
      !agendamento.clienteId) {
    throw new Error("Dados historicos do atendimento incompletos.");
  }
  return {
    versao: 1,
    origem: { tipo: "atendimento", documentoId: agendamentoId },
    cliente: { clienteId: agendamento.clienteId, nome: agendamento.clienteNome || "" },
    descricao: composicao.descricao,
    ...(composicao.servicosSnapshot
      ? { servicosSnapshot: composicao.servicosSnapshot.map((item) => ({ ...item })) }
      : {}),
    valor,
    dataCompetencia: agendamento.data,
    ...(agendamento.concluidoEm ? { concluidoEm: agendamento.concluidoEm } : {}),
    status: "pendente",
    pagamento: null,
    criadoEm: timestamp,
    criadoPor: atorUid,
    atualizadoEm: timestamp,
  };
};

module.exports = {
  FORMAS_PAGAMENTO,
  idContaAtendimento,
  montarContaAtendimento,
  obterComposicaoFinanceira,
};
