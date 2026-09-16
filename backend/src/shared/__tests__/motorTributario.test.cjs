"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { CATALOGO_IBS_CBS_2025_002_V1_60 } = require("../catalogoTributario.cjs");
const {
  VERSAO_MOTOR_IBS_CBS,
  PENDENCIAS_MOTOR_IBS_CBS,
  avaliarTributacaoIbsCbs,
  validarClassificacaoIbsCbs,
} = require("../motorTributario.cjs");

const faturamentoHistorico = () => ({
  origem: { tipo: "venda" },
  contextoFiscal: {
    emitente: { regimeTributario: "Simples Nacional" },
    destinatario: { nome: "Cliente" },
    operacao: { dataOperacao: "2026-06-22", destinoOperacao: "interna" },
  },
  itens: [{
    origemItemId: "item-1",
    fiscalSnapshot: { ncm: "34060000", origemProduto: "revenda" },
  }],
  determinacaoFiscal: {
    regraVersao: "fiscal_v1",
    itens: [{ indice: 0, origemItemId: "item-1", cfopEfetivo: "5102", pendencias: [] }],
  },
  classificacaoTributaria: {
    versao: 1,
    regraVersao: "tributaria_v1",
    itens: [{ origemItemId: "item-1", ibsCbs: { cst: null, cClassTrib: null, fonte: null } }],
  },
});

test("motor returns an explicit versioned, auditable, conservative result", () => {
  const resultado = avaliarTributacaoIbsCbs({
    faturamento: faturamentoHistorico(),
    catalogo: CATALOGO_IBS_CBS_2025_002_V1_60,
  });
  assert.equal(resultado.versao, 1);
  assert.equal(resultado.regraVersao, VERSAO_MOTOR_IBS_CBS);
  assert.equal(resultado.catalogoVersao, "2025.002-v1.60");
  assert.equal(resultado.status, "pendente");
  assert.equal(resultado.itens[0].status, "pendente");
  assert.deepEqual(resultado.itens[0].resultado, { cst: null, cClassTrib: null });
  assert.deepEqual(resultado.itens[0].regrasAplicadas, []);
  assert.ok(resultado.pendencias.includes(PENDENCIAS_MOTOR_IBS_CBS.REGRA_NAO_IMPLEMENTADA));
  assert.ok(resultado.pendencias.includes(PENDENCIAS_MOTOR_IBS_CBS.CLASSIFICACAO_NAO_DETERMINADA));
  assert.equal(new Set(resultado.pendencias).size, resultado.pendencias.length);
  assert.deepEqual(resultado.itens[0].evidencias, [
    { codigo: "data_operacao", valor: "2026-06-22" },
    { codigo: "destino_operacao", valor: "interna" },
    { codigo: "regime_tributario", valor: "Simples Nacional" },
    { codigo: "cfop_efetivo", valor: "5102" },
    { codigo: "origem_produto", valor: "revenda" },
    { codigo: "ncm", valor: "34060000" },
  ]);
});

test("invalid input, missing or incomplete catalogue, date and fiscal facts produce deduplicated pendencies", () => {
  const vazio = avaliarTributacaoIbsCbs();
  assert.equal(vazio.status, "pendente");
  assert.ok(vazio.pendencias.includes(PENDENCIAS_MOTOR_IBS_CBS.ENTRADA_INVALIDA));
  assert.ok(vazio.pendencias.includes(PENDENCIAS_MOTOR_IBS_CBS.CATALOGO_AUSENTE));
  assert.ok(vazio.pendencias.includes(PENDENCIAS_MOTOR_IBS_CBS.DATA_OPERACAO_AUSENTE));

  const faturamento = faturamentoHistorico();
  faturamento.contextoFiscal.operacao.dataOperacao = "2026-02-30";
  faturamento.contextoFiscal.emitente = {};
  delete faturamento.contextoFiscal.destinatario;
  delete faturamento.determinacaoFiscal;
  const resultado = avaliarTributacaoIbsCbs({ faturamento, catalogo: { completo: false, itens: [] } });
  for (const codigo of [
    PENDENCIAS_MOTOR_IBS_CBS.CATALOGO_INCOMPLETO,
    PENDENCIAS_MOTOR_IBS_CBS.DATA_OPERACAO_AUSENTE,
    PENDENCIAS_MOTOR_IBS_CBS.CONTEXTO_INCOMPLETO,
    PENDENCIAS_MOTOR_IBS_CBS.REGIME_AUSENTE,
    PENDENCIAS_MOTOR_IBS_CBS.DETERMINACAO_AUSENTE,
  ]) assert.ok(resultado.pendencias.includes(codigo), codigo);
  assert.equal(new Set(resultado.pendencias).size, resultado.pendencias.length);
  assert.ok(resultado.itens[0].pendencias.includes(PENDENCIAS_MOTOR_IBS_CBS.DETERMINACAO_AUSENTE));
  const versaoIncompativel = avaliarTributacaoIbsCbs({
    faturamento: faturamentoHistorico(),
    catalogo: CATALOGO_IBS_CBS_2025_002_V1_60,
    regraVersao: "motor_ibs_cbs_v2",
  });
  assert.ok(versaoIncompativel.pendencias.includes(PENDENCIAS_MOTOR_IBS_CBS.ENTRADA_INVALIDA));
  assert.equal(versaoIncompativel.regraVersao, VERSAO_MOTOR_IBS_CBS);
});

test("missing item determination remains pending without using CFOP as fallback", () => {
  const faturamento = faturamentoHistorico();
  faturamento.determinacaoFiscal.itens[0].cfopEfetivo = null;
  const resultado = avaliarTributacaoIbsCbs({ faturamento, catalogo: CATALOGO_IBS_CBS_2025_002_V1_60 });
  assert.ok(resultado.itens[0].pendencias.includes(PENDENCIAS_MOTOR_IBS_CBS.DETERMINACAO_ITEM_INCOMPLETA));
  assert.deepEqual(resultado.itens[0].resultado, { cst: null, cClassTrib: null });
});

test("catalogue validates a proposed code, CST and historical validity without selecting it", () => {
  const catalogo = CATALOGO_IBS_CBS_2025_002_V1_60;
  const proposta = { catalogo, cst: "000", cClassTrib: "000001", dataOperacao: "2026-06-22" };
  assert.deepEqual(validarClassificacaoIbsCbs(proposta), { valida: true, pendencias: [] });
  assert.ok(validarClassificacaoIbsCbs({ ...proposta, cClassTrib: "999999" })
    .pendencias.includes(PENDENCIAS_MOTOR_IBS_CBS.CODIGO_INEXISTENTE));
  assert.ok(validarClassificacaoIbsCbs({ ...proposta, cst: "010" })
    .pendencias.includes(PENDENCIAS_MOTOR_IBS_CBS.CST_INCOMPATIVEL));
  assert.ok(validarClassificacaoIbsCbs({ ...proposta, dataOperacao: "2025-01-01" })
    .pendencias.includes(PENDENCIAS_MOTOR_IBS_CBS.FORA_VIGENCIA));
  assert.ok(validarClassificacaoIbsCbs({ ...proposta, dataOperacao: "not-a-date" })
    .pendencias.includes(PENDENCIAS_MOTOR_IBS_CBS.DATA_OPERACAO_AUSENTE));
});

test("same inputs are deterministic and all historical inputs remain immutable", () => {
  const faturamento = faturamentoHistorico();
  const antes = structuredClone(faturamento);
  const catalogo = CATALOGO_IBS_CBS_2025_002_V1_60;
  const primeira = avaliarTributacaoIbsCbs({ faturamento, catalogo });
  const segunda = avaliarTributacaoIbsCbs({ faturamento, catalogo });
  assert.deepEqual(primeira, segunda);
  assert.deepEqual(primeira.itens[0].evidencias, segunda.itens[0].evidencias);
  assert.deepEqual(primeira.itens[0].regrasAplicadas, segunda.itens[0].regrasAplicadas);
  assert.deepEqual(faturamento, antes);
  assert.deepEqual(faturamento.classificacaoTributaria, antes.classificacaoTributaria);
  assert.deepEqual(faturamento.itens[0].fiscalSnapshot, antes.itens[0].fiscalSnapshot);
  assert.equal(Object.isFrozen(catalogo.itens[0]), true);
  assert.equal(Object.isFrozen(primeira.itens[0].resultado), true);
});

test("NCM, CFOP, product origin and tax regime never select a code in motor v1", () => {
  for (const campo of ["ncm", "cfop", "origemProduto", "regimeTributario"]) {
    const faturamento = faturamentoHistorico();
    if (campo === "ncm") faturamento.itens[0].fiscalSnapshot.ncm = "00000000";
    if (campo === "cfop") faturamento.determinacaoFiscal.itens[0].cfopEfetivo = "6102";
    if (campo === "origemProduto") faturamento.itens[0].fiscalSnapshot.origemProduto = "fabricado";
    if (campo === "regimeTributario") faturamento.contextoFiscal.emitente.regimeTributario = "Outro regime";
    const resultado = avaliarTributacaoIbsCbs({ faturamento, catalogo: CATALOGO_IBS_CBS_2025_002_V1_60 });
    assert.deepEqual(resultado.itens[0].resultado, { cst: null, cClassTrib: null }, campo);
    assert.deepEqual(resultado.itens[0].regrasAplicadas, [], campo);
  }
});
