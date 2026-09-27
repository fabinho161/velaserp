const test = require("node:test");
const assert = require("node:assert/strict");
const {
  formatarDataCivil,
  formatarDuracao,
  montarConteudoConfirmacaoAgendamento,
  montarLinhasEnderecoEmpresa,
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

test("endereco estruturado completo aparece no texto e HTML", () => {
  const conteudo = montarConteudoConfirmacaoAgendamento({
    nomeEmpresa: "Minha empresa Teste",
    configuracaoEmpresa: {
      endereco: {
        cep: "75515390",
        logradouro: "Rua 7",
        numero: "2",
        complemento: "Casa",
        bairro: "S Rita",
        cidade: "Itumbiara",
        uf: "GO",
      },
    },
    agendamento: { clienteNome: "Cliente", servicoNome: "Servico" },
  });

  assert.match(conteudo.texto, /Endereço:\nRua 7, 2 — S Rita\nComplemento: Casa\nItumbiara\/GO — CEP 75515-390/);
  assert.match(conteudo.html, /Rua 7, 2 — S Rita<br \/>Complemento: Casa<br \/>Itumbiara\/GO — CEP 75515-390/);
});

test("endereco omite complemento e CEP ausentes sem gerar separadores vazios", () => {
  const linhas = montarLinhasEnderecoEmpresa({
    endereco: { logradouro: "Rua A", numero: "10", cidade: "Goiania", uf: "GO" },
  });

  assert.deepEqual(linhas, ["Rua A, 10", "Goiania/GO"]);
});

test("localidade estruturada suporta somente cidade ou somente UF", () => {
  assert.deepEqual(montarLinhasEnderecoEmpresa({ endereco: { cidade: "Itumbiara" } }), ["Itumbiara"]);
  assert.deepEqual(montarLinhasEnderecoEmpresa({ endereco: { uf: "go" } }), ["GO"]);
});

test("cidade legado funciona somente como fallback sem interpretar seu conteudo", () => {
  assert.deepEqual(montarLinhasEnderecoEmpresa({ cidade: "Itumbiara-GO" }), ["Itumbiara-GO"]);
  assert.deepEqual(montarLinhasEnderecoEmpresa({ cidade: "Legado", endereco: {} }), []);
});

test("empresa sem endereco omite secao e preserva template multisservico", () => {
  const conteudo = montarConteudoConfirmacaoAgendamento({
    nomeEmpresa: "Empresa",
    configuracaoEmpresa: {},
    agendamento: {
      clienteNome: "Cliente",
      servicosSnapshot: [
        { servicoId: "a", servicoNome: "Servico A", duracaoMinutos: 30, valorUnitario: 10 },
        { servicoId: "b", servicoNome: "Servico B", duracaoMinutos: 30, valorUnitario: 20 },
      ],
    },
  });

  assert.doesNotMatch(conteudo.texto, /Endereço:/);
  assert.match(conteudo.texto, /Servico A[\s\S]*Servico B/);
});
