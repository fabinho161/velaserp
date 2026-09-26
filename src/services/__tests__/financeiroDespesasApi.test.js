import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const api = await readFile(new URL("../financeiroDespesasApi.js", import.meta.url), "utf8");
const tela = await readFile(new URL("../../pages/Financeiro.jsx", import.meta.url), "utf8");

test("baixa de despesa usa API autenticada e endpoint autoritativo", () => {
  assert.match(api, /fetchAutenticado/);
  assert.match(api, /\/api\/financeiro\/despesas\/pagar/);
  assert.match(api, /method: "POST"/);
});

test("Financeiro envia somente identificacao, data e forma e aguarda listener", () => {
  assert.match(tela, /await pagarDespesa\(\{\s*empresaId,\s*despesaId: despesaPagando\.id,\s*\.\.\.pagamentoDespesaForm/);
  assert.doesNotMatch(tela, /pagarDespesa\(\{[^}]*valorPago/s);
  assert.match(tela, /setSalvandoPagamentoDespesa\(true\)/);
  assert.match(tela, /finally \{\s*setSalvandoPagamentoDespesa\(false\)/);
  assert.doesNotMatch(tela, /updateItem\("despesas"[^;]*pagamento/s);
});

test("modal de baixa possui somente data, forma e valor de leitura", () => {
  assert.match(tela, /aria-label="Registrar pagamento de despesa"/);
  assert.match(tela, /Data do pagamento/);
  assert.match(tela, /Forma de pagamento/);
  assert.match(tela, /moedaBR\(despesaPagando\.valor\)/);
  assert.match(tela, /disabled=\{salvandoPagamentoDespesa\}/);
});
