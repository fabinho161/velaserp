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
}

class FakeCollectionRef {
  constructor(db, path) {
    this._db = db;
    this.path = path;
  }

  doc(id) {
    return new FakeDocRef(this._db, `${this.path}/${id || this._db.nextId()}`);
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
    });
  }
}

class FakeDb {
  constructor() {
    this.store = new Map();
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

  getCollectionSnapshot(ref) {
    const prefix = `${ref.path}/`;
    const docs = [...this.store.entries()]
      .filter(([path]) =>
        path.startsWith(prefix) &&
        path.slice(prefix.length).split("/").length === 1
      )
      .map(([path, data]) =>
        new FakeDocSnapshot(new FakeDocRef(this, path), { ...data })
      );

    return new FakeCollectionSnapshot(docs);
  }

  async runTransaction(callback) {
    const transaction = new FakeTransaction(this);
    const resultado = await callback(transaction);

    transaction.writes.forEach((write) => {
      const atual = this.store.get(write.path) || {};
      this.store.set(
        write.path,
        write.options?.merge ? { ...atual, ...write.data } : { ...write.data }
      );
    });

    return resultado;
  }
}

const carregarRotaEmpresa = (db) => {
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
      req.user = { uid: "owner-1", email: "owner@erp.com" };
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

const criarAmbiente = () => {
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
  app.use("/api/empresas", carregarRotaEmpresa(db));

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
