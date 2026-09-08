import assert from "node:assert/strict";
import test from "node:test";

import {
  calcularComponentesProdutoProducao,
  calcularConsumosInsumosProducao,
  calcularCustoMedioInsumo,
  normalizarQuantidadeProduzida,
  validarEstoqueInsumosProducao,
} from "../producao.js";

const criarInsumo = ({ nome, unidade, quantidadeCompra = 10, valorCompra = 100 }) => ({
  id: nome.toLowerCase(),
  nome,
  unidade,
  compras: [
    {
      quantidade: quantidadeCompra,
      valorTotal: valorCompra,
    },
  ],
});

const assertQuaseIgual = (atual, esperado) => {
  assert.ok(Math.abs(atual - esperado) < 0.000000001);
};

test("calcula 0.12 kg por unidade em producao de 10 como 1.2 kg", () => {
  const [consumo] = calcularConsumosInsumosProducao({
    produtoSelecionado: { consumos: { Parafina: 0.12 } },
    insumos: [criarInsumo({ nome: "Parafina", unidade: "kg" })],
    quantidadeProduzida: 10,
  });

  assert.equal(consumo.quantidadeTotal, 1.2);
  assert.equal(consumo.unidade, "kg");
});

test("calcula 10 ml por unidade em producao de 10 como 100 ml", () => {
  const [consumo] = calcularConsumosInsumosProducao({
    produtoSelecionado: { consumos: { Essencia: 10 } },
    insumos: [criarInsumo({ nome: "Essencia", unidade: "ml" })],
    quantidadeProduzida: 10,
  });

  assert.equal(consumo.quantidadeTotal, 100);
  assert.equal(consumo.unidade, "ml");
});

test("calcula 1 un por unidade em producao de 10 como 10 un", () => {
  const [consumo] = calcularConsumosInsumosProducao({
    produtoSelecionado: { consumos: { Pavio: 1 } },
    insumos: [criarInsumo({ nome: "Pavio", unidade: "un" })],
    quantidadeProduzida: 10,
  });

  assert.equal(consumo.quantidadeTotal, 10);
  assert.equal(consumo.unidade, "un");
});

test("preserva precisao de 0.0075 kg em producao de 20 como 0.15 kg", () => {
  const [consumo] = calcularConsumosInsumosProducao({
    produtoSelecionado: { consumos: { Corante: 0.0075 } },
    insumos: [criarInsumo({ nome: "Corante", unidade: "kg" })],
    quantidadeProduzida: 20,
  });

  assert.equal(consumo.quantidadeTotal, 0.15);
});

test("estoque suficiente permite producao", () => {
  const resultado = validarEstoqueInsumosProducao({
    consumosCalculados: [{ nome: "Parafina", quantidadeTotal: 1.2 }],
    insumos: [{ id: "parafina", nome: "Parafina", estoque: 2.5 }],
    estoqueInsumos: [{ insumoId: "parafina", nome: "Parafina", saldo: 2.5 }],
  });

  assert.equal(resultado.ok, true);
});

test("estoque insuficiente bloqueia producao", () => {
  const resultado = validarEstoqueInsumosProducao({
    consumosCalculados: [{ nome: "Parafina", quantidadeTotal: 1.2 }],
    insumos: [{ id: "parafina", nome: "Parafina", estoque: 1 }],
    estoqueInsumos: [{ insumoId: "parafina", nome: "Parafina", saldo: 1 }],
  });

  assert.equal(resultado.ok, false);
  assert.equal(resultado.insumo.nome, "Parafina");
  assert.equal(resultado.quantidadeTotal, 1.2);
});

test("calcula custo total de 1.2 kg com custo medio 20.80 como 24.96", () => {
  const [consumo] = calcularConsumosInsumosProducao({
    produtoSelecionado: { consumos: { Parafina: 0.12 } },
    insumos: [
      criarInsumo({
        nome: "Parafina",
        unidade: "kg",
        quantidadeCompra: 10,
        valorCompra: 208,
      }),
    ],
    quantidadeProduzida: 10,
  });

  assert.equal(calcularCustoMedioInsumo([{ quantidade: 10, valorTotal: 208 }]), 20.8);
  assert.equal(consumo.custoTotal, 24.96);
});

test("calcula custo em ml preservando precisao", () => {
  const [consumo] = calcularConsumosInsumosProducao({
    produtoSelecionado: { consumos: { Essencia: 10 } },
    insumos: [
      criarInsumo({
        nome: "Essencia",
        unidade: "ml",
        quantidadeCompra: 1000,
        valorCompra: 111.42,
      }),
    ],
    quantidadeProduzida: 10,
  });

  assert.equal(consumo.quantidadeTotal, 100);
  assert.equal(consumo.custoMedio, 0.11142);
  assertQuaseIgual(consumo.custoTotal, 11.142);
});

test("produto legado sem consumosDetalhados usa consumos normalizados", () => {
  const [consumo] = calcularConsumosInsumosProducao({
    produtoSelecionado: { consumos: { Parafina: 0.18 } },
    insumos: [criarInsumo({ nome: "Parafina", unidade: "kg" })],
    quantidadeProduzida: 10,
  });

  assertQuaseIgual(consumo.quantidadeTotal, 1.8);
});

test("produto novo com consumosDetalhados usa consumos e nao quantidade informada", () => {
  const [consumo] = calcularConsumosInsumosProducao({
    produtoSelecionado: {
      consumos: { Parafina: 0.12 },
      consumosDetalhados: {
        Parafina: {
          quantidadeInformada: 120,
          unidadeInformada: "g",
          quantidadeNormalizada: 0.12,
          unidadeEstoque: "kg",
        },
      },
    },
    insumos: [criarInsumo({ nome: "Parafina", unidade: "kg" })],
    quantidadeProduzida: 10,
  });

  assert.equal(consumo.quantidadeTotal, 1.2);
});

test("quantidade produzida zero, negativa ou invalida e rejeitada", () => {
  assert.equal(normalizarQuantidadeProduzida(0), null);
  assert.equal(normalizarQuantidadeProduzida(-1), null);
  assert.equal(normalizarQuantidadeProduzida("abc"), null);
});

test("componentesProduto continua calculando quantidade e custo sem conversao", () => {
  const [componente] = calcularComponentesProdutoProducao({
    produtoSelecionado: {
      componentesProduto: {
        produtoA: {
          produtoId: "produtoA",
          codigo: "P001",
          nome: "Base",
          quantidade: 2,
          unidade: "un",
          custoUnitarioSnapshot: 5,
        },
      },
    },
    produtos: [{ id: "produtoA", codigo: "P001", nome: "Base", custoUnitario: 7 }],
    quantidadeProduzida: 10,
  });

  assert.equal(componente.quantidadeTotal, 20);
  assert.equal(componente.custoTotal, 100);
  assert.equal(componente.unidade, "un");
});
