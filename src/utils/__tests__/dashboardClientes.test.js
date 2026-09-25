import test from "node:test";
import assert from "node:assert/strict";
import {
  calcularDashboardClientes,
  obterAcoesRapidasDashboardClientes,
  obterAgendaHoje,
  obterProximoAtendimento,
  resumirFinanceiroDashboard,
  resolverTipoDashboard,
} from "../dashboardClientes.js";

const hoje = "2026-09-24";
const agenda = [
  { id: "1", data: hoje, horaInicio: "10:00", status: "confirmado", clienteId: "c1", servicoId: "s1", servicoNome: "Corte" },
  { id: "2", data: hoje, horaInicio: "09:00", status: "concluido", clienteId: "c1", servicoId: "s1", servicoNome: "Corte" },
  { id: "3", data: hoje, horaInicio: "11:00", status: "cancelado", clienteId: "c2", servicoId: "s2", servicoNome: "Consulta" },
  { id: "4", data: hoje, horaInicio: "14:00", status: "agendado", clienteId: "c3", servicoId: "s2", servicoNome: "Consulta" },
  { id: "5", data: "2026-09-23", horaInicio: "15:00", status: "concluido", clienteId: "c3", servicoNome: "Legado" },
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
    { servicoId: "s1", nome: "Corte", quantidade: 1 },
    { servicoId: null, nome: "Legado", quantidade: 1 },
  ]);
  assert.equal(resultado.estadosMes.cancelado, 1);
});

test("estados vazios e valores ausentes permanecem seguros", () => {
  const resultado = calcularDashboardClientes({ hoje, agoraMinutos: 0 });
  assert.equal(resultado.totalHoje, 0);
  assert.equal(resultado.proximoAtendimento, null);
  assert.equal(resultado.financeiro.aReceber, 0);
  assert.equal(Number.isNaN(resultado.financeiro.ticketMedioRecebido), false);
  assert.deepEqual(resultado.servicosMaisRealizados, []);
});
