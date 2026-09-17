"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { classificarManualmente } = require("../classificacaoManual.cjs");
const { CATALOGO_IBS_CBS_2025_002_V1_60: catalogo } = require("../catalogoTributario.cjs");

const faturamento = () => ({
  status: "rascunho",
  contextoFiscal: { emitente: { regimeTributario: "normal" }, operacao: { dataOperacao: "2026-07-01" } },
  itens: [{ origemItemId: "a", fiscalSnapshot: { ncm: "99999999" } }, { origemItemId: "b", fiscalSnapshot: { cfopPadrao: "5102" } }],
});
const entrada = (indice = 0, dados = {}) => ({ indice, origemItemId: indice ? "b" : "a",
  cst: "000", cClassTrib: "000001", ...dados });
const executar = (dados = {}) => classificarManualmente({ faturamento: faturamento(),
  solicitacoes: [entrada()], catalogo, usuarioId: "uid", dataAuditoria: "2026-09-16T12:00:00Z", ...dados });

test("classificacao explicita valida codigo, par e vigencia; parcial mantem pendencia", () => {
  const origem = faturamento();
  const resultado = executar({ faturamento: origem });
  assert.equal(resultado.classificacaoTributaria.itens[0].ibsCbs.cClassTrib, "000001");
  assert.equal(resultado.classificacaoTributaria.itens[0].origemClassificacao, "manual");
  assert.equal(resultado.classificacaoTributaria.itens[0].catalogoVersao, catalogo.versaoCatalogo);
  assert.ok(resultado.classificacaoTributaria.pendencias.includes("classificacao_ibs_cbs_nao_determinada"));
  assert.equal(origem.classificacaoTributaria, undefined);
  const completo = executar({ solicitacoes: [entrada(), entrada(1)] });
  assert.ok(!completo.classificacaoTributaria.pendencias.includes("classificacao_ibs_cbs_nao_determinada"));
});

test("erros de catalogo, codigo, item e data rejeitam a request inteira", () => {
  assert.throws(() => executar({ catalogo: null }), /catalogo_indisponivel/);
  assert.throws(() => executar({ solicitacoes: [] }), /itens_invalidos/);
  assert.throws(() => executar({ catalogo: { ...catalogo, completo: false } }), /catalogo_indisponivel/);
  assert.throws(() => executar({ solicitacoes: [entrada(0, { cst: "999" })] }), /cst_inexistente/);
  assert.throws(() => executar({ solicitacoes: [entrada(0, { cClassTrib: "999999" })] }), /classificacao_tributaria_inexistente/);
  assert.throws(() => executar({ solicitacoes: [entrada(0, { cst: "010" })] }), /cst_incompativel/);
  assert.throws(() => executar({ solicitacoes: [entrada(2)] }), /item_inexistente/);
  assert.throws(() => executar({ solicitacoes: [entrada(), entrada()] }), /item_duplicado/);
  const semData = faturamento();
  delete semData.contextoFiscal.operacao.dataOperacao;
  assert.throws(() => executar({ faturamento: semData }), /data_operacao_ausente/);
  const fora = faturamento();
  fora.contextoFiscal.operacao.dataOperacao = "2025-01-01";
  assert.throws(() => executar({ faturamento: fora }), /classificacao_fora_vigencia/);
});

test("observacao, auditoria, imutabilidade e reenvio identico", () => {
  const solicitacoes = [entrada(0, { observacao: "  Orientacao  contabil  " })];
  const original = structuredClone(solicitacoes);
  const primeiro = executar({ solicitacoes });
  assert.deepEqual(solicitacoes, original);
  assert.equal(primeiro.classificacaoTributaria.itens[0].observacao, "Orientacao contabil");
  assert.equal(primeiro.classificacaoTributaria.itens[0].classificadoPor, "uid");
  assert.equal(primeiro.classificacaoTributaria.itens[0].classificadoEm, "2026-09-16T12:00:00Z");
  assert.throws(() => executar({ solicitacoes: [entrada(0, { observacao: "x".repeat(501) })] }), /observacao_longa/);
  const repetido = executar({ faturamento: { ...faturamento(), classificacaoTributaria: primeiro.classificacaoTributaria }, solicitacoes });
  assert.equal(repetido.alterou, false);
  assert.equal(repetido.classificacaoTributaria.itens[0].historico.length, 0);
  assert.equal(catalogo.itens.find((item) => item.cClassTrib === "000001").cst, "000");
});

test("mudanca explicita conserva autoria inicial e registra revisao limitada", () => {
  const primeiro = executar().classificacaoTributaria;
  const segundo = executar({ faturamento: { ...faturamento(), classificacaoTributaria: primeiro },
    solicitacoes: [entrada(0, { observacao: "Revisado" })],
    usuarioId: "contador" });
  const item = segundo.classificacaoTributaria.itens[0];
  assert.equal(item.classificadoPor, "uid");
  assert.equal(item.atualizadoPor, "contador");
  assert.equal(item.historico.length, 1);
  assert.deepEqual(item.historico[0], {
    cstAnterior: "000", cClassTribAnterior: "000001",
    cstNovo: "000", cClassTribNovo: "000001",
    usuarioId: "contador", data: "2026-09-16T12:00:00Z",
  });
});

test("NCM, CFOP, origem e regime nao substituem escolha explicita de codigos", () => {
  const comFatos = faturamento();
  comFatos.itens[0].fiscalSnapshot = { ncm: "34060000", origemProduto: "revenda" };
  comFatos.determinacaoFiscal = { itens: [{ indice: 0, cfopEfetivo: "5102", pendencias: [] }] };
  comFatos.contextoFiscal.emitente.regimeTributario = "lucro_real";
  assert.throws(() => executar({ faturamento: comFatos,
    solicitacoes: [entrada(0, { cst: "", cClassTrib: "" })] }), /cst_inexistente/);
  assert.equal(comFatos.classificacaoTributaria, undefined);
});
