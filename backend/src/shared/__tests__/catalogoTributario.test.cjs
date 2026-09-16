"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  CATALOGO_IBS_CBS_REFERENCIA,
  validarCatalogoTributario,
  buscarClassificacaoPorCodigo,
  listarClassificacoesPorCst,
} = require("../catalogoTributario.cjs");
const { classificarTributacaoFaturamento } = require("../faturamento.cjs");

// Fictitious codes: never exported as a production catalogue.
const fixture = (versaoCatalogo = "fixture-v1") => ({
  tipo: "ibs_cbs_cclasstrib",
  versaoCatalogo,
  referencia: {
    documento: "Fixture de teste",
    versaoDocumento: "1",
    dataDocumento: "2026-06-22",
    dataPublicacao: "2026-06-23",
  },
  itens: [
    { cst: "001", cClassTrib: "001001", descricao: "Exemplo A", inicioVigencia: "2026-01-01", fimVigencia: null },
    { cst: "001", cClassTrib: "001002", descricao: "Exemplo B", inicioVigencia: null, fimVigencia: null },
    { cst: "002", cClassTrib: "002001", descricao: "Exemplo C", inicioVigencia: null, fimVigencia: null },
  ],
});

test("accepts versioned fixture and preserves official reference metadata without bundled rows", () => {
  assert.equal(validarCatalogoTributario(fixture()), true);
  assert.equal(validarCatalogoTributario(CATALOGO_IBS_CBS_REFERENCIA), true);
  assert.equal(CATALOGO_IBS_CBS_REFERENCIA.completo, false);
  assert.deepEqual(CATALOGO_IBS_CBS_REFERENCIA.itens, []);
  assert.equal(CATALOGO_IBS_CBS_REFERENCIA.versaoCatalogo, "2025.002-v1.60");
  assert.equal(CATALOGO_IBS_CBS_REFERENCIA.referencia.documento, "IT 2025.002");
  assert.equal(CATALOGO_IBS_CBS_REFERENCIA.referencia.versaoDocumento, "1.60");
  assert.equal(CATALOGO_IBS_CBS_REFERENCIA.referencia.dataPublicacao, "2026-06-23");
});

test("rejects missing version, reference, codes, duplicates and invalid dates", () => {
  const base = fixture();
  assert.equal(validarCatalogoTributario({ ...base, versaoCatalogo: "" }), false);
  assert.equal(validarCatalogoTributario({ ...base, referencia: null }), false);
  assert.equal(validarCatalogoTributario({ ...base, itens: [{ ...base.itens[0], cst: "" }] }), false);
  assert.equal(validarCatalogoTributario({ ...base, itens: [{ ...base.itens[0], cClassTrib: "" }] }), false);
  assert.equal(validarCatalogoTributario({ ...base, itens: [{ ...base.itens[0], cst: 1 }] }), false);
  assert.equal(validarCatalogoTributario({ ...base, itens: [{ ...base.itens[0], cClassTrib: 1001 }] }), false);
  assert.equal(validarCatalogoTributario({ ...base, itens: [base.itens[0], base.itens[0]] }), false);
  assert.equal(validarCatalogoTributario({ ...base, itens: [{ ...base.itens[0], inicioVigencia: "2026-02-30" }] }), false);
  assert.equal(validarCatalogoTributario({ ...base, itens: [{ ...base.itens[0], fimVigencia: "2025-01-01" }] }), false);
});

test("looks up exact string codes and CST without losing leading zeros or mutating input", () => {
  const catalogo = fixture();
  const antes = structuredClone(catalogo);
  const item = buscarClassificacaoPorCodigo("001001", catalogo);
  assert.equal(item.cst, "001");
  assert.equal(item.cClassTrib, "001001");
  assert.equal(item.origemCatalogo.versaoCatalogo, "fixture-v1");
  assert.deepEqual(listarClassificacoesPorCst("001", catalogo).map((valor) => valor.cClassTrib), ["001001", "001002"]);
  assert.equal(buscarClassificacaoPorCodigo("999999", catalogo), null);
  assert.equal(buscarClassificacaoPorCodigo(1001, catalogo), null);
  assert.deepEqual(listarClassificacoesPorCst("999", catalogo), []);
  item.descricao = "Alterado";
  assert.deepEqual(catalogo, antes);
});

test("multiple versions coexist and classification remains conservative for historical data", () => {
  const antiga = fixture("fixture-v1");
  const nova = fixture("fixture-v2");
  nova.itens[0].descricao = "Exemplo revisado";
  assert.equal(buscarClassificacaoPorCodigo("001001", antiga).descricao, "Exemplo A");
  assert.equal(buscarClassificacaoPorCodigo("001001", nova).descricao, "Exemplo revisado");
  const historico = { itens: [{ origemItemId: "item-1" }], contextoFiscal: {} };
  const antes = structuredClone(historico);
  const classificacao = classificarTributacaoFaturamento(historico);
  assert.deepEqual(classificacao.itens[0].ibsCbs, { cst: null, cClassTrib: null, fonte: null });
  assert.ok(classificacao.pendencias.includes("classificacao_ibs_cbs_nao_determinada"));
  assert.deepEqual(historico, antes);
});

test("historical billing classification remains untouched by catalog lookup", () => {
  const historico = {
    itens: [{ origemItemId: "item-antigo" }],
    classificacaoTributaria: {
      versao: 1,
      regraVersao: "tributaria_v1",
      itens: [{ origemItemId: "item-antigo", ibsCbs: { cst: null, cClassTrib: null, fonte: null } }],
      pendencias: ["classificacao_ibs_cbs_nao_determinada"],
    },
  };
  const antes = structuredClone(historico);

  buscarClassificacaoPorCodigo("001001", fixture());
  listarClassificacoesPorCst("001", fixture("fixture-v2"));

  assert.deepEqual(historico, antes);
  assert.deepEqual(historico.classificacaoTributaria, antes.classificacaoTributaria);
});
