import assert from "node:assert/strict";
import test from "node:test";

import { existeConflitoAgendamento } from "../agenda.js";

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
