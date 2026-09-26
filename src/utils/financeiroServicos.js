import { normalizarSegmentoEmpresa } from "../config/segmentosEmpresa.js";
import { normalizarDataCivilDespesa, normalizarDespesa } from "./despesas.js";

export const ehFinanceiroServicos = (segmento) =>
  normalizarSegmentoEmpresa(segmento) === "clientes";

export const filtrarMovimentacoesPeriodo = (movimentacoes, { inicio = "", fim = "" } = {}) =>
  movimentacoes.filter((item) => {
    if (inicio && item.data < inicio) return false;
    if (fim && item.data > fim) return false;
    return true;
  });

const dataNoPeriodo = (data, { inicio = "", fim = "" } = {}) =>
  Boolean(data) && (!inicio || data >= inicio) && (!fim || data <= fim);

const valorFinanceiro = (valor) =>
  typeof valor === "number" && Number.isFinite(valor) && valor >= 0 ? valor : null;

export const filtrarContasServicos = (contas, { inicio = "", fim = "" } = {}) =>
  contas.filter((conta) => {
    if (conta.origem?.tipo !== "atendimento") return false;
    const data = conta.status === "recebido"
      ? conta.pagamento?.dataRecebimento
      : conta.dataCompetencia;
    return (!inicio || data >= inicio) && (!fim || data <= fim);
  });

export const montarEntradasCaixaServicos = (contas = [], filtro = {}) =>
  contas.flatMap((conta) => {
    const data = normalizarDataCivilDespesa(conta?.pagamento?.dataRecebimento);
    const valor = valorFinanceiro(conta?.pagamento?.valorRecebido);
    if (conta?.origem?.tipo !== "atendimento" || conta?.status !== "recebido" ||
        !dataNoPeriodo(data, filtro) || valor === null) return [];

    return [{
      tipo: "Entrada",
      descricao: conta.descricao || conta.cliente?.nome || "Atendimento recebido",
      categoria: "Atendimento",
      valor,
      data,
      status: "Recebido",
      origemId: conta.id || conta.origem?.documentoId || "",
    }];
  });

export const montarSaidasCaixaDespesas = (despesas = [], filtro = {}) =>
  despesas.flatMap((despesa) => {
    const normalizada = normalizarDespesa(despesa);
    if (normalizada.situacao !== "ativo" || normalizada.statusFinanceiro !== "pago" ||
        !normalizada.pagamento ||
        !dataNoPeriodo(normalizada.pagamento.dataPagamento, filtro)) return [];

    return [{
      tipo: "Saída",
      descricao: normalizada.descricao || "Despesa paga",
      categoria: normalizada.categoria || "Outros",
      valor: normalizada.pagamento.valorPago,
      data: normalizada.pagamento.dataPagamento,
      status: "Pago",
      origemId: normalizada.id,
    }];
  });

export const filtrarObrigacoesDespesas = (despesas = [], filtro = {}) =>
  despesas
    .map((despesa) => ({ original: despesa, normalizada: normalizarDespesa(despesa) }))
    .filter(({ normalizada }) =>
      normalizada.situacao === "ativo" &&
      dataNoPeriodo(normalizada.dataCompetencia, filtro)
    );

export const resumirFinanceiroServicos = (despesas = [], contas = [], filtro = {}) => {
  const entradasCaixa = montarEntradasCaixaServicos(contas, filtro);
  const saidasCaixa = montarSaidasCaixaDespesas(despesas, filtro);
  const obrigacoes = filtrarObrigacoesDespesas(despesas, filtro);
  const pendentes = obrigacoes.filter(({ normalizada }) =>
    normalizada.statusFinanceiro === "pendente"
  );
  const recebido = entradasCaixa.reduce((total, item) => total + item.valor, 0);
  const despesasPagas = saidasCaixa.reduce((total, item) => total + item.valor, 0);
  const aReceber = contas
    .filter((conta) => conta.status === "pendente" && conta.origem?.tipo === "atendimento")
    .reduce((total, conta) => total + Number(conta.valor || 0), 0);
  const atendimentosPagos = entradasCaixa.length;
  const totalDespesasPendentes = pendentes.reduce(
    (total, { normalizada }) => total + Number(normalizada.valor ?? 0),
    0,
  );

  return {
    recebido,
    aReceber,
    atendimentosPagos,
    ticketMedio: atendimentosPagos ? recebido / atendimentosPagos : 0,
    despesas: despesasPagas,
    saldo: recebido === despesasPagas ? 0 : recebido - despesasPagas,
    despesasPendentes: pendentes.length,
    totalDespesasPendentes,
    movimentacoesCaixa: [...entradasCaixa, ...saidasCaixa],
  };
};
