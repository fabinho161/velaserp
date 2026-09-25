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

const servicosSnapshot = [
  { servicoId: "a", servicoNome: "Troca de oleo", duracaoMinutos: 60, valorUnitario: 150 },
  { servicoId: "b", servicoNome: "Alinhamento", duracaoMinutos: 45, valorUnitario: 120 },
  { servicoId: "c", servicoNome: "Balanceamento", duracaoMinutos: 45, valorUnitario: 100 },
];

test("multisservico cria uma conta com total, resumo e composicao historica ordenada", () => {
  for (const quantidade of [1, 2, 3]) {
    const itens = servicosSnapshot.slice(0, quantidade);
    const valorTotalServicos = itens.reduce((total, item) => total + item.valorUnitario, 0);
    const conta = criar({
      servicosSnapshot: itens,
      valorTotalServicos,
      valorServico: 999,
      servicoNome: "Compatibilidade que nao e fonte financeira",
    });
    assert.equal(conta.valor, valorTotalServicos);
    assert.equal(conta.descricao, quantidade === 1
      ? "Troca de oleo"
      : `Troca de oleo + ${quantidade - 1} ${quantidade === 2 ? "serviço" : "serviços"}`);
    assert.deepEqual(conta.servicosSnapshot, itens);
  }
});

test("snapshot da conta nao mantem referencia mutavel ao agendamento", () => {
  const itens = servicosSnapshot.slice(0, 2).map((item) => ({ ...item }));
  const conta = criar({ servicosSnapshot: itens, valorTotalServicos: 270 });
  itens[0].servicoNome = "Cadastro alterado depois";
  assert.equal(conta.servicosSnapshot[0].servicoNome, "Troca de oleo");
});

test("multisservico de valor zero conclui sem criar conta", () => {
  assert.equal(criar({
    servicosSnapshot: [{
      servicoId: "gratis", servicoNome: "Cortesia", duracaoMinutos: 30, valorUnitario: 0,
    }],
    valorTotalServicos: 0,
  }), null);
});

test("divergencia, snapshot invalido ou duplicado impedem cobranca silenciosa", () => {
  assert.throws(() => criar({ servicosSnapshot, valorTotalServicos: 999 }), /diverge/);
  assert.throws(() => criar({
    servicosSnapshot: [{ ...servicosSnapshot[0], valorUnitario: -1 }],
    valorTotalServicos: 150,
  }), /composicao historica/i);
  assert.throws(() => criar({
    servicosSnapshot: [servicosSnapshot[0], { ...servicosSnapshot[1], servicoId: "a" }],
    valorTotalServicos: 270,
  }), /composicao historica/i);
  assert.throws(() => criar({ servicosSnapshot: [], valorTotalServicos: 0 }), /composicao historica/i);
});
