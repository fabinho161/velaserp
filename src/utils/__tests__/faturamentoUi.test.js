import assert from "node:assert/strict";
import test from "node:test";

import {
  calcularKpisFaturamento,
  descreverPendenciaFaturamento,
  filtrarFaturamentos,
  formatarDestinoOperacao,
  formatarOrigemFaturamento,
  formatarStatusFaturamento,
} from "../faturamentoUi.js";

const faturamento = (dados = {}) => ({
  id: "fat-1",
  status: "rascunho",
  origem: {
    tipo: "venda",
    numeroDocumento: "PED-0001",
  },
  contextoFiscal: {
    destinatario: {
      nome: "Cliente Teste",
    },
    operacao: {
      dataOperacao: "2026-09-12",
    },
  },
  pendencias: [],
  ...dados,
});

test("formata labels de status origem destino e pendencias", () => {
  assert.equal(formatarStatusFaturamento("preparado"), "Preparado");
  assert.equal(formatarOrigemFaturamento("venda_pecas"), "Venda de Peças");
  assert.equal(formatarDestinoOperacao("interestadual"), "Interestadual");
  assert.equal(
    descreverPendenciaFaturamento("item_ncm_ausente"),
    "Um ou mais itens não possuem NCM no snapshot fiscal."
  );
});

test("calcula kpis por status e pendencias", () => {
  assert.deepEqual(
    calcularKpisFaturamento([
      faturamento(),
      faturamento({ status: "preparado" }),
      faturamento({ status: "cancelado" }),
      faturamento({ pendencias: ["item_ncm_ausente"] }),
    ]),
    {
      total: 4,
      rascunhos: 2,
      preparados: 1,
      cancelados: 1,
      comPendencias: 1,
    }
  );
});

test("filtra por status origem destinatario e periodo", () => {
  const lista = [
    faturamento(),
    faturamento({
      id: "fat-2",
      status: "preparado",
      origem: { tipo: "venda_pecas", numeroDocumento: "PEC-0001" },
      contextoFiscal: {
        destinatario: { nome: "Outro Cliente" },
        operacao: { dataOperacao: "2026-10-01" },
      },
    }),
  ];

  assert.deepEqual(
    filtrarFaturamentos(lista, {
      status: "preparado",
      origem: "venda_pecas",
      busca: "outro",
      dataInicial: "2026-10-01",
      dataFinal: "2026-10-31",
    }).map((item) => item.id),
    ["fat-2"]
  );
});

test("filtra periodo com timestamp serializado do backend", () => {
  const lista = [
    faturamento({
      id: "fat-timestamp",
      contextoFiscal: {
        destinatario: { nome: "Cliente Timestamp" },
        operacao: { dataOperacao: { _seconds: 1799755200, _nanoseconds: 0 } },
      },
    }),
  ];

  assert.deepEqual(
    filtrarFaturamentos(lista, {
      dataInicial: "2027-01-12",
      dataFinal: "2027-01-12",
    }).map((item) => item.id),
    ["fat-timestamp"]
  );
});
