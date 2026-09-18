import assert from "node:assert/strict";
import test from "node:test";

import {
  ehFinanceiroServicos,
  filtrarMovimentacoesPeriodo,
  resumirFinanceiroServicos,
} from "../financeiroServicos.js";

test("somente clientes usa a apresentação financeira de serviços", () => {
  assert.equal(ehFinanceiroServicos("clientes"), true);
  for (const segmento of ["comercio", "industria", "oficina", undefined]) {
    assert.equal(ehFinanceiroServicos(segmento), false);
  }
});

test("sem recebimento de atendimento, indicadores ficam zerados", () => {
  assert.deepEqual(resumirFinanceiroServicos([]), {
    recebido: 0, aReceber: 0, atendimentosPagos: 0, ticketMedio: 0,
    despesas: 0, saldo: 0,
  });
});

test("despesas reais afetam o saldo, sem transformar atendimento concluído em pagamento", () => {
  assert.deepEqual(resumirFinanceiroServicos([
    { tipo: "Saída", valor: 35, data: "2026-09-17" },
    { tipo: "Saída", valor: 15, data: "2026-09-17" },
  ]), {
    recebido: 0, aReceber: 0, atendimentosPagos: 0, ticketMedio: 0,
    despesas: 50, saldo: -50,
  });
});

test("filtro de período mantém ambas as bordas inclusivas", () => {
  const movimentos = [
    { data: "2026-09-01" }, { data: "2026-09-15" },
    { data: "2026-09-30" }, { data: "2026-10-01" },
  ];
  assert.deepEqual(filtrarMovimentacoesPeriodo(movimentos, {
    inicio: "2026-09-15", fim: "2026-09-30",
  }), [movimentos[1], movimentos[2]]);
  assert.deepEqual(filtrarMovimentacoesPeriodo([{ data: undefined }], {
    inicio: "2026-09-15",
  }), [{ data: undefined }]);
});
