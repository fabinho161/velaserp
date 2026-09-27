const test = require("node:test");
const assert = require("node:assert/strict");
const {
  formatarDataCivil,
  formatarDuracao,
  montarConteudoConfirmacaoAgendamento,
} = require("../emailAgendamentos");

test("template de confirmacao suporta agendamento legado e escapa HTML", () => {
  const conteudo = montarConteudoConfirmacaoAgendamento({
    nomeEmpresa: "Oficina <Central>",
    agendamento: {
      clienteNome: "Joao & Filhos",
      servicoId: "s1",
      servicoNome: "Troca <oleo>",
      valorServico: 150,
      duracaoMinutos: 60,
      data: "2026-09-27",
      horaInicio: "09:00",
      horaFim: "10:00",
    },
  });

  assert.match(conteudo.assunto, /Oficina <Central>/);
  assert.match(conteudo.texto, /Troca <oleo>/);
  assert.match(conteudo.texto, /27\/09\/2026/);
  assert.match(conteudo.html, /Oficina &lt;Central&gt;/);
  assert.match(conteudo.html, /Troca &lt;oleo&gt;/);
  assert.doesNotMatch(conteudo.html, /R\$|150/);
});

test("template de confirmacao lista todos os snapshots multisservico na ordem historica", () => {
  const conteudo = montarConteudoConfirmacaoAgendamento({
    nomeEmpresa: "Empresa",
    agendamento: {
      clienteNome: "Cliente",
      servicosSnapshot: [
        { servicoId: "a", servicoNome: "Troca de oleo", duracaoMinutos: 60, valorUnitario: 150 },
        { servicoId: "b", servicoNome: "Alinhamento", duracaoMinutos: 45, valorUnitario: 120 },
      ],
      duracaoMinutos: 105,
      data: "2026-09-27",
      horaInicio: "14:00",
      horaFim: "15:45",
    },
  });

  assert.ok(conteudo.texto.indexOf("Troca de oleo") < conteudo.texto.indexOf("Alinhamento"));
  assert.match(conteudo.html, /<li>Troca de oleo<\/li><li>Alinhamento<\/li>/);
  assert.match(conteudo.texto, /1h45/);
});

test("formatadores preservam data civil e duracao operacional", () => {
  assert.equal(formatarDataCivil("2026-01-02"), "02/01/2026");
  assert.equal(formatarDuracao(45), "45min");
  assert.equal(formatarDuracao(120), "2h");
});
