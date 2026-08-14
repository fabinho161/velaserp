const test = require("node:test");
const assert = require("node:assert/strict");

const {
  criarHandlerCriarConviteUsuarioEmpresa,
} = require("../usuariosEmpresaRoutes");

const agora = new Date("2026-08-14T12:00:00.000Z");
const futuro = new Date("2026-08-21T12:00:00.000Z");
const passado = new Date("2026-08-01T12:00:00.000Z");

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
    this.reads = [];
    this.writes = [];
    this._writeStarted = false;
  }

  async get(ref) {
    if (this._writeStarted) {
      throw new Error("Leitura apos write na transacao fake.");
    }

    this.reads.push(ref.path);

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
    this.transactions = [];
    this._id = 0;
    this._lock = Promise.resolve();
    this.inTransaction = false;
    this.retryTransactionOnce = false;
    this._retryTransactionUsed = false;
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

  getCollectionSnapshot(ref) {
    const prefix = `${ref.path}/`;
    const docs = [...this.store.entries()]
      .filter(([path]) => path.startsWith(prefix) && path.slice(prefix.length).split("/").length === 1)
      .map(([path, data]) => new FakeDocSnapshot(new FakeDocRef(this, path), { ...data }));

    return new FakeCollectionSnapshot(docs);
  }

  async runTransaction(callback) {
    const anterior = this._lock;
    let liberar;
    this._lock = new Promise((resolve) => {
      liberar = resolve;
    });

    await anterior;

    const executarTentativa = async () => {
      const transaction = new FakeTransaction(this);
      this.inTransaction = true;

      try {
        const resultado = await callback(transaction);
        this.inTransaction = false;
        this.transactions.push(transaction);

        return { resultado, transaction };
      } catch (error) {
        this.inTransaction = false;
        this.transactions.push(transaction);
        throw error;
      }
    };

    const aplicarWrites = (transaction) => {
      transaction.writes.forEach((write) => {
        const atual = this.store.get(write.path) || {};
        this.store.set(
          write.path,
          write.options?.merge ? { ...atual, ...write.data } : { ...write.data }
        );
      });
    };

    try {
      const primeiraTentativa = await executarTentativa();

      if (this.retryTransactionOnce && !this._retryTransactionUsed) {
        this._retryTransactionUsed = true;
        const segundaTentativa = await executarTentativa();

        aplicarWrites(segundaTentativa.transaction);
        return segundaTentativa.resultado;
      }

      aplicarWrites(primeiraTentativa.transaction);
      return primeiraTentativa.resultado;
    } finally {
      liberar();
    }
  }
}

const pathEmpresa = (ownerUid = "owner-1", empresaId = "empresa-1") =>
  `users/${ownerUid}/empresas/${empresaId}`;

const pathUsuarioEmpresa = (id, ownerUid = "owner-1", empresaId = "empresa-1") =>
  `${pathEmpresa(ownerUid, empresaId)}/usuariosEmpresa/${id}`;

const criarAmbiente = ({
  plano = "basico",
  statusPlano = "active",
  atorUid = "owner-1",
  atorRole = "cliente",
  usuariosEmpresa = [],
  empresa = {},
  emailFalha = false,
} = {}) => {
  const db = new FakeDb();
  const envios = [];
  const logs = [];
  const handler = criarHandlerCriarConviteUsuarioEmpresa({
    getDb: () => db,
    gerarToken: () => `token-${db.nextId()}`,
    gerarIdUsuarioEmpresa: () => `usuario-${db.nextId()}`,
    criarDataAtual: () => agora,
    getBaseUrl: () => "http://app.local",
    enviarEmailConvite: async (payload) => {
      envios.push({
        payload,
        inTransaction: db.inTransaction,
      });

      if (emailFalha) {
        throw new Error("SMTP indisponivel");
      }

      return { provider: "fake" };
    },
  });

  db.set("users/owner-1", {
    email: "owner@erp.com",
    role: "cliente",
  });
  db.set("users/ator-1", {
    email: "ator@erp.com",
    role: atorRole,
  });
  db.set(pathEmpresa(), {
    nome: "Empresa Teste",
    ownerUid: "owner-1",
    planoEspelho: {
      plano,
      status: statusPlano,
    },
    ...empresa,
  });

  usuariosEmpresa.forEach((usuario) => {
    db.set(pathUsuarioEmpresa(usuario.id), usuario);
  });

  const req = {
    user: atorUid ? {
      uid: atorUid,
      email: atorUid === "owner-1" ? "owner@erp.com" : "ator@erp.com",
    } : null,
    params: {
      ownerUid: "owner-1",
      empresaId: "empresa-1",
    },
    body: {
      nome: "Novo Usuario",
      email: "novo@erp.com",
      role: "visualizacao",
    },
  };
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };

  return {
    db,
    envios,
    handler,
    logs,
    req,
    res,
  };
};

const executar = async (ambiente, overrides = {}) => {
  Object.assign(ambiente.req, overrides.req || {});
  ambiente.req.params = {
    ...ambiente.req.params,
    ...(overrides.params || {}),
  };
  ambiente.req.body = Object.prototype.hasOwnProperty.call(overrides, "rawBody")
    ? overrides.rawBody
    : {
        ...ambiente.req.body,
        ...(overrides.body || {}),
      };

  await ambiente.handler(ambiente.req, ambiente.res);
  return ambiente.res;
};

test("requisicao sem autenticacao retorna 401", async () => {
  const ambiente = criarAmbiente({ atorUid: "" });

  const res = await executar(ambiente);

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.ok, false);
});

test("ator sem autorizacao retorna 403", async () => {
  const ambiente = criarAmbiente({ atorUid: "ator-1" });

  const res = await executar(ambiente);

  assert.equal(res.statusCode, 403);
});

test("owner autorizado cria convite com vaga", async () => {
  const ambiente = criarAmbiente();

  const res = await executar(ambiente);
  const usuarioEmpresa = ambiente.db.get(pathUsuarioEmpresa("usuario-auto-2"));
  const convite = ambiente.db.get("convitesEmpresa/token-auto-1");

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.operacao, "criado");
  assert.equal(res.body.vagasOcupadas, 2);
  assert.equal(res.body.limiteUsuarios, 3);
  assert.equal(res.body.conviteEnviado, true);
  assert.equal("token" in res.body, false);
  assert.equal(usuarioEmpresa.conviteToken, "token-auto-1");
  assert.equal(convite.token, "token-auto-1");
  assert.equal(ambiente.envios[0].payload.linkConvite, "http://app.local/aceitar-convite/token-auto-1");
});

test("administrador_empresa ativo e autorizado", async () => {
  const ambiente = criarAmbiente({
    atorUid: "ator-1",
    usuariosEmpresa: [{
      id: "admin",
      uidAuth: "ator-1",
      email: "ator@erp.com",
      status: "ativo",
      role: "administrador_empresa",
    }],
  });

  const res = await executar(ambiente);

  assert.equal(res.statusCode, 200);
});

test("administrador pendente, inativo ou removido e negado", async () => {
  for (const status of ["pendente", "inativo", "removido"]) {
    const ambiente = criarAmbiente({
      atorUid: "ator-1",
      usuariosEmpresa: [{
        id: `admin-${status}`,
        uidAuth: "ator-1",
        email: "ator@erp.com",
        status,
        role: "administrador_empresa",
      }],
    });

    const res = await executar(ambiente);

    assert.equal(res.statusCode, 403);
  }
});

test("admin_master autorizado, mas sem bypass do limite", async () => {
  const ambiente = criarAmbiente({
    atorUid: "ator-1",
    atorRole: "admin_master",
    plano: "gratis",
  });

  const res = await executar(ambiente);

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.codigo, "limite_usuarios_atingido");
});

test("empresa inexistente retorna 404", async () => {
  const ambiente = criarAmbiente();
  ambiente.db.store.delete(pathEmpresa());

  const res = await executar(ambiente);

  assert.equal(res.statusCode, 404);
});

test("ownerUid divergente do owner real retorna 403", async () => {
  const ambiente = criarAmbiente({
    empresa: {
      ownerUid: "outro-owner",
    },
  });

  const res = await executar(ambiente);

  assert.equal(res.statusCode, 403);
});

test("email invalido e role invalida retornam 400", async () => {
  const emailInvalido = criarAmbiente();
  const roleInvalida = criarAmbiente();

  assert.equal((await executar(emailInvalido, { body: { email: "invalido" } })).statusCode, 400);
  assert.equal((await executar(roleInvalida, { body: { role: "admin_master" } })).statusCode, 400);
});

test("convite ao proprio owner retorna 409", async () => {
  const ambiente = criarAmbiente();

  const res = await executar(ambiente, {
    body: {
      email: " OWNER@ERP.com ",
    },
  });

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.codigo, "convite_owner");
});

test("novo convite sem vaga retorna 409 sem writes operacionais", async () => {
  const ambiente = criarAmbiente({ plano: "gratis" });

  const res = await executar(ambiente);

  assert.equal(res.statusCode, 409);
  assert.deepEqual(
    [...ambiente.db.store.keys()].filter((path) => path.startsWith("convitesEmpresa/")),
    []
  );
});

test("duas criacoes concorrentes para a ultima vaga deixam apenas uma passar", async () => {
  const ambienteA = criarAmbiente({
    usuariosEmpresa: [{
      id: "ativo-1",
      uidAuth: "ativo-1",
      email: "ativo@erp.com",
      status: "ativo",
      role: "visualizacao",
    }],
  });
  const ambienteB = {
    ...ambienteA,
    req: {
      ...ambienteA.req,
      body: {
        ...ambienteA.req.body,
        email: "outro@erp.com",
      },
    },
    res: {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    },
  };

  const [resA, resB] = await Promise.all([
    executar(ambienteA),
    executar(ambienteB),
  ]);
  const status = [resA.statusCode, resB.statusCode].sort();

  assert.deepEqual(status, [200, 409]);
});

test("callback transacional repetida reaproveita token e envia email uma vez", async () => {
  const ambiente = criarAmbiente();
  ambiente.db.retryTransactionOnce = true;

  const res = await executar(ambiente);
  const convites = [...ambiente.db.store.keys()].filter((path) => path.startsWith("convitesEmpresa/"));
  const usuarios = [...ambiente.db.store.keys()].filter((path) =>
    path.startsWith(pathEmpresa() + "/usuariosEmpresa/") && path.includes("usuario-auto")
  );

  assert.equal(res.statusCode, 200);
  assert.equal(ambiente.db.transactions.length, 2);
  assert.equal(ambiente.envios.length, 1);
  assert.deepEqual(convites, ["convitesEmpresa/token-auto-1"]);
  assert.deepEqual(usuarios, [pathUsuarioEmpresa("usuario-auto-2")]);
  assert.equal(ambiente.envios[0].payload.linkConvite, "http://app.local/aceitar-convite/token-auto-1");
});

test("reenvio pendente valido nao aumenta contagem", async () => {
  const ambiente = criarAmbiente({
    usuariosEmpresa: [{
      id: "pendente-1",
      email: "novo@erp.com",
      status: "pendente",
      role: "visualizacao",
      convitePendente: true,
      conviteToken: "token-existente",
      conviteExpiraEm: futuro,
      vagaReservada: true,
    }],
  });
  ambiente.db.set("convitesEmpresa/token-existente", {
    token: "token-existente",
    status: "pendente",
  });

  const res = await executar(ambiente);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.operacao, "reenviado");
  assert.equal(res.body.vagasOcupadas, 2);
  assert.equal(ambiente.db.get(pathUsuarioEmpresa("pendente-1")).conviteToken, "token-existente");
  assert.equal(ambiente.db.transactions.at(-1).reads.includes(pathEmpresa() + "/controles/usuarios"), true);
  assert.equal(
    ambiente.db.transactions.at(-1).writes.some((write) => write.path === pathEmpresa() + "/controles/usuarios"),
    true
  );
});

test("pendente expirado volta a reservar vaga com novo token", async () => {
  const ambiente = criarAmbiente({
    usuariosEmpresa: [{
      id: "pendente-1",
      email: "novo@erp.com",
      status: "pendente",
      role: "visualizacao",
      convitePendente: true,
      conviteToken: "token-antigo",
      conviteExpiraEm: passado,
    }],
  });
  ambiente.db.set("convitesEmpresa/token-antigo", {
    token: "token-antigo",
    status: "pendente",
  });

  const res = await executar(ambiente);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.operacao, "reenviado");
  assert.equal(res.body.vagasOcupadas, 2);
  assert.equal(ambiente.db.get("convitesEmpresa/token-antigo").status, "expirado");
});

test("reconvite removido exige vaga e reutiliza vinculo", async () => {
  const ambiente = criarAmbiente({
    usuariosEmpresa: [{
      id: "removido-1",
      email: "novo@erp.com",
      status: "removido",
      role: "visualizacao",
    }],
  });

  const res = await executar(ambiente);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.operacao, "reconvidado");
  assert.equal(ambiente.db.get(pathUsuarioEmpresa("removido-1")).status, "pendente");
});

test("membro ativo e inativo retornam conflito", async () => {
  for (const status of ["ativo", "inativo"]) {
    const ambiente = criarAmbiente({
      usuariosEmpresa: [{
        id: status,
        email: "novo@erp.com",
        status,
        role: "visualizacao",
      }],
    });

    const res = await executar(ambiente);

    assert.equal(res.statusCode, 409);
  }
});

test("duplicidade ambigua falha sem writes", async () => {
  const ambiente = criarAmbiente({
    usuariosEmpresa: [
      { id: "a", email: " Novo@ERP.com ", status: "removido" },
      { id: "b", email: "novo@erp.com", status: "removido" },
    ],
  });

  const res = await executar(ambiente);

  assert.equal(res.statusCode, 409);
  assert.equal(ambiente.db.transactions.at(-1).writes.length, 0);
});

test("falha no envio posterior nao duplica reserva", async () => {
  const ambiente = criarAmbiente({ emailFalha: true });

  const res = await executar(ambiente);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.conviteEnviado, false);
  assert.equal(ambiente.db.get(pathEmpresa() + "/controles/usuarios").quantidadeVagasOcupadas, 2);
});

test("sentinela e lida e escrita; leituras precedem writes", async () => {
  const ambiente = criarAmbiente();

  await executar(ambiente);

  const tx = ambiente.db.transactions.at(-1);
  assert.equal(tx.reads.includes(pathEmpresa() + "/controles/usuarios"), true);
  assert.equal(tx.writes.some((write) => write.path === pathEmpresa() + "/controles/usuarios"), true);
  assert.equal(ambiente.envios[0].inTransaction, false);
});

test("sentinela existente tambem e lida e atualizada", async () => {
  const ambiente = criarAmbiente();
  ambiente.db.set(pathEmpresa() + "/controles/usuarios", {
    quantidadeVagasOcupadas: 1,
    limiteAplicado: 3,
  });

  const res = await executar(ambiente);
  const tx = ambiente.db.transactions.at(-1);

  assert.equal(res.statusCode, 200);
  assert.equal(tx.reads[0], pathEmpresa() + "/controles/usuarios");
  assert.equal(tx.writes.some((write) => write.path === pathEmpresa() + "/controles/usuarios"), true);
  assert.equal(ambiente.db.get(pathEmpresa() + "/controles/usuarios").quantidadeVagasOcupadas, 2);
});

test("limite e plano no body sao rejeitados", async () => {
  const ambiente = criarAmbiente();

  const res = await executar(ambiente, {
    body: {
      plano: "premium",
      limite: 999,
    },
  });

  assert.equal(res.statusCode, 400);
});

test("campos herdados via prototype nao sao usados como payload confiavel", async () => {
  const ambiente = criarAmbiente();
  const body = Object.create({
    plano: "premium",
    limite: 999,
    role: "admin_master",
  });
  body.nome = "Usuario Sem Role Propria";
  body.email = "herdado@erp.com";

  const res = await executar(ambiente, {
    rawBody: body,
  });

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.codigo, "role_invalida");
});

test("owner duplicado em usuariosEmpresa nao aumenta a contagem", async () => {
  const ambiente = criarAmbiente({
    usuariosEmpresa: [{
      id: "owner-1",
      uidAuth: "owner-1",
      email: "owner@erp.com",
      status: "ativo",
      role: "administrador_empresa",
      dono: true,
    }],
  });

  const res = await executar(ambiente);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.vagasOcupadas, 2);
});
