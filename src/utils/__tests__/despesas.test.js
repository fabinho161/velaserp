import assert from "node:assert/strict";
import test from "node:test";

import {
  ehDespesaLegada,
  montarAtualizacaoDespesa,
  montarCancelamentoDespesa,
  montarPayloadNovaDespesa,
  normalizarDataCivilDespesa,
  normalizarDespesa,
  normalizarPagamentoDespesa,
  normalizarStatusFinanceiroDespesa,
  obterSituacaoDespesa,
  podeCancelarDespesa,
  podeEditarDespesa,
  podeRegistrarPagamentoDespesa,
} from "../despesas.js";

const baseLegada = {
  id: "despesa-1",
  descricao: "Aluguel",
  categoria: "Estrutura",
  valor: 100,
  data: "2026-09-10",
  status: "Pago",
};

test("normaliza despesa legada paga sem inventar pagamento ou vencimento", () => {
  assert.deepEqual(normalizarDespesa(baseLegada), {
    id: "despesa-1",
    descricao: "Aluguel",
    categoria: "Estrutura",
    valor: 100,
    dataCompetencia: "2026-09-10",
    dataVencimento: null,
    statusFinanceiro: "pago",
    situacao: "ativo",
    pagamento: null,
    legado: true,
    criadoEm: null,
    criadoPor: "",
    atualizadoEm: null,
    atualizadoPor: "",
  });
});

test("normaliza legado pendente e legado sem status com compatibilidade historica", () => {
  assert.equal(normalizarDespesa({ ...baseLegada, status: "Pendente" }).statusFinanceiro, "pendente");
  const semStatus = { ...baseLegada };
  delete semStatus.status;
  const normalizada = normalizarDespesa(semStatus);
  assert.equal(normalizada.statusFinanceiro, "pago");
  assert.equal(normalizada.pagamento, null);
  assert.equal(normalizada.legado, true);
});

test("normaliza capitalizacao do status e nao inventa estados desconhecidos", () => {
  assert.equal(normalizarStatusFinanceiroDespesa(" PAGO "), "pago");
  assert.equal(normalizarStatusFinanceiroDespesa("pendente"), "pendente");
  assert.equal(normalizarStatusFinanceiroDespesa("parcial"), null);
  assert.equal(normalizarDespesa({ ...baseLegada, status: "desconhecido" }).statusFinanceiro, null);
});

test("separa cancelamento do status financeiro", () => {
  const excluida = normalizarDespesa({ ...baseLegada, excluida: true });
  assert.equal(excluida.situacao, "cancelado");
  assert.equal(excluida.statusFinanceiro, "pago");

  const canceladaPorStatus = normalizarDespesa({ ...baseLegada, status: "cancelado" });
  assert.equal(canceladaPorStatus.situacao, "cancelado");
  assert.equal(canceladaPorStatus.statusFinanceiro, null);
  assert.equal(obterSituacaoDespesa({ situacao: "cancelado" }), "cancelado");
});

test("normaliza contrato novo pendente com datas explicitas", () => {
  const normalizada = normalizarDespesa({
    ...baseLegada,
    dataCompetencia: "2026-10-01",
    dataVencimento: "2026-10-15",
    statusFinanceiro: "pendente",
    situacao: "ativo",
    pagamento: null,
  });
  assert.equal(normalizada.legado, false);
  assert.equal(normalizada.dataCompetencia, "2026-10-01");
  assert.equal(normalizada.dataVencimento, "2026-10-15");
  assert.equal(normalizada.statusFinanceiro, "pendente");
  assert.equal(normalizada.pagamento, null);
});

test("preserva pagamento estruturado completo sem compartilhar referencia", () => {
  const pagamento = {
    dataPagamento: "2026-10-05",
    formaPagamento: "pix",
    valorPago: 100,
    pagoEm: { seconds: 123, nanoseconds: 0 },
    pagoPor: "usuario-1",
  };
  const normalizada = normalizarDespesa({
    ...baseLegada,
    dataCompetencia: "2026-09-10",
    statusFinanceiro: "pago",
    situacao: "ativo",
    pagamento,
  });
  assert.deepEqual(normalizada.pagamento, pagamento);
  assert.notEqual(normalizada.pagamento, pagamento);
  assert.notEqual(normalizada.pagamento.pagoEm, pagamento.pagoEm);
});

test("data legada serve somente como competencia", () => {
  const normalizada = normalizarDespesa(baseLegada);
  assert.equal(normalizada.dataCompetencia, "2026-09-10");
  assert.equal(normalizada.dataVencimento, null);
  assert.equal(normalizada.pagamento, null);
});

test("valida datas civis reais sem conversao de timezone", () => {
  assert.equal(normalizarDataCivilDespesa("2026-01-01"), "2026-01-01");
  assert.equal(normalizarDataCivilDespesa("2024-02-29"), "2024-02-29");
  assert.equal(normalizarDataCivilDespesa("2026-02-29"), null);
  assert.equal(normalizarDataCivilDespesa("2026-13-01"), null);
  assert.equal(normalizarDataCivilDespesa("01/01/2026"), null);
});

test("preserva zero e rejeita valores financeiros invalidos", () => {
  assert.equal(normalizarDespesa({ ...baseLegada, valor: 0 }).valor, 0);
  for (const valor of [NaN, Infinity, -1, "100", undefined]) {
    assert.equal(normalizarDespesa({ ...baseLegada, valor }).valor, null);
  }
});

test("rejeita pagamento malformado sem completar dados ausentes", () => {
  const parcial = {
    dataPagamento: "2026-10-05",
    formaPagamento: "pix",
    valorPago: 100,
  };
  assert.equal(normalizarPagamentoDespesa(parcial), null);
  assert.equal(normalizarDespesa({ ...baseLegada, pagamento: parcial }).pagamento, null);
  assert.equal(normalizarPagamentoDespesa({ ...parcial, pagoEm: {}, pagoPor: "u1", valorPago: Infinity }), null);
});

test("nao usa data legada como fallback quando o contrato novo e explicito mas invalido", () => {
  const normalizada = normalizarDespesa({
    ...baseLegada,
    dataCompetencia: "invalida",
    statusFinanceiro: "pago",
  });
  assert.equal(normalizada.legado, false);
  assert.equal(normalizada.dataCompetencia, null);
});

test("identifica legado pela ausencia do contrato explicito, mesmo mantendo data antiga", () => {
  assert.equal(ehDespesaLegada(baseLegada), true);
  assert.equal(ehDespesaLegada({ ...baseLegada, dataCompetencia: "2026-09-10" }), false);
  assert.equal(ehDespesaLegada({ ...baseLegada, pagamento: null }), false);
});

test("tolera entrada vazia e campos extras", () => {
  assert.equal(normalizarDespesa(null).valor, null);
  assert.equal(normalizarDespesa(undefined).statusFinanceiro, null);
  assert.equal(normalizarDespesa({}).statusFinanceiro, "pago");
  assert.equal(normalizarDespesa({ campoDesconhecido: { qualquer: true } }).legado, true);
});

test("normalizacao nao altera o objeto original", () => {
  const original = {
    ...baseLegada,
    excluida: true,
    criadoEm: { seconds: 10 },
    campoExtra: { interno: [1, 2] },
  };
  const antes = structuredClone(original);
  const normalizada = normalizarDespesa(original);
  normalizada.criadoEm.seconds = 99;
  assert.deepEqual(original, antes);
});

const auditoria = {
  uid: "usuario-1",
  timestamp: { tipo: "serverTimestamp" },
};

const formularioNovo = {
  descricao: "  Energia elétrica  ",
  categoria: "  Utilidades  ",
  valor: "250.50",
  dataCompetencia: "2026-09-01",
  dataVencimento: "2026-09-20",
};

test("monta nova despesa pendente com contrato explicito e espelhos transitorios", () => {
  const payload = montarPayloadNovaDespesa(formularioNovo, auditoria);
  assert.deepEqual(payload, {
    descricao: "Energia elétrica",
    categoria: "Utilidades",
    valor: 250.5,
    dataCompetencia: "2026-09-01",
    dataVencimento: "2026-09-20",
    statusFinanceiro: "pendente",
    situacao: "ativo",
    pagamento: null,
    data: "2026-09-01",
    status: "Pendente",
    criadoEm: auditoria.timestamp,
    criadoPor: "usuario-1",
    atualizadoEm: auditoria.timestamp,
    atualizadoPor: "usuario-1",
  });
  assert.equal(ehDespesaLegada(payload), false);
  assert.equal(normalizarDespesa(payload).statusFinanceiro, "pendente");
});

test("bloqueia payload novo com campos obrigatorios invalidos", () => {
  const invalidos = [
    { descricao: "" },
    { categoria: "" },
    { valor: "0" },
    { valor: "-1" },
    { valor: "qualquer" },
    { valor: Infinity },
    { dataCompetencia: "2026-02-29" },
    { dataVencimento: "invalida" },
  ];

  for (const alteracao of invalidos) {
    assert.equal(montarPayloadNovaDespesa({ ...formularioNovo, ...alteracao }, auditoria), null);
  }
  assert.equal(montarPayloadNovaDespesa(formularioNovo, { ...auditoria, uid: "" }), null);
  assert.equal(montarPayloadNovaDespesa(formularioNovo, { ...auditoria, timestamp: null }), null);
});

test("edicao de contrato novo usa allowlist e preserva campos protegidos", () => {
  const original = montarPayloadNovaDespesa(formularioNovo, auditoria);
  const timestampAtualizacao = { tipo: "serverTimestamp-2" };
  const atualizacao = montarAtualizacaoDespesa(original, {
    ...formularioNovo,
    descricao: "Energia ajustada",
    categoria: "Infraestrutura",
    valor: "275",
    dataCompetencia: "2026-10-01",
    dataVencimento: "2026-10-18",
    statusFinanceiro: "pago",
    situacao: "cancelado",
    pagamento: { inventado: true },
    criadoPor: "invasor",
  }, { uid: "editor-1", timestamp: timestampAtualizacao });

  assert.deepEqual(atualizacao, {
    descricao: "Energia ajustada",
    categoria: "Infraestrutura",
    valor: 275,
    data: "2026-10-01",
    atualizadoEm: timestampAtualizacao,
    atualizadoPor: "editor-1",
    dataCompetencia: "2026-10-01",
    dataVencimento: "2026-10-18",
  });
  const persistido = { ...original, ...atualizacao };
  assert.equal(persistido.statusFinanceiro, "pendente");
  assert.equal(persistido.situacao, "ativo");
  assert.equal(persistido.pagamento, null);
  assert.equal(persistido.criadoPor, "usuario-1");
  assert.equal(persistido.criadoEm, auditoria.timestamp);
});

test("edicao legada permanece minima sem promover contrato ou inventar vencimento", () => {
  const original = {
    ...baseLegada,
    campoExtra: { preservar: true },
  };
  const atualizacao = montarAtualizacaoDespesa(original, {
    descricao: "Aluguel reajustado",
    categoria: "Estrutura",
    valor: "120",
    dataCompetencia: "2026-10-10",
    dataVencimento: "2026-10-20",
  }, auditoria);
  const persistido = { ...original, ...atualizacao };

  assert.equal(ehDespesaLegada(persistido), true);
  assert.equal(persistido.data, "2026-10-10");
  assert.equal(Object.hasOwn(persistido, "dataCompetencia"), false);
  assert.equal(Object.hasOwn(persistido, "dataVencimento"), false);
  assert.equal(Object.hasOwn(persistido, "pagamento"), false);
  assert.equal(Object.hasOwn(persistido, "dataPagamento"), false);
  assert.deepEqual(persistido.campoExtra, { preservar: true });
  assert.equal(persistido.status, "Pago");
});

test("legados pendente e sem status preservam o status durante edicao", () => {
  for (const original of [
    { ...baseLegada, status: "Pendente" },
    Object.fromEntries(Object.entries(baseLegada).filter(([chave]) => chave !== "status")),
  ]) {
    const atualizacao = montarAtualizacaoDespesa(original, {
      ...formularioNovo,
      dataVencimento: "",
    }, auditoria);
    const persistido = { ...original, ...atualizacao };
    assert.equal(Object.hasOwn(atualizacao, "status"), false);
    assert.equal(Object.hasOwn(atualizacao, "pagamento"), false);
    assert.equal(normalizarDespesa(persistido).statusFinanceiro,
      original.status === "Pendente" ? "pendente" : "pago");
  }
});

test("cancelamento e logico e nao cria pagamento nem altera status financeiro canonico", () => {
  const nova = montarPayloadNovaDespesa(formularioNovo, auditoria);
  const cancelamentoNovo = montarCancelamentoDespesa(nova, {
    uid: "usuario-2",
    timestamp: { tipo: "cancelamento" },
  });
  const novaCancelada = { ...nova, ...cancelamentoNovo };
  assert.equal(cancelamentoNovo.situacao, "cancelado");
  assert.equal(novaCancelada.statusFinanceiro, "pendente");
  assert.equal(novaCancelada.pagamento, null);
  assert.equal(normalizarDespesa(novaCancelada).situacao, "cancelado");

  const cancelamentoLegado = montarCancelamentoDespesa(baseLegada, auditoria);
  assert.equal(Object.hasOwn(cancelamentoLegado, "situacao"), false);
  assert.equal(Object.hasOwn(cancelamentoLegado, "pagamento"), false);
  assert.equal(cancelamentoLegado.status, "cancelado");
});

test("legado parcialmente modernizado preserva origem e competencia historica", () => {
  const paga = {
    ...baseLegada,
    origemSchema: "legado",
    statusFinanceiro: "pago",
    pagamento: {
      dataPagamento: "2026-09-26", formaPagamento: "pix", valorPago: 100,
      pagoEm: { seconds: 1 }, pagoPor: "u1",
    },
  };
  const normalizada = normalizarDespesa(paga);
  assert.equal(ehDespesaLegada(paga), true);
  assert.equal(normalizada.dataCompetencia, "2026-09-10");
  assert.equal(normalizada.dataVencimento, null);
  assert.equal(normalizada.pagamento.dataPagamento, "2026-09-26");
});

test("elegibilidade de baixa, edicao e cancelamento respeita estado financeiro", () => {
  const nova = montarPayloadNovaDespesa(formularioNovo, auditoria);
  assert.equal(podeRegistrarPagamentoDespesa(nova), true);
  assert.equal(podeEditarDespesa(nova), true);
  assert.equal(podeCancelarDespesa(nova), true);
  assert.equal(podeRegistrarPagamentoDespesa({ ...baseLegada, status: "Pendente" }), true);
  assert.equal(podeRegistrarPagamentoDespesa(baseLegada), false);
  assert.equal(podeEditarDespesa(baseLegada), false);
  const semStatus = { ...baseLegada }; delete semStatus.status;
  assert.equal(podeRegistrarPagamentoDespesa(semStatus), false);
  assert.equal(podeEditarDespesa(semStatus), false);
  assert.equal(podeCancelarDespesa(baseLegada), false);
  assert.equal(podeCancelarDespesa({ ...baseLegada, status: "Pendente" }), true);
  assert.equal(podeRegistrarPagamentoDespesa({ ...nova, situacao: "cancelado" }), false);
  const paga = { ...nova, statusFinanceiro: "pago", status: "Pago", pagamento: {
    dataPagamento: "2026-09-26", formaPagamento: "pix", valorPago: 250.5,
    pagoEm: { seconds: 1 }, pagoPor: "u1",
  } };
  assert.equal(podeRegistrarPagamentoDespesa(paga), false);
  assert.equal(podeEditarDespesa(paga), false);
  assert.equal(podeCancelarDespesa(paga), false);
});
