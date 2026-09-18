const test = require("node:test");
const assert = require("node:assert/strict");
const { idContaAtendimento, montarContaAtendimento } = require("../contasReceberServicos.cjs");

const agendamento = {
  status: "concluido", clienteId: "c1", clienteNome: "Cliente antigo",
  servicoNome: "Servico antigo", valorServico: 100, data: "2026-08-01",
};
const criar = (dados = {}) => montarContaAtendimento({
  agendamentoId: "a1", agendamento: { ...agendamento, ...dados },
  atorUid: "u1", timestamp: "timestamp",
});

test("conta pendente usa identidade e snapshots historicos do atendimento", () => {
  assert.equal(idContaAtendimento("a1"), "atendimento_a1");
  assert.deepEqual(criar(), {
    versao: 1, origem: { tipo: "atendimento", documentoId: "a1" },
    cliente: { clienteId: "c1", nome: "Cliente antigo" },
    descricao: "Servico antigo", valor: 100, dataCompetencia: "2026-08-01",
    status: "pendente", pagamento: null,
    criadoEm: "timestamp", criadoPor: "u1", atualizadoEm: "timestamp",
  });
});

test("estados nao concluidos nao geram conta", () => {
  for (const status of ["agendado", "confirmado", "em_atendimento", "cancelado"]) {
    assert.equal(criar({ status }), null);
  }
});

test("legado sem concluidoEm continua valido sem marco inventado", () => {
  assert.equal(Object.hasOwn(criar(), "concluidoEm"), false);
  assert.equal(criar({ concluidoEm: "marco" }).concluidoEm, "marco");
});

test("valor zero e gratuito; valor invalido nao gera obrigacao", () => {
  assert.equal(criar({ valorServico: 0 }), null);
  for (const valorServico of [-1, undefined, "100", NaN]) {
    assert.throws(() => criar({ valorServico }), /Valor historico/);
  }
  assert.throws(() => criar({ clienteId: "" }), /incompletos/);
});
