const test = require("node:test");
const assert = require("node:assert/strict");
const {
  criarHandlerConcluir, criarHandlerReceber, criarHandlerSincronizar,
} = require("../financeiroServicosRoutes");
const app = require("../../server");

test("POST final montado no servidor chega ao middleware de autenticacao", async () => {
  const server = app.listen(0);
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/financeiro/servicos/sincronizar`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    });
    assert.equal(response.status, 401);
    assert.match((await response.json()).error, /Token Firebase nao informado/);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

const criarBanco = ({ segmento = "clientes", role = "financeiro", ativo = true } = {}) => {
  const docs = new Map([
    ["users/owner/empresas/empresa", { segmento, ownerUid: "owner" }],
    ["users/owner/empresas/empresa/agendamentos/a1", {
      status: "em_atendimento", clienteId: "c1", clienteNome: "Historico",
      servicoNome: "Servico historico", valorServico: 120, data: "2026-09-01",
    }],
    ["usuariosPorAuth/guest/empresas/empresa", {
      ownerUid: "owner", status: ativo ? "ativo" : "inativo", usuarioEmpresaId: "m1",
    }],
    ["users/owner/empresas/empresa/usuariosEmpresa/m1", {
      uidAuth: "guest", status: ativo ? "ativo" : "inativo", role,
    }],
  ]);
  const ref = (path) => ({
    path, id: path.split("/").at(-1),
    collection: (name) => collection(`${path}/${name}`),
  });
  const collection = (path) => ({
    doc: (id) => ref(`${path}/${id}`),
    where: (_field, _op, value) => ({
      get: async () => ({ docs: [...docs.entries()]
        .filter(([key, data]) => key.startsWith(`${path}/`) && data.status === value)
        .map(([key, data]) => ({ id: key.split("/").at(-1), data: () => data })) }),
    }),
  });
  const db = {
    collection,
    runTransaction: async (callback) => {
      const writes = [];
      const tx = {
        get: async (item) => ({ exists: docs.has(item.path), data: () => docs.get(item.path) }),
        create: (item, data) => writes.push(() => docs.set(item.path, data)),
        update: (item, data) => writes.push(() => docs.set(item.path, { ...docs.get(item.path), ...data })),
      };
      const result = await callback(tx);
      writes.forEach((write) => write());
      return result;
    },
  };
  return { db, docs };
};

const chamar = async (handler, body, uid = "owner") => {
  const res = { status(code) { this.code = code; return this; }, json(payload) { this.payload = payload; return this; } };
  await handler({ body: { ownerUid: "owner", empresaId: "empresa", ...body }, user: { uid } }, res);
  return { status: res.code, ...res.payload };
};

test("conclusao atomica cria conta pendente unica com valor historico", async () => {
  const { db, docs } = criarBanco();
  const handler = criarHandlerConcluir({ getDb: () => db, agora: () => "agora" });
  assert.equal((await chamar(handler, { agendamentoId: "a1" })).criada, true);
  assert.equal((await chamar(handler, { agendamentoId: "a1" })).criada, false);
  const contas = [...docs.entries()].filter(([key]) => key.includes("/contasReceber/"));
  assert.equal(contas.length, 1);
  assert.equal(contas[0][1].valor, 120);
  assert.equal(contas[0][1].status, "pendente");
  assert.equal(docs.get("users/owner/empresas/empresa/agendamentos/a1").status, "concluido");
});

test("reconciliacao nao altera agenda nem duplica conta", async () => {
  const { db, docs } = criarBanco();
  const agenda = docs.get("users/owner/empresas/empresa/agendamentos/a1");
  agenda.status = "concluido";
  const handler = criarHandlerSincronizar({ getDb: () => db, agora: () => "agora" });
  assert.equal((await chamar(handler, {})).criadas, 1);
  assert.equal((await chamar(handler, {})).criadas, 0);
  assert.equal(Object.hasOwn(agenda, "concluidoEm"), false);
});

test("valor historico invalido bloqueia conclusao e vira pendencia no legado", async () => {
  const { db, docs } = criarBanco();
  const agenda = docs.get("users/owner/empresas/empresa/agendamentos/a1");
  agenda.valorServico = undefined;
  const concluir = criarHandlerConcluir({ getDb: () => db });
  assert.equal((await chamar(concluir, { agendamentoId: "a1" })).status, 422);
  assert.equal(agenda.status, "em_atendimento");
  assert.equal([...docs.keys()].some((key) => key.includes("/contasReceber/")), false);
  agenda.status = "concluido";
  const sincronizar = criarHandlerSincronizar({ getDb: () => db });
  const resultado = await chamar(sincronizar, {});
  assert.equal(resultado.criadas, 0);
  assert.equal(resultado.pendencias.length, 1);
  assert.equal(agenda.status, "concluido");
});

test("recebimento integral e unico exige perfil financeiro ativo", async () => {
  const { db, docs } = criarBanco({ role: "financeiro" });
  await chamar(criarHandlerConcluir({ getDb: () => db, agora: () => "agora" }), { agendamentoId: "a1" });
  const handler = criarHandlerReceber({ getDb: () => db, agora: () => "recebidoAgora" });
  const body = { contaId: "atendimento_a1", dataRecebimento: "2026-09-17", formaPagamento: "pix" };
  assert.equal((await chamar(handler, body, "guest")).status, "recebido");
  const conta = docs.get("users/owner/empresas/empresa/contasReceber/atendimento_a1");
  assert.deepEqual(conta.pagamento, {
    dataRecebimento: "2026-09-17", formaPagamento: "pix", valorRecebido: 120,
    recebidoEm: "recebidoAgora", recebidoPor: "guest",
  });
  assert.equal((await chamar(handler, body, "guest")).status, 409);
});

test("comercial, vinculo inativo e outro segmento nao recebem", async () => {
  for (const options of [{ role: "comercial" }, { ativo: false }, { segmento: "comercio" }]) {
    const { db } = criarBanco(options);
    const handler = criarHandlerReceber({ getDb: () => db });
    const resposta = await chamar(handler, {
      contaId: "atendimento_a1", dataRecebimento: "2026-09-17", formaPagamento: "pix",
    }, "guest");
    assert.equal(resposta.status, 403);
  }
});
