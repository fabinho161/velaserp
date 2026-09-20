"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const {
  CATALOGO_SERVICOS_NFSE_V1_01_20260122: catalogo,
  buscarServicoPorCodigo,
  pesquisarServicos,
  validarCatalogoServicos,
} = require("../catalogoServicos.cjs");

test("carrega catalogo oficial versionado com proveniencia verificavel", () => {
  assert.equal(validarCatalogoServicos(catalogo), true);
  assert.equal(catalogo.tipo, "nfse_servicos_nacional");
  assert.equal(catalogo.versaoCatalogo, "v1.01-20260122");
  assert.equal(catalogo.referencia.ambiente, "producao");
  assert.equal(catalogo.proveniencia.sha256Fonte.length, 64);
  const conteudoTransformado = JSON.stringify({ itens: catalogo.itens, nbs: catalogo.nbs });
  assert.equal(
    createHash("sha256").update(conteudoTransformado).digest("hex"),
    catalogo.proveniencia.sha256ConteudoTransformado
  );
  assert.equal(catalogo.itens.length, 338);
  assert.equal(catalogo.nbs.length, 1210);
});

test("preserva codigos como strings unicas e relacao estrutural nacional", () => {
  assert.equal(new Set(catalogo.itens.map((item) => item.codigoTributacaoNacional)).size, 338);
  assert.ok(catalogo.itens.every((item) =>
    typeof item.codigoTributacaoNacional === "string" &&
    item.codigoTributacaoNacional === `${item.item}${item.subitem}${item.desdobroNacional}`));
  assert.equal(new Set(catalogo.nbs.map((item) => item.codigo)).size, 1210);
  assert.ok(catalogo.nbs.every((item) => typeof item.codigo === "string"));
});

test("busca codigo existente e retorna resultado seguro para inexistente", () => {
  const item = buscarServicoPorCodigo("010101", catalogo);
  assert.equal(item.codigoTributacaoNacional, "010101");
  assert.match(item.descricao, /desenvolvimento de sistemas/i);
  assert.equal(item.origemCatalogo.versaoCatalogo, catalogo.versaoCatalogo);
  assert.equal(buscarServicoPorCodigo("999999", catalogo), null);
});

test("pesquisa por codigo ou descricao sem mutar catalogo", () => {
  const antes = JSON.stringify(catalogo.itens[0]);
  assert.ok(pesquisarServicos("010101", catalogo).length > 0);
  assert.ok(pesquisarServicos("desenvolvimento", catalogo).length > 0);
  const copia = buscarServicoPorCodigo("010101", catalogo);
  copia.descricao = "alterado";
  assert.equal(JSON.stringify(catalogo.itens[0]), antes);
  assert.equal(Object.isFrozen(catalogo), true);
});

test("rejeita duplicidades e metadados invalidos sem inventar vigencia", () => {
  const duplicado = structuredClone(catalogo);
  duplicado.itens.push({ ...duplicado.itens[0] });
  assert.equal(validarCatalogoServicos(duplicado), false);
  assert.equal(validarCatalogoServicos({ ...structuredClone(catalogo), versaoCatalogo: "" }), false);
  assert.equal(catalogo.vigenciaPorRegistro, false);
  assert.ok(catalogo.itens.every((item) => !Object.hasOwn(item, "inicioVigencia") &&
    !Object.hasOwn(item, "fimVigencia")));
});

test("mantem NBS como dominio independente sem inferir relacao com servico", () => {
  assert.ok(catalogo.nbs.length > 0);
  assert.ok(catalogo.itens.every((item) => !Object.hasOwn(item, "nbs")));
});
