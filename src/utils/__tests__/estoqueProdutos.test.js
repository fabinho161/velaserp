import assert from "node:assert/strict";
import test from "node:test";
import { calcularEstoqueProdutos } from "../estoqueProdutos.js";

const produtoPadrao = {
  id: "produto-1",
  codigo: "P001",
  nome: "Filtro de oleo",
  origemProduto: "revenda",
  estoqueInicial: 10,
  custoUnitario: 20,
  precoVenda: 40,
};

const calcularProduto = (opcoes = {}) =>
  calcularEstoqueProdutos({
    produtos: [produtoPadrao],
    ...opcoes,
  }).find((produto) => produto.produtoId === produtoPadrao.id);

const pecaPadrao = (quantidade = 2) => ({
  produtoId: produtoPadrao.id,
  codigoProduto: produtoPadrao.codigo,
  produtoNome: produtoPadrao.nome,
  produto: `${produtoPadrao.codigo} - ${produtoPadrao.nome}`,
  quantidade,
  valorUnitario: 40,
  subtotal: 40 * Number(quantidade || 0),
  custoUnitario: 20,
  custoTotal: 20 * Number(quantidade || 0),
});

const ordemServico = (status, pecas = [pecaPadrao()]) => ({
  id: `os-${status}`,
  status,
  pecas,
});

test("venda valida reduz estoque de produto", () => {
  const produto = calcularProduto({
    vendas: [
      {
        statusExpedicao: "Entregue",
        statusPagamento: "pago",
        itens: [pecaPadrao(3)],
      },
    ],
  });

  assert.equal(produto.vendido, 3);
  assert.equal(produto.saldo, 7);
});

test("venda cancelada nao reduz estoque de produto", () => {
  const produto = calcularProduto({
    vendas: [
      {
        statusExpedicao: "Cancelado",
        statusPagamento: "pago",
        itens: [pecaPadrao(3)],
      },
      {
        statusExpedicao: "Entregue",
        statusPagamento: "cancelado",
        itens: [pecaPadrao(4)],
      },
    ],
  });

  assert.equal(produto.vendido, 0);
  assert.equal(produto.saldo, 10);
});

test("OS aberta nao consome pecas", () => {
  const produto = calcularProduto({
    ordensServico: [ordemServico("aberta")],
  });

  assert.equal(produto.consumidoEmOrdemServico, 0);
  assert.equal(produto.saldo, 10);
});

test("OS aguardando_aprovacao nao consome pecas", () => {
  const produto = calcularProduto({
    ordensServico: [ordemServico("aguardando_aprovacao")],
  });

  assert.equal(produto.consumidoEmOrdemServico, 0);
  assert.equal(produto.saldo, 10);
});

test("OS aprovada consome pecas", () => {
  const produto = calcularProduto({
    ordensServico: [ordemServico("aprovada")],
  });

  assert.equal(produto.consumidoEmOrdemServico, 2);
  assert.equal(produto.saldo, 8);
});

test("OS em_execucao consome pecas", () => {
  const produto = calcularProduto({
    ordensServico: [ordemServico("em_execucao")],
  });

  assert.equal(produto.consumidoEmOrdemServico, 2);
  assert.equal(produto.saldo, 8);
});

test("OS concluida consome pecas", () => {
  const produto = calcularProduto({
    ordensServico: [ordemServico("concluida")],
  });

  assert.equal(produto.consumidoEmOrdemServico, 2);
  assert.equal(produto.saldo, 8);
});

test("OS encerrada consome pecas", () => {
  const produto = calcularProduto({
    ordensServico: [ordemServico("encerrada")],
  });

  assert.equal(produto.consumidoEmOrdemServico, 2);
  assert.equal(produto.saldo, 8);
});

test("OS concluida e encerrada mantem o mesmo consumo", () => {
  const concluida = calcularProduto({
    ordensServico: [ordemServico("concluida", [pecaPadrao(4)])],
  });
  const encerrada = calcularProduto({
    ordensServico: [ordemServico("encerrada", [pecaPadrao(4)])],
  });

  assert.equal(concluida.consumidoEmOrdemServico, 4);
  assert.equal(encerrada.consumidoEmOrdemServico, 4);
  assert.equal(encerrada.saldo, concluida.saldo);
});

test("OS cancelada e status desconhecido nao consomem pecas", () => {
  const produto = calcularProduto({
    ordensServico: [
      ordemServico("cancelada", [pecaPadrao(2)]),
      ordemServico("pendente", [pecaPadrao(3)]),
      ordemServico("", [pecaPadrao(4)]),
    ],
  });

  assert.equal(produto.consumidoEmOrdemServico, 0);
  assert.equal(produto.saldo, 10);
});

test("duas OS elegiveis somam consumo de pecas", () => {
  const produto = calcularProduto({
    ordensServico: [
      ordemServico("aprovada", [pecaPadrao(2)]),
      ordemServico("concluida", [pecaPadrao(3)]),
    ],
  });

  assert.equal(produto.consumidoEmOrdemServico, 5);
  assert.equal(produto.saldo, 5);
});

test("quantidade invalida zero ou negativa nao reduz estoque", () => {
  const produto = calcularProduto({
    ordensServico: [
      ordemServico("aprovada", [
        pecaPadrao(0),
        pecaPadrao(-1),
        pecaPadrao("abc"),
        pecaPadrao(null),
      ]),
    ],
  });

  assert.equal(produto.consumidoEmOrdemServico, 0);
  assert.equal(produto.saldo, 10);
});

test("chamada antiga sem ordensServico continua funcionando", () => {
  const produto = calcularProduto();

  assert.equal(produto.saldo, 10);
  assert.equal(produto.consumidoEmOrdemServico, 0);
});

test("produto identificado por produtoId e consumido corretamente pela OS", () => {
  const produto = calcularProduto({
    ordensServico: [
      ordemServico("aprovada", [
        {
          produtoId: produtoPadrao.id,
          quantidade: 4,
        },
      ]),
    ],
  });

  assert.equal(produto.produtoId, produtoPadrao.id);
  assert.equal(produto.consumidoEmOrdemServico, 4);
  assert.equal(produto.saldo, 6);
});

test("OS concluida consome estoque normalmente", () => {
  const produto = calcularProduto({
    ordensServico: [
      {
        id: "os-concluida-1",
        status: "concluida",
        pecas: [pecaPadrao(3)],
      },
    ],
  });

  assert.equal(produto.consumidoEmOrdemServico, 3);
  assert.equal(produto.saldo, 7);
});

test("OS atual e ignorada quando ignorarOrdemServicoId corresponde ao id", () => {
  const produto = calcularProduto({
    ordensServico: [
      {
        id: "os-atual",
        status: "concluida",
        pecas: [pecaPadrao(3)],
      },
    ],
    ignorarOrdemServicoId: "os-atual",
  });

  assert.equal(produto.consumidoEmOrdemServico, 0);
  assert.equal(produto.saldo, 10);
});

test("outra OS continua sendo considerada ao ignorar a OS atual", () => {
  const produto = calcularProduto({
    ordensServico: [
      {
        id: "os-atual",
        status: "concluida",
        pecas: [pecaPadrao(3)],
      },
      {
        id: "os-outra",
        status: "concluida",
        pecas: [pecaPadrao(2)],
      },
    ],
    ignorarOrdemServicoId: "os-atual",
  });

  assert.equal(produto.consumidoEmOrdemServico, 2);
  assert.equal(produto.saldo, 8);
});

test("fallback legado por codigo e nome permanece funcionando para vendas", () => {
  const produto = calcularEstoqueProdutos({
    produtos: [
      {
        codigo: "LEG001",
        nome: "Peca legada",
        origemProduto: "revenda",
        estoqueInicial: 6,
      },
    ],
    vendas: [
      {
        statusExpedicao: "Entregue",
        statusPagamento: "pago",
        itens: [
          {
            codigoProduto: "LEG001",
            produtoNome: "Peca legada",
            quantidade: 2,
          },
        ],
      },
    ],
  })[0];

  assert.equal(produto.vendido, 2);
  assert.equal(produto.saldo, 4);
});
