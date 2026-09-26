const test = require("node:test");
const assert = require("node:assert/strict");
const { criarHandlerPagar } = require("../financeiroDespesasRoutes");
const app = require("../../server");

const pathDespesa = "users/owner/empresas/empresa/despesas/d1";
const criarBanco = ({ role = "financeiro", uid = "guest", despesa = {}, segmento = "clientes" } = {}) => {
  const docs = new Map([
    ["users/owner/empresas/empresa", { segmento, ownerUid: "owner" }],
    ["users/owner/empresas/empresa/despesas/d1", {
      descricao: "Aluguel", valor: 120, dataCompetencia: "2026-09-01",
      dataVencimento: "2026-09-10", statusFinanceiro: "pendente", situacao: "ativo",
      pagamento: null, data: "2026-09-01", status: "Pendente", ...despesa,
    }],
    [`usuariosPorAuth/${uid}/empresas/empresa`, {
      ownerUid: "owner", status: "ativo", usuarioEmpresaId: "m1",
    }],
    [`users/owner/empresas/empresa/usuariosEmpresa/m1`, {
      uidAuth: uid, status: "ativo", role,
    }],
  ]);
  if (uid === "owner") docs.set("users/owner", { role: "usuario" });
  if (uid === "admin") {
    docs.set("users/admin", { role: "admin_master" });
    docs.set("users/admin/empresas/empresa", { ownerUid: "owner", status: "ativo" });
  }
  const ref = (path) => ({ path, id: path.split("/").at(-1), collection: (name) => collection(`${path}/${name}`) });
  const collection = (path) => ({ doc: (id) => ref(`${path}/${id}`) });
  let fila = Promise.resolve();
  const db = {
    collection,
    runTransaction(callback) {
      const execucao = fila.then(async () => {
        const writes = [];
        const tx = {
          get: async (item) => ({ exists: docs.has(item.path), id: item.id, data: () => docs.get(item.path) }),
          update: (item, data) => writes.push(() => docs.set(item.path, { ...docs.get(item.path), ...data })),
        };
        const result = await callback(tx);
        writes.forEach((write) => write());
        return result;
      });
      fila = execucao.catch(() => {});
      return execucao;
    },
  };
  return { db, docs };
};

const chamar = async (handler, body = {}, uid = "guest") => {
  const res = { status(code) { this.code = code; return this; }, json(payload) { this.payload = payload; } };
  await handler({ body: { empresaId: "empresa", despesaId: "d1", dataPagamento: "2026-09-26", formaPagamento: "pix", ...body }, user: { uid } }, res);
  return { http: res.code, ...res.payload };
};

const converterEmLegada = (docs, status) => {
  const despesa = docs.get(pathDespesa);
  for (const campo of ["dataCompetencia", "dataVencimento", "statusFinanceiro", "situacao", "pagamento"]) {
    delete despesa[campo];
  }
  despesa.data = "2026-08-10";
  if (status === undefined) delete despesa.status;
  else despesa.status = status;
};

test("rota final exige autenticacao Firebase", async () => {
  const server = app.listen(0);
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/financeiro/despesas/pagar`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    });
    assert.equal(response.status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("paga despesa pendente com valor e auditoria obtidos no servidor", async () => {
  const { db, docs } = criarBanco();
  const handler = criarHandlerPagar({ getDb: () => db, agora: () => "agora" });
  const resposta = await chamar(handler, { valorPago: 1, ownerUid: "invasor", pagoPor: "invasor" });
  const paga = docs.get(pathDespesa);
  assert.equal(resposta.status, "pago");
  assert.deepEqual(paga.pagamento, {
    dataPagamento: "2026-09-26", formaPagamento: "pix", valorPago: 120,
    pagoEm: "agora", pagoPor: "guest",
  });
  assert.equal(paga.statusFinanceiro, "pago");
  assert.equal(paga.status, "Pago");
  assert.equal(paga.atualizadoEm, "agora");
  assert.equal(paga.atualizadoPor, "guest");
  assert.equal(paga.dataCompetencia, "2026-09-01");
  assert.equal(paga.dataVencimento, "2026-09-10");
});

test("valida data civil, forma, ids e valor persistido", async () => {
  for (const body of [
    { dataPagamento: "2026-02-29" }, { dataPagamento: "26/09/2026" },
    { formaPagamento: "cheque" }, { despesaId: "x/y" },
  ]) {
    const { db } = criarBanco();
    assert.equal((await chamar(criarHandlerPagar({ getDb: () => db }), body)).http, 400);
  }
  for (const valor of [0, -1, Infinity, "120", null]) {
    const { db } = criarBanco({ despesa: { valor } });
    assert.equal((await chamar(criarHandlerPagar({ getDb: () => db }))).http, 422);
  }
});

test("rejeita inexistente e cancelada sem gravar", async () => {
  const inexistente = criarBanco();
  inexistente.docs.delete(pathDespesa);
  assert.equal((await chamar(criarHandlerPagar({ getDb: () => inexistente.db }))).http, 404);
  for (const despesa of [{ situacao: "cancelado" }, { excluida: true }, { status: "cancelado" }]) {
    const { db } = criarBanco({ despesa });
    assert.equal((await chamar(criarHandlerPagar({ getDb: () => db }))).http, 409);
  }
});

test("pagamento estruturado e tentativas concorrentes sao idempotentes", async () => {
  const { db, docs } = criarBanco();
  const handler = criarHandlerPagar({ getDb: () => db, agora: () => "uma-vez" });
  const respostas = await Promise.all([chamar(handler), chamar(handler)]);
  assert.equal(respostas.filter((item) => item.idempotente === false).length, 1);
  assert.equal(respostas.filter((item) => item.idempotente === true).length, 1);
  assert.equal(docs.get(pathDespesa).pagamento.pagoEm, "uma-vez");
});

test("legados pagos ou sem status permanecem historicos sem pagamento artificial", async () => {
  for (const status of ["Pago", undefined]) {
    const { db, docs } = criarBanco();
    converterEmLegada(docs, status);
    const resposta = await chamar(criarHandlerPagar({ getDb: () => db }));
    assert.equal(resposta.historico, true);
    assert.equal(docs.get(pathDespesa).pagamento, undefined);
  }
});

test("legado pendente recebe baixa sem ganhar competencia ou vencimento inventados", async () => {
  const { db, docs } = criarBanco();
  converterEmLegada(docs, "Pendente");
  await chamar(criarHandlerPagar({ getDb: () => db, agora: () => "agora" }));
  const paga = docs.get(pathDespesa);
  assert.equal(paga.origemSchema, "legado");
  assert.equal(paga.data, "2026-08-10");
  assert.equal(paga.dataCompetencia, undefined);
  assert.equal(paga.dataVencimento, undefined);
});

test("RBAC financeiro preserva perfis autorizados e rejeita os demais", async () => {
  for (const [role, esperado] of [["financeiro", 200], ["administrador_empresa", 200], ["comercial", 403], ["visualizacao", 403], ["producao", 403], ["estoque", 403]]) {
    const { db } = criarBanco({ role });
    assert.equal((await chamar(criarHandlerPagar({ getDb: () => db }))).http, esperado, role);
  }
  for (const uid of ["owner", "admin"]) {
    const { db } = criarBanco({ uid });
    assert.equal((await chamar(criarHandlerPagar({ getDb: () => db }), {}, uid)).http, 200, uid);
  }
});

test("tenant e vinculo sao validados sem restringir os segmentos que usam despesas", async () => {
  const outro = criarBanco();
  assert.equal((await chamar(criarHandlerPagar({ getDb: () => outro.db }), { empresaId: "outra" })).http, 403);
  const comercio = criarBanco({ segmento: "comercio" });
  assert.equal((await chamar(criarHandlerPagar({ getDb: () => comercio.db }))).http, 200);
});
