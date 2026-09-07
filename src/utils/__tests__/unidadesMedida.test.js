import assert from "node:assert/strict";
import test from "node:test";

import {
  UNIDADES_CONVERSAO_CANONICAS,
  converterQuantidade,
  obterMetadadosUnidade,
  unidadesCompativeis,
} from "../unidadesMedida.js";

const unidadesPadrao = Object.entries(UNIDADES_CONVERSAO_CANONICAS).map(
  ([id, metadados]) => ({
    id,
    nome: id,
    ativo: true,
    ...metadados,
  })
);

const quantidadeConvertida = (quantidade, unidadeOrigem, unidadeDestino, unidades = unidadesPadrao) =>
  converterQuantidade({
    quantidade,
    unidadeOrigem,
    unidadeDestino,
    unidades,
  }).quantidade;

test("converte g para kg", () => {
  assert.equal(quantidadeConvertida(1000, "g", "kg"), 1);
});

test("converte kg para g", () => {
  assert.equal(quantidadeConvertida(1, "kg", "g"), 1000);
});

test("converte ml para lt", () => {
  assert.equal(quantidadeConvertida(1000, "ml", "lt"), 1);
});

test("converte lt para ml", () => {
  assert.equal(quantidadeConvertida(1.5, "lt", "ml"), 1500);
});

test("converte mm para cm", () => {
  assert.equal(quantidadeConvertida(10, "mm", "cm"), 1);
});

test("converte cm para m", () => {
  assert.equal(quantidadeConvertida(100, "cm", "m"), 1);
});

test("converte m para mm", () => {
  assert.equal(quantidadeConvertida(2, "m", "mm"), 2000);
});

test("converte un para un preservando quantidade", () => {
  assert.equal(quantidadeConvertida(8, "un", "un"), 8);
});

test("mesma unidade retorna mesma quantidade mesmo sem metadados", () => {
  const resultado = converterQuantidade({
    quantidade: 10,
    unidadeOrigem: "cx",
    unidadeDestino: "cx",
    unidades: [{ id: "cx", nome: "Caixa", ativo: true }],
  });

  assert.equal(resultado.ok, true);
  assert.equal(resultado.quantidade, 10);
  assert.equal(resultado.convertido, false);
});

test("massa para volume e incompativel", () => {
  const resultado = converterQuantidade({
    quantidade: 1,
    unidadeOrigem: "kg",
    unidadeDestino: "lt",
    unidades: unidadesPadrao,
  });

  assert.equal(resultado.ok, false);
  assert.equal(resultado.motivo, "unidades_incompativeis");
  assert.equal(unidadesCompativeis("kg", "lt", unidadesPadrao), false);
});

test("volume para comprimento e incompativel", () => {
  const resultado = converterQuantidade({
    quantidade: 1,
    unidadeOrigem: "ml",
    unidadeDestino: "m",
    unidades: unidadesPadrao,
  });

  assert.equal(resultado.ok, false);
  assert.equal(resultado.motivo, "unidades_incompativeis");
});

test("unidade desconhecida nao converte", () => {
  const resultado = converterQuantidade({
    quantidade: 10,
    unidadeOrigem: "cx",
    unidadeDestino: "un",
    unidades: unidadesPadrao,
  });

  assert.equal(resultado.ok, false);
  assert.equal(resultado.motivo, "unidade_desconhecida");
});

test("fatorBase menor ou igual a zero invalida conversao", () => {
  const resultado = converterQuantidade({
    quantidade: 10,
    unidadeOrigem: "kg",
    unidadeDestino: "g",
    unidades: [
      { id: "kg", nome: "Kilograma", grupoConversao: "massa", fatorBase: 0 },
      { id: "g", nome: "Grama", grupoConversao: "massa", fatorBase: 1 },
    ],
  });

  assert.equal(resultado.ok, false);
  assert.equal(resultado.motivo, "fator_base_invalido");
});

test("fatorBase ausente invalida conversao", () => {
  const resultado = converterQuantidade({
    quantidade: 10,
    unidadeOrigem: "cx",
    unidadeDestino: "un",
    unidades: [
      { id: "cx", nome: "Caixa", grupoConversao: "unidade" },
      { id: "un", nome: "Unidade", grupoConversao: "unidade", fatorBase: 1 },
    ],
  });

  assert.equal(resultado.ok, false);
  assert.equal(resultado.motivo, "fator_base_invalido");
});

test("quantidade invalida nao converte", () => {
  const resultado = converterQuantidade({
    quantidade: "abc",
    unidadeOrigem: "kg",
    unidadeDestino: "g",
    unidades: unidadesPadrao,
  });

  assert.equal(resultado.ok, false);
  assert.equal(resultado.motivo, "quantidade_invalida");
});

test("quantidade negativa nao converte", () => {
  const resultado = converterQuantidade({
    quantidade: -1,
    unidadeOrigem: "kg",
    unidadeDestino: "g",
    unidades: unidadesPadrao,
  });

  assert.equal(resultado.ok, false);
  assert.equal(resultado.motivo, "quantidade_negativa");
});

test("unidade legada sem metadados nao converte para outra unidade", () => {
  const resultado = converterQuantidade({
    quantidade: 10,
    unidadeOrigem: "cx",
    unidadeDestino: "un",
    unidades: [
      { id: "cx", nome: "Caixa", ativo: true },
      { id: "un", nome: "Unidade", ativo: true, grupoConversao: "unidade", fatorBase: 1 },
    ],
  });

  assert.equal(resultado.ok, false);
  assert.equal(resultado.motivo, "grupo_conversao_invalido");
});

test("unidade canonica legada sem metadados usa fallback por id", () => {
  const unidadesLegadas = [
    { id: "ml", nome: "Mililitro", ativo: true },
    { id: "lt", nome: "Litro", ativo: true },
  ];

  assert.equal(quantidadeConvertida(500, "ml", "lt", unidadesLegadas), 0.5);
  assert.equal(quantidadeConvertida(0.5, "lt", "ml", unidadesLegadas), 500);
});

test("resolve metadados canonicos quando lista de unidades nao e fornecida", () => {
  const metadados = obterMetadadosUnidade(" kg ");

  assert.equal(metadados.conversivel, true);
  assert.equal(metadados.grupoConversao, "massa");
  assert.equal(metadados.fatorBase, 1000);
});
