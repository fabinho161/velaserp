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
  obterMarcoTransicaoAgendamento,
  montarAtualizacaoStatusAgendamento,
  podeEditarDadosAgendamento,
  podeTransicionarStatusAgendamento,
  sugerirHoraFim,
  transicoesPermitidasAgendamento,
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

test("congela dados fiscais explicitos do servico e preserva legado", () => {
  const servico = { id: "s", nome: "Consulta", valor: 100, fiscal: {
    codigoTributacaoNacional: "001234", codigoTributacaoMunicipal: "", nbs: "", descricaoFiscal: "Consulta",
  } };
  const snapshot = obterSnapshotServicoAgendamento(null, servico);
  assert.equal(snapshot.servicoFiscalSnapshot.codigoTributacaoNacional, "001234");
  servico.fiscal.codigoTributacaoNacional = "999999";
  assert.equal(snapshot.servicoFiscalSnapshot.codigoTributacaoNacional, "001234");
  assert.deepEqual(obterSnapshotServicoAgendamento(snapshot, servico), snapshot);
  const legado = obterSnapshotServicoAgendamento(null, { id: "l", nome: "Legado", valor: 0 });
  assert.equal("servicoFiscalSnapshot" in legado, false);
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

test("permite somente as transições operacionais explícitas", () => {
  assert.deepEqual(transicoesPermitidasAgendamento("agendado"), [
    "confirmado", "em_atendimento", "concluido", "cancelado",
  ]);
  assert.deepEqual(transicoesPermitidasAgendamento("confirmado"), [
    "em_atendimento", "concluido", "cancelado",
  ]);
  assert.deepEqual(transicoesPermitidasAgendamento("em_atendimento"), [
    "concluido", "cancelado",
  ]);
  for (const [de, para] of [
    ["agendado", "confirmado"], ["agendado", "em_atendimento"],
    ["agendado", "concluido"], ["agendado", "cancelado"],
    ["confirmado", "em_atendimento"], ["confirmado", "concluido"],
    ["confirmado", "cancelado"], ["em_atendimento", "concluido"],
    ["em_atendimento", "cancelado"],
  ]) assert.equal(podeTransicionarStatusAgendamento(de, para), true);
});

test("rejeita retrocessos, terminais e status desconhecido", () => {
  for (const [de, para] of [
    ["confirmado", "agendado"], ["em_atendimento", "confirmado"],
    ["em_atendimento", "agendado"], ["concluido", "agendado"],
    ["concluido", "cancelado"], ["cancelado", "concluido"],
    ["cancelado", "agendado"], ["desconhecido", "concluido"],
  ]) assert.equal(podeTransicionarStatusAgendamento(de, para), false);
  assert.deepEqual(transicoesPermitidasAgendamento("concluido"), []);
  assert.deepEqual(transicoesPermitidasAgendamento("cancelado"), []);
  assert.deepEqual(transicoesPermitidasAgendamento("desconhecido"), []);
});

test("cada transição produz apenas seu marco próprio", () => {
  assert.equal(obterMarcoTransicaoAgendamento("agendado", "confirmado"), "confirmadoEm");
  assert.equal(obterMarcoTransicaoAgendamento("agendado", "em_atendimento"), "iniciadoEm");
  assert.equal(obterMarcoTransicaoAgendamento("confirmado", "em_atendimento"), "iniciadoEm");
  assert.equal(obterMarcoTransicaoAgendamento("confirmado", "concluido"), "concluidoEm");
  assert.equal(obterMarcoTransicaoAgendamento("agendado", "concluido"), "concluidoEm");
  assert.equal(obterMarcoTransicaoAgendamento("em_atendimento", "cancelado"), "canceladoEm");
  assert.equal(obterMarcoTransicaoAgendamento("concluido", "cancelado"), null);
});

test("patch de status registra só o marco ocorrido e não sobrescreve marco existente", () => {
  const timestamp = { servidor: true };
  assert.deepEqual(montarAtualizacaoStatusAgendamento(
    { status: "agendado" }, "em_atendimento", timestamp
  ), { status: "em_atendimento", iniciadoEm: timestamp, atualizadoEm: timestamp });
  assert.deepEqual(montarAtualizacaoStatusAgendamento(
    { status: "confirmado", confirmadoEm: "anterior" }, "concluido", timestamp
  ), { status: "concluido", concluidoEm: timestamp, atualizadoEm: timestamp });
  assert.equal(montarAtualizacaoStatusAgendamento(
    { status: "agendado", confirmadoEm: "anterior" }, "confirmado", timestamp
  ), null);
});

test("edição operacional é bloqueada em estados terminais e em atendimento", () => {
  assert.equal(podeEditarDadosAgendamento("agendado"), true);
  assert.equal(podeEditarDadosAgendamento("confirmado"), true);
  assert.equal(podeEditarDadosAgendamento("em_atendimento"), false);
  assert.equal(podeEditarDadosAgendamento("concluido"), false);
  assert.equal(podeEditarDadosAgendamento("cancelado"), false);
  assert.equal(podeEditarDadosAgendamento("desconhecido"), false);
});

test("legados terminais sem marco continuam legíveis e sem ações", () => {
  for (const status of ["concluido", "cancelado"]) {
    const legado = { horaInicio: "14:00", status };
    assert.equal(normalizarStatusAgendamento(legado.status), status);
    assert.deepEqual(transicoesPermitidasAgendamento(legado.status), []);
    assert.equal(obterHoraFimAgendamento(legado), "");
  }
});
