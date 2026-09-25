const test = require("node:test");
const assert = require("node:assert/strict");
const {
  agendamentosConflitam,
  existeConflitoAgenda,
  montarSnapshotCliente,
  montarSnapshotServico,
  validarIntervaloAgenda,
} = require("../agendaOperacional.cjs");

const agenda = (horaInicio, horaFim, status = "agendado") => ({
  data: "2026-09-24", horaInicio, horaFim, status,
});

test("intervalos adjacentes nao conflitam", () => {
  assert.equal(agendamentosConflitam(agenda("09:00", "10:00"), agenda("10:00", "11:00")), false);
});

test("sobreposicoes parcial, contida, abrangente e igual conflitam", () => {
  for (const intervalo of [
    ["09:30", "10:30", "09:00", "10:00"],
    ["09:15", "09:45", "09:00", "10:00"],
    ["08:00", "11:00", "09:00", "10:00"],
    ["09:00", "10:00", "09:00", "10:00"],
  ]) {
    assert.equal(agendamentosConflitam(agenda(intervalo[0], intervalo[1]), agenda(intervalo[2], intervalo[3])), true);
  }
});

test("cancelado nao ocupa horario e edicao ignora o proprio id", () => {
  assert.equal(agendamentosConflitam(agenda("09:00", "10:00"), agenda("09:00", "10:00", "cancelado")), false);
  assert.equal(existeConflitoAgenda(agenda("09:00", "10:00"), [
    { id: "a1", ...agenda("09:00", "10:00") },
  ], "a1"), false);
});

test("valida data, horario, duracao positiva e coerencia", () => {
  assert.deepEqual(validarIntervaloAgenda({
    data: "2026-09-24", horaInicio: "09:00", horaFim: "10:30", duracaoMinutos: 90,
  }), { data: "2026-09-24", horaInicio: "09:00", horaFim: "10:30", duracaoMinutos: 90 });
  for (const invalido of [
    { data: "2026-02-30", horaInicio: "09:00", horaFim: "10:00", duracaoMinutos: 60 },
    { data: "2026-09-24", horaInicio: "10:00", horaFim: "09:00", duracaoMinutos: -60 },
    { data: "2026-09-24", horaInicio: "09:00", horaFim: "10:00", duracaoMinutos: 0 },
    { data: "2026-09-24", horaInicio: "09:00", horaFim: "10:00", duracaoMinutos: 30 },
  ]) assert.throws(() => validarIntervaloAgenda(invalido), { codigo: "agenda_intervalo_invalido" });
});

test("snapshots operacionais congelam clienteEmail opcional e servico", () => {
  assert.deepEqual(montarSnapshotCliente("c1", {
    nome: "Cliente", telefone: "1199", email: "cliente@exemplo.com",
  }), {
    clienteId: "c1", clienteNome: "Cliente", clienteTelefone: "1199", clienteEmail: "cliente@exemplo.com",
  });
  assert.equal(montarSnapshotCliente("c2", { nome: "Sem email" }).clienteEmail, "");
  assert.deepEqual(montarSnapshotServico("s1", { nome: "Consulta", valor: 150 }, 60), {
    servicoId: "s1", servicoNome: "Consulta", valorServico: 150, duracaoMinutos: 60,
  });
});

test("regra pura de conflito permanece deterministica antes do controle transacional", () => {
  const novo = agenda("09:00", "10:00");
  assert.equal(existeConflitoAgenda(novo, []), false);
  assert.equal(existeConflitoAgenda(novo, []), false);
});
