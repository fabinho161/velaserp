import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  filtrarAtendimentosRelatorio,
  filtrarRelatoriosPorSegmento,
  obterApresentacaoRelatorios,
  prepararRelatorioAtendimentos,
  prepararRelatorioFinanceiroServicos,
  prepararRelatorioServicos,
} from "../relatorios.js";

const relatoriosAtuais = [
  { tipo: "vendas" },
  { tipo: "atendimentos" },
  { tipo: "servicos" },
  { tipo: "financeiro" },
  { tipo: "dre" },
  { tipo: "estoque" },
  { tipo: "producao" },
  { tipo: "insumos" },
];

test("clientes recebe a apresentacao de Gestao de Servicos", () => {
  const apresentacao = obterApresentacaoRelatorios("clientes");

  assert.equal(apresentacao.isGestaoServicos, true);
  assert.equal(apresentacao.exibirIndicadoresVendas, false);
  assert.equal(apresentacao.exibirDespesas, true);
  assert.deepEqual(
    filtrarRelatoriosPorSegmento(relatoriosAtuais, "clientes").map(({ tipo }) => tipo),
    ["atendimentos", "servicos", "financeiro", "dre"]
  );
});

test("alias legado servicos recebe a mesma apresentacao de clientes", () => {
  assert.deepEqual(
    obterApresentacaoRelatorios("servicos"),
    obterApresentacaoRelatorios("clientes")
  );
  assert.deepEqual(
    filtrarRelatoriosPorSegmento(relatoriosAtuais, "servicos"),
    filtrarRelatoriosPorSegmento(relatoriosAtuais, "clientes")
  );
});

for (const segmento of ["comercio", "industria", "oficina"]) {
  test(`${segmento} preserva a apresentacao atual`, () => {
    const apresentacao = obterApresentacaoRelatorios(segmento);

    assert.equal(apresentacao.isGestaoServicos, false);
    assert.equal(apresentacao.exibirIndicadoresVendas, true);
    assert.equal(apresentacao.exibirDespesas, true);
    assert.deepEqual(
      filtrarRelatoriosPorSegmento(relatoriosAtuais, segmento).map(({ tipo }) => tipo),
      ["vendas", "financeiro", "dre", "estoque", "producao", "insumos"]
    );
  });
}

const agendamentos = [
  {
    id: "multi",
    clienteId: "cliente-1",
    clienteNome: "João",
    data: "2026-09-25",
    horaInicio: "08:00",
    horaFim: "09:45",
    duracaoMinutos: 105,
    status: "concluido",
    servicosSnapshot: [
      { servicoId: "A", servicoNome: "Troca de óleo", duracaoMinutos: 60, valorUnitario: 150 },
      { servicoId: "B", servicoNome: "Alinhamento", duracaoMinutos: 45, valorUnitario: 120 },
    ],
    valorTotalServicos: 270,
  },
  {
    id: "legado",
    clienteId: "cliente-2",
    clienteNome: "Maria",
    data: "2026-09-26",
    horaInicio: "10:00",
    horaFim: "11:00",
    duracaoMinutos: 60,
    status: "agendado",
    servicoId: "C",
    servicoNome: "Consulta",
    valorServico: 150,
  },
  {
    id: "gratuito",
    clienteId: "cliente-1",
    clienteNome: "João",
    data: "2026-09-27",
    horaInicio: "12:00",
    horaFim: "12:30",
    duracaoMinutos: 30,
    status: "concluido",
    servicosSnapshot: [
      { servicoId: "D", servicoNome: "Cortesia", duracaoMinutos: 30, valorUnitario: 0 },
    ],
    valorTotalServicos: 0,
  },
  {
    id: "cancelado",
    clienteId: "cliente-1",
    clienteNome: "João",
    data: "2026-09-28",
    horaInicio: "13:00",
    horaFim: "14:00",
    duracaoMinutos: 60,
    status: "cancelado",
    servicoId: "E",
    servicoNome: "Serviço cancelado",
    valorServico: 500,
  },
];

test("filtra atendimentos por data e cliente historico", () => {
  assert.deepEqual(
    filtrarAtendimentosRelatorio(agendamentos, {
      inicio: "2026-09-26",
      fim: "2026-09-27",
      clienteId: "cliente-1",
    }).map(({ id }) => id),
    ["gratuito"]
  );
});

test("filtro encontra servico em qualquer posicao da composicao", () => {
  assert.deepEqual(
    filtrarAtendimentosRelatorio(agendamentos, { servicoId: "A" }).map(({ id }) => id),
    ["multi"]
  );
  assert.deepEqual(
    filtrarAtendimentosRelatorio(agendamentos, { servicoId: "B" }).map(({ id }) => id),
    ["multi"]
  );
  assert.deepEqual(filtrarAtendimentosRelatorio(agendamentos, { servicoId: "Z" }), []);
});

test("filtro e relatorio preservam documento legado", () => {
  const resultado = prepararRelatorioAtendimentos(agendamentos, { servicoId: "C" });

  assert.equal(resultado.totalAtendimentos, 1);
  assert.equal(resultado.linhas[0].servicosResumo, "Consulta");
  assert.equal(resultado.linhas[0].valorHistorico, 150);
});

test("multisservico conta um atendimento e preserva composicao e valor", () => {
  const resultado = prepararRelatorioAtendimentos(agendamentos, { servicoId: "B" });

  assert.equal(resultado.totalAtendimentos, 1);
  assert.equal(resultado.totalConcluidos, 1);
  assert.equal(resultado.valorAtendimentosConcluidos, 270);
  assert.equal(resultado.linhas[0].servicosResumo, "Troca de óleo + 1 serviço");
  assert.equal(resultado.linhas[0].servicosNomes, "Troca de óleo • Alinhamento");
});

test("concluido gratuito conta sem alterar valor e cancelado nao compoe total", () => {
  const resultado = prepararRelatorioAtendimentos(agendamentos);

  assert.equal(resultado.totalAtendimentos, 4);
  assert.equal(resultado.totalConcluidos, 2);
  assert.equal(resultado.valorAtendimentosConcluidos, 270);
});

test("preparacao sem atendimentos retorna resumo vazio seguro", () => {
  assert.deepEqual(prepararRelatorioAtendimentos([], { servicoId: "A" }), {
    linhas: [],
    totalAtendimentos: 0,
    totalConcluidos: 0,
    valorAtendimentosConcluidos: 0,
  });
});

const itemServico = (servicoId, servicoNome, valorUnitario) => ({
  servicoId,
  servicoNome,
  duracaoMinutos: 30,
  valorUnitario,
});

const agendaAnalitica = [
  {
    id: "concluido-1",
    clienteId: "cliente-1",
    data: "2026-09-10",
    status: "concluido",
    servicosSnapshot: [
      itemServico("A", "Serviço A antigo", 100),
      itemServico("B", "Serviço B", 50.25),
      itemServico("Z", "Cortesia", 0),
    ],
  },
  {
    id: "concluido-2",
    clienteId: "cliente-1",
    data: "2026-09-11",
    status: "concluido",
    servicosSnapshot: [
      itemServico("C", "Serviço C", 30.1),
      itemServico("D", "Serviço D", 20),
      itemServico("A", "Serviço A renomeado", 120),
    ],
  },
  {
    id: "legado-concluido",
    clienteId: "cliente-2",
    data: "2026-09-12",
    status: "concluido",
    servicoId: "L",
    servicoNome: "Serviço legado",
    duracaoMinutos: 60,
    valorServico: 150,
  },
  {
    id: "agendado",
    clienteId: "cliente-1",
    data: "2026-09-13",
    status: "agendado",
    servicosSnapshot: [itemServico("A", "Serviço A", 999)],
  },
  {
    id: "em-atendimento",
    clienteId: "cliente-1",
    data: "2026-09-14",
    status: "em_atendimento",
    servicosSnapshot: [itemServico("B", "Serviço B", 999)],
  },
  {
    id: "cancelado",
    clienteId: "cliente-1",
    data: "2026-09-15",
    status: "cancelado",
    servicosSnapshot: [itemServico("C", "Serviço C", 999)],
  },
];

test("relatorio de servicos agrupa legado e multisservico somente concluidos", () => {
  const resultado = prepararRelatorioServicos(agendaAnalitica);

  assert.deepEqual(resultado.linhas, [
    { servicoId: "A", nome: "Serviço A antigo", quantidade: 2, valor: 220 },
    { servicoId: "Z", nome: "Cortesia", quantidade: 1, valor: 0 },
    { servicoId: "B", nome: "Serviço B", quantidade: 1, valor: 50.25 },
    { servicoId: "C", nome: "Serviço C", quantidade: 1, valor: 30.1 },
    { servicoId: "D", nome: "Serviço D", quantidade: 1, valor: 20 },
    { servicoId: "L", nome: "Serviço legado", quantidade: 1, valor: 150 },
  ]);
  assert.equal(resultado.totalExecucoes, 7);
  assert.equal(resultado.totalTipos, 6);
  assert.equal(resultado.valorHistorico, 470.35);
});

test("filtros de periodo e cliente antecedem a expansao dos servicos", () => {
  const resultado = prepararRelatorioServicos(agendaAnalitica, {
    inicio: "2026-09-11",
    fim: "2026-09-11",
    clienteId: "cliente-1",
  });

  assert.deepEqual(resultado.linhas.map(({ servicoId }) => servicoId), ["A", "C", "D"]);
  assert.equal(resultado.totalExecucoes, 3);
  assert.equal(resultado.valorHistorico, 170.1);
});

test("filtro de servico nao inclui companheiros do mesmo atendimento", () => {
  const resultado = prepararRelatorioServicos(agendaAnalitica, { servicoId: "B" });

  assert.deepEqual(resultado.linhas, [
    { servicoId: "B", nome: "Serviço B", quantidade: 1, valor: 50.25 },
  ]);
});

test("valor por servico reconcilia com atendimentos concluidos sem filtro especifico", () => {
  const analitico = prepararRelatorioServicos(agendaAnalitica);
  const atendimentos = prepararRelatorioAtendimentos(agendaAnalitica);

  assert.equal(analitico.valorHistorico, atendimentos.valorAtendimentosConcluidos);
});

test("reconcilia A 220 e B 50 com total historico de 270", () => {
  const base = [
    {
      status: "concluido",
      servicosSnapshot: [
        itemServico("A", "Serviço A", 100),
        itemServico("B", "Serviço B", 50),
      ],
    },
    {
      status: "concluido",
      servicosSnapshot: [itemServico("A", "Serviço A", 120)],
    },
  ];
  const analitico = prepararRelatorioServicos(base);
  const atendimentos = prepararRelatorioAtendimentos(base);

  assert.deepEqual(analitico.linhas, [
    { servicoId: "A", nome: "Serviço A", quantidade: 2, valor: 220 },
    { servicoId: "B", nome: "Serviço B", quantidade: 1, valor: 50 },
  ]);
  assert.equal(analitico.valorHistorico, 270);
  assert.equal(atendimentos.valorAtendimentosConcluidos, 270);
});

test("relatorio financeiro de servicos reutiliza caixa realizado", () => {
  const resultado = prepararRelatorioFinanceiroServicos({
    contasReceber: [
      {
        id: "recebida",
        origem: { tipo: "atendimento" },
        cliente: { clienteId: "cliente-1", nome: "João" },
        descricao: "Atendimento",
        status: "recebido",
        valor: 999,
        dataCompetencia: "2026-09-10",
        pagamento: { dataRecebimento: "2026-10-07", valorRecebido: 1000 },
      },
      {
        origem: { tipo: "atendimento" },
        cliente: { clienteId: "cliente-1" },
        status: "pendente",
        valor: 300,
        dataCompetencia: "2026-09-15",
      },
    ],
    despesas: [
      {
        id: "paga",
        descricao: "Aluguel",
        categoria: "Estrutura",
        valor: 800,
        dataCompetencia: "2026-09-20",
        dataVencimento: "2026-09-30",
        statusFinanceiro: "pago",
        situacao: "ativo",
        pagamento: {
          dataPagamento: "2026-10-05",
          formaPagamento: "pix",
          valorPago: 500,
          pagoEm: { seconds: 1 },
          pagoPor: "usuario-1",
        },
      },
      {
        id: "pendente",
        descricao: "Energia",
        categoria: "Estrutura",
        valor: 200,
        dataCompetencia: "2026-10-10",
        dataVencimento: "2026-10-20",
        statusFinanceiro: "pendente",
        situacao: "ativo",
        pagamento: null,
      },
      { descricao: "Legada", categoria: "Outros", valor: 100, data: "2026-10-01", status: "Pago" },
    ],
    inicio: "2026-10-01",
    fim: "2026-10-31",
  });

  assert.equal(resultado.recebido, 1000);
  assert.equal(resultado.despesas, 500);
  assert.equal(resultado.saldo, 500);
  assert.equal(resultado.aReceber, 300);
  assert.equal(resultado.totalDespesasPendentes, 200);
  assert.deepEqual(resultado.movimentacoesCaixa.map(({ data, tipo, valor }) => ({
    data, tipo, valor,
  })), [
    { data: "2026-10-07", tipo: "Entrada", valor: 1000 },
    { data: "2026-10-05", tipo: "Saída", valor: 500 },
  ]);
});

test("filtro Cliente afeta recebimentos e carteira, mas nao despesas gerais", () => {
  const pagamento = {
    dataPagamento: "2026-10-05",
    formaPagamento: "pix",
    valorPago: 100,
    pagoEm: { seconds: 1 },
    pagoPor: "usuario-1",
  };
  const resultado = prepararRelatorioFinanceiroServicos({
    clienteId: "cliente-1",
    contasReceber: [
      { origem: { tipo: "atendimento" }, cliente: { clienteId: "cliente-1" }, status: "recebido", pagamento: { dataRecebimento: "2026-10-01", valorRecebido: 200 } },
      { origem: { tipo: "atendimento" }, cliente: { clienteId: "cliente-2" }, status: "recebido", pagamento: { dataRecebimento: "2026-10-01", valorRecebido: 900 } },
    ],
    despesas: [{
      descricao: "Despesa geral", categoria: "Outros", valor: 100,
      dataCompetencia: "2026-10-01", dataVencimento: "2026-10-05",
      statusFinanceiro: "pago", situacao: "ativo", pagamento,
    }],
  });

  assert.equal(resultado.recebido, 200);
  assert.equal(resultado.despesas, 100);
  assert.equal(resultado.saldo, 100);
});

test("Relatorios condiciona listener e bloco financeiro a permissao financeira", async () => {
  const fonte = await readFile(
    new URL("../../pages/Relatorios.jsx", import.meta.url),
    "utf8",
  );
  assert.match(
    fonte,
    /if \(!chaveRelatoriosServicos \|\| !podeVerFinanceiro\) return undefined;[\s\S]*?"contasReceber"/,
  );
  assert.match(fonte, /relatorio\.tipo !== "financeiro" \|\|\s*podeVerFinanceiro/);
  assert.match(fonte, /Seu perfil não possui acesso aos dados financeiros/);
});

test("PDF financeiro de Servicos usa movimentos de caixa e separa carteira", async () => {
  const fonte = await readFile(
    new URL("../../pages/Relatorios.jsx", import.meta.url),
    "utf8",
  );
  assert.match(fonte, /label: "Recebimentos"[\s\S]*?resumoFinanceiroServicos\.recebido/);
  assert.match(fonte, /label: "Pagamentos"[\s\S]*?resumoFinanceiroServicos\.despesas/);
  assert.match(fonte, /label: "Saldo de caixa"[\s\S]*?resumoFinanceiroServicos\.saldo/);
  assert.match(fonte, /head: \[\["Data", "Tipo", "Descrição", "Categoria", "Valor"\]\]/);
  assert.match(fonte, /resumoFinanceiroServicos\.movimentacoesCaixa\.map/);
});

test("relatorio de servicos vazio retorna totais seguros", () => {
  assert.deepEqual(prepararRelatorioServicos([], { servicoId: "A" }), {
    linhas: [],
    totalExecucoes: 0,
    totalTipos: 0,
    valorHistorico: 0,
  });
});
