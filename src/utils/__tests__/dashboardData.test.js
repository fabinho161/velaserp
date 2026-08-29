import assert from "node:assert/strict";
import test from "node:test";

import {
  calcularRankingLucroProdutos,
  ordenarUltimosPedidos,
} from "../dashboardData.js";

test("ordena ultimos pedidos pela data autoritativa antes de limitar", () => {
  const timestamp = {
    toDate: () => new Date("2026-05-03T12:00:00.000Z"),
  };
  const vendas = [
    { id: "sem-data", numeroPedido: "PED-9999", cliente: "Sem data" },
    { id: "iso-antigo", numeroPedido: "PED-0001", data: "2026-05-01" },
    { id: "date", numeroPedido: "PED-0002", data: new Date("2026-05-02T00:00:00.000Z") },
    { id: "timestamp", numeroPedido: "PED-0003", data: timestamp },
    { id: "br", numeroPedido: "PED-0004", data: "04/05/2026" },
    { id: "iso-recente", numeroPedido: "PED-0005", data: "2026-05-05T10:00:00.000Z" },
  ];

  const pedidos = ordenarUltimosPedidos(vendas, 5);

  assert.deepEqual(
    pedidos.map((pedido) => pedido.id),
    ["iso-recente", "br", "timestamp", "date", "iso-antigo"]
  );
});

test("usa criadoEm, numero e id como desempate deterministico", () => {
  const vendas = [
    {
      id: "a",
      numeroPedido: "PED-0003",
      data: "2026-05-01",
      criadoEm: "2026-05-01T08:00:00.000Z",
    },
    {
      id: "b",
      numeroPedido: "PED-0002",
      data: "2026-05-01",
      criadoEm: "2026-05-01T09:00:00.000Z",
    },
    {
      id: "c",
      numeroPedido: "PED-0004",
      data: "2026-05-01",
      criadoEm: "2026-05-01T09:00:00.000Z",
    },
  ];

  const pedidos = ordenarUltimosPedidos(vendas, 3);

  assert.deepEqual(
    pedidos.map((pedido) => pedido.id),
    ["c", "b", "a"]
  );
});

test("ranking de lucro considera somente produtos ativos cadastrados", () => {
  const produtos = [
    { id: "vela-1", codigo: "V1", nome: "Vela Premium" },
    { id: "vela-2", codigo: "V2", nome: "Vela Inativa", ativo: false },
    { id: "vela-3", codigo: "V3", nome: "Vela Removida", status: "removido" },
  ];
  const vendas = [
    {
      id: "venda-1",
      itens: [
        { produtoId: "vela-1", produto: "Nome historico A", quantidade: 2, total: 100, lucro: 40 },
        { produtoId: "vela-2", produto: "Vela Inativa", quantidade: 1, total: 80, lucro: 30 },
        { produtoId: "produto-inexistente", produto: "Fantasma", quantidade: 1, total: 50, lucro: 20 },
      ],
    },
    {
      id: "venda-2",
      itens: [
        { produtoId: "vela-1", produto: "Nome historico B", quantidade: 1, total: 60, lucro: 25 },
        { produtoId: "vela-3", produto: "Vela Removida", quantidade: 1, total: 30, lucro: 10 },
      ],
    },
  ];

  const ranking = calcularRankingLucroProdutos({ vendas, produtos });

  assert.equal(ranking.length, 1);
  assert.equal(ranking[0].id, "vela-1");
  assert.equal(ranking[0].produto, "V1 - Vela Premium");
  assert.equal(ranking[0].quantidade, 3);
  assert.equal(ranking[0].faturamento, 160);
  assert.equal(ranking[0].lucro, 65);
});

test("ranking de lucro resolve produto legado por alias ativo", () => {
  const produtos = [
    { id: "legacy-1", codigo: "VL1", nome: "Vela Legada", status: "ativo" },
  ];
  const vendas = [
    {
      id: "venda-legada",
      produto: "VL1 - Vela Legada",
      quantidade: 4,
      total: 200,
      lucro: 90,
    },
  ];

  const ranking = calcularRankingLucroProdutos({ vendas, produtos });

  assert.equal(ranking.length, 1);
  assert.equal(ranking[0].id, "legacy-1");
  assert.equal(ranking[0].quantidade, 4);
  assert.equal(ranking[0].lucro, 90);
});
