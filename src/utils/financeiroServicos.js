import { normalizarSegmentoEmpresa } from "../config/segmentosEmpresa.js";

export const ehFinanceiroServicos = (segmento) =>
  normalizarSegmentoEmpresa(segmento) === "clientes";

export const filtrarMovimentacoesPeriodo = (movimentacoes, { inicio = "", fim = "" } = {}) =>
  movimentacoes.filter((item) => {
    if (inicio && item.data < inicio) return false;
    if (fim && item.data > fim) return false;
    return true;
  });

export const filtrarContasServicos = (contas, { inicio = "", fim = "" } = {}) =>
  contas.filter((conta) => {
    if (conta.origem?.tipo !== "atendimento") return false;
    const data = conta.status === "recebido"
      ? conta.pagamento?.dataRecebimento
      : conta.dataCompetencia;
    return (!inicio || data >= inicio) && (!fim || data <= fim);
  });

export const resumirFinanceiroServicos = (movimentacoes, contas = [], filtro = {}) => {
  const despesas = movimentacoes
    .filter((item) => item.tipo === "Saída")
    .reduce((total, item) => total + Number(item.valor ?? 0), 0);
  const recebidasNoPeriodo = filtrarContasServicos(contas, filtro)
    .filter((conta) => conta.status === "recebido" && conta.origem?.tipo === "atendimento");
  const recebido = recebidasNoPeriodo.reduce((total, conta) => total + Number(conta.valor || 0), 0);
  const aReceber = contas
    .filter((conta) => conta.status === "pendente" && conta.origem?.tipo === "atendimento")
    .reduce((total, conta) => total + Number(conta.valor || 0), 0);
  const atendimentosPagos = recebidasNoPeriodo.length;

  return {
    recebido,
    aReceber,
    atendimentosPagos,
    ticketMedio: atendimentosPagos ? recebido / atendimentosPagos : 0,
    despesas,
    saldo: recebido === despesas ? 0 : recebido - despesas,
  };
};
