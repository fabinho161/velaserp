const FORMAS_PAGAMENTO = [
  "pix", "dinheiro", "cartao_credito", "cartao_debito", "boleto", "transferencia", "outro",
];

const idContaAtendimento = (agendamentoId) => `atendimento_${agendamentoId}`;

const montarContaAtendimento = ({ agendamentoId, agendamento, atorUid, timestamp }) => {
  if (agendamento?.status !== "concluido") return null;
  const valor = agendamento.valorServico;
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0) {
    throw new Error("Valor historico do atendimento invalido.");
  }
  if (valor === 0) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(agendamento.data || "")) ||
      !agendamento.clienteId || !agendamento.servicoNome) {
    throw new Error("Dados historicos do atendimento incompletos.");
  }
  return {
    versao: 1,
    origem: { tipo: "atendimento", documentoId: agendamentoId },
    cliente: { clienteId: agendamento.clienteId, nome: agendamento.clienteNome || "" },
    descricao: agendamento.servicoNome,
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

module.exports = { FORMAS_PAGAMENTO, idContaAtendimento, montarContaAtendimento };
