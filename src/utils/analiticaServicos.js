import { normalizarServicosAgendamento } from "./agenda.js";

export const agruparServicosRealizados = (
  agendamentos = [],
  { servicoId = "" } = {}
) => {
  const ranking = new Map();

  for (const agendamento of agendamentos) {
    const servicos = normalizarServicosAgendamento(agendamento)
      .filter((servico) => !servicoId || servico.servicoId === servicoId);

    for (const servico of servicos) {
      const chave = `id:${servico.servicoId}`;
      const atual = ranking.get(chave) || {
        servicoId: servico.servicoId,
        nome: servico.servicoNome,
        quantidade: 0,
        valor: 0,
      };
      atual.quantidade += 1;
      atual.valor += servico.valorUnitario;
      ranking.set(chave, atual);
    }
  }

  return [...ranking.values()];
};
