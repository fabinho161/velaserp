import assert from "node:assert/strict";
import test from "node:test";

import {
  adicionarServicoId,
  agendamentosSobrepostos,
  calcularDuracaoAgendamento,
  calcularDuracaoTotalServicos,
  calcularResumoAgenda,
  calcularValorTotalServicos,
  compararAgendamentosPorHorario,
  existeConflitoAgendamento,
  filtrarAgendamentoPorVisao,
  horarioParaMinutos,
  isAtendimentoAntigoEmAberto,
  normalizarStatusAgendamento,
  normalizarServicosAgendamento,
  obterAcaoPrincipalAgenda,
  obterDataLocalISO,
  obterHoraFimAgendamento,
  obterHoraFimAutomaticaServicos,
  obterIntervaloAgendamento,
  obterServicosFormulario,
  obterSnapshotServicoAgendamento,
  obterTextoBuscaServicos,
  obterValorTotalAgendamento,
  obterMarcoTransicaoAgendamento,
  montarAtualizacaoStatusAgendamento,
  montarPayloadAgendamento,
  montarSelecaoServicosApi,
  podeEditarDadosAgendamento,
  podeTransicionarStatusAgendamento,
  possuiServicosDuplicados,
  removerServicoId,
  resumirServicosAgendamento,
  sugerirHoraFim,
  transicoesPermitidasAgendamento,
} from "../agenda.js";

const servicosSnapshot = [
  { servicoId: "a", servicoNome: "Troca de óleo", duracaoMinutos: 60, valorUnitario: 150 },
  { servicoId: "b", servicoNome: "Alinhamento", duracaoMinutos: 45, valorUnitario: 120.5 },
  { servicoId: "c", servicoNome: "Balanceamento", duracaoMinutos: 0, valorUnitario: 0 },
];

test("normaliza snapshots novos de um ou varios servicos", () => {
  assert.deepEqual(normalizarServicosAgendamento({ servicosSnapshot: [servicosSnapshot[0]] }), [servicosSnapshot[0]]);
  assert.deepEqual(normalizarServicosAgendamento({ servicosSnapshot: servicosSnapshot.slice(0, 2) }), servicosSnapshot.slice(0, 2));
  assert.deepEqual(normalizarServicosAgendamento({ servicosSnapshot }), servicosSnapshot);
});

test("adapta documento legado em memoria sem alterar a origem", () => {
  const legado = { servicoId: "srv1", servicoNome: "Consulta", valorServico: 100, duracaoMinutos: 60 };
  const original = structuredClone(legado);
  assert.deepEqual(normalizarServicosAgendamento(legado), [
    { servicoId: "srv1", servicoNome: "Consulta", valorUnitario: 100, duracaoMinutos: 60 },
  ]);
  assert.deepEqual(legado, original);
  assert.equal(Object.hasOwn(legado, "servicosSnapshot"), false);
});

test("snapshot novo valido prevalece sobre campos legados sem concatenacao", () => {
  const resultado = normalizarServicosAgendamento({
    servicosSnapshot: servicosSnapshot.slice(0, 2),
    servicoId: "legado", servicoNome: "Legado", valorServico: 999, duracaoMinutos: 999,
  });
  assert.deepEqual(resultado, servicosSnapshot.slice(0, 2));
  assert.equal(resultado.some((item) => item.servicoId === "legado"), false);
});

test("snapshot novo invalido ou vazio usa legado valido como fallback seguro", () => {
  const legado = { servicoId: "l", servicoNome: "Legado", valorServico: 80, duracaoMinutos: 30 };
  assert.deepEqual(normalizarServicosAgendamento({ ...legado, servicosSnapshot: [] }), [
    { servicoId: "l", servicoNome: "Legado", valorUnitario: 80, duracaoMinutos: 30 },
  ]);
  assert.deepEqual(normalizarServicosAgendamento({
    ...legado, servicosSnapshot: [{ servicoId: "x", servicoNome: "Inválido", duracaoMinutos: -1, valorUnitario: 10 }],
  }), [{ servicoId: "l", servicoNome: "Legado", valorUnitario: 80, duracaoMinutos: 30 }]);
  assert.deepEqual(normalizarServicosAgendamento({ servicosSnapshot: [] }), []);
});

test("detecta IDs duplicados e nao aceita parcialmente o snapshot", () => {
  const duplicados = [servicosSnapshot[0], { ...servicosSnapshot[1], servicoId: "a" }];
  assert.equal(possuiServicosDuplicados(duplicados), true);
  assert.equal(possuiServicosDuplicados(servicosSnapshot), false);
  assert.deepEqual(normalizarServicosAgendamento({ servicosSnapshot: duplicados }), []);
});

test("totaliza valores e duracoes sugeridas sem alterar duracao operacional", () => {
  assert.equal(calcularValorTotalServicos(servicosSnapshot), 270.5);
  assert.equal(calcularDuracaoTotalServicos(servicosSnapshot), 105);
  assert.equal(calcularValorTotalServicos([]), 0);
  assert.equal(calcularDuracaoTotalServicos([]), 0);
  assert.equal(calcularValorTotalServicos([{ ...servicosSnapshot[0], valorUnitario: NaN }]), null);
  assert.equal(calcularDuracaoTotalServicos([{ ...servicosSnapshot[0], duracaoMinutos: -1 }]), null);
  assert.equal(calcularDuracaoAgendamento("09:00", "11:30"), 150);
});

test("valores monetarios de borda preservam a politica numerica existente", () => {
  const valores = [0, 0.01, 10.10, 99.99].map((valorUnitario, indice) => ({
    servicoId: `s${indice}`,
    servicoNome: `Servico ${indice}`,
    duracaoMinutos: indice,
    valorUnitario,
  }));
  assert.equal(calcularValorTotalServicos(valores), 110.1);
  for (const valorUnitario of [NaN, Infinity, -0.01, "10.10", undefined]) {
    assert.equal(calcularValorTotalServicos([{ ...valores[0], valorUnitario }]), null);
  }
  for (const duracaoMinutos of [-1, 1.5, undefined]) {
    assert.equal(calcularDuracaoTotalServicos([{ ...valores[0], duracaoMinutos }]), null);
  }
});

test("hora automatica rejeita virada de dia e intervalo operacional invertido", () => {
  assert.equal(sugerirHoraFim("23:30", 60), "");
  assert.equal(obterHoraFimAutomaticaServicos({ horaInicio: "23:30" }, 60, true), "");
  assert.equal(calcularDuracaoAgendamento("23:30", "00:30"), null);
  assert.equal(calcularDuracaoAgendamento("10:00", "10:00"), null);
});

test("resume um, dois e tres ou mais servicos", () => {
  assert.equal(resumirServicosAgendamento([servicosSnapshot[0]]), "Troca de óleo");
  assert.equal(resumirServicosAgendamento(servicosSnapshot.slice(0, 2)), "Troca de óleo + 1 serviço");
  assert.equal(resumirServicosAgendamento(servicosSnapshot), "Troca de óleo + 2 serviços");
  assert.equal(resumirServicosAgendamento([]), "");
});

test("seleciona um, dois e tres servicos sem permitir duplicidade", () => {
  let ids = adicionarServicoId([], "a");
  assert.deepEqual(ids, ["a"]);
  ids = adicionarServicoId(ids, "b");
  assert.deepEqual(ids, ["a", "b"]);
  ids = adicionarServicoId(ids, "c");
  assert.deepEqual(ids, ["a", "b", "c"]);
  assert.deepEqual(adicionarServicoId(ids, "b"), ids);
  assert.deepEqual(removerServicoId(ids, "b"), ["a", "c"]);
  assert.deepEqual(removerServicoId(["a"], "a"), []);
});

test("formulario combina snapshots historicos e servicos atuais preservando ordem", () => {
  const agendamento = { servicosSnapshot: [servicosSnapshot[0], servicosSnapshot[1]] };
  const servicos = [
    { id: "a", nome: "Nome atual ignorado", valor: 999, tempoEstimadoMinutos: 10 },
    { id: "c", nome: "Balanceamento", valor: 100, tempoEstimadoMinutos: 30 },
  ];
  assert.deepEqual(obterServicosFormulario({
    servicoIds: ["a", "c"], servicos, agendamento,
  }), [
    servicosSnapshot[0],
    { servicoId: "c", servicoNome: "Balanceamento", duracaoMinutos: 30, valorUnitario: 100 },
  ]);
});

test("hora final automatica acompanha composicao e modo manual preserva escolha", () => {
  const form = { horaInicio: "14:00", horaFim: "16:00" };
  assert.equal(obterHoraFimAutomaticaServicos(form, 60, true), "15:00");
  assert.equal(obterHoraFimAutomaticaServicos(form, 105, true), "15:45");
  assert.equal(obterHoraFimAutomaticaServicos(form, 45, false), "16:00");
  assert.equal(obterHoraFimAutomaticaServicos(form, 0, false), "16:00");
  assert.equal(calcularDuracaoAgendamento(form.horaInicio, form.horaFim), 120);
});

test("payload de API preserva legado inalterado e usa servicoIds para nova composicao", () => {
  const legado = { servicoId: "a", servicoNome: "Antigo", valorServico: 100, duracaoMinutos: 60 };
  assert.deepEqual(montarSelecaoServicosApi({ agendamento: legado, servicoIds: ["a"] }), { servicoId: "a" });
  assert.deepEqual(montarSelecaoServicosApi({ agendamento: legado, servicoIds: ["a", "b"] }), {
    servicoIds: ["a", "b"],
  });
  assert.deepEqual(montarSelecaoServicosApi({ servicoIds: ["a"] }), { servicoIds: ["a"] });
  assert.deepEqual(montarSelecaoServicosApi({
    agendamento: { servicosSnapshot: [servicosSnapshot[0], servicosSnapshot[1]] },
    servicoIds: ["a", "b"],
  }), { servicoIds: ["a", "b"] });
});

test("busca encontra qualquer servico e valor da tabela prioriza total valido", () => {
  const novo = { servicosSnapshot, valorTotalServicos: 270.5, valorServico: 999 };
  assert.match(obterTextoBuscaServicos(novo), /Alinhamento/);
  assert.match(obterTextoBuscaServicos(novo), /Balanceamento/);
  assert.equal(obterValorTotalAgendamento(novo), 270.5);
  assert.equal(obterValorTotalAgendamento({ valorServico: 100 }), 100);
  assert.equal(obterValorTotalAgendamento({ valorTotalServicos: -1, valorServico: 80 }), 80);
});

test("payload local multisservico calcula previa sem substituir duracao reservada", () => {
  const form = {
    clienteId: "c", servicoIds: ["a", "b"], data: "2026-09-25",
    horaInicio: "14:00", horaFim: "16:00", observacoes: "",
  };
  const selecionados = servicosSnapshot.slice(0, 2);
  const payload = montarPayloadAgendamento({
    form, cliente: { id: "c", nome: "Cliente" }, servicosSelecionados: selecionados,
  });
  assert.deepEqual(payload.servicosSnapshot, selecionados);
  assert.equal(payload.valorTotalServicos, 270.5);
  assert.equal(payload.duracaoTotalServicos, 105);
  assert.equal(payload.duracaoMinutos, 120);
});

const existente = {
  id: "agenda-1",
  data: "2026-09-04",
  horaInicio: "10:00",
  duracaoMinutos: 60,
  status: "agendado",
};

test("formata hoje pela data civil local sem depender de UTC", () => {
  assert.equal(obterDataLocalISO(new Date(2026, 8, 25, 23, 30)), "2026-09-25");
});

test("filtros rapidos cobrem Todos, Hoje, Proximos e Em atendimento", () => {
  const hoje = "2026-09-25";
  const hojeAgendado = { data: hoje, status: "agendado" };
  const futuroConfirmado = { data: "2026-09-26", status: "confirmado" };
  const futuroConcluido = { data: "2026-09-26", status: "concluido" };
  const antigoEmAtendimento = { data: "2026-09-24", status: "em_atendimento" };

  assert.equal(filtrarAgendamentoPorVisao(futuroConcluido, "todos", hoje), true);
  assert.equal(filtrarAgendamentoPorVisao(hojeAgendado, "hoje", hoje), true);
  assert.equal(filtrarAgendamentoPorVisao(futuroConfirmado, "proximos", hoje), true);
  assert.equal(filtrarAgendamentoPorVisao(futuroConcluido, "proximos", hoje), false);
  assert.equal(filtrarAgendamentoPorVisao(antigoEmAtendimento, "em_atendimento", hoje), true);
});

test("resumo calcula cards Confirmados e Cancelados e proximos somente operacionais", () => {
  const resumo = calcularResumoAgenda([
    { data: "2026-09-25", status: "agendado" },
    { data: "2026-09-26", status: "confirmado" },
    { data: "2026-09-26", status: "concluido" },
    { data: "2026-09-24", status: "cancelado" },
  ], "2026-09-25");

  assert.deepEqual(resumo, { hoje: 1, confirmados: 1, proximos: 2, cancelados: 1 });
});

test("identifica atendimento antigo ainda em aberto", () => {
  assert.equal(isAtendimentoAntigoEmAberto(
    { data: "2026-09-24", status: "em_atendimento" },
    "2026-09-25",
  ), true);
  assert.equal(isAtendimentoAntigoEmAberto(
    { data: "2026-09-24", status: "concluido" },
    "2026-09-25",
  ), false);
});

test("acao principal segue fluxo operacional e respeita somente leitura", () => {
  assert.deepEqual(obterAcaoPrincipalAgenda("agendado", true), {
    tipo: "transicao", proximoStatus: "confirmado", label: "Confirmar", processando: "Confirmando...",
  });
  assert.equal(obterAcaoPrincipalAgenda("confirmado", true).proximoStatus, "em_atendimento");
  assert.equal(obterAcaoPrincipalAgenda("em_atendimento", true).proximoStatus, "concluido");
  assert.equal(obterAcaoPrincipalAgenda("concluido", true).tipo, "visualizar");
  assert.equal(obterAcaoPrincipalAgenda("cancelado", true).tipo, "visualizar");
  assert.equal(obterAcaoPrincipalAgenda("agendado", false).tipo, "visualizar");
});

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

test("snapshot operacional nao produz dados fiscais", () => {
  const servico = { id: "s", nome: "Consulta", valor: 100, fiscal: {
    codigoTributacaoNacional: "001234", codigoTributacaoMunicipal: "", nbs: "", descricaoFiscal: "Consulta",
  } };
  const snapshot = obterSnapshotServicoAgendamento(null, servico);
  assert.equal(Object.hasOwn(snapshot, "servicoFiscalSnapshot"), false);
  const legado = obterSnapshotServicoAgendamento(null, { id: "l", nome: "Legado", valor: 0 });
  assert.equal("servicoFiscalSnapshot" in legado, false);
});

test("payload novo nunca contem undefined em campos opcionais aninhados", () => {
  const form = {
    clienteId: "c", servicoId: "s", data: "2026-09-20", horaInicio: "10:00", horaFim: "11:00",
    observacoes: "", localPrestacaoCodigoMunicipio: "", localPrestacaoMunicipio: "", localPrestacaoUf: "",
  };
  const cliente = { id: "c", nome: "Cliente" };
  const valorIndefinido = (valor, caminho = "payload") => {
    assert.notEqual(valor, undefined, caminho);
    if (valor && typeof valor === "object") {
      for (const [chave, interno] of Object.entries(valor)) valorIndefinido(interno, `${caminho}.${chave}`);
    }
  };

  for (const fiscal of [undefined, { codigoTributacaoNacional: "001234" }]) {
    const servico = { id: "s", nome: "Consulta", valor: 100, ...(fiscal ? { fiscal } : {}) };
    const payload = montarPayloadAgendamento({ form, cliente, servico });
    assert.ok(payload);
    valorIndefinido(payload);
    assert.equal("localPrestacao" in payload, false);
    assert.equal("servicoFiscalSnapshot" in payload, false);
  }
  assert.equal(montarPayloadAgendamento({ form, cliente, servico: { nome: "Sem ID", valor: 100 } }), null);
  assert.equal(montarPayloadAgendamento({ form, servico: { id: "s", nome: "Consulta", valor: 100 } }), null);
});

test("snapshot fiscal legado nao e repassado na edicao operacional", () => {
  const agendamento = {
    servicoId: "s", servicoNome: "Consulta", valorServico: 100,
    servicoFiscalSnapshot: { versao: 1, codigoTributacaoNacional: "001234", nbs: undefined },
  };
  const snapshot = obterSnapshotServicoAgendamento(agendamento, { id: "s" });
  assert.equal("servicoFiscalSnapshot" in snapshot, false);
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
