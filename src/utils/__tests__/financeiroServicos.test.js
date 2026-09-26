import assert from "node:assert/strict";
import test from "node:test";

import {
  ehFinanceiroServicos,
  filtrarContasServicos,
  filtrarMovimentacoesPeriodo,
  filtrarObrigacoesDespesas,
  montarEntradasCaixaServicos,
  montarSaidasCaixaDespesas,
  resumirFinanceiroServicos,
} from "../financeiroServicos.js";

const pagamentoDespesa = (dataPagamento, valorPago = 500) => ({
  dataPagamento,
  formaPagamento: "pix",
  valorPago,
  pagoEm: { seconds: 1 },
  pagoPor: "usuario-1",
});

const despesaNova = (sobrescrita = {}) => ({
  id: "despesa-1",
  descricao: "Aluguel",
  categoria: "Estrutura",
  valor: 500,
  dataCompetencia: "2026-09-20",
  dataVencimento: "2026-09-30",
  statusFinanceiro: "pendente",
  situacao: "ativo",
  pagamento: null,
  ...sobrescrita,
});

const contaRecebida = (sobrescrita = {}) => ({
  id: "atendimento-1",
  origem: { tipo: "atendimento", documentoId: "agenda-1" },
  cliente: { nome: "Cliente" },
  descricao: "Atendimento",
  status: "recebido",
  valor: 1000,
  dataCompetencia: "2026-09-20",
  pagamento: {
    dataRecebimento: "2026-10-07",
    formaPagamento: "pix",
    valorRecebido: 1000,
  },
  ...sobrescrita,
});

test("recebimento entra no caixa por dataRecebimento e valorRecebido", () => {
  const conta = contaRecebida({ valor: 1200 });
  assert.deepEqual(montarEntradasCaixaServicos([conta], {
    inicio: "2026-10-01",
    fim: "2026-10-31",
  }), [{
    tipo: "Entrada",
    descricao: "Atendimento",
    categoria: "Atendimento",
    valor: 1000,
    data: "2026-10-07",
    status: "Recebido",
    origemId: "atendimento-1",
  }]);
  assert.deepEqual(montarEntradasCaixaServicos([conta], {
    inicio: "2026-09-01",
    fim: "2026-09-30",
  }), []);
});

test("conta pendente nao entra no caixa e permanece em contas a receber", () => {
  const conta = {
    origem: { tipo: "atendimento" },
    status: "pendente",
    valor: 800,
    dataCompetencia: "2026-09-20",
    pagamento: null,
  };
  assert.deepEqual(montarEntradasCaixaServicos([conta]), []);
  assert.equal(resumirFinanceiroServicos([], [conta]).aReceber, 800);
});

test("despesa pendente e obrigacao, mas nao reduz o caixa", () => {
  const despesa = despesaNova();
  assert.deepEqual(montarSaidasCaixaDespesas([despesa]), []);
  const resumo = resumirFinanceiroServicos([despesa]);
  assert.equal(resumo.despesas, 0);
  assert.equal(resumo.saldo, 0);
  assert.equal(resumo.despesasPendentes, 1);
  assert.equal(resumo.totalDespesasPendentes, 500);
});

test("despesa paga entra no caixa por dataPagamento e valorPago", () => {
  const despesa = despesaNova({
    valor: 700,
    statusFinanceiro: "pago",
    pagamento: pagamentoDespesa("2026-10-05", 500),
  });
  assert.deepEqual(montarSaidasCaixaDespesas([despesa], {
    inicio: "2026-10-01",
    fim: "2026-10-31",
  }), [{
    tipo: "Saída",
    descricao: "Aluguel",
    categoria: "Estrutura",
    valor: 500,
    data: "2026-10-05",
    status: "Pago",
    origemId: "despesa-1",
  }]);
  assert.deepEqual(montarSaidasCaixaDespesas([despesa], {
    inicio: "2026-09-01",
    fim: "2026-09-30",
  }), []);
});

test("competencia e vencimento nao deslocam a saida de caixa", () => {
  const despesa = despesaNova({
    valor: 1000,
    statusFinanceiro: "pago",
    pagamento: pagamentoDespesa("2026-10-05", 1000),
  });
  assert.equal(filtrarObrigacoesDespesas([despesa], {
    inicio: "2026-09-01", fim: "2026-09-30",
  }).length, 1);
  assert.equal(montarSaidasCaixaDespesas([despesa], {
    inicio: "2026-09-01", fim: "2026-09-30",
  }).length, 0);
  assert.equal(montarSaidasCaixaDespesas([despesa], {
    inicio: "2026-10-01", fim: "2026-10-31",
  }).length, 1);
});

test("legados pagos ou sem status nao inventam data de caixa", () => {
  const pago = { descricao: "Legada", categoria: "Outros", valor: 100, data: "2026-09-10", status: "Pago" };
  const semStatus = { descricao: "Legada", categoria: "Outros", valor: 100, data: "2026-09-10" };
  assert.deepEqual(montarSaidasCaixaDespesas([pago, semStatus]), []);
  assert.equal(resumirFinanceiroServicos([pago, semStatus]).despesasPendentes, 0);
});

test("legado pendente fica na obrigacao e entra no caixa somente depois da baixa real", () => {
  const pendente = { id: "legada", descricao: "Legada", categoria: "Outros", valor: 300, data: "2026-09-10", status: "Pendente" };
  assert.equal(resumirFinanceiroServicos([pendente]).totalDespesasPendentes, 300);
  assert.deepEqual(montarSaidasCaixaDespesas([pendente]), []);

  const baixada = {
    ...pendente,
    statusFinanceiro: "pago",
    pagamento: pagamentoDespesa("2026-10-10", 300),
  };
  assert.equal(montarSaidasCaixaDespesas([baixada], {
    inicio: "2026-10-01", fim: "2026-10-31",
  })[0].valor, 300);
});

test("despesa cancelada nao entra em obrigacoes nem caixa", () => {
  const cancelada = despesaNova({
    situacao: "cancelado",
    statusFinanceiro: "pago",
    pagamento: pagamentoDespesa("2026-09-25"),
  });
  assert.deepEqual(filtrarObrigacoesDespesas([cancelada]), []);
  assert.deepEqual(montarSaidasCaixaDespesas([cancelada]), []);
});

test("saldo usa exclusivamente entradas e saidas efetivas", () => {
  const despesas = [
    despesaNova(),
    despesaNova({ id: "paga", statusFinanceiro: "pago", pagamento: pagamentoDespesa("2026-10-05", 400) }),
  ];
  const resumo = resumirFinanceiroServicos(despesas, [contaRecebida()], {
    inicio: "2026-10-01", fim: "2026-10-31",
  });
  assert.equal(resumo.recebido, 1000);
  assert.equal(resumo.despesas, 400);
  assert.equal(resumo.saldo, 600);
});

test("valor zero estruturado permanece um movimento valido", () => {
  const entrada = contaRecebida({ pagamento: {
    dataRecebimento: "2026-10-07", formaPagamento: "pix", valorRecebido: 0,
  } });
  const saida = despesaNova({
    statusFinanceiro: "pago",
    pagamento: pagamentoDespesa("2026-10-05", 0),
  });
  assert.equal(montarEntradasCaixaServicos([entrada]).length, 1);
  assert.equal(montarSaidasCaixaDespesas([saida]).length, 1);
});

test("dados financeiros ou datas invalidas nao viram caixa", () => {
  assert.deepEqual(montarEntradasCaixaServicos([
    contaRecebida({ pagamento: { dataRecebimento: "2026-10-07", valorRecebido: "1000" } }),
  ]), []);
  assert.deepEqual(montarSaidasCaixaDespesas([
    despesaNova({ statusFinanceiro: "pago", pagamento: pagamentoDespesa("2026-02-30") }),
  ]), []);
});

test("filtros mantem bordas inclusivas para caixa e obrigacoes", () => {
  const despesas = [
    despesaNova({ id: "inicio", dataCompetencia: "2026-09-01" }),
    despesaNova({ id: "fim", dataCompetencia: "2026-09-30" }),
    despesaNova({ id: "fora", dataCompetencia: "2026-10-01" }),
  ];
  assert.equal(filtrarObrigacoesDespesas(despesas, {
    inicio: "2026-09-01", fim: "2026-09-30",
  }).length, 2);
});

test("somente clientes e alias servicos usam a apresentacao financeira de servicos", () => {
  assert.equal(ehFinanceiroServicos("clientes"), true);
  assert.equal(ehFinanceiroServicos("servicos"), true);
  for (const segmento of ["comercio", "industria", "oficina", undefined]) {
    assert.equal(ehFinanceiroServicos(segmento), false);
  }
});

test("filtros legados compartilhados preservam o comportamento anterior", () => {
  const contas = [
    contaRecebida(),
    { origem: { tipo: "atendimento" }, status: "pendente", dataCompetencia: "2026-09-10" },
  ];
  assert.equal(filtrarContasServicos(contas, {
    inicio: "2026-09-01", fim: "2026-09-30",
  }).length, 1);
  const movimentos = [{ data: "2026-09-01" }, { data: "2026-10-01" }];
  assert.deepEqual(filtrarMovimentacoesPeriodo(movimentos, {
    inicio: "2026-09-01", fim: "2026-09-30",
  }), [movimentos[0]]);
});
