const test = require("node:test");
const assert = require("node:assert/strict");
const {
  agendamentosConflitam,
  calcularDuracaoTotalServicos,
  calcularValorTotalServicos,
  existeConflitoAgenda,
  montarSnapshotCliente,
  montarSnapshotServico,
  normalizarServicosAgendamento,
  possuiServicosDuplicados,
  resumirServicosAgendamento,
  validarIntervaloAgenda,
} = require("../agendaOperacional.cjs");

const servicosSnapshot = [
  { servicoId: "a", servicoNome: "Troca de óleo", duracaoMinutos: 60, valorUnitario: 150 },
  { servicoId: "b", servicoNome: "Alinhamento", duracaoMinutos: 45, valorUnitario: 120.5 },
  { servicoId: "c", servicoNome: "Balanceamento", duracaoMinutos: 0, valorUnitario: 0 },
];

test("normaliza modelo novo e adapta legado sem mutacao", () => {
  assert.deepEqual(normalizarServicosAgendamento({ servicosSnapshot }), servicosSnapshot);
  const legado = { servicoId: "l", servicoNome: "Legado", valorServico: 80, duracaoMinutos: 30 };
  assert.deepEqual(normalizarServicosAgendamento(legado), [
    { servicoId: "l", servicoNome: "Legado", valorUnitario: 80, duracaoMinutos: 30 },
  ]);
  assert.equal(Object.hasOwn(legado, "servicosSnapshot"), false);
});

test("modelo novo valido prevalece e invalido recorre ao legado", () => {
  const legado = { servicoId: "l", servicoNome: "Legado", valorServico: 80, duracaoMinutos: 30 };
  assert.deepEqual(normalizarServicosAgendamento({ ...legado, servicosSnapshot }), servicosSnapshot);
  assert.deepEqual(normalizarServicosAgendamento({ ...legado, servicosSnapshot: [] }), [
    { servicoId: "l", servicoNome: "Legado", valorUnitario: 80, duracaoMinutos: 30 },
  ]);
  assert.deepEqual(normalizarServicosAgendamento({
    ...legado, servicosSnapshot: [{ servicoId: "x", servicoNome: "Inválido", duracaoMinutos: 1, valorUnitario: -1 }],
  }), [{ servicoId: "l", servicoNome: "Legado", valorUnitario: 80, duracaoMinutos: 30 }]);
  assert.deepEqual(normalizarServicosAgendamento({ servicosSnapshot: [] }), []);
});

test("duplicidade invalida o snapshot e nunca concatena com legado", () => {
  const duplicados = [servicosSnapshot[0], { ...servicosSnapshot[1], servicoId: "a" }];
  assert.equal(possuiServicosDuplicados(duplicados), true);
  assert.equal(possuiServicosDuplicados(servicosSnapshot), false);
  assert.deepEqual(normalizarServicosAgendamento({ servicosSnapshot: duplicados }), []);
});

test("agrega zero, decimais e duracao sugerida separadamente", () => {
  assert.equal(calcularValorTotalServicos(servicosSnapshot), 270.5);
  assert.equal(calcularDuracaoTotalServicos(servicosSnapshot), 105);
  assert.equal(calcularValorTotalServicos([]), 0);
  assert.equal(calcularDuracaoTotalServicos([]), 0);
  assert.equal(calcularValorTotalServicos([{ ...servicosSnapshot[0], valorUnitario: Infinity }]), null);
  assert.equal(calcularDuracaoTotalServicos([{ ...servicosSnapshot[0], duracaoMinutos: 1.5 }]), null);
});

test("resume listas sem alterar os snapshots", () => {
  assert.equal(resumirServicosAgendamento([servicosSnapshot[0]]), "Troca de óleo");
  assert.equal(resumirServicosAgendamento(servicosSnapshot.slice(0, 2)), "Troca de óleo + 1 serviço");
  assert.equal(resumirServicosAgendamento(servicosSnapshot), "Troca de óleo + 2 serviços");
  assert.equal(resumirServicosAgendamento([]), "");
});

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
