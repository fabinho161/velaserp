const test = require("node:test");
const assert = require("node:assert/strict");

const {
  criarHandlerCriarFaturamento,
} = require("../faturamentoRoutes");

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
    this.store.set(path, structuredClone(data));
  }

  get(path) {
    const data = this.store.get(path);
    return data === undefined ? undefined : structuredClone(data);
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

        this.store.set(write.path, structuredClone(write.data));
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

const pathUsuarioPorAuth = (uidAuth, empresaId = "empresa-1") =>
  `usuariosPorAuth/${uidAuth}/empresas/${empresaId}`;

const pathVenda = (vendaId = "venda-1", ownerUid = "owner-1", empresaId = "empresa-1") =>
  `${pathEmpresa(ownerUid, empresaId)}/vendas/${vendaId}`;

const pathFaturamento = (
  vendaId = "venda-1",
  ownerUid = "owner-1",
  empresaId = "empresa-1"
) => `${pathEmpresa(ownerUid, empresaId)}/faturamentos/venda_${vendaId}_preparacao_v1`;

const fiscalEmpresaSnapshot = () => ({
  versao: 1,
  regimeTributario: "Simples Nacional",
  cnpj: "11222333000144",
  inscricaoEstadual: "123456789",
  inscricaoMunicipal: "987654",
  cnae: "4789001",
  uf: "GO",
  municipio: "Itumbiara",
  ambienteFiscal: "homologacao",
});

const destinatarioSnapshot = () => ({
  versao: 1,
  clienteId: "cliente-1",
  nome: "Cliente Teste",
  documento: "12345678900",
  email: "cliente@teste.com",
  telefone: "62999990000",
  endereco: "Rua Central",
  cidade: "Itumbiara",
  uf: "GO",
});

const fiscalItemSnapshot = () => ({
  versao: 1,
  ncm: "34060000",
  cest: "2803800",
  cfopPadrao: "5102",
  origem: "0",
  unidadeTributavel: "un",
});

const criarVenda = (dados = {}) => ({
  numeroPedido: "PED-0001",
  cliente: "Cliente Teste",
  clienteId: "cliente-1",
  clienteNome: "Cliente Teste",
  data: "2026-09-12",
  itens: [
    {
      produtoId: "produto-1",
      produtoNome: "Vela Aromatica",
      produto: "Vela Aromatica",
      quantidade: 2,
      valorUnitario: 25,
      desconto: 5,
      valorBruto: 50,
      total: 45,
      fiscalSnapshot: fiscalItemSnapshot(),
    },
  ],
  valorBruto: 50,
  desconto: 5,
  total: 45,
  statusPagamento: "pendente",
  statusExpedicao: "Pendente",
  fiscalEmpresaSnapshot: fiscalEmpresaSnapshot(),
  destinatarioSnapshot: destinatarioSnapshot(),
  ...dados,
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
  venda = criarVenda(),
  vendaId = "venda-1",
} = {}) => {
  const db = new FakeDb();
  const handler = criarHandlerCriarFaturamento({
    getDb: () => db,
    criarTimestampServidor: () => SERVER_TIMESTAMP,
  });

  db.set("users/owner-1", { email: "owner@erp.com", role: "cliente" });
  db.set(`users/${atorUid}`, { email: `${atorUid}@erp.com`, role: atorRole });
  db.set(pathEmpresa(), {
    nome: "Empresa Teste",
    ownerUid: "owner-1",
    segmento: "comercio",
    ...empresa,
  });
  db.set(pathUsuarioEmpresa("owner-1"), {
    uidAuth: "owner-1",
    role: "administrador_empresa",
    status: "ativo",
    dono: true,
  });

  if (venda) {
    db.set(pathVenda(vendaId), venda);
  }

  if (atorUid !== "owner-1") {
    db.set(pathUsuarioPorAuth(atorUid), {
      ownerUid: "owner-1",
      empresaId: "empresa-1",
      usuarioEmpresaId: atorUid,
      status: usuarioEmpresa.status || "ativo",
    });
    db.set(pathUsuarioEmpresa(atorUid), {
      uidAuth: atorUid,
      role: usuarioEmpresa.role || "comercial",
      status: usuarioEmpresa.status || "ativo",
      ...usuarioEmpresa,
    });
  }

  return {
    db,
    handler,
    req: (body = { empresaId: "empresa-1", vendaId }) => ({
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

const listarFaturamentos = (db, ownerUid = "owner-1", empresaId = "empresa-1") =>
  [...db.store.entries()]
    .filter(([path]) => path.startsWith(`${pathEmpresa(ownerUid, empresaId)}/faturamentos/`))
    .map(([path, data]) => ({
      id: path.split("/").pop(),
      ...data,
    }));

test("cria faturamento a partir de venda normal", async () => {
  const ambiente = criarAmbiente();
  const res = await executar(ambiente);
  const faturamento = ambiente.db.get(pathFaturamento());

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.reutilizado, false);
  assert.equal(faturamento.origem.tipo, "venda");
  assert.equal(faturamento.itens[0].tipoItem, "mercadoria");
});

test("cria faturamento a partir de venda de pecas", async () => {
  const ambiente = criarAmbiente({
    empresa: { segmento: "oficina" },
    venda: criarVenda({ tipoVenda: "pecas" }),
  });

  const res = await executar(ambiente);
  const faturamento = ambiente.db.get(pathFaturamento());

  assert.equal(res.statusCode, 201);
  assert.equal(faturamento.origem.tipo, "venda_pecas");
  assert.equal(faturamento.itens[0].tipoItem, "peca");
});

test("venda legada sem tipoVenda e tratada como venda normal", async () => {
  const venda = criarVenda();
  delete venda.tipoVenda;
  const ambiente = criarAmbiente({ venda });

  const res = await executar(ambiente);
  const faturamento = ambiente.db.get(pathFaturamento());

  assert.equal(res.statusCode, 201);
  assert.equal(faturamento.origem.tipo, "venda");
});

test("venda inexistente retorna 404", async () => {
  const ambiente = criarAmbiente({ venda: null });

  const res = await executar(ambiente);

  assert.equal(res.statusCode, 404);
  assert.equal(listarFaturamentos(ambiente.db).length, 0);
});

test("empresa nao autorizada nao permite faturar venda de outro owner", async () => {
  const ambiente = criarAmbiente({ atorUid: "comercial-1" });
  ambiente.db.set(pathEmpresa("owner-2", "empresa-2"), {
    nome: "Outra Empresa",
    ownerUid: "owner-2",
    segmento: "comercio",
  });
  ambiente.db.set(pathVenda("venda-2", "owner-2", "empresa-2"), criarVenda());

  const res = await executar(ambiente, {
    empresaId: "empresa-2",
    vendaId: "venda-2",
  });

  assert.equal(res.statusCode, 404);
  assert.equal(listarFaturamentos(ambiente.db, "owner-2", "empresa-2").length, 0);
});

test("usuario sem permissao e negado", async () => {
  const ambiente = criarAmbiente({
    atorUid: "estoque-1",
    usuarioEmpresa: { role: "estoque", status: "ativo" },
  });

  const res = await executar(ambiente);

  assert.equal(res.statusCode, 403);
  assert.equal(listarFaturamentos(ambiente.db).length, 0);
});

test("usuario inativo e negado", async () => {
  const ambiente = criarAmbiente({
    atorUid: "comercial-1",
    usuarioEmpresa: { role: "comercial", status: "inativo" },
  });

  const res = await executar(ambiente);

  assert.equal(res.statusCode, 403);
});

test("venda cancelada e incompativel", async () => {
  const ambiente = criarAmbiente({
    venda: criarVenda({ statusPagamento: "cancelado" }),
  });

  const res = await executar(ambiente);

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.codigo, "venda_cancelada");
});

test("snapshots ausentes permanecem como pendencias", async () => {
  const venda = criarVenda();
  delete venda.fiscalEmpresaSnapshot;
  delete venda.destinatarioSnapshot;
  delete venda.itens[0].fiscalSnapshot;
  const ambiente = criarAmbiente({ venda });

  const res = await executar(ambiente);
  const faturamento = ambiente.db.get(pathFaturamento());

  assert.equal(res.statusCode, 201);
  assert.deepEqual(faturamento.pendencias, [
    "emitente_snapshot_ausente",
    "destinatario_snapshot_ausente",
    "item_fiscal_snapshot_ausente",
  ]);
});

test("persistencia mantem snapshot independente de alteracao posterior na venda", async () => {
  const ambiente = criarAmbiente();

  await executar(ambiente);
  ambiente.db.set(pathVenda(), criarVenda({
    clienteNome: "Cliente Alterado",
    fiscalEmpresaSnapshot: {
      ...fiscalEmpresaSnapshot(),
      cnpj: "00000000000000",
    },
  }));
  const faturamento = ambiente.db.get(pathFaturamento());

  assert.equal(faturamento.contextoFiscal.destinatario.nome, "Cliente Teste");
  assert.equal(faturamento.contextoFiscal.emitente.cnpj, "11222333000144");
});

test("segunda chamada equivalente reutiliza faturamento sem duplicar", async () => {
  const ambiente = criarAmbiente();

  const primeira = await executar(ambiente);
  const segunda = await executar(ambiente);

  assert.equal(primeira.statusCode, 201);
  assert.equal(segunda.statusCode, 200);
  assert.equal(segunda.body.reutilizado, true);
  assert.equal(primeira.body.faturamentoId, segunda.body.faturamentoId);
  assert.equal(listarFaturamentos(ambiente.db).length, 1);
});

test("duas chamadas simultaneas nao criam faturamentos duplicados", async () => {
  const ambiente = criarAmbiente({
    atorUid: "comercial-1",
    usuarioEmpresa: { role: "comercial", status: "ativo" },
  });

  const [primeira, segunda] = await Promise.all([
    executar(ambiente),
    executar(ambiente),
  ]);

  assert.deepEqual(
    [primeira.statusCode, segunda.statusCode].sort(),
    [200, 201]
  );
  assert.equal(listarFaturamentos(ambiente.db).length, 1);
});

test("criadoPor vem do usuario autenticado", async () => {
  const ambiente = criarAmbiente({
    atorUid: "financeiro-1",
    usuarioEmpresa: { role: "financeiro", status: "ativo" },
  });

  const res = await executar(ambiente);
  const faturamento = ambiente.db.get(pathFaturamento());

  assert.equal(res.statusCode, 201);
  assert.equal(faturamento.criadoPor, "financeiro-1");
});

test("segmento vem da empresa real", async () => {
  const ambiente = criarAmbiente({
    empresa: { segmento: "oficina" },
    venda: criarVenda({ tipoVenda: "pecas" }),
  });

  await executar(ambiente, {
    empresaId: "empresa-1",
    vendaId: "venda-1",
    segmento: "comercio",
  });
  const faturamento = ambiente.db.get(pathFaturamento());

  assert.equal(faturamento.contextoFiscal.operacao.segmento, "oficina");
});

test("payload nao falsifica totais cliente ou tipo da origem", async () => {
  const ambiente = criarAmbiente({
    venda: criarVenda({
      clienteNome: "Cliente Confiavel",
      total: 45,
    }),
  });

  await executar(ambiente, {
    empresaId: "empresa-1",
    vendaId: "venda-1",
    total: 9999,
    clienteNome: "Cliente Falso",
    tipoVenda: "pecas",
  });
  const faturamento = ambiente.db.get(pathFaturamento());

  assert.equal(faturamento.totais.valorLiquido, 45);
  assert.equal(faturamento.contextoFiscal.destinatario.nome, "Cliente Teste");
  assert.equal(faturamento.origem.tipo, "venda");
});

test("roles autorizadas podem preparar faturamento", async (t) => {
  for (const role of ["administrador_empresa", "financeiro", "comercial"]) {
    await t.test(role, async () => {
      const ambiente = criarAmbiente({
        atorUid: `${role}-1`,
        usuarioEmpresa: { role, status: "ativo" },
      });

      const res = await executar(ambiente);

      assert.equal(res.statusCode, 201);
    });
  }
});

test("rota nao expoe delete de faturamento", async () => {
  const express = require("express");
  const app = express();
  const ambiente = criarAmbiente();
  app.use(express.json());
  app.use("/api/faturamentos", require("../faturamentoRoutes"));

  const server = app.listen(0);
  const { port } = server.address();

  try {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/faturamentos/${pathFaturamento().split("/").pop()}`,
      { method: "DELETE" }
    );

    assert.equal(response.status, 404);
    assert.equal(listarFaturamentos(ambiente.db).length, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
