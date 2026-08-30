const test = require("node:test");
const assert = require("node:assert/strict");

const {
  criarHandlerCriarOrdemServico,
} = require("../ordensServicoRoutes");

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
    this.reads = [];
    this.writes = [];
    this._writeStarted = false;
  }

  async get(ref) {
    if (this._writeStarted) {
      throw new Error("Leitura apos write na transacao fake.");
    }

    this.reads.push(ref.path);
    return new FakeDocSnapshot(ref, this._db.get(ref.path));
  }

  create(ref, data) {
    this._writeStarted = true;
    this.writes.push({
      tipo: "create",
      path: ref.path,
      data,
    });
  }

  set(ref, data, options = {}) {
    this._writeStarted = true;
    this.writes.push({
      tipo: "set",
      path: ref.path,
      data,
      options,
    });
  }
}

class FakeDb {
  constructor() {
    this.store = new Map();
    this.transactions = [];
    this._id = 0;
    this._lock = Promise.resolve();
  }

  collection(nome) {
    return new FakeCollectionRef(this, nome);
  }

  nextId() {
    this._id += 1;
    return `auto-${this._id}`;
  }

  set(path, data) {
    this.store.set(path, { ...data });
  }

  get(path) {
    const data = this.store.get(path);
    return data === undefined ? undefined : { ...data };
  }

  async runTransaction(callback) {
    const anterior = this._lock;
    let liberar;
    this._lock = new Promise((resolve) => {
      liberar = resolve;
    });

    await anterior;

    try {
      const transaction = new FakeTransaction(this);
      const resultado = await callback(transaction);

      transaction.writes.forEach((write) => {
        if (write.tipo === "create" && this.store.has(write.path)) {
          throw new Error("Documento ja existe.");
        }

        const atual = this.store.get(write.path) || {};
        this.store.set(
          write.path,
          write.options?.merge ? { ...atual, ...write.data } : { ...write.data }
        );
      });

      this.transactions.push(transaction);
      return resultado;
    } finally {
      liberar();
    }
  }
}

const pathEmpresa = (ownerUid = "owner-1", empresaId = "empresa-1") =>
  `users/${ownerUid}/empresas/${empresaId}`;

const pathUsuarioEmpresa = (id, ownerUid = "owner-1", empresaId = "empresa-1") =>
  `${pathEmpresa(ownerUid, empresaId)}/usuariosEmpresa/${id}`;

const pathControleOS = (ownerUid = "owner-1", empresaId = "empresa-1") =>
  `${pathEmpresa(ownerUid, empresaId)}/controles/ordensServico`;

const pathUsuarioPorAuth = (uidAuth, empresaId = "empresa-1") =>
  `usuariosPorAuth/${uidAuth}/empresas/${empresaId}`;

const criarBodyOrdem = (ordem = {}) => ({
  empresaId: "empresa-1",
  ordem: {
    clienteId: "cliente-1",
    clienteNome: "Cliente Teste",
    veiculoId: "veiculo-1",
    veiculoPlaca: "ABC1D23",
    defeitoRelatado: "Falha ao ligar",
    servicos: [],
    pecas: [],
    totalServicos: 0,
    totalPecas: 0,
    totalGeral: 0,
    statusPagamento: "pendente",
    ...ordem,
  },
});

const criarRes = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
});

const criarAmbiente = ({
  atorUid = "owner-1",
  atorRole = "cliente",
  empresa = {},
  usuarioEmpresa = {},
} = {}) => {
  const db = new FakeDb();
  const handler = criarHandlerCriarOrdemServico({
    getDb: () => db,
    criarTimestampServidor: () => SERVER_TIMESTAMP,
  });

  db.set("users/owner-1", { email: "owner@erp.com", role: "cliente" });
  db.set(`users/${atorUid}`, { email: `${atorUid}@erp.com`, role: atorRole });
  db.set(pathEmpresa(), {
    nome: "Oficina",
    ownerUid: "owner-1",
    segmento: "oficina",
    ...empresa,
  });
  db.set(pathUsuarioEmpresa("owner-1"), {
    uidAuth: "owner-1",
    role: "administrador_empresa",
    status: "ativo",
    dono: true,
  });

  if (atorUid !== "owner-1") {
    db.set(pathUsuarioPorAuth(atorUid), {
      ownerUid: "owner-1",
      empresaId: "empresa-1",
      usuarioEmpresaId: atorUid,
      status: usuarioEmpresa.status || "ativo",
    });
    db.set(pathUsuarioEmpresa(atorUid), {
      uidAuth: atorUid,
      role: usuarioEmpresa.role || "producao",
      status: usuarioEmpresa.status || "ativo",
      ...usuarioEmpresa,
    });
  }

  return {
    db,
    handler,
    req: (body = criarBodyOrdem()) => ({
      user: { uid: atorUid, email: `${atorUid}@erp.com` },
      body,
    }),
  };
};

const executar = async (ambiente, body) => {
  const res = criarRes();
  await ambiente.handler(ambiente.req(body), res);
  return res;
};

const listarOrdensCriadas = (db) =>
  [...db.store.entries()]
    .filter(([path]) => path.startsWith(`${pathEmpresa()}/ordensServico/`))
    .map(([path, data]) => ({
      id: path.split("/").pop(),
      ...data,
    }));

test("primeira OS da empresa recebe numero OS-0001", async () => {
  const ambiente = criarAmbiente();
  const res = await executar(ambiente);
  const ordens = listarOrdensCriadas(ambiente.db);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.numero, "OS-0001");
  assert.equal(ordens[0].numero, "OS-0001");
  assert.equal(ambiente.db.get(pathControleOS()).ultimoNumero, 1);
});

test("segunda OS da empresa recebe numero OS-0002", async () => {
  const ambiente = criarAmbiente();

  await executar(ambiente);
  const res = await executar(ambiente);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.numero, "OS-0002");
  assert.equal(ambiente.db.get(pathControleOS()).ultimoNumero, 2);
});

test("contador existente 27 gera OS-0028", async () => {
  const ambiente = criarAmbiente();
  ambiente.db.set(pathControleOS(), { ultimoNumero: 27 });

  const res = await executar(ambiente);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.numero, "OS-0028");
  assert.equal(ambiente.db.get(pathControleOS()).ultimoNumero, 28);
});

test("usuario sem permissao de escrita e negado", async () => {
  const ambiente = criarAmbiente({
    atorUid: "financeiro-1",
    usuarioEmpresa: { role: "financeiro", status: "ativo" },
  });

  const res = await executar(ambiente);

  assert.equal(res.statusCode, 403);
  assert.equal(listarOrdensCriadas(ambiente.db).length, 0);
});

test("empresa que nao e oficina e negada", async () => {
  const ambiente = criarAmbiente({
    empresa: { segmento: "industria" },
  });

  const res = await executar(ambiente);

  assert.equal(res.statusCode, 403);
  assert.equal(listarOrdensCriadas(ambiente.db).length, 0);
});

test("numero enviado no body e ignorado", async () => {
  const ambiente = criarAmbiente();
  const res = await executar(ambiente, criarBodyOrdem({ numero: "OS-9999" }));
  const ordens = listarOrdensCriadas(ambiente.db);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.numero, "OS-0001");
  assert.equal(ordens[0].numero, "OS-0001");
});

test("OS e contador sao gravados na mesma transacao", async () => {
  const ambiente = criarAmbiente();

  await executar(ambiente);

  const writes = ambiente.db.transactions[0].writes.map((write) => write.path);
  assert.equal(ambiente.db.transactions.length, 1);
  assert.equal(writes.some((path) => path.includes("/ordensServico/")), true);
  assert.equal(writes.includes(pathControleOS()), true);
});

test("duas criacoes simultaneas nao recebem o mesmo numero", async () => {
  const ambiente = criarAmbiente({
    atorUid: "producao-1",
    usuarioEmpresa: { role: "producao", status: "ativo" },
  });

  const [primeira, segunda] = await Promise.all([
    executar(ambiente),
    executar(ambiente),
  ]);
  const numeros = listarOrdensCriadas(ambiente.db).map((ordem) => ordem.numero).sort();

  assert.equal(primeira.statusCode, 201);
  assert.equal(segunda.statusCode, 201);
  assert.deepEqual(numeros, ["OS-0001", "OS-0002"]);
  assert.equal(ambiente.db.get(pathControleOS()).ultimoNumero, 2);
});
