import { normalizarSegmentoEmpresa } from "../config/segmentosEmpresa.js";

export const ehFinanceiroServicos = (segmento) =>
  normalizarSegmentoEmpresa(segmento) === "clientes";

export const filtrarMovimentacoesPeriodo = (movimentacoes, { inicio = "", fim = "" } = {}) =>
  movimentacoes.filter((item) => {
    if (inicio && item.data < inicio) return false;
    if (fim && item.data > fim) return false;
    return true;
  });

export const resumirFinanceiroServicos = (movimentacoes) => {
  const despesas = movimentacoes
    .filter((item) => item.tipo === "Saída")
    .reduce((total, item) => total + Number(item.valor ?? 0), 0);

  return {
    recebido: 0,
    aReceber: 0,
    atendimentosPagos: 0,
    ticketMedio: 0,
    despesas,
    saldo: despesas === 0 ? 0 : -despesas,
  };
};
