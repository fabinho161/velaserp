import assert from "node:assert/strict";
import test from "node:test";

import { montarDadosOperacionaisServico } from "../servicos.js";

test("monta cadastro operacional sem produzir dados fiscais", () => {
  const dados = montarDadosOperacionaisServico({
    nome: " Consulta ", descricao: " Atendimento ", valor: "120.50",
    tempoEstimadoMinutos: "60", status: "ativo",
    fiscal: { codigoTributacaoNacional: "010101", nbs: "qualquer" },
  });

  assert.deepEqual(dados, {
    nome: "Consulta", descricao: "Atendimento", valor: 120.5,
    tempoEstimadoMinutos: 60, status: "ativo",
  });
  assert.equal(Object.hasOwn(dados, "fiscal"), false);
});
