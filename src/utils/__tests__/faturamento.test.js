import assert from "node:assert/strict";
import test from "node:test";

import {
  PENDENCIAS_FATURAMENTO,
  PENDENCIAS_PREPARACAO_FATURAMENTO,
  criarFaturamentoVenda,
  validarPreparacaoFaturamento,
} from "../faturamento.js";

const fiscalEmpresaSnapshot = () => ({
  versao: 1,
  regimeTributario: "Simples Nacional",
  cnpj: "11222333000144",
  inscricaoEstadual: "123456789",
  inscricaoMunicipal: "987654",
  cnae: "4789001",
  uf: "GO",
  municipio: "Itumbiara",
  ambienteFiscal: "homologacao",
});

const destinatarioSnapshot = () => ({
  versao: 1,
  clienteId: "cliente-1",
  nome: "Cliente Teste",
  documento: "12345678900",
  email: "cliente@teste.com",
  telefone: "62999990000",
  endereco: "Rua Central",
  cidade: "Itumbiara",
  uf: "GO",
});

const fiscalItemSnapshot = () => ({
  versao: 1,
  ncm: "34060000",
  cest: "2803800",
  cfopPadrao: "5102",
  origem: "0",
  unidadeTributavel: "un",
});

const vendaBase = (sobrescritas = {}) => ({
  id: "venda-1",
  numeroPedido: "PED-0001",
  cliente: "Cliente Teste",
  clienteId: "cliente-1",
  clienteNome: "Cliente Teste",
  data: "2026-09-12",
  itens: [
    {
      produtoId: "produto-1",
      codigoProduto: "P001",
      produtoNome: "Vela Aromatica",
      produto: "Vela Aromatica",
      quantidade: 2,
      valorUnitario: 25,
      desconto: 5,
      valorBruto: 50,
      total: 45,
      fiscalSnapshot: fiscalItemSnapshot(),
    },
  ],
  valorBruto: 50,
  desconto: 5,
  total: 45,
  fiscalEmpresaSnapshot: fiscalEmpresaSnapshot(),
  destinatarioSnapshot: destinatarioSnapshot(),
  ...sobrescritas,
});

test("cria faturamento conceitual para venda normal", () => {
  const faturamento = criarFaturamentoVenda({
    venda: vendaBase(),
    segmento: "comercio",
  });

  assert.equal(faturamento.versao, 1);
  assert.deepEqual(faturamento.origem, {
    tipo: "venda",
    documentoId: "venda-1",
    numeroDocumento: "PED-0001",
  });
  assert.equal(faturamento.contextoFiscal.operacao.tipoOperacao, "venda");
  assert.equal(faturamento.contextoFiscal.operacao.segmento, "comercio");
  assert.equal(faturamento.itens[0].tipoItem, "mercadoria");
});

test("cria faturamento conceitual para venda de pecas", () => {
  const faturamento = criarFaturamentoVenda({
    venda: vendaBase({ tipoVenda: "pecas" }),
    segmento: "oficina",
  });

  assert.deepEqual(faturamento.origem, {
    tipo: "venda_pecas",
    documentoId: "venda-1",
    numeroDocumento: "PED-0001",
  });
  assert.equal(faturamento.contextoFiscal.operacao.tipoOperacao, "venda_pecas");
  assert.equal(faturamento.itens[0].tipoItem, "peca");
});

test("venda legada sem tipoVenda e tratada como venda normal", () => {
  const venda = vendaBase();
  delete venda.tipoVenda;

  const faturamento = criarFaturamentoVenda({ venda, segmento: "industria" });

  assert.equal(faturamento.origem.tipo, "venda");
  assert.equal(faturamento.itens[0].tipoItem, "mercadoria");
});

test("preserva origem comercial da venda", () => {
  const faturamento = criarFaturamentoVenda({
    venda: vendaBase({ id: "abc123", numeroPedido: "PED-0099" }),
  });

  assert.deepEqual(faturamento.origem, {
    tipo: "venda",
    documentoId: "abc123",
    numeroDocumento: "PED-0099",
  });
});

test("mapeia totais congelados da venda", () => {
  const faturamento = criarFaturamentoVenda({
    venda: vendaBase({ valorBruto: 120.5, desconto: 20.25, total: 100.25 }),
  });

  assert.deepEqual(faturamento.totais, {
    valorBruto: 120.5,
    desconto: 20.25,
    valorLiquido: 100.25,
  });
});

test("usa exclusivamente o snapshot do emitente salvo na venda", () => {
  const snapshot = fiscalEmpresaSnapshot();
  const faturamento = criarFaturamentoVenda({
    venda: vendaBase({
      fiscalEmpresaSnapshot: snapshot,
      empresaAtual: { cnpj: "nao usar" },
    }),
  });

  assert.deepEqual(faturamento.contextoFiscal.emitente, snapshot);
  assert.equal(Object.hasOwn(faturamento.contextoFiscal.emitente, "empresaAtual"), false);
});

test("usa exclusivamente o snapshot do destinatario salvo na venda", () => {
  const snapshot = destinatarioSnapshot();
  const faturamento = criarFaturamentoVenda({
    venda: vendaBase({
      destinatarioSnapshot: snapshot,
      clienteAtual: { nome: "Cadastro Atualizado" },
    }),
  });

  assert.deepEqual(faturamento.contextoFiscal.destinatario, snapshot);
  assert.equal(faturamento.contextoFiscal.destinatario.nome, "Cliente Teste");
});

test("mapeia itens com fiscalSnapshot", () => {
  const faturamento = criarFaturamentoVenda({ venda: vendaBase() });

  assert.deepEqual(faturamento.itens[0], {
    tipoItem: "mercadoria",
    origemItemId: "produto-1",
    descricao: "Vela Aromatica",
    quantidade: 2,
    unidade: "un",
    valorUnitario: 25,
    desconto: 5,
    total: 45,
    fiscalSnapshot: fiscalItemSnapshot(),
  });
});

test("venda antiga sem snapshots registra pendencias sem inventar dados", () => {
  const venda = vendaBase();
  delete venda.fiscalEmpresaSnapshot;
  delete venda.destinatarioSnapshot;
  delete venda.itens[0].fiscalSnapshot;

  const faturamento = criarFaturamentoVenda({ venda });

  assert.equal(faturamento.contextoFiscal.emitente, null);
  assert.equal(faturamento.contextoFiscal.destinatario, null);
  assert.deepEqual(faturamento.itens[0].fiscalSnapshot, null);
  assert.deepEqual(faturamento.pendencias, [
    PENDENCIAS_FATURAMENTO.EMITENTE_SNAPSHOT_AUSENTE,
    PENDENCIAS_FATURAMENTO.DESTINATARIO_SNAPSHOT_AUSENTE,
    PENDENCIAS_FATURAMENTO.ITEM_FISCAL_SNAPSHOT_AUSENTE,
  ]);
});

test("ausencia parcial de snapshots registra somente pendencias correspondentes", () => {
  const venda = vendaBase();
  delete venda.destinatarioSnapshot;

  const faturamento = criarFaturamentoVenda({ venda });

  assert.deepEqual(faturamento.pendencias, [
    PENDENCIAS_FATURAMENTO.DESTINATARIO_SNAPSHOT_AUSENTE,
  ]);
});

test("nao reconstrui dados a partir de cadastros atuais anexados a venda", () => {
  const venda = vendaBase();
  delete venda.fiscalEmpresaSnapshot;
  delete venda.destinatarioSnapshot;
  delete venda.itens[0].fiscalSnapshot;
  venda.configuracoes = { fiscal: fiscalEmpresaSnapshot() };
  venda.clienteAtual = destinatarioSnapshot();
  venda.itens[0].produtoCadastro = { fiscal: fiscalItemSnapshot() };

  const faturamento = criarFaturamentoVenda({ venda });

  assert.equal(faturamento.contextoFiscal.emitente, null);
  assert.equal(faturamento.contextoFiscal.destinatario, null);
  assert.equal(faturamento.itens[0].fiscalSnapshot, null);
});

test("mutacao posterior da venda nao altera faturamento", () => {
  const venda = vendaBase();
  const faturamento = criarFaturamentoVenda({ venda });

  venda.numeroPedido = "PED-9999";
  venda.valorBruto = 999;

  assert.equal(faturamento.origem.numeroDocumento, "PED-0001");
  assert.equal(faturamento.totais.valorBruto, 50);
});

test("mutacao posterior do item nao altera faturamento", () => {
  const venda = vendaBase();
  const faturamento = criarFaturamentoVenda({ venda });

  venda.itens[0].produtoNome = "Produto alterado";
  venda.itens[0].quantidade = 99;

  assert.equal(faturamento.itens[0].descricao, "Vela Aromatica");
  assert.equal(faturamento.itens[0].quantidade, 2);
});

test("mutacao posterior de snapshots aninhados nao altera faturamento", () => {
  const venda = vendaBase();
  const faturamento = criarFaturamentoVenda({ venda });

  venda.fiscalEmpresaSnapshot.cnpj = "00000000000000";
  venda.destinatarioSnapshot.nome = "Outro cliente";
  venda.itens[0].fiscalSnapshot.ncm = "99999999";

  assert.equal(faturamento.contextoFiscal.emitente.cnpj, "11222333000144");
  assert.equal(faturamento.contextoFiscal.destinatario.nome, "Cliente Teste");
  assert.equal(faturamento.itens[0].fiscalSnapshot.ncm, "34060000");
});

test("status inicial e rascunho", () => {
  const faturamento = criarFaturamentoVenda({ venda: vendaBase() });

  assert.equal(faturamento.status, "rascunho");
});

test("nao inclui campos tributarios ainda nao implementados", () => {
  const faturamento = criarFaturamentoVenda({ venda: vendaBase() });
  const operacao = faturamento.contextoFiscal.operacao;

  assert.equal(Object.hasOwn(operacao, "finalidadeOperacao"), false);
  assert.equal(Object.hasOwn(operacao, "presencaComprador"), false);
  assert.equal(Object.hasOwn(operacao, "consumidorFinal"), false);
  assert.equal(Object.hasOwn(operacao, "destinoOperacao"), false);
  assert.equal(Object.hasOwn(operacao, "naturezaOperacao"), false);
  assert.equal(Object.hasOwn(operacao, "cfopEfetivo"), false);
  assert.equal(Object.hasOwn(faturamento, "tributos"), false);
  assert.equal(Object.hasOwn(faturamento, "retencoes"), false);
});

test("nao cria identificadores persistentes ou fiscais", () => {
  const faturamento = criarFaturamentoVenda({ venda: vendaBase() });

  assert.equal(Object.hasOwn(faturamento, "faturamentoId"), false);
  assert.equal(Object.hasOwn(faturamento, "idempotencyKey"), false);
  assert.equal(Object.hasOwn(faturamento, "numeroFiscal"), false);
  assert.equal(Object.hasOwn(faturamento, "serie"), false);
  assert.equal(Object.hasOwn(faturamento, "chaveAcesso"), false);
  assert.equal(Object.hasOwn(faturamento, "protocolo"), false);
  assert.equal(Object.hasOwn(faturamento, "criadoEm"), false);
  assert.equal(Object.hasOwn(faturamento, "atualizadoEm"), false);
});

test("validacao de preparacao aceita faturamento cadastralmente completo", () => {
  const faturamento = criarFaturamentoVenda({
    venda: vendaBase(),
    segmento: "comercio",
  });

  assert.deepEqual(validarPreparacaoFaturamento(faturamento), {
    valido: true,
    pendencias: [],
  });
});

test("validacao de preparacao aponta emitente ausente", () => {
  const faturamento = criarFaturamentoVenda({
    venda: vendaBase({ fiscalEmpresaSnapshot: null }),
  });

  assert.deepEqual(validarPreparacaoFaturamento(faturamento), {
    valido: false,
    pendencias: [
      PENDENCIAS_PREPARACAO_FATURAMENTO.EMITENTE_SNAPSHOT_AUSENTE,
    ],
  });
});

test("validacao de preparacao aponta destinatario ausente", () => {
  const faturamento = criarFaturamentoVenda({
    venda: vendaBase({ destinatarioSnapshot: null }),
  });

  assert.deepEqual(validarPreparacaoFaturamento(faturamento), {
    valido: false,
    pendencias: [
      PENDENCIAS_PREPARACAO_FATURAMENTO.DESTINATARIO_SNAPSHOT_AUSENTE,
    ],
  });
});

test("validacao de preparacao aponta item sem fiscalSnapshot", () => {
  const venda = vendaBase();
  delete venda.itens[0].fiscalSnapshot;
  const faturamento = criarFaturamentoVenda({ venda });

  assert.deepEqual(validarPreparacaoFaturamento(faturamento).pendencias, [
    PENDENCIAS_PREPARACAO_FATURAMENTO.ITEM_FISCAL_SNAPSHOT_AUSENTE,
  ]);
});

test("validacao de preparacao aponta ausencia de itens", () => {
  const faturamento = criarFaturamentoVenda({
    venda: vendaBase({ itens: [] }),
  });

  assert.deepEqual(validarPreparacaoFaturamento(faturamento).pendencias, [
    PENDENCIAS_PREPARACAO_FATURAMENTO.ITENS_AUSENTES,
  ]);
});

test("validacao de preparacao aponta item sem NCM", () => {
  const venda = vendaBase({
    itens: [
      {
        ...vendaBase().itens[0],
        fiscalSnapshot: {
          ...fiscalItemSnapshot(),
          ncm: "",
        },
      },
    ],
  });
  const faturamento = criarFaturamentoVenda({ venda });

  assert.deepEqual(validarPreparacaoFaturamento(faturamento).pendencias, [
    PENDENCIAS_PREPARACAO_FATURAMENTO.ITEM_NCM_AUSENTE,
  ]);
});

test("validacao de preparacao aponta item sem unidade tributavel", () => {
  const venda = vendaBase({
    itens: [
      {
        ...vendaBase().itens[0],
        fiscalSnapshot: {
          ...fiscalItemSnapshot(),
          unidadeTributavel: "",
        },
      },
    ],
  });
  const faturamento = criarFaturamentoVenda({ venda });

  assert.deepEqual(validarPreparacaoFaturamento(faturamento).pendencias, [
    PENDENCIAS_PREPARACAO_FATURAMENTO.ITEM_UNIDADE_TRIBUTAVEL_AUSENTE,
  ]);
});

test("validacao de preparacao consolida multiplas pendencias sem duplicidade", () => {
  const venda = vendaBase({
    fiscalEmpresaSnapshot: {
      ...fiscalEmpresaSnapshot(),
      cnpj: "",
      uf: "",
    },
    destinatarioSnapshot: {
      ...destinatarioSnapshot(),
      nome: "",
    },
    itens: [
      {
        ...vendaBase().itens[0],
        produtoNome: "",
        produto: "",
        quantidade: 0,
        fiscalSnapshot: {
          ...fiscalItemSnapshot(),
          ncm: "",
          unidadeTributavel: "",
        },
      },
    ],
  });
  const faturamento = criarFaturamentoVenda({ venda });
  const validacao = validarPreparacaoFaturamento({
    ...faturamento,
    pendencias: [
      PENDENCIAS_PREPARACAO_FATURAMENTO.EMITENTE_CNPJ_AUSENTE,
    ],
  });

  assert.deepEqual(validacao.pendencias, [
    PENDENCIAS_PREPARACAO_FATURAMENTO.EMITENTE_CNPJ_AUSENTE,
    PENDENCIAS_PREPARACAO_FATURAMENTO.EMITENTE_UF_AUSENTE,
    PENDENCIAS_PREPARACAO_FATURAMENTO.DESTINATARIO_NOME_AUSENTE,
    PENDENCIAS_PREPARACAO_FATURAMENTO.ITEM_DESCRICAO_AUSENTE,
    PENDENCIAS_PREPARACAO_FATURAMENTO.ITEM_QUANTIDADE_INVALIDA,
    PENDENCIAS_PREPARACAO_FATURAMENTO.ITEM_NCM_AUSENTE,
    PENDENCIAS_PREPARACAO_FATURAMENTO.ITEM_UNIDADE_TRIBUTAVEL_AUSENTE,
  ]);
  assert.equal(new Set(validacao.pendencias).size, validacao.pendencias.length);
});

test("validacao de preparacao tem ordenacao deterministica", () => {
  const validacao = validarPreparacaoFaturamento({
    pendencias: [
      PENDENCIAS_PREPARACAO_FATURAMENTO.ITEM_NCM_AUSENTE,
      PENDENCIAS_PREPARACAO_FATURAMENTO.EMITENTE_CNPJ_AUSENTE,
    ],
    contextoFiscal: {
      emitente: {
        ...fiscalEmpresaSnapshot(),
        cnpj: "",
      },
      destinatario: destinatarioSnapshot(),
    },
    itens: [
      {
        ...criarFaturamentoVenda({ venda: vendaBase() }).itens[0],
        fiscalSnapshot: {
          ...fiscalItemSnapshot(),
          ncm: "",
        },
      },
    ],
  });

  assert.deepEqual(validacao.pendencias, [
    PENDENCIAS_PREPARACAO_FATURAMENTO.EMITENTE_CNPJ_AUSENTE,
    PENDENCIAS_PREPARACAO_FATURAMENTO.ITEM_NCM_AUSENTE,
  ]);
});

test("validacao de preparacao nao muta objeto original", () => {
  const faturamento = criarFaturamentoVenda({ venda: vendaBase() });
  const cloneAntes = structuredClone(faturamento);

  validarPreparacaoFaturamento(faturamento);

  assert.deepEqual(faturamento, cloneAntes);
});
