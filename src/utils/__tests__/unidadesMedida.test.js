import assert from "node:assert/strict";
import test from "node:test";

import {
  UNIDADES_CONVERSAO_CANONICAS,
  converterQuantidade,
  obterMetadadosUnidade,
  obterUnidadesCompativeis,
  prepararCompraInsumo,
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

test("lista somente unidades ativas compativeis com a unidade de estoque", () => {
  const unidades = [
    { id: "ml", nome: "Mililitro", ativo: true },
    { id: "lt", nome: "Litro", ativo: true },
    { id: "kg", nome: "Quilograma", ativo: true },
    { id: "g", nome: "Grama", ativo: false },
  ];

  assert.deepEqual(
    obterUnidadesCompativeis("lt", unidades).map((unidade) => unidade.id),
    ["ml", "lt"]
  );
});

test("prepara compra de 500 ml para estoque em lt", () => {
  const resultado = prepararCompraInsumo({
    data: "2026-09-07",
    quantidade: 500,
    valorTotal: 20,
    unidadeCompra: "ml",
    unidadeEstoque: "lt",
    unidades: [
      { id: "ml", nome: "Mililitro", ativo: true },
      { id: "lt", nome: "Litro", ativo: true },
    ],
  });

  assert.equal(resultado.ok, true);
  assert.deepEqual(resultado.compra, {
    data: "2026-09-07",
    quantidade: 0.5,
    valorTotal: 20,
    quantidadeInformada: 500,
    unidadeCompra: "ml",
    unidadeEstoque: "lt",
  });
});

test("prepara compra de 0.5 lt para estoque em ml", () => {
  const resultado = prepararCompraInsumo({
    data: "2026-09-07",
    quantidade: 0.5,
    valorTotal: 12,
    unidadeCompra: "lt",
    unidadeEstoque: "ml",
    unidades: [
      { id: "ml", nome: "Mililitro", ativo: true },
      { id: "lt", nome: "Litro", ativo: true },
    ],
  });

  assert.equal(resultado.ok, true);
  assert.equal(resultado.compra.quantidade, 500);
});

test("prepara compra de 2 kg para estoque em g", () => {
  const resultado = prepararCompraInsumo({
    data: "2026-09-07",
    quantidade: 2,
    valorTotal: 30,
    unidadeCompra: "kg",
    unidadeEstoque: "g",
    unidades: unidadesPadrao,
  });

  assert.equal(resultado.ok, true);
  assert.equal(resultado.compra.quantidade, 2000);
});

test("prepara compra na mesma unidade sem converter", () => {
  const resultado = prepararCompraInsumo({
    data: "2026-09-07",
    quantidade: 3,
    valorTotal: 15,
    unidadeCompra: "kg",
    unidadeEstoque: "kg",
    unidades: unidadesPadrao,
  });

  assert.equal(resultado.ok, true);
  assert.equal(resultado.compra.quantidade, 3);
  assert.equal(resultado.compra.quantidadeInformada, 3);
});

test("prepara compra legada customizada na mesma unidade", () => {
  const resultado = prepararCompraInsumo({
    data: "2026-09-07",
    quantidade: 10,
    valorTotal: 100,
    unidadeCompra: "cx",
    unidadeEstoque: "cx",
    unidades: [{ id: "cx", nome: "Caixa", ativo: true }],
  });

  assert.equal(resultado.ok, true);
  assert.equal(resultado.compra.quantidade, 10);
  assert.equal(resultado.compra.unidadeCompra, "cx");
  assert.equal(resultado.compra.unidadeEstoque, "cx");
});

test("bloqueia compra com unidades incompativeis", () => {
  const resultado = prepararCompraInsumo({
    data: "2026-09-07",
    quantidade: 1,
    valorTotal: 20,
    unidadeCompra: "kg",
    unidadeEstoque: "lt",
    unidades: unidadesPadrao,
  });

  assert.equal(resultado.ok, false);
  assert.equal(resultado.motivo, "unidades_incompativeis");
});

test("bloqueia conversao de unidade customizada para unidade canonica", () => {
  const resultado = prepararCompraInsumo({
    data: "2026-09-07",
    quantidade: 10,
    valorTotal: 100,
    unidadeCompra: "cx",
    unidadeEstoque: "un",
    unidades: [
      { id: "cx", nome: "Caixa", ativo: true },
      { id: "un", nome: "Unidade", ativo: true },
    ],
  });

  assert.equal(resultado.ok, false);
  assert.equal(resultado.motivo, "grupo_conversao_invalido");
});

test("compra legada sem unidade propria preserva quantidade normalizada existente", () => {
  const compraLegada = {
    data: "2026-09-07",
    quantidade: 10,
    valorTotal: 50,
  };

  assert.equal(compraLegada.quantidade, 10);
  assert.equal(compraLegada.quantidadeInformada, undefined);
  assert.equal(compraLegada.unidadeCompra, undefined);
});

test("bloqueia compra com quantidade invalida, zerada ou negativa", () => {
  const casos = ["abc", 0, -1].map((quantidade) =>
    prepararCompraInsumo({
      data: "2026-09-07",
      quantidade,
      valorTotal: 10,
      unidadeCompra: "kg",
      unidadeEstoque: "kg",
      unidades: unidadesPadrao,
    })
  );

  assert.deepEqual(
    casos.map((resultado) => resultado.ok),
    [false, false, false]
  );
});

test("bloqueia compra com valor total invalido", () => {
  const resultado = prepararCompraInsumo({
    data: "2026-09-07",
    quantidade: 1,
    valorTotal: "abc",
    unidadeCompra: "kg",
    unidadeEstoque: "kg",
    unidades: unidadesPadrao,
  });

  assert.equal(resultado.ok, false);
  assert.equal(resultado.motivo, "valor_total_invalido");
});
