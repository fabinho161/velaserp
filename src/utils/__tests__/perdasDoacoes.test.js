import assert from "node:assert/strict";
import test from "node:test";
import {
  obterQuantidadeExibicaoBaixa,
  obterQuantidadeNormalizadaBaixa,
  prepararBaixaInsumo,
} from "../perdasDoacoes.js";

const unidadesPadrao = [
  { id: "kg", nome: "Kilograma", ativo: true, grupoConversao: "massa", fatorBase: 1000 },
  { id: "g", nome: "Grama", ativo: true, grupoConversao: "massa", fatorBase: 1 },
  { id: "lt", nome: "Litro", ativo: true, grupoConversao: "volume", fatorBase: 1000 },
  { id: "ml", nome: "Mililitro", ativo: true, grupoConversao: "volume", fatorBase: 1 },
  { id: "un", nome: "Unidade", ativo: true, grupoConversao: "unidade", fatorBase: 1 },
  { id: "cx", nome: "Caixa", ativo: true },
];

const preparar = (opcoes = {}) =>
  prepararBaixaInsumo({
    quantidade: 1,
    unidadeInformada: "kg",
    unidadeEstoque: "kg",
    unidades: unidadesPadrao,
    saldoDisponivel: 10,
    custoUnitarioSnapshot: 20,
    ...opcoes,
  });

test("normaliza 250 g para 0.25 kg", () => {
  const resultado = preparar({ quantidade: 250, unidadeInformada: "g" });

  assert.equal(resultado.ok, true);
  assert.equal(resultado.baixa.quantidade, 0.25);
  assert.equal(resultado.baixa.unidadeEstoque, "kg");
});

test("preserva 50 ml para estoque em ml", () => {
  const resultado = preparar({
    quantidade: 50,
    unidadeInformada: "ml",
    unidadeEstoque: "ml",
    saldoDisponivel: 100,
  });

  assert.equal(resultado.ok, true);
  assert.equal(resultado.baixa.quantidade, 50);
});

test("normaliza 250 ml para 0.25 lt", () => {
  const resultado = preparar({
    quantidade: 250,
    unidadeInformada: "ml",
    unidadeEstoque: "lt",
  });

  assert.equal(resultado.ok, true);
  assert.equal(resultado.baixa.quantidade, 0.25);
});

test("preserva 0.5 kg para estoque em kg", () => {
  const resultado = preparar({ quantidade: 0.5 });

  assert.equal(resultado.ok, true);
  assert.equal(resultado.baixa.quantidade, 0.5);
});

test("permite unidade personalizada somente para ela mesma", () => {
  const resultado = preparar({
    quantidade: 3,
    unidadeInformada: "cx",
    unidadeEstoque: "cx",
  });

  assert.equal(resultado.ok, true);
  assert.equal(resultado.baixa.quantidade, 3);
  assert.equal(resultado.baixa.unidadeInformada, "cx");
});

test("rejeita kg para lt", () => {
  const resultado = preparar({
    quantidade: 1,
    unidadeInformada: "kg",
    unidadeEstoque: "lt",
  });

  assert.equal(resultado.ok, false);
  assert.equal(resultado.motivo, "unidades_incompativeis");
});

test("rejeita cx para un", () => {
  const resultado = preparar({
    quantidade: 1,
    unidadeInformada: "cx",
    unidadeEstoque: "un",
  });

  assert.equal(resultado.ok, false);
  assert.equal(resultado.motivo, "grupo_conversao_invalido");
});

test("aprova quando estoque normalizado e suficiente", () => {
  const resultado = preparar({
    quantidade: 250,
    unidadeInformada: "g",
    saldoDisponivel: 0.3,
  });

  assert.equal(resultado.ok, true);
  assert.equal(resultado.baixa.quantidade, 0.25);
});

test("rejeita quando estoque normalizado e insuficiente", () => {
  const resultado = preparar({
    quantidade: 250,
    unidadeInformada: "g",
    saldoDisponivel: 0.2,
  });

  assert.equal(resultado.ok, false);
  assert.equal(resultado.motivo, "estoque_insuficiente");
  assert.equal(resultado.baixa.quantidade, 0.25);
});

test("preserva precisao de 7.5 g para 0.0075 kg", () => {
  const resultado = preparar({
    quantidade: 7.5,
    unidadeInformada: "g",
  });

  assert.equal(resultado.ok, true);
  assert.equal(resultado.baixa.quantidade, 0.0075);
});

test("snapshot preserva quantidade informada e normalizada", () => {
  const resultado = preparar({
    quantidade: 250,
    unidadeInformada: "g",
  });

  assert.equal(resultado.baixa.quantidade, 0.25);
  assert.equal(resultado.baixa.quantidadeInformada, 250);
  assert.equal(resultado.baixa.unidadeInformada, "g");
  assert.equal(resultado.baixa.unidadeEstoque, "kg");
  assert.equal(resultado.baixa.unidade, "kg");
});

test("registro legado continua exibindo quantidade normalizada antiga", () => {
  const exibicao = obterQuantidadeExibicaoBaixa({
    tipoItem: "insumo",
    quantidade: 0.25,
    unidade: "kg",
  });

  assert.deepEqual(exibicao, { quantidade: 0.25, unidade: "kg" });
});

test("cancelamento e reversao utilizam quantidade normalizada", () => {
  const registro = {
    tipoItem: "insumo",
    quantidade: 0.25,
    quantidadeInformada: 250,
    unidadeInformada: "g",
    unidade: "kg",
  };

  assert.equal(obterQuantidadeNormalizadaBaixa(registro), 0.25);
  assert.deepEqual(obterQuantidadeExibicaoBaixa(registro), {
    quantidade: 250,
    unidade: "g",
  });
});

test("produto acabado permanece exibindo quantidade e unidade originais", () => {
  const exibicao = obterQuantidadeExibicaoBaixa({
    tipoItem: "produto",
    quantidade: 4,
    unidade: "unidades",
    quantidadeInformada: 4000,
    unidadeInformada: "g",
  });

  assert.deepEqual(exibicao, { quantidade: 4, unidade: "unidades" });
});
