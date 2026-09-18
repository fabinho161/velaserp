import assert from "node:assert/strict";
import test from "node:test";

import {
  agendamentosSobrepostos,
  calcularDuracaoAgendamento,
  compararAgendamentosPorHorario,
  existeConflitoAgendamento,
  horarioParaMinutos,
  normalizarStatusAgendamento,
  obterHoraFimAgendamento,
  obterIntervaloAgendamento,
  obterSnapshotServicoAgendamento,
  sugerirHoraFim,
} from "../agenda.js";

const existente = {
  id: "agenda-1",
  data: "2026-09-04",
  horaInicio: "10:00",
  duracaoMinutos: 60,
  status: "agendado",
};

test("nao identifica conflito quando horarios nao se sobrepoem", () => {
  assert.equal(
    existeConflitoAgendamento(
      { data: "2026-09-04", horaInicio: "11:00", duracaoMinutos: 30 },
      [existente]
    ),
    false
  );
});

test("identifica conflito no mesmo horario", () => {
  assert.equal(
    existeConflitoAgendamento(
      { data: "2026-09-04", horaInicio: "10:00", duracaoMinutos: 60 },
      [existente]
    ),
    true
  );
});

test("identifica sobreposicao parcial no inicio", () => {
  assert.equal(
    existeConflitoAgendamento(
      { data: "2026-09-04", horaInicio: "09:30", duracaoMinutos: 45 },
      [existente]
    ),
    true
  );
});

test("identifica sobreposicao parcial no fim", () => {
  assert.equal(
    existeConflitoAgendamento(
      { data: "2026-09-04", horaInicio: "10:30", duracaoMinutos: 60 },
      [existente]
    ),
    true
  );
});

test("identifica agendamento dentro de outro", () => {
  assert.equal(
    existeConflitoAgendamento(
      { data: "2026-09-04", horaInicio: "10:15", duracaoMinutos: 30 },
      [existente]
    ),
    true
  );
});

test("identifica outro agendamento dentro do novo", () => {
  assert.equal(
    existeConflitoAgendamento(
      { data: "2026-09-04", horaInicio: "09:30", duracaoMinutos: 120 },
      [existente]
    ),
    true
  );
});

test("ignora agendamento cancelado", () => {
  assert.equal(
    existeConflitoAgendamento(
      { data: "2026-09-04", horaInicio: "10:30", duracaoMinutos: 60 },
      [{ ...existente, status: "cancelado" }]
    ),
    false
  );
});

test("ignora documento atual ao editar", () => {
  assert.equal(
    existeConflitoAgendamento(
      { data: "2026-09-04", horaInicio: "10:00", duracaoMinutos: 60 },
      [existente],
      { ignorarId: "agenda-1" }
    ),
    false
  );
});

test("datas diferentes nao conflitam", () => {
  assert.equal(
    existeConflitoAgendamento(
      { data: "2026-09-05", horaInicio: "10:00", duracaoMinutos: 60 },
      [existente]
    ),
    false
  );
});

test("valida HH:MM e calcula duração sem atravessar meia-noite", () => {
  assert.equal(horarioParaMinutos("14:00"), 840);
  assert.equal(horarioParaMinutos("1:00"), null);
  assert.equal(horarioParaMinutos("24:00"), null);
  assert.equal(calcularDuracaoAgendamento("14:00", "16:30"), 150);
  assert.equal(calcularDuracaoAgendamento("14:00", "14:00"), null);
  assert.equal(calcularDuracaoAgendamento("16:00", "15:00"), null);
  assert.equal(calcularDuracaoAgendamento("23:00", "01:00"), null);
});

test("sugere fim por duração e mantém legado apenas em memória", () => {
  assert.equal(sugerirHoraFim("14:00", 90), "15:30");
  assert.equal(sugerirHoraFim("23:00", 90), "");
  assert.equal(obterHoraFimAgendamento({ horaInicio: "14:00", duracaoMinutos: 90 }), "15:30");
  assert.equal(obterHoraFimAgendamento({ horaInicio: "14:00" }), "");
  assert.equal(obterIntervaloAgendamento({ horaInicio: "14:00" }), null);
});

test("fim explícito prevalece sobre duração antiga no conflito", () => {
  const agendamento = { ...existente, horaFim: "12:00", duracaoMinutos: 30 };
  assert.deepEqual(obterIntervaloAgendamento(agendamento), { inicio: 600, fim: 720 });
  assert.equal(agendamentosSobrepostos(agendamento, {
    data: existente.data, horaInicio: "11:30", horaFim: "12:30",
  }), true);
  assert.equal(agendamentosSobrepostos(agendamento, {
    data: existente.data, horaInicio: "12:00", horaFim: "13:00",
  }), false);
  assert.equal(agendamentosSobrepostos(agendamento, {
    data: existente.data, horaInicio: "10:15", horaFim: "10:45",
  }), true);
});

test("preserva snapshot do mesmo serviço e recota somente na troca", () => {
  const antigo = { servicoId: "a", servicoNome: "Consulta", valorServico: 100 };
  assert.deepEqual(obterSnapshotServicoAgendamento(antigo, {
    id: "a", nome: "Consulta nova", valor: 120,
  }), antigo);
  assert.deepEqual(obterSnapshotServicoAgendamento(antigo, {
    id: "b", nome: "Retorno", valor: 80,
  }), { servicoId: "b", servicoNome: "Retorno", valorServico: 80 });
  assert.equal(calcularDuracaoAgendamento("14:00", "16:30"), 150);
  assert.deepEqual(obterSnapshotServicoAgendamento(antigo, { id: "a" }), antigo);
});

test("status legado é seguro e intervalo incompleto não gera conflito", () => {
  assert.equal(normalizarStatusAgendamento("desconhecido"), "agendado");
  assert.equal(agendamentosSobrepostos(
    { data: existente.data, horaInicio: "10:00" }, existente
  ), false);
});

test("ordena registros pela data e hora inicial sem depender da hora final", () => {
  const registros = [
    { data: "2026-09-05", horaInicio: "09:00" },
    { data: "2026-09-04", horaInicio: "16:00", horaFim: "17:00" },
    { data: "2026-09-04", horaInicio: "10:00" },
  ];
  assert.deepEqual([...registros].sort(compararAgendamentosPorHorario), [
    registros[2], registros[1], registros[0],
  ]);
});
