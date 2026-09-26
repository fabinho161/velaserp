import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  filtrarCategoriasDespesaAtivas,
  obterCategoriaHistoricaInativa,
  podeGerenciarCategoriasDespesa,
} from "../categoriasDespesa.js";

test("gerenciador exige Gestao de Servicos e a intersecao das permissoes", () => {
  for (const segmento of ["clientes", "servicos"]) {
    assert.equal(podeGerenciarCategoriasDespesa(segmento, {
      podeEscreverFinanceiro: true,
      podeEscreverParametros: true,
    }), true);
  }
  for (const segmento of ["comercio", "industria", "oficina"]) {
    assert.equal(podeGerenciarCategoriasDespesa(segmento, {
      podeEscreverFinanceiro: true,
      podeEscreverParametros: true,
    }), false);
  }
  assert.equal(podeGerenciarCategoriasDespesa("clientes", {
    podeEscreverFinanceiro: true,
    podeEscreverParametros: false,
  }), false);
  assert.equal(podeGerenciarCategoriasDespesa("clientes", {
    podeEscreverFinanceiro: false,
    podeEscreverParametros: true,
  }), false);
});

test("nova despesa recebe somente categorias ativas sem fallback artificial", () => {
  const categorias = [
    { id: "ativa", nome: "Aluguel", ativo: true },
    { id: "inativa", nome: "Energia", ativo: false },
  ];
  assert.deepEqual(filtrarCategoriasDespesaAtivas(categorias), [categorias[0]]);
  assert.deepEqual(filtrarCategoriasDespesaAtivas([
    { id: "inativa", nome: "Energia", ativo: false },
  ]), []);
});

test("edicao preserva categoria historica inativa sem reativa-la", () => {
  const categorias = [
    { id: "ativa", nome: "Aluguel", ativo: true },
    { id: "inativa", nome: "Energia", ativo: false },
  ];
  assert.equal(obterCategoriaHistoricaInativa(categorias, "Energia"), "Energia");
  assert.equal(obterCategoriaHistoricaInativa(categorias, "Aluguel"), "");
  assert.equal(obterCategoriaHistoricaInativa(categorias, "Categoria removida"), "Categoria removida");
});

test("gerenciador reutiliza operacoes existentes e nao oferece exclusao fisica", async () => {
  const fonte = await readFile(new URL("../../components/GerenciadorCategoriasDespesa.jsx", import.meta.url), "utf8");
  assert.match(fonte, /adicionarCategoria\(nome\)/);
  assert.match(fonte, /editarCategoria\(/);
  assert.match(fonte, /alterarAtividadeCategoria\(/);
  assert.doesNotMatch(fonte, /excluirParametro|Excluir/);
});

test("Rules mantem categorias no tenant e restringe atualizacao a administrador canonico", async () => {
  const rules = await readFile(new URL("../../../firestore.rules", import.meta.url), "utf8");
  const inicio = rules.indexOf("match /parametros/{documentId}");
  const fim = rules.indexOf("match /insumos/{documentId}", inicio);
  const bloco = rules.slice(inicio, fim);

  assert.ok(inicio >= 0 && fim > inicio);
  assert.match(bloco, /documentId == "categoriasDespesa"/);
  assert.match(bloco, /hasCompanyRole\(userId, empresaId/);
  assert.match(bloco, /allow update: if isCompanyAdministratorCanonical\(userId, empresaId\)/);
  assert.match(bloco, /allow delete: if false/);
});

test("Financeiro mantem a categoria historica no select sem reativacao automatica", async () => {
  const fonte = await readFile(new URL("../../pages/Financeiro.jsx", import.meta.url), "utf8");
  assert.match(fonte, /obterCategoriaHistoricaInativa/);
  assert.match(fonte, /Categoria histórica inativa/);
  assert.doesNotMatch(fonte, /desativarParametro\("categoriasDespesa"[^)]*true\)/);
});
