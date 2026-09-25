import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  agruparServicosRealizados,
  calcularDashboardClientes,
  obterAcoesRapidasDashboardClientes,
  obterAgendaHoje,
  obterProximoAtendimento,
  resumirFinanceiroDashboard,
  resolverTipoDashboard,
} from "../dashboardClientes.js";

const firestoreRules = readFileSync(
  fileURLToPath(new URL("../../../firestore.rules", import.meta.url)),
  "utf8",
);

const hoje = "2026-09-24";
const agenda = [
  { id: "1", data: hoje, horaInicio: "10:00", status: "confirmado", clienteId: "c1", servicoId: "s1", servicoNome: "Corte", duracaoMinutos: 30, valorServico: 50 },
  { id: "2", data: hoje, horaInicio: "09:00", status: "concluido", clienteId: "c1", servicoId: "s1", servicoNome: "Corte", duracaoMinutos: 30, valorServico: 50 },
  { id: "3", data: hoje, horaInicio: "11:00", status: "cancelado", clienteId: "c2", servicoId: "s2", servicoNome: "Consulta", duracaoMinutos: 60, valorServico: 100 },
  { id: "4", data: hoje, horaInicio: "14:00", status: "agendado", clienteId: "c3", servicoId: "s2", servicoNome: "Consulta", duracaoMinutos: 60, valorServico: 100 },
  { id: "5", data: "2026-09-23", horaInicio: "15:00", status: "concluido", clienteId: "c3", servicoId: "legado", servicoNome: "Legado", duracaoMinutos: 45, valorServico: 80 },
];

test("agenda de hoje exclui cancelados e ordena por hora", () => {
  assert.deepEqual(obterAgendaHoje(agenda, hoje).map((item) => item.id), ["2", "1", "4"]);
});

test("segmento clientes resolve dashboard especifico e demais preservam o padrao", () => {
  assert.equal(resolverTipoDashboard("clientes"), "clientes");
  for (const segmento of ["industria", "comercio", "oficina", undefined]) {
    assert.equal(resolverTipoDashboard(segmento), "padrao");
  }
});

test("acoes rapidas respeitam permissoes operacionais", () => {
  assert.deepEqual(obterAcoesRapidasDashboardClientes({ podeVerAgenda: true }).map((item) => item.id), ["abrir_agenda"]);
  assert.deepEqual(obterAcoesRapidasDashboardClientes({
    podeVerAgenda: true, podeOperarAgenda: true, podeCriarCliente: true, podeCriarServico: true,
  }).map((item) => item.id), ["novo_agendamento", "novo_cliente", "novo_servico", "abrir_agenda"]);
  assert.deepEqual(obterAcoesRapidasDashboardClientes(), []);
});

test("proximo atendimento ignora passado, concluido e cancelado", () => {
  assert.equal(obterProximoAtendimento(agenda, hoje, 10 * 60 + 30)?.id, "4");
  assert.equal(obterProximoAtendimento(agenda, hoje, 15 * 60), null);
});

test("financeiro usa somente contas de atendimento nos estados corretos", () => {
  const resumo = resumirFinanceiroDashboard([
    { status: "pendente", valor: 100, origem: { tipo: "atendimento" } },
    { status: "pendente", valor: undefined, origem: { tipo: "atendimento" } },
    { status: "recebido", valor: 200, origem: { tipo: "atendimento" }, pagamento: { dataRecebimento: "2026-09-10" } },
    { status: "recebido", valor: 300, origem: { tipo: "atendimento" }, pagamento: { dataRecebimento: "2026-08-10" } },
    { status: "pendente", valor: 999, origem: { tipo: "venda" } },
  ], "2026-09");
  assert.deepEqual(resumo, {
    aReceber: 100, pendencias: 2, recebidoMes: 200, recebimentosMes: 1, ticketMedioRecebido: 200,
  });
});

test("calcula indicadores mensais, clientes unicos, evolucao e ranking por servicoId", () => {
  const resultado = calcularDashboardClientes({ agendamentos: agenda, hoje, agoraMinutos: 600 });
  assert.equal(resultado.totalHoje, 3);
  assert.equal(resultado.restantesHoje, 2);
  assert.equal(resultado.concluidosMes, 2);
  assert.equal(resultado.cancelamentosMes, 1);
  assert.equal(resultado.clientesAtendidosMes, 2);
  assert.deepEqual(resultado.evolucao, [{ dia: "23", quantidade: 1 }, { dia: "24", quantidade: 1 }]);
  assert.deepEqual(resultado.servicosMaisRealizados, [
    { servicoId: "s1", nome: "Corte", quantidade: 1, valor: 50 },
    { servicoId: "legado", nome: "Legado", quantidade: 1, valor: 80 },
  ]);
  assert.equal(resultado.estadosMes.cancelado, 1);
});

const item = (servicoId, servicoNome, valorUnitario) => ({
  servicoId, servicoNome, duracaoMinutos: 30, valorUnitario,
});

test("ranking expande servicos sem multiplicar atendimentos nem receita", () => {
  const concluidos = [
    {
      id: "multi-1", data: hoje, status: "concluido", clienteId: "c1",
      servicosSnapshot: [item("a", "Troca de oleo", 150), item("b", "Alinhamento", 120)],
      valorTotalServicos: 270,
    },
    {
      id: "multi-2", data: hoje, status: "concluido", clienteId: "c2",
      servicosSnapshot: [item("a", "Troca de oleo", 150), item("c", "Balanceamento", 100)],
      valorTotalServicos: 250,
    },
    {
      id: "multi-3", data: hoje, status: "concluido", clienteId: "c3",
      servicosSnapshot: [item("b", "Alinhamento", 120)],
      valorTotalServicos: 120,
    },
  ];
  const resultado = calcularDashboardClientes({
    agendamentos: concluidos,
    contasReceber: [{
      origem: { tipo: "atendimento" },
      status: "recebido",
      valor: 640,
      pagamento: { dataRecebimento: hoje },
    }],
    hoje,
    agoraMinutos: 0,
  });

  assert.equal(resultado.concluidosMes, 3);
  assert.deepEqual(resultado.servicosMaisRealizados, [
    { servicoId: "b", nome: "Alinhamento", quantidade: 2, valor: 240 },
    { servicoId: "a", nome: "Troca de oleo", quantidade: 2, valor: 300 },
    { servicoId: "c", nome: "Balanceamento", quantidade: 1, valor: 100 },
  ]);
  assert.equal(resultado.servicosMaisRealizados.reduce((total, servico) => total + servico.valor, 0), 640);
  assert.equal(concluidos.reduce((total, agendamento) => total + agendamento.valorTotalServicos, 0), 640);
  assert.equal(resultado.financeiro.recebidoMes, 640);
  assert.equal(resultado.financeiro.recebimentosMes, 1);
});

test("ranking suporta novo formato com um, dois e tres itens e legado singular", () => {
  const ranking = agruparServicosRealizados([
    { servicosSnapshot: [item("a", "A", 10)] },
    { servicosSnapshot: [item("a", "A", 10), item("b", "B", 20)] },
    { servicosSnapshot: [item("a", "A", 10), item("b", "B", 20), item("c", "C", 30)] },
    { servicoId: "legado", servicoNome: "Legado", duracaoMinutos: 45, valorServico: 40 },
  ]);

  assert.deepEqual(ranking, [
    { servicoId: "a", nome: "A", quantidade: 3, valor: 30 },
    { servicoId: "b", nome: "B", quantidade: 2, valor: 40 },
    { servicoId: "c", nome: "C", quantidade: 1, valor: 30 },
    { servicoId: "legado", nome: "Legado", quantidade: 1, valor: 40 },
  ]);
});

test("ranking segue fallback canonico quando snapshot novo e invalido", () => {
  const ranking = agruparServicosRealizados([{
    servicosSnapshot: [{ ...item("novo", "Invalido", 10), valorUnitario: -1 }],
    servicoId: "legado",
    servicoNome: "Fallback legado",
    duracaoMinutos: 60,
    valorServico: 75,
  }]);

  assert.deepEqual(ranking, [{
    servicoId: "legado", nome: "Fallback legado", quantidade: 1, valor: 75,
  }]);
});

test("ranking preserva filtro mensal e considera somente atendimentos concluidos", () => {
  const resultado = calcularDashboardClientes({
    agendamentos: [
      { id: "fora", data: "2026-08-31", status: "concluido", servicosSnapshot: [item("a", "A", 10)] },
      { id: "aberto", data: hoje, status: "confirmado", servicosSnapshot: [item("b", "B", 20)] },
      { id: "valido", data: hoje, status: "concluido", servicosSnapshot: [item("c", "C", 30)] },
    ],
    hoje,
    agoraMinutos: 0,
  });

  assert.equal(resultado.concluidosMes, 1);
  assert.deepEqual(resultado.servicosMaisRealizados, [
    { servicoId: "c", nome: "C", quantidade: 1, valor: 30 },
  ]);
});

test("estados vazios e valores ausentes permanecem seguros", () => {
  const resultado = calcularDashboardClientes({ hoje, agoraMinutos: 0 });
  assert.equal(resultado.totalHoje, 0);
  assert.equal(resultado.proximoAtendimento, null);
  assert.equal(resultado.financeiro.aReceber, 0);
  assert.equal(Number.isNaN(resultado.financeiro.ticketMedioRecebido), false);
  assert.deepEqual(resultado.servicosMaisRealizados, []);
});

test("Rules alinham leitura financeira do Dashboard com o perfil financeiro", () => {
  assert.match(
    firestoreRules,
    /modulo == "financeiro"\s*&&\s*isCompanyRole\(role, perfil, \["financeiro"\]\)/,
  );
  assert.match(
    firestoreRules,
    /match \/contasReceber\/\{contaId\}[\s\S]*?isCompanySegment\(userId, empresaId, "clientes"\)[\s\S]*?canReadModule\(userId, empresaId, "financeiro"\)/,
  );
  assert.match(
    firestoreRules,
    /match \/agendaControles\/\{dataControle\}\s*\{\s*allow read, write: if false;/,
  );
});
