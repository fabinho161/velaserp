const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const SERVER_TIMESTAMP = { __serverTimestamp: true };

class FakeDocSnapshot {
  constructor(ref, data) {
    this.ref = ref;
    this.id = ref.id;
    this.exists = data !== undefined;
    this._data = data;
  }

  data() {
    return this._data;
  }
}

class FakeCollectionSnapshot {
  constructor(docs) {
    this.docs = docs;
    this.empty = docs.length === 0;
    this.size = docs.length;
  }
}

class FakeDocRef {
  constructor(db, path) {
    this._db = db;
    this.path = path;
    this.id = path.split("/").pop();
  }

  collection(nome) {
    return new FakeCollectionRef(this._db, `${this.path}/${nome}`);
  }

  async get() {
    return new FakeDocSnapshot(this, this._db.get(this.path));
  }

  async set(data, options = {}) {
    this._db.writeSet(this.path, data, options);
  }

  async delete() {
    this._db.store.delete(this.path);
  }
}

class FakeCollectionRef {
  constructor(db, path) {
    this._db = db;
    this.path = path;
  }

  doc(id) {
    return new FakeDocRef(this._db, `${this.path}/${id || this._db.nextId()}`);
  }

  where(campo, operador, valor) {
    return new FakeQuery(this._db, this.path, [{ campo, operador, valor }]);
  }

  async get() {
    return this._db.getCollectionSnapshot(this);
  }
}

class FakeQuery {
  constructor(db, path, filtros = []) {
    this._db = db;
    this.path = path;
    this.filtros = filtros;
  }

  where(campo, operador, valor) {
    return new FakeQuery(this._db, this.path, [
      ...this.filtros,
      { campo, operador, valor },
    ]);
  }

  async get() {
    return this._db.getCollectionSnapshot(this);
  }
}

class FakeTransaction {
  constructor(db) {
    this._db = db;
    this.writes = [];
    this._writeStarted = false;
  }

  async get(ref) {
    if (this._writeStarted) {
      throw new Error("Leitura apos write na transacao fake.");
    }

    if (ref instanceof FakeCollectionRef) {
      return this._db.getCollectionSnapshot(ref);
    }

    return new FakeDocSnapshot(ref, this._db.get(ref.path));
  }

  set(ref, data, options = {}) {
    this._writeStarted = true;
    this.writes.push({
      path: ref.path,
      data,
      options,
      tipo: "set",
    });
  }

  delete(ref) {
    this._writeStarted = true;
    this.writes.push({
      path: ref.path,
      tipo: "delete",
    });
  }
}

class FakeDb {
  constructor() {
    this.store = new Map();
    this.recursiveDeletes = [];
    this.falharProximaTransacao = false;
    this._id = 0;
  }

  collection(nome) {
    return new FakeCollectionRef(this, nome);
  }

  nextId() {
    this._id += 1;
    return `empresa-${this._id}`;
  }

  set(path, data) {
    this.store.set(path, { ...data });
  }

  get(path) {
    const data = this.store.get(path);
    return data === undefined ? undefined : { ...data };
  }

  writeSet(path, data, options = {}) {
    const atual = this.store.get(path) || {};
    this.store.set(
      path,
      options?.merge ? { ...atual, ...data } : { ...data }
    );
  }

  getCollectionSnapshot(ref) {
    const prefix = `${ref.path}/`;
    const docs = [...this.store.entries()]
      .filter(([path]) =>
        path.startsWith(prefix) &&
        path.slice(prefix.length).split("/").length === 1
      )
      .filter(([, data]) =>
        !ref.filtros ||
        ref.filtros.every((filtro) =>
          filtro.operador === "==" && data?.[filtro.campo] === filtro.valor
        )
      )
      .map(([path, data]) =>
        new FakeDocSnapshot(new FakeDocRef(this, path), { ...data })
      );

    return new FakeCollectionSnapshot(docs);
  }

  async recursiveDelete(ref) {
    this.recursiveDeletes.push(ref.path);

    [...this.store.keys()].forEach((path) => {
      if (path === ref.path || path.startsWith(`${ref.path}/`)) {
        this.store.delete(path);
      }
    });
  }

  async runTransaction(callback) {
    const transaction = new FakeTransaction(this);
    const resultado = await callback(transaction);

    if (this.falharProximaTransacao) {
      this.falharProximaTransacao = false;
      throw new Error("Falha simulada apos recursiveDelete.");
    }

    transaction.writes.forEach((write) => {
      if (write.tipo === "delete") {
        this.store.delete(write.path);
        return;
      }

      this.writeSet(write.path, write.data, write.options);
    });

    return resultado;
  }
}

const carregarRotaEmpresa = (db, usuario = { uid: "owner-1", email: "owner@erp.com" }) => {
  const authPath = require.resolve("../../middlewares/authFirebase");
  const firebaseAdminPath = require.resolve("../../firebaseAdmin");
  const auditoriaPath = require.resolve("../../utils/auditoriaFirestore");
  const rotaPath = require.resolve("../empresaRoutes");

  delete require.cache[rotaPath];
  require.cache[authPath] = {
    id: authPath,
    filename: authPath,
    loaded: true,
    exports: (req, _res, next) => {
      req.user = usuario;
      next();
    },
  };
  require.cache[firebaseAdminPath] = {
    id: firebaseAdminPath,
    filename: firebaseAdminPath,
    loaded: true,
    exports: {
      FieldValue: { serverTimestamp: () => SERVER_TIMESTAMP },
      getDb: () => db,
    },
  };
  require.cache[auditoriaPath] = {
    id: auditoriaPath,
    filename: auditoriaPath,
    loaded: true,
    exports: {
      logAuditoriaError: () => {},
      logAuditoriaInfo: () => {},
      registrarErroAuditoria: async () => {},
    },
  };

  return require("../empresaRoutes");
};

const criarAmbiente = (usuario) => {
  const db = new FakeDb();
  db.set("users/owner-1", {
    email: "owner@erp.com",
    role: "cliente",
  });
  db.set("users/owner-1/assinatura/plano", {
    plano: "premium",
    status: "active",
  });

  const app = express();
  app.use(express.json());
  app.use("/api/empresas", carregarRotaEmpresa(db, usuario));

  return { app, db };
};

const postEmpresa = async (app, body) => {
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/empresas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();

    return { response, data };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

const listarEmpresas = (db) =>
  [...db.store.entries()]
    .filter(([path]) =>
      path.startsWith("users/owner-1/empresas/") &&
      path.split("/").length === 4
    )
    .map(([path, data]) => ({ path, data }));

const deleteEmpresa = async (app, empresaId) => {
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/empresas/${empresaId}`, {
      method: "DELETE",
    });
    const data = await response.json();

    return { response, data };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

test("cria empresa sem segmento usando industria como padrao", async () => {
  const { app, db } = criarAmbiente();

  const { response, data } = await postEmpresa(app, { nome: "Empresa Padrao" });
  const empresas = listarEmpresas(db);

  assert.equal(response.status, 201);
  assert.equal(data.empresa.segmento, "industria");
  assert.equal(empresas.length, 1);
  assert.equal(empresas[0].data.segmento, "industria");
});

test("cria empresa com segmento oficina", async () => {
  const { app, db } = criarAmbiente();

  const { response, data } = await postEmpresa(app, {
    nome: "Oficina Teste",
    segmento: "oficina",
  });
  const empresas = listarEmpresas(db);

  assert.equal(response.status, 201);
  assert.equal(data.empresa.segmento, "oficina");
  assert.equal(empresas.length, 1);
  assert.equal(empresas[0].data.segmento, "oficina");
});

test("rejeita segmento invalido sem criar empresa", async () => {
  const { app, db } = criarAmbiente();

  const { response, data } = await postEmpresa(app, {
    nome: "Empresa Invalida",
    segmento: "saude",
  });

  assert.equal(response.status, 400);
  assert.equal(data.ok, false);
  assert.equal(listarEmpresas(db).length, 0);
});

test("aceita todos os segmentos canonicos", async (t) => {
  for (const segmento of ["comercio", "industria", "oficina", "clientes"]) {
    await t.test(segmento, async () => {
      const { app, db } = criarAmbiente();
      const { response, data } = await postEmpresa(app, {
        nome: `Empresa ${segmento}`,
        segmento,
      });
      const empresas = listarEmpresas(db);

      assert.equal(response.status, 201);
      assert.equal(data.empresa.segmento, segmento);
      assert.equal(empresas.length, 1);
      assert.equal(empresas[0].data.segmento, segmento);
    });
  }
});

test("owner consegue excluir propria empresa com limpeza relacionada", async () => {
  const { app, db } = criarAmbiente();

  db.set("users/owner-1/empresas/empresa-a", {
    nome: "Empresa A",
    ownerUid: "owner-1",
  });
  db.set("users/owner-1/empresas/empresa-a/configuracoes/empresa", {
    nome: "Empresa A",
  });
  db.set("users/owner-1/empresas/empresa-a/usuariosEmpresa/owner-1", {
    uidAuth: "owner-1",
    dono: true,
    status: "ativo",
  });
  db.set("users/owner-1/empresas/empresa-a/usuariosEmpresa/membro-1", {
    uidAuth: "membro-1",
    status: "ativo",
  });
  db.set("users/membro-1/empresas/empresa-a", {
    ownerUid: "owner-1",
    empresaId: "empresa-a",
    usuarioEmpresaId: "membro-1",
  });
  db.set("usuariosPorAuth/membro-1/empresas/empresa-a", {
    ownerUid: "owner-1",
    empresaId: "empresa-a",
    usuarioEmpresaId: "membro-1",
  });
  db.set("convitesEmpresa/token-a", {
    ownerUid: "owner-1",
    empresaId: "empresa-a",
    usuarioEmpresaId: "membro-1",
  });
  db.set("convitesEmpresa/token-outra", {
    ownerUid: "owner-1",
    empresaId: "empresa-b",
  });
  db.set("users/owner-1/empresas/empresa-b", {
    nome: "Empresa B",
    ownerUid: "owner-1",
  });
  db.set("users/owner-1/controles/empresas", {
    quantidadeEmpresas: 99,
    outroCampo: "preservado",
  });

  const { response, data } = await deleteEmpresa(app, "empresa-a");

  assert.equal(response.status, 200);
  assert.equal(data.ok, true);
  assert.deepEqual(db.recursiveDeletes, ["users/owner-1/empresas/empresa-a"]);
  assert.equal(db.get("users/owner-1/empresas/empresa-a"), undefined);
  assert.equal(db.get("users/owner-1/empresas/empresa-a/configuracoes/empresa"), undefined);
  assert.equal(db.get("users/membro-1/empresas/empresa-a"), undefined);
  assert.equal(db.get("usuariosPorAuth/membro-1/empresas/empresa-a"), undefined);
  assert.equal(db.get("convitesEmpresa/token-a"), undefined);
  assert.notEqual(db.get("convitesEmpresa/token-outra"), undefined);
  assert.equal(db.get("users/owner-1").bloquearCriacaoAutomaticaEmpresa, true);
  assert.equal(db.get("users/owner-1/controles/exclusaoEmpresa_empresa-a"), undefined);
  assert.deepEqual(db.get("users/owner-1/controles/empresas"), {
    quantidadeEmpresas: 1,
    outroCampo: "preservado",
    atualizadoEm: SERVER_TIMESTAMP,
  });
});

test("excluir empresa inexistente retorna 404", async () => {
  const { app, db } = criarAmbiente();

  const { response, data } = await deleteEmpresa(app, "empresa-ausente");

  assert.equal(response.status, 404);
  assert.equal(data.ok, false);
  assert.equal(db.recursiveDeletes.length, 0);
});

test("usuario que nao e owner nao exclui ponteiro de empresa", async () => {
  const { app, db } = criarAmbiente({
    uid: "membro-1",
    email: "membro@erp.com",
  });

  db.set("users/membro-1", {
    email: "membro@erp.com",
    role: "cliente",
  });
  db.set("users/membro-1/empresas/empresa-a", {
    ownerUid: "owner-1",
    empresaId: "empresa-a",
    usuarioEmpresaId: "membro-1",
  });

  const { response, data } = await deleteEmpresa(app, "empresa-a");

  assert.equal(response.status, 403);
  assert.equal(data.ok, false);
  assert.equal(db.get("users/membro-1/empresas/empresa-a").ownerUid, "owner-1");
  assert.equal(db.recursiveDeletes.length, 0);
});

test("exclusao reconcilia contador por quantidade real restante", async () => {
  const { app, db } = criarAmbiente();

  db.set("users/owner-1/empresas/empresa-a", {
    nome: "Empresa A",
    ownerUid: "owner-1",
  });
  db.set("users/owner-1/empresas/empresa-b", {
    nome: "Empresa B",
    ownerUid: "owner-1",
  });
  db.set("users/owner-1/empresas/empresa-c", {
    nome: "Empresa C",
    ownerUid: "owner-1",
  });
  db.set("users/owner-1/controles/empresas", {
    quantidadeEmpresas: 1,
  });

  const { response } = await deleteEmpresa(app, "empresa-a");

  assert.equal(response.status, 200);
  assert.equal(db.get("users/owner-1/controles/empresas").quantidadeEmpresas, 2);
});

test("falha apos recursiveDelete preserva tombstone para retry", async () => {
  const { app, db } = criarAmbiente();

  db.set("users/owner-1/empresas/empresa-a", {
    nome: "Empresa A",
    ownerUid: "owner-1",
  });
  db.set("users/owner-1/empresas/empresa-a/usuariosEmpresa/membro-1", {
    uidAuth: "membro-1",
    status: "ativo",
  });
  db.set("users/membro-1/empresas/empresa-a", {
    ownerUid: "owner-1",
    empresaId: "empresa-a",
  });
  db.set("usuariosPorAuth/membro-1/empresas/empresa-a", {
    ownerUid: "owner-1",
    empresaId: "empresa-a",
  });
  db.set("convitesEmpresa/token-a", {
    ownerUid: "owner-1",
    empresaId: "empresa-a",
  });
  db.falharProximaTransacao = true;

  const { response, data } = await deleteEmpresa(app, "empresa-a");
  const tombstone = db.get("users/owner-1/controles/exclusaoEmpresa_empresa-a");

  assert.equal(response.status, 500);
  assert.equal(data.ok, false);
  assert.equal(db.get("users/owner-1/empresas/empresa-a"), undefined);
  assert.equal(db.get("users/membro-1/empresas/empresa-a").ownerUid, "owner-1");
  assert.equal(tombstone.ownerUid, "owner-1");
  assert.equal(tombstone.empresaId, "empresa-a");
  assert.deepEqual(tombstone.membrosUidAuth, ["membro-1"]);
  assert.deepEqual(tombstone.conviteIds, ["token-a"]);
});

test("nova tentativa com mesmo owner retoma tombstone e conclui limpeza", async () => {
  const { app, db } = criarAmbiente();

  db.set("users/owner-1/controles/exclusaoEmpresa_empresa-a", {
    ownerUid: "owner-1",
    empresaId: "empresa-a",
    membrosUidAuth: ["membro-1"],
    conviteIds: ["token-a"],
    status: "em_andamento",
  });
  db.set("users/membro-1/empresas/empresa-a", {
    ownerUid: "owner-1",
    empresaId: "empresa-a",
  });
  db.set("usuariosPorAuth/membro-1/empresas/empresa-a", {
    ownerUid: "owner-1",
    empresaId: "empresa-a",
  });
  db.set("convitesEmpresa/token-a", {
    ownerUid: "owner-1",
    empresaId: "empresa-a",
  });
  db.set("users/owner-1/empresas/empresa-b", {
    nome: "Empresa B",
    ownerUid: "owner-1",
  });

  const { response, data } = await deleteEmpresa(app, "empresa-a");

  assert.equal(response.status, 200);
  assert.equal(data.ok, true);
  assert.deepEqual(db.recursiveDeletes, ["users/owner-1/empresas/empresa-a"]);
  assert.equal(db.get("users/membro-1/empresas/empresa-a"), undefined);
  assert.equal(db.get("usuariosPorAuth/membro-1/empresas/empresa-a"), undefined);
  assert.equal(db.get("convitesEmpresa/token-a"), undefined);
  assert.equal(db.get("users/owner-1/controles/exclusaoEmpresa_empresa-a"), undefined);
  assert.equal(db.get("users/owner-1/controles/empresas").quantidadeEmpresas, 1);
  assert.equal(db.get("users/owner-1").bloquearCriacaoAutomaticaEmpresa, true);
});

test("outro usuario nao reutiliza tombstone divergente", async () => {
  const { app, db } = criarAmbiente({
    uid: "membro-1",
    email: "membro@erp.com",
  });

  db.set("users/membro-1", {
    email: "membro@erp.com",
    role: "cliente",
  });
  db.set("users/membro-1/controles/exclusaoEmpresa_empresa-a", {
    ownerUid: "owner-1",
    empresaId: "empresa-a",
    membrosUidAuth: ["membro-1"],
    conviteIds: [],
  });

  const { response, data } = await deleteEmpresa(app, "empresa-a");

  assert.equal(response.status, 403);
  assert.equal(data.ok, false);
  assert.equal(db.get("users/membro-1/controles/exclusaoEmpresa_empresa-a").ownerUid, "owner-1");
  assert.equal(db.recursiveDeletes.length, 0);
});

test("retry tolera ponteiros e convites ja removidos", async () => {
  const { app, db } = criarAmbiente();

  db.set("users/owner-1/controles/exclusaoEmpresa_empresa-a", {
    ownerUid: "owner-1",
    empresaId: "empresa-a",
    membrosUidAuth: ["membro-1"],
    conviteIds: ["token-a"],
    status: "em_andamento",
  });
  db.set("users/owner-1/empresas/empresa-b", {
    nome: "Empresa B",
    ownerUid: "owner-1",
  });

  const { response, data } = await deleteEmpresa(app, "empresa-a");

  assert.equal(response.status, 200);
  assert.equal(data.ok, true);
  assert.equal(db.get("users/owner-1/controles/exclusaoEmpresa_empresa-a"), undefined);
  assert.equal(db.get("users/owner-1/controles/empresas").quantidadeEmpresas, 1);
  assert.equal(db.get("users/owner-1").bloquearCriacaoAutomaticaEmpresa, true);
});
