const assert = require("node:assert/strict");
const test = require("node:test");
const {
  executarExclusaoCliente,
  obterPreviewExclusaoCliente,
} = require("../exclusaoClienteSaas");

const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

class FakeSnapshot {
  constructor(ref, value) {
    this.ref = ref;
    this.id = ref.id;
    this.exists = value !== undefined;
    this._value = value;
  }
  data() { return clone(this._value); }
}

class FakeDocRef {
  constructor(db, path) { this.db = db; this.path = path; this.id = path.split("/").at(-1); }
  collection(name) { return new FakeCollection(this.db, `${this.path}/${name}`); }
  async get() { return new FakeSnapshot(this, this.db.docs.get(this.path)); }
  async set(value, options = {}) {
    const previous = options.merge ? this.db.docs.get(this.path) || {} : {};
    this.db.docs.set(this.path, { ...clone(previous), ...clone(value) });
    this.db.events.push(`set:${this.path}`);
  }
  async delete() { this.db.docs.delete(this.path); this.db.events.push(`delete:${this.path}`); }
}

class FakeQuery {
  constructor(collection, filters = []) { this.collection = collection; this.filters = filters; }
  where(field, op, value) { return new FakeQuery(this.collection, [...this.filters, [field, op, value]]); }
  async get() {
    const docs = this.collection.directDocs().filter((snapshot) =>
      this.filters.every(([field, op, value]) => op === "==" && snapshot.data()?.[field] === value)
    );
    return { docs, size: docs.length, empty: docs.length === 0 };
  }
}

class FakeCollection extends FakeQuery {
  constructor(db, path) { super(null); this.db = db; this.path = path; this.collection = this; this.filters = []; }
  doc(id) { return new FakeDocRef(this.db, `${this.path}/${id}`); }
  directDocs() {
    const prefix = `${this.path}/`;
    return [...this.db.docs.entries()]
      .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/"))
      .map(([path, value]) => new FakeSnapshot(new FakeDocRef(this.db, path), value));
  }
  async get() { const docs = this.directDocs(); return { docs, size: docs.length, empty: docs.length === 0 }; }
}

class FakeDb {
  constructor(initial = {}) { this.docs = new Map(Object.entries(clone(initial))); this.events = []; this.failPath = null; }
  collection(name) { return new FakeCollection(this, name); }
  async runTransaction(callback) {
    return callback({
      get: (refOrQuery) => refOrQuery.get(),
      set: (ref, value, options) => ref.set(value, options),
      delete: (ref) => ref.delete(),
    });
  }
  async recursiveDelete(ref) {
    this.events.push(`recursive:${ref.path}`);
    if (this.failPath === ref.path) { this.failPath = null; throw new Error("falha simulada"); }
    for (const path of [...this.docs.keys()]) {
      if (path === ref.path || path.startsWith(`${ref.path}/`)) this.docs.delete(path);
    }
  }
}

const base = () => ({
  "users/admin": { email: "admin@erp.com", role: "admin_master" },
  "users/alvo": { email: "cliente@erp.com", role: "cliente" },
});

test("preview exige admin_master, bloqueia autoexclusao, alvo admin e cliente inexistente", async () => {
  const normal = new FakeDb({ ...base(), "users/comum": { role: "cliente" } });
  await assert.rejects(
    obterPreviewExclusaoCliente({ db: normal, actorUid: "comum", targetUid: "alvo" }),
    (error) => error.statusCode === 403
  );
  await assert.rejects(
    obterPreviewExclusaoCliente({ db: normal, actorUid: "admin", targetUid: "admin" }),
    (error) => error.codigo === "autoexclusao"
  );
  await assert.rejects(
    obterPreviewExclusaoCliente({ db: normal, actorUid: "admin", targetUid: "ausente" }),
    (error) => error.statusCode === 404
  );
  const outroAdmin = new FakeDb({ ...base(), "users/outro": { email: "outro@erp.com", role: "admin_master" } });
  await assert.rejects(
    obterPreviewExclusaoCliente({ db: outroAdmin, actorUid: "admin", targetUid: "outro" }),
    (error) => error.codigo === "admin_master_protegido"
  );
});

test("preview inventaria sem mutacao e rejeita UID ou confirmacao invalidos", async () => {
  const db = new FakeDb(base());
  const preview = await obterPreviewExclusaoCliente({ db, actorUid: "admin", targetUid: "alvo" });
  assert.deepEqual(preview, {
    uid: "alvo", email: "cliente@erp.com", empresasProprias: 0,
    participacoesTerceiros: 0, vinculosConvidados: 0, convitesRelacionados: 0,
  });
  assert.deepEqual(db.events, []);
  await assert.rejects(
    obterPreviewExclusaoCliente({ db, actorUid: "admin", targetUid: "../alvo" }),
    (error) => error.codigo === "uid_invalido"
  );
  await assert.rejects(
    executarExclusaoCliente({ db, authClient: {}, actorUid: "admin", targetUid: "alvo", confirmacaoEmail: "errado@erp.com" }),
    (error) => error.codigo === "email_confirmacao_divergente"
  );
});

test("exclui empresas proprias, convidados, convites, ponteiros, arvore pessoal e Auth por ultimo", async () => {
  const db = new FakeDb({
    ...base(),
    "users/alvo/assinatura/plano": { plano: "gratis" },
    "users/alvo/pagamentos/p1": { valor: 10 },
    "users/alvo/empresas/e1": { empresaId: "e1", ownerUid: "alvo" },
    "users/alvo/empresas/e2": { empresaId: "e2", ownerUid: "alvo" },
    "users/alvo/empresas/e1/usuariosEmpresa/m1": { uidAuth: "convidado" },
    "users/convidado": { email: "guest@erp.com" },
    "users/convidado/empresas/e1": { ownerUid: "alvo", empresaId: "e1" },
    "usuariosPorAuth/convidado/empresas/e1": { ownerUid: "alvo", empresaId: "e1" },
    "usuariosPorAuth/alvo/empresas/e1": { ownerUid: "alvo", empresaId: "e1" },
    "convitesEmpresa/c1": { ownerUid: "alvo", empresaId: "e1", email: "guest@erp.com" },
    "logs/webhooksMercadoPago/eventos/log1": { userId: "alvo" },
  });
  const authClient = { deleteUser: async (uid) => db.events.push(`auth:${uid}`) };
  const result = await executarExclusaoCliente({
    db, authClient, actorUid: "admin", targetUid: "alvo", confirmacaoEmail: " CLIENTE@ERP.COM ",
  });

  assert.equal(result.concluido, true);
  assert.equal(db.docs.has("users/alvo"), false);
  assert.equal(db.docs.has("users/alvo/pagamentos/p1"), false);
  assert.equal(db.docs.has("users/convidado"), true);
  assert.equal(db.docs.has("users/convidado/empresas/e1"), false);
  assert.equal(db.docs.has("usuariosPorAuth/convidado/empresas/e1"), false);
  assert.equal(db.docs.get("convitesEmpresa/c1").status, "cancelado");
  assert.equal(db.docs.has("logs/webhooksMercadoPago/eventos/log1"), true);
  assert.ok(db.events.indexOf("auth:alvo") > db.events.indexOf("recursive:users/alvo"));
  assert.equal(db.docs.get("adminExclusoesClientes/alvo").status, "concluido");
});

test("remove participacao em empresa terceira sem excluir empresa nem outros membros", async () => {
  const db = new FakeDb({
    ...base(),
    "users/alvo/empresas/terceira": { ownerUid: "owner", empresaId: "terceira", usuarioEmpresaId: "m-alvo" },
    "usuariosPorAuth/alvo/empresas/terceira": { ownerUid: "owner", empresaId: "terceira", usuarioEmpresaId: "m-alvo" },
    "users/owner": { email: "owner@erp.com" },
    "users/owner/empresas/terceira": {
      ownerUid: "owner",
      empresaId: "terceira",
      planoEspelho: { plano: "profissional", status: "active" },
    },
    "users/owner/empresas/terceira/usuariosEmpresa/m-alvo": {
      uidAuth: "alvo", status: "ativo", role: "financeiro",
    },
    "users/owner/empresas/terceira/usuariosEmpresa/m-outro": { uidAuth: "outro", status: "ativo" },
    "users/owner/empresas/terceira/controles/usuarios": {
      quantidadeVagasOcupadas: 3,
      limiteAplicado: 5,
      plano: "profissional",
      fonteLimite: "planoEspelho",
    },
    "convitesEmpresa/ct": { ownerUid: "owner", empresaId: "terceira", usuarioEmpresaId: "m-alvo", email: "cliente@erp.com", status: "pendente" },
  });
  await executarExclusaoCliente({
    db, authClient: { deleteUser: async () => {} }, actorUid: "admin", targetUid: "alvo", confirmacaoEmail: "cliente@erp.com",
  });
  assert.equal(db.docs.has("users/owner/empresas/terceira"), true);
  assert.equal(db.docs.get("users/owner/empresas/terceira/usuariosEmpresa/m-alvo").status, "removido");
  assert.equal(db.docs.get("users/owner/empresas/terceira/usuariosEmpresa/m-alvo").role, "financeiro");
  assert.equal(db.docs.get("users/owner/empresas/terceira/usuariosEmpresa/m-outro").status, "ativo");
  assert.equal(db.docs.get("convitesEmpresa/ct").status, "cancelado");
  const controle = db.docs.get("users/owner/empresas/terceira/controles/usuarios");
  assert.equal(controle.quantidadeVagasOcupadas, 2);
  assert.equal(controle.limiteAplicado, 5);
  assert.equal(controle.plano, "profissional");
});

test("falha antes do Auth persiste tombstone e retry conclui de forma idempotente", async () => {
  const db = new FakeDb({ ...base(), "users/alvo/empresas/e1": { ownerUid: "alvo", empresaId: "e1" } });
  db.failPath = "users/alvo/empresas/e1";
  let authCalls = 0;
  const authClient = { deleteUser: async () => { authCalls += 1; } };
  const args = { db, authClient, actorUid: "admin", targetUid: "alvo", confirmacaoEmail: "cliente@erp.com" };

  await assert.rejects(executarExclusaoCliente(args), (error) => error.parcial === true);
  assert.equal(authCalls, 0);
  assert.equal(db.docs.get("adminExclusoesClientes/alvo").status, "falha");
  await executarExclusaoCliente(args);
  assert.equal(authCalls, 1);
  assert.equal(db.docs.get("adminExclusoesClientes/alvo").status, "concluido");
  const novamente = await executarExclusaoCliente(args);
  assert.equal(novamente.retomada, true);
  assert.equal(authCalls, 1);
});

test("Auth ausente no passo final e valor user-not-found sao idempotentes", async () => {
  const db = new FakeDb(base());
  await executarExclusaoCliente({
    db,
    authClient: { deleteUser: async () => { const error = new Error("ausente"); error.code = "auth/user-not-found"; throw error; } },
    actorUid: "admin", targetUid: "alvo", confirmacaoEmail: "cliente@erp.com",
  });
  assert.equal(db.docs.get("adminExclusoesClientes/alvo").status, "concluido");
});

test("snapshot de erro registra fase e nao remove outro admin_master", async () => {
  const db = new FakeDb({ ...base(), "users/outro-admin": { email: "a@erp.com", role: "admin_master" } });
  db.failPath = "users/alvo";
  await assert.rejects(executarExclusaoCliente({
    db, authClient: { deleteUser: async () => assert.fail("Auth nao deveria ser chamado") },
    actorUid: "admin", targetUid: "alvo", confirmacaoEmail: "cliente@erp.com",
  }));
  const tombstone = db.docs.get("adminExclusoesClientes/alvo");
  assert.equal(tombstone.status, "falha");
  assert.equal(tombstone.faseAtual, "excluir_arvore_usuario");
  assert.equal(db.docs.has("users/outro-admin"), true);
});
