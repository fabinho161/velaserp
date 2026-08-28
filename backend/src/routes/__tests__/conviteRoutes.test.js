const test = require("node:test");
const assert = require("node:assert/strict");

const {
  criarHandlerRemoverUsuarioEmpresa,
} = require("../conviteRoutes");

const agora = new Date("2026-08-14T12:00:00.000Z");
const futuro = new Date("2026-08-21T12:00:00.000Z");

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
    return new FakeDocRef(this._db, `${this.path}/${id}`);
  }

  where(campo, operador, valor) {
    return new FakeQueryRef(this._db, this.path, [{ campo, operador, valor }]);
  }
}

class FakeQueryRef {
  constructor(db, path, filtros) {
    this._db = db;
    this.path = path;
    this.filtros = filtros;
  }

  where(campo, operador, valor) {
    return new FakeQueryRef(this._db, this.path, [
      ...this.filtros,
      { campo, operador, valor },
    ]);
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

    if (ref instanceof FakeQueryRef) {
      return this._db.getQuerySnapshot(ref);
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
    this.transactions = [];
  }

  collection(nome) {
    return new FakeCollectionRef(this, nome);
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

  getQuerySnapshot(ref) {
    const docs = this.getCollectionSnapshot(ref).docs.filter((docSnap) => {
      const dados = docSnap.data() || {};

      return ref.filtros.every((filtro) => {
        if (filtro.operador !== "==") return false;
        return dados[filtro.campo] === filtro.valor;
      });
    });

    return new FakeCollectionSnapshot(docs);
  }

  async runTransaction(callback) {
    const transaction = new FakeTransaction(this);

    try {
      const resultado = await callback(transaction);

      transaction.writes.forEach((write) => {
        const atual = this.store.get(write.path) || {};
        this.store.set(
          write.path,
          write.options?.merge ? { ...atual, ...write.data } : { ...write.data }
        );
      });
      this.transactions.push(transaction);

      return resultado;
    } catch (error) {
      this.transactions.push(transaction);
      throw error;
    }
  }
}

const pathEmpresa = (ownerUid = "owner-1", empresaId = "empresa-1") =>
  `users/${ownerUid}/empresas/${empresaId}`;

const pathUsuarioEmpresa = (id, ownerUid = "owner-1", empresaId = "empresa-1") =>
  `${pathEmpresa(ownerUid, empresaId)}/usuariosEmpresa/${id}`;

const pathEmpresaUsuario = (uidAuth, empresaId = "empresa-1") =>
  `users/${uidAuth}/empresas/${empresaId}`;

const pathUsuarioPorAuth = (uidAuth, empresaId = "empresa-1") =>
  `usuariosPorAuth/${uidAuth}/empresas/${empresaId}`;

const pathControle = () => `${pathEmpresa()}/controles/usuarios`;

const criarRes = () => ({
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
});

const criarAmbienteRemocao = ({
  atorUid = "owner-1",
  atorRole = "cliente",
  usuarioAlvo = {},
  usuariosEmpresa = [],
  empresa = {},
  criarPonteiros = true,
  ponteiroEmpresa = {},
  ponteiroAuth = {},
  convite = null,
  criarSentinela = true,
} = {}) => {
  const db = new FakeDb();
  const handler = criarHandlerRemoverUsuarioEmpresa({
    getDb: () => db,
    criarDataAtual: () => agora,
  });
  const alvo = {
    id: "membro-1",
    nome: "Membro Teste",
    email: "membro@erp.com",
    uidAuth: "membro-auth",
    status: "ativo",
    role: "visualizacao",
    convitePendente: false,
    dono: false,
    ...usuarioAlvo,
  };

  db.set("users/owner-1", {
    email: "owner@erp.com",
    role: "cliente",
  });
  db.set("users/ator-1", {
    email: "ator@erp.com",
    role: atorRole,
  });
  if (alvo.uidAuth) {
    db.set(`users/${alvo.uidAuth}`, {
      email: alvo.email,
      role: usuarioAlvo.roleGlobal || "cliente",
    });
  }
  db.set(pathEmpresa(), {
    nome: "Empresa Teste",
    ownerUid: "owner-1",
    planoEspelho: {
      plano: "basico",
      status: "active",
    },
    ...empresa,
  });
  db.set(pathUsuarioEmpresa(alvo.id), alvo);

  usuariosEmpresa.forEach((usuario) => {
    db.set(pathUsuarioEmpresa(usuario.id), usuario);
  });

  if (criarPonteiros && alvo.uidAuth) {
    const dadosPonteiro = {
      nome: "Empresa Teste",
      ownerUid: "owner-1",
      empresaId: "empresa-1",
      usuarioEmpresaId: alvo.id,
      email: alvo.email,
      role: alvo.role,
      status: alvo.status,
      convitePendente: false,
      atualizadoEm: new Date("2026-08-01T12:00:00.000Z"),
    };

    db.set(pathEmpresaUsuario(alvo.uidAuth), {
      ...dadosPonteiro,
      ...ponteiroEmpresa,
    });
    db.set(pathUsuarioPorAuth(alvo.uidAuth), {
      ...dadosPonteiro,
      ...ponteiroAuth,
    });
  }

  if (convite) {
    db.set(`convitesEmpresa/${convite.token}`, convite);
  }

  if (criarSentinela) {
    db.set(pathControle(), {
      quantidadeVagasOcupadas: 2,
      limiteAplicado: 3,
      plano: "basico",
      statusPlano: "active",
      fonteLimite: "planoEspelho",
      versao: 1,
    });
  }

  const req = {
    user: atorUid ? {
      uid: atorUid,
      email: atorUid === "owner-1" ? "owner@erp.com" : "ator@erp.com",
    } : null,
    body: {
      ownerUid: "owner-1",
      empresaId: "empresa-1",
      usuarioEmpresaId: alvo.id,
    },
  };
  const res = criarRes();

  return {
    alvo,
    db,
    handler,
    req,
    res,
  };
};

const executarRemocao = async (ambiente, overrides = {}) => {
  Object.assign(ambiente.req, overrides.req || {});
  ambiente.req.body = {
    ...ambiente.req.body,
    ...(overrides.body || {}),
  };

  await ambiente.handler(ambiente.req, ambiente.res);
  return ambiente.res;
};

test("remocao sem autenticacao retorna 401", async () => {
  const ambiente = criarAmbienteRemocao({ atorUid: "" });

  const res = await executarRemocao(ambiente);

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.ok, false);
});

test("remocao ator sem autorizacao retorna 403", async () => {
  const ambiente = criarAmbienteRemocao({ atorUid: "ator-1" });

  const res = await executarRemocao(ambiente);

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.codigo, "sem_permissao");
});

test("remocao protege owner e autoexclusao", async () => {
  const owner = criarAmbienteRemocao({
    usuarioAlvo: {
      id: "owner-1",
      uidAuth: "owner-1",
      email: "owner@erp.com",
      dono: true,
      role: "administrador_empresa",
    },
  });
  const self = criarAmbienteRemocao({
    atorUid: "membro-auth",
    usuarioAlvo: {
      uidAuth: "membro-auth",
    },
    usuariosEmpresa: [{
      id: "admin",
      uidAuth: "membro-auth",
      email: "membro@erp.com",
      status: "ativo",
      role: "administrador_empresa",
    }],
  });

  assert.equal((await executarRemocao(owner)).statusCode, 403);
  assert.equal((await executarRemocao(self)).statusCode, 403);
});

test("remocao protege alvo admin_master", async () => {
  const ambiente = criarAmbienteRemocao({
    usuarioAlvo: {
      roleGlobal: "admin_master",
    },
  });

  const res = await executarRemocao(ambiente);

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.codigo, "alvo_admin_master");
});

test("remocao de ativo marca vinculo, ponteiros e sentinela", async () => {
  const ambiente = criarAmbienteRemocao();

  const res = await executarRemocao(ambiente);
  const usuario = ambiente.db.get(pathUsuarioEmpresa("membro-1"));
  const ponteiroEmpresa = ambiente.db.get(pathEmpresaUsuario("membro-auth"));
  const ponteiroAuth = ambiente.db.get(pathUsuarioPorAuth("membro-auth"));
  const controle = ambiente.db.get(pathControle());
  const tx = ambiente.db.transactions.at(-1);

  assert.equal(res.statusCode, 200);
  assert.equal(usuario.status, "removido");
  assert.equal(ponteiroEmpresa.status, "removido");
  assert.equal(ponteiroAuth.status, "removido");
  assert.equal(controle.quantidadeVagasOcupadas, 1);
  assert.equal(tx.reads[0], pathControle());
  assert.equal(tx.writes.some((write) => write.path === pathControle()), true);
});

test("cancelamento de pendente cancela convite e libera reserva", async () => {
  const ambiente = criarAmbienteRemocao({
    usuarioAlvo: {
      status: "pendente",
      uidAuth: "",
      convitePendente: true,
      conviteToken: "token-pendente",
      conviteExpiraEm: futuro,
      vagaReservada: true,
    },
    convite: {
      token: "token-pendente",
      ownerUid: "owner-1",
      empresaId: "empresa-1",
      usuarioEmpresaId: "membro-1",
      status: "pendente",
      email: "membro@erp.com",
      expiraEm: futuro,
    },
  });

  const res = await executarRemocao(ambiente);
  const convite = ambiente.db.get("convitesEmpresa/token-pendente");

  assert.equal(res.statusCode, 200);
  assert.equal(convite.status, "cancelado");
  assert.equal(ambiente.db.get(pathControle()).quantidadeVagasOcupadas, 1);
});

test("remocao encontra convite pendente por usuarioEmpresaId sem token no vinculo", async () => {
  const ambiente = criarAmbienteRemocao({
    usuarioAlvo: {
      status: "pendente",
      uidAuth: "",
      convitePendente: true,
      conviteExpiraEm: futuro,
      vagaReservada: true,
    },
    convite: {
      token: "token-por-query",
      ownerUid: "owner-1",
      empresaId: "empresa-1",
      usuarioEmpresaId: "membro-1",
      status: "pendente",
      email: "membro@erp.com",
      expiraEm: futuro,
    },
  });

  const res = await executarRemocao(ambiente);

  assert.equal(res.statusCode, 200);
  assert.equal(ambiente.db.get("convitesEmpresa/token-por-query").status, "cancelado");
});

test("remocao de inativo e repeticao de removido sao idempotentes", async () => {
  for (const status of ["inativo", "removido"]) {
    const ambiente = criarAmbienteRemocao({
      usuarioAlvo: {
        status,
      },
    });

    const res = await executarRemocao(ambiente);

    assert.equal(res.statusCode, 200);
    assert.equal(ambiente.db.get(pathUsuarioEmpresa("membro-1")).status, "removido");
    assert.equal(ambiente.db.get(pathControle()).quantidadeVagasOcupadas, 1);
  }
});

test("remocao com ponteiros ausentes cria somente marcadores removidos", async () => {
  const ambiente = criarAmbienteRemocao({ criarPonteiros: false });

  const res = await executarRemocao(ambiente);

  assert.equal(res.statusCode, 200);
  assert.equal(ambiente.db.get(pathEmpresaUsuario("membro-auth")).status, "removido");
  assert.equal(ambiente.db.get(pathUsuarioPorAuth("membro-auth")).status, "removido");
});

test("remocao com ponteiro incompativel falha sem writes", async () => {
  const ambiente = criarAmbienteRemocao({
    ponteiroEmpresa: {
      ownerUid: "outro-owner",
    },
  });

  const res = await executarRemocao(ambiente);

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.codigo, "ponteiro_inconsistente");
  assert.equal(ambiente.db.transactions.at(-1).writes.length, 0);
});

test("remocao com convite incompativel falha sem cancelar", async () => {
  const ambiente = criarAmbienteRemocao({
    usuarioAlvo: {
      status: "pendente",
      uidAuth: "",
      convitePendente: true,
      conviteToken: "token-invalido",
      conviteExpiraEm: futuro,
      vagaReservada: true,
    },
    convite: {
      token: "token-invalido",
      ownerUid: "outro-owner",
      empresaId: "empresa-1",
      usuarioEmpresaId: "membro-1",
      status: "pendente",
    },
  });

  const res = await executarRemocao(ambiente);

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.codigo, "convite_inconsistente");
  assert.equal(ambiente.db.get("convitesEmpresa/token-invalido").status, "pendente");
});

test("remocao cria sentinela ausente pela contagem final", async () => {
  const ambiente = criarAmbienteRemocao({ criarSentinela: false });

  const res = await executarRemocao(ambiente);

  assert.equal(res.statusCode, 200);
  assert.equal(ambiente.db.get(pathControle()).quantidadeVagasOcupadas, 1);
});

test("remocao acima do limite e permitida e reconcilia quantidade real", async () => {
  const ambiente = criarAmbienteRemocao({
    empresa: {
      planoEspelho: {
        plano: "gratis",
        status: "active",
      },
    },
    usuariosEmpresa: [{
      id: "extra",
      uidAuth: "extra-auth",
      email: "extra@erp.com",
      status: "ativo",
      role: "visualizacao",
    }],
  });

  const res = await executarRemocao(ambiente);
  const controle = ambiente.db.get(pathControle());

  assert.equal(res.statusCode, 200);
  assert.equal(controle.limiteAplicado, 1);
  assert.equal(controle.quantidadeVagasOcupadas, 2);
});

test("remocao preserva historico de convite aceito", async () => {
  const ambiente = criarAmbienteRemocao({
    usuarioAlvo: {
      conviteToken: "token-aceito",
    },
    convite: {
      token: "token-aceito",
      ownerUid: "owner-1",
      empresaId: "empresa-1",
      usuarioEmpresaId: "membro-1",
      status: "aceito",
      email: "membro@erp.com",
    },
  });

  const res = await executarRemocao(ambiente);

  assert.equal(res.statusCode, 200);
  assert.equal(ambiente.db.get("convitesEmpresa/token-aceito").status, "aceito");
});
