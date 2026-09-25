const test = require("node:test");
const assert = require("node:assert/strict");
const {
  canonicalizarSegmentoEmpresa,
  empresaPertenceAoSegmento,
  normalizarSegmentoEmpresa,
} = require("../segmentosEmpresa");

test("preserva os quatro segmentos canonicos sem regressao", () => {
  for (const segmento of ["comercio", "industria", "oficina", "clientes"]) {
    assert.equal(canonicalizarSegmentoEmpresa(segmento), segmento);
    assert.equal(normalizarSegmentoEmpresa(segmento), segmento);
  }
});

test("servicos existe somente como alias legado de clientes", () => {
  assert.equal(canonicalizarSegmentoEmpresa("servicos"), "clientes");
  assert.equal(normalizarSegmentoEmpresa("servicos"), "clientes");
  assert.equal(empresaPertenceAoSegmento("servicos", "clientes"), true);
  assert.equal(empresaPertenceAoSegmento("servicos", "servicos"), false);
});

test("valor desconhecido continua usando fallback seguro", () => {
  assert.equal(canonicalizarSegmentoEmpresa("desconhecido"), null);
  assert.equal(normalizarSegmentoEmpresa("desconhecido"), "industria");
});
