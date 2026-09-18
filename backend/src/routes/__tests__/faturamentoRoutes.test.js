const test = require("node:test");
const assert = require("node:assert/strict");

const {
  criarHandlerClassificarTributacaoFaturamento,
  criarHandlerSalvarClassificacaoManual,
  criarHandlerListarCatalogoTributario,
  criarHandlerCancelarFaturamento,
  criarHandlerCriarFaturamento,
  criarHandlerCriarFaturamentoAtendimento,
  criarHandlerDeterminarFiscalFaturamento,
  criarHandlerListarFaturamentos,
  criarHandlerObterFaturamento,
  criarHandlerPrepararFaturamento,
  criarHandlerSalvarContextoOperacionalFaturamento,
} = require("../faturamentoRoutes");

const pathAtendimento = (id = "agenda-1") => `users/owner-1/empresas/empresa-1/agendamentos/${id}`;
const pathFaturamentoAtendimento = (id = "agenda-1") =>
  `users/owner-1/empresas/empresa-1/faturamentos/atendimento_${id}_preparacao_v1`;

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

  async get() {
    const docs = [...this._db.store.entries()]
      .filter(([path]) => path.startsWith(`${this.path}/`))
      .filter(([path]) => path.split("/").length === this.path.split("/").length + 1)
      .map(([path, data]) => new FakeDocSnapshot(
        new FakeDocRef(this._db, path),
        structuredClone(data)
      ));

    return { docs };
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

  update(ref, data) {
    this._writeStarted = true;
    this.writes.push({
      tipo: "update",
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

        if (write.tipo === "update") {
          if (!this.store.has(write.path)) {
            throw new Error("Documento nao existe.");
          }

          const atual = this.store.get(write.path);
          const atualizado = structuredClone(atual);

          Object.entries(structuredClone(write.data)).forEach(([chave, valor]) => {
            const partes = chave.split(".");

            if (partes.length === 1) {
              atualizado[chave] = valor;
              return;
            }

            let alvo = atualizado;
            partes.slice(0, -1).forEach((parte) => {
              if (!alvo[parte] || typeof alvo[parte] !== "object") {
                alvo[parte] = {};
              }

              alvo = alvo[parte];
            });
            alvo[partes.at(-1)] = valor;
          });

          this.store.set(write.path, atualizado);
          return;
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

const fiscalItemSnapshotClassificado = (origemProduto) => ({
  ...fiscalItemSnapshot(),
  origemProduto,
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

const contextoOperacionalPayload = (dados = {}) => ({
  empresaId: "empresa-1",
  finalidadeOperacao: "normal",
  presencaComprador: "presencial",
  consumidorFinal: true,
  indicadorIEDestinatario: "nao_contribuinte",
  naturezaOperacao: "Venda de mercadoria",
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
  const prepararHandler = criarHandlerPrepararFaturamento({
    getDb: () => db,
    criarTimestampServidor: () => SERVER_TIMESTAMP,
  });
  const cancelarHandler = criarHandlerCancelarFaturamento({
    getDb: () => db,
    criarTimestampServidor: () => SERVER_TIMESTAMP,
  });
  const determinarFiscalHandler = criarHandlerDeterminarFiscalFaturamento({
    getDb: () => db,
    criarTimestampServidor: () => SERVER_TIMESTAMP,
  });
  const classificarTributacaoHandler = criarHandlerClassificarTributacaoFaturamento({
    getDb: () => db,
    criarTimestampServidor: () => SERVER_TIMESTAMP,
  });
  const classificacaoManualHandler = criarHandlerSalvarClassificacaoManual({
    getDb: () => db,
    agora: () => "2026-09-16T12:00:00Z",
  });
  const catalogoHandler = criarHandlerListarCatalogoTributario({ getDb: () => db });
  const contextoHandler = criarHandlerSalvarContextoOperacionalFaturamento({
    getDb: () => db,
    criarTimestampServidor: () => SERVER_TIMESTAMP,
  });
  const listarHandler = criarHandlerListarFaturamentos({
    getDb: () => db,
  });
  const obterHandler = criarHandlerObterFaturamento({
    getDb: () => db,
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
    prepararHandler,
    cancelarHandler,
    determinarFiscalHandler,
    classificarTributacaoHandler,
    classificacaoManualHandler,
    catalogoHandler,
    contextoHandler,
    listarHandler,
    obterHandler,
    req: (body = { empresaId: "empresa-1", vendaId }, params = {}) => ({
      user: { uid: atorUid, email: `${atorUid}@erp.com` },
      body,
      params,
      query: body,
    }),
  };
};

const executar = async (ambiente, body) => {
  const res = criarRes();
  await ambiente.handler(ambiente.req(body), res);
  return res;
};

const executarPreparar = async (
  ambiente,
  faturamentoId = pathFaturamento().split("/").pop(),
  body = { empresaId: "empresa-1" }
) => {
  const res = criarRes();
  await ambiente.prepararHandler(
    ambiente.req(body, { faturamentoId }),
    res
  );
  return res;
};

const executarCancelar = async (
  ambiente,
  faturamentoId = pathFaturamento().split("/").pop(),
  body = { empresaId: "empresa-1", motivoCancelamento: "Erro operacional" }
) => {
  const res = criarRes();
  await ambiente.cancelarHandler(
    ambiente.req(body, { faturamentoId }),
    res
  );
  return res;
};

const executarContexto = async (
  ambiente,
  faturamentoId = pathFaturamento().split("/").pop(),
  body = contextoOperacionalPayload()
) => {
  const res = criarRes();
  await ambiente.contextoHandler(
    ambiente.req(body, { faturamentoId }),
    res
  );
  return res;
};

const executarDeterminarFiscal = async (
  ambiente,
  faturamentoId = pathFaturamento().split("/").pop(),
  body = { empresaId: "empresa-1" }
) => {
  const res = criarRes();
  await ambiente.determinarFiscalHandler(
    ambiente.req(body, { faturamentoId }),
    res
  );
  return res;
};

const executarClassificarTributacao = async (
  ambiente,
  faturamentoId = pathFaturamento().split("/").pop(),
  body = { empresaId: "empresa-1" }
) => {
  const res = criarRes();
  await ambiente.classificarTributacaoHandler(
    ambiente.req(body, { faturamentoId }),
    res
  );
  return res;
};

const executarListar = async (
  ambiente,
  query = { empresaId: "empresa-1" },
  user = undefined
) => {
  const res = criarRes();
  await ambiente.listarHandler({
    user: user === undefined ? ambiente.req().user : user,
    query,
  }, res);
  return res;
};

const executarObter = async (
  ambiente,
  faturamentoId = pathFaturamento().split("/").pop(),
  query = { empresaId: "empresa-1" },
  user = undefined
) => {
  const res = criarRes();
  await ambiente.obterHandler({
    user: user === undefined ? ambiente.req().user : user,
    query,
    params: { faturamentoId },
  }, res);
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

test("catalogo autenticado retorna somente opcoes necessarias e respeita vinculo", async () => {
  const ambiente = criarAmbiente();
  const res = criarRes();
  await ambiente.catalogoHandler(ambiente.req({ empresaId: "empresa-1" }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.versao, "2025.002-v1.60");
  assert.ok(res.body.itens.some((item) => item.cClassTrib === "000001"));
  assert.equal(Object.hasOwn(res.body.itens[0], "metadadosOficiais"), false);
  const negado = criarRes();
  await ambiente.catalogoHandler(ambiente.req({ empresaId: "outra" }), negado);
  assert.equal(negado.statusCode, 404);
});

test("classificacao manual e atomica, auditada, idempotente e preserva venda", async () => {
  const ambiente = criarAmbiente();
  await executar(ambiente);
  const antes = ambiente.db.get(pathFaturamento());
  const vendaAntes = ambiente.db.get(pathVenda());
  const req = ambiente.req({ empresaId: "empresa-1", itens: [
    { indice: 0, origemItemId: "produto-1", cst: "000", cClassTrib: "000001", observacao: "Contador" },
  ] }, { faturamentoId: "venda_venda-1_preparacao_v1" });
  const res = criarRes();
  await ambiente.classificacaoManualHandler(req, res);
  assert.equal(res.statusCode, 200);
  const depois = ambiente.db.get(pathFaturamento());
  assert.equal(depois.classificacaoTributaria.itens[0].classificadoPor, "owner-1");
  assert.equal(depois.classificacaoTributaria.itens[0].ibsCbs.fonte.tipo, "manual");
  assert.deepEqual(depois.itens, antes.itens);
  assert.deepEqual(depois.contextoFiscal, antes.contextoFiscal);
  assert.deepEqual(ambiente.db.get(pathVenda()), vendaAntes);
  const repetido = criarRes();
  await ambiente.classificacaoManualHandler(req, repetido);
  assert.equal(repetido.body.alterou, false);
  const invalida = criarRes();
  await ambiente.classificacaoManualHandler(ambiente.req({ empresaId: "empresa-1", itens: [
    { indice: 0, origemItemId: "produto-1", cst: "999", cClassTrib: "000001" },
  ] }, req.params), invalida);
  assert.equal(invalida.statusCode, 400);
  assert.deepEqual(ambiente.db.get(pathFaturamento()), depois);
});

test("classificacao manual exige autenticacao, vinculo ativo, role e rascunho", async () => {
  const body = { empresaId: "empresa-1", itens: [
    { indice: 0, origemItemId: "produto-1", cst: "000", cClassTrib: "000001" },
  ] };
  const params = { faturamentoId: "venda_venda-1_preparacao_v1" };
  const anonimo = criarAmbiente();
  const reqAnonimo = anonimo.req(body, params);
  reqAnonimo.user = null;
  const resAnonimo = criarRes();
  await anonimo.classificacaoManualHandler(reqAnonimo, resAnonimo);
  assert.equal(resAnonimo.statusCode, 401);

  for (const role of ["comercial", "estoque", "producao", "visualizacao"]) {
    const ambiente = criarAmbiente({ atorUid: `usuario-${role}`, usuarioEmpresa: { role } });
    await executar(ambiente);
    const antes = ambiente.db.get(pathFaturamento());
    const res = criarRes();
    await ambiente.classificacaoManualHandler(ambiente.req(body, params), res);
    assert.equal(res.statusCode, 403, role);
    assert.deepEqual(ambiente.db.get(pathFaturamento()), antes);
  }
  const inativo = criarAmbiente({ atorUid: "inativo", usuarioEmpresa: { role: "financeiro", status: "inativo" } });
  await executar(inativo);
  const resInativo = criarRes();
  await inativo.classificacaoManualHandler(inativo.req(body, params), resInativo);
  assert.equal(resInativo.statusCode, 403);

  const owner = criarAmbiente();
  const inexistente = criarRes();
  await owner.classificacaoManualHandler(owner.req(body, params), inexistente);
  assert.equal(inexistente.statusCode, 404);
  await executar(owner);
  for (const status of ["preparado", "cancelado"]) {
    owner.db.set(pathFaturamento(), { ...owner.db.get(pathFaturamento()), status });
    const res = criarRes();
    await owner.classificacaoManualHandler(owner.req(body, params), res);
    assert.equal(res.statusCode, 409, status);
  }
});

test("administrador e financeiro ativos podem classificar; empresa cruzada e negada", async () => {
  const body = { empresaId: "empresa-1", itens: [
    { indice: 0, origemItemId: "produto-1", cst: "000", cClassTrib: "000001" },
  ] };
  const params = { faturamentoId: "venda_venda-1_preparacao_v1" };
  for (const role of ["administrador_empresa", "financeiro"]) {
    const ambiente = criarAmbiente({ atorUid: `usuario-${role}`, usuarioEmpresa: { role } });
    await executar(ambiente);
    const res = criarRes();
    await ambiente.classificacaoManualHandler(ambiente.req(body, params), res);
    assert.equal(res.statusCode, 200, role);
    assert.equal(res.body.classificacaoTributaria.itens[0].classificadoPor, `usuario-${role}`);
    const cruzada = criarRes();
    await ambiente.classificacaoManualHandler(ambiente.req({ ...body, empresaId: "empresa-2" }, params), cruzada);
    assert.equal(cruzada.statusCode, 404);
  }
});

test("segundo item invalido nao persiste primeiro e classificador antigo nao apaga decisao manual", async () => {
  const venda = criarVenda({ itens: [
    criarVenda().itens[0],
    { ...criarVenda().itens[0], produtoId: "produto-2" },
  ] });
  const ambiente = criarAmbiente({ venda });
  await executar(ambiente);
  const antes = ambiente.db.get(pathFaturamento());
  const params = { faturamentoId: "venda_venda-1_preparacao_v1" };
  const primeiro = { indice: 0, origemItemId: "produto-1", cst: "000", cClassTrib: "000001" };
  const resInvalido = criarRes();
  await ambiente.classificacaoManualHandler(ambiente.req({ empresaId: "empresa-1", itens: [
    primeiro, { indice: 1, origemItemId: "produto-2", cst: "999", cClassTrib: "000001" },
  ] }, params), resInvalido);
  assert.equal(resInvalido.statusCode, 400);
  assert.deepEqual(ambiente.db.get(pathFaturamento()), antes);
  const resValido = criarRes();
  await ambiente.classificacaoManualHandler(ambiente.req({ empresaId: "empresa-1", itens: [primeiro] }, params), resValido);
  assert.equal(resValido.statusCode, 200);
  const manual = ambiente.db.get(pathFaturamento()).classificacaoTributaria;
  await executarClassificarTributacao(ambiente);
  assert.deepEqual(ambiente.db.get(pathFaturamento()).classificacaoTributaria, manual);
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

test("listagem de faturamentos exige autenticacao", async () => {
  const ambiente = criarAmbiente();

  const res = await executarListar(ambiente, { empresaId: "empresa-1" }, null);

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.codigo, "token_ausente");
});

const criarAmbienteAtendimento = ({ status = "concluido", segmento = "clientes", atorUid = "owner-1", role = "comercial", valorServico = 100 } = {}) => {
  const ambiente = criarAmbiente({ atorUid, usuarioEmpresa: { role }, empresa: { segmento } });
  ambiente.db.set(pathAtendimento(), {
    status, clienteId: "cliente-1", clienteNome: "Nome historico", clienteTelefone: "62999990000",
    servicoId: "servico-1", servicoNome: "Servico historico", valorServico, data: "2026-09-01",
  });
  ambiente.db.set("users/owner-1/empresas/empresa-1/clientesComerciais/cliente-1", {
    nome: "Nome atual", documento: "11122233344", fiscal: { cpf: "" },
  });
  ambiente.db.set("users/owner-1/empresas/empresa-1/configuracoes/fiscal", {
    cnpj: "11222333000144", inscricaoMunicipal: "123", municipio: "Itumbiara",
  });
  const handler = criarHandlerCriarFaturamentoAtendimento({
    getDb: () => ambiente.db, criarTimestampServidor: () => SERVER_TIMESTAMP,
  });
  const executarAtendimento = async () => {
    const res = criarRes();
    await handler(ambiente.req({ empresaId: "empresa-1", agendamentoId: "agenda-1" }), res);
    return res;
  };
  return { ...ambiente, executarAtendimento };
};

test("atendimento concluido cria um rascunho idempotente sem tocar conta a receber", async () => {
  const ambiente = criarAmbienteAtendimento();
  const [primeiro, segundo] = await Promise.all([
    ambiente.executarAtendimento(), ambiente.executarAtendimento(),
  ]);
  assert.deepEqual([primeiro.statusCode, segundo.statusCode], [201, 200]);
  const fat = ambiente.db.get(pathFaturamentoAtendimento());
  assert.equal(fat.origem.tipo, "atendimento");
  assert.equal(fat.origem.documentoId, "agenda-1");
  assert.equal(fat.status, "rascunho");
  assert.equal(fat.totais.valorLiquido, 100);
  assert.equal(fat.contextoFiscal.destinatario.nome, "Nome historico");
  assert.equal(fat.itens[0].descricao, "Servico historico");
  assert.equal(fat.itens[0].tipoItem, "servico");
  assert.equal(ambiente.db.transactions.flatMap((tx) => tx.reads).some((path) => path.includes("contasReceber")), false);
  assert.equal(ambiente.db.transactions.flatMap((tx) => tx.writes).some((write) => write.path.includes("contasReceber")), false);
});

test("outros estados, segmento e role sem permissao sao negados", async () => {
  for (const status of ["agendado", "confirmado", "em_atendimento", "cancelado"]) {
    const ambiente = criarAmbienteAtendimento({ status });
    assert.equal((await ambiente.executarAtendimento()).statusCode, 409);
    assert.equal(ambiente.db.get(pathFaturamentoAtendimento()), undefined);
  }
  for (const segmento of ["comercio", "industria", "oficina"]) {
    assert.equal((await criarAmbienteAtendimento({ segmento }).executarAtendimento()).statusCode, 403);
  }
  assert.equal((await criarAmbienteAtendimento({ atorUid: "guest", role: "producao" }).executarAtendimento()).statusCode, 403);
  assert.equal((await criarAmbienteAtendimento({ atorUid: "guest", role: "financeiro" }).executarAtendimento()).statusCode, 201);
});

test("valor invalido impede persistencia; zero e legado sem concluidoEm permanecem validos", async () => {
  assert.equal((await criarAmbienteAtendimento({ valorServico: -1 }).executarAtendimento()).statusCode, 422);
  const ambiente = criarAmbienteAtendimento({ valorServico: 0 });
  assert.equal((await ambiente.executarAtendimento()).statusCode, 201);
  const fat = ambiente.db.get(pathFaturamentoAtendimento());
  assert.equal(fat.totais.valorLiquido, 0);
  assert.equal("concluidoEm" in fat, false);
});

test("endereco HTTP final de atendimento esta montado e exige autenticacao", async () => {
  const app = require("../../server");
  const server = app.listen(0);
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/faturamentos/atendimento`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    });
    assert.equal(response.status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("owner lista somente faturamentos da empresa autorizada", async () => {
  const ambiente = criarAmbiente();

  await executar(ambiente);
  ambiente.db.set(pathEmpresa("owner-1", "empresa-2"), {
    nome: "Empresa 2",
    ownerUid: "owner-1",
    segmento: "comercio",
  });
  ambiente.db.set(pathFaturamento("venda-2", "owner-1", "empresa-2"), {
    status: "rascunho",
    origem: { numeroDocumento: "PED-0002" },
  });

  const res = await executarListar(ambiente);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.faturamentos.length, 1);
  assert.equal(res.body.faturamentos[0].origem.numeroDocumento, "PED-0001");
});

test("visualizacao pode listar sem permissao de mutacao", async () => {
  const ambiente = criarAmbiente({
    atorUid: "visualizacao-1",
    usuarioEmpresa: { role: "visualizacao", status: "ativo" },
  });

  await executar(criarAmbiente());
  ambiente.db.set(pathFaturamento(), {
    status: "rascunho",
    origem: { numeroDocumento: "PED-0001" },
  });
  const res = await executarListar(ambiente);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.faturamentos.length, 1);
});

test("usuario sem permissao nao lista faturamentos", async () => {
  const ambiente = criarAmbiente({
    atorUid: "estoque-1",
    usuarioEmpresa: { role: "estoque", status: "ativo" },
  });

  const res = await executarListar(ambiente);

  assert.equal(res.statusCode, 403);
});

test("listagem de empresa cruzada retorna 404", async () => {
  const ambiente = criarAmbiente({ atorUid: "comercial-1" });
  ambiente.db.set(pathEmpresa("owner-2", "empresa-2"), {
    nome: "Outra Empresa",
    ownerUid: "owner-2",
    segmento: "comercio",
  });
  ambiente.db.set(pathFaturamento("venda-2", "owner-2", "empresa-2"), {
    status: "rascunho",
  });

  const res = await executarListar(ambiente, { empresaId: "empresa-2" });

  assert.equal(res.statusCode, 404);
});

test("detalhe retorna faturamento valido", async () => {
  const ambiente = criarAmbiente();

  await executar(ambiente);
  const res = await executarObter(ambiente);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.faturamento.id, pathFaturamento().split("/").pop());
  assert.equal(res.body.faturamento.origem.numeroDocumento, "PED-0001");
});

test("detalhe inexistente retorna 404", async () => {
  const ambiente = criarAmbiente();

  const res = await executarObter(ambiente);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.codigo, "faturamento_nao_encontrado");
});

test("contexto operacional exige autenticacao", async () => {
  const ambiente = criarAmbiente();
  await executar(ambiente);
  const res = criarRes();

  await ambiente.contextoHandler({
    user: null,
    body: contextoOperacionalPayload(),
    params: { faturamentoId: pathFaturamento().split("/").pop() },
  }, res);

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.codigo, "token_ausente");
});

test("contexto operacional de faturamento inexistente retorna 404", async () => {
  const ambiente = criarAmbiente({ venda: null });

  const res = await executarContexto(ambiente);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.codigo, "faturamento_nao_encontrado");
});

test("contexto operacional de empresa cruzada e negado", async () => {
  const ambiente = criarAmbiente({ atorUid: "comercial-1" });
  ambiente.db.set(pathEmpresa("owner-2", "empresa-2"), {
    nome: "Outra Empresa",
    ownerUid: "owner-2",
    segmento: "comercio",
  });
  ambiente.db.set(
    pathFaturamento("venda-2", "owner-2", "empresa-2"),
    { status: "rascunho" }
  );

  const res = await executarContexto(
    ambiente,
    "venda_venda-2_preparacao_v1",
    contextoOperacionalPayload({ empresaId: "empresa-2" })
  );

  assert.equal(res.statusCode, 404);
});

test("usuario sem permissao nao salva contexto operacional", async () => {
  const ambiente = criarAmbiente({
    atorUid: "estoque-1",
    usuarioEmpresa: { role: "estoque", status: "ativo" },
  });

  await executar(ambiente, { empresaId: "empresa-1", vendaId: "venda-1" });
  const res = await executarContexto(ambiente);

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.codigo, "sem_permissao");
});

test("rascunho aceita contexto operacional", async () => {
  const ambiente = criarAmbiente({
    atorUid: "comercial-1",
    usuarioEmpresa: { role: "comercial", status: "ativo" },
  });

  await executar(ambiente);
  const res = await executarContexto(ambiente);
  const faturamento = ambiente.db.get(pathFaturamento());

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, "rascunho");
  assert.equal(faturamento.contextoFiscal.operacao.finalidadeOperacao, "normal");
  assert.equal(faturamento.contextoFiscal.operacao.presencaComprador, "presencial");
  assert.equal(faturamento.contextoFiscal.operacao.consumidorFinal, true);
  assert.equal(
    faturamento.contextoFiscal.operacao.indicadorIEDestinatario,
    "nao_contribuinte"
  );
  assert.equal(faturamento.contextoFiscal.operacao.destinoOperacao, "interna");
  assert.equal(faturamento.contextoFiscal.operacao.naturezaOperacao, "Venda de mercadoria");
  assert.equal(faturamento.contextoOperacionalAtualizadoPor, "comercial-1");
  assert.deepEqual(faturamento.contextoOperacionalAtualizadoEm, SERVER_TIMESTAMP);
});

test("faturamento preparado rejeita edicao de contexto operacional", async () => {
  const ambiente = criarAmbiente();

  await executar(ambiente);
  await executarContexto(ambiente);
  await executarPreparar(ambiente);
  const antes = ambiente.db.get(pathFaturamento());
  const res = await executarContexto(ambiente, pathFaturamento().split("/").pop(), {
    ...contextoOperacionalPayload(),
    naturezaOperacao: "Outra natureza",
  });
  const depois = ambiente.db.get(pathFaturamento());

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.codigo, "status_invalido");
  assert.deepEqual(depois, antes);
});

test("faturamento cancelado rejeita edicao de contexto operacional", async () => {
  const ambiente = criarAmbiente();

  await executar(ambiente);
  await executarCancelar(ambiente);
  const res = await executarContexto(ambiente);

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.codigo, "status_invalido");
});

test("payload com campo protegido nao altera origem snapshots itens ou totais", async () => {
  const ambiente = criarAmbiente({ empresa: { segmento: "oficina" } });

  await executar(ambiente);
  const antes = ambiente.db.get(pathFaturamento());
  const res = await executarContexto(ambiente, pathFaturamento().split("/").pop(), {
    ...contextoOperacionalPayload(),
    origem: { tipo: "falso" },
    segmento: "comercio",
    tipoOperacao: "falso",
    dataOperacao: "2099-01-01",
    emitente: { cnpj: "000" },
    destinatario: { nome: "Outro" },
    itens: [],
    totais: { valorLiquido: 0 },
    status: "preparado",
  });
  const depois = ambiente.db.get(pathFaturamento());

  assert.equal(res.statusCode, 200);
  assert.deepEqual(depois.origem, antes.origem);
  assert.deepEqual(depois.contextoFiscal.emitente, antes.contextoFiscal.emitente);
  assert.deepEqual(depois.contextoFiscal.destinatario, antes.contextoFiscal.destinatario);
  assert.deepEqual(depois.itens, antes.itens);
  assert.deepEqual(depois.totais, antes.totais);
  assert.equal(depois.status, "rascunho");
  assert.equal(depois.contextoFiscal.operacao.segmento, "oficina");
  assert.equal(depois.contextoFiscal.operacao.tipoOperacao, "venda");
  assert.equal(depois.contextoFiscal.operacao.dataOperacao, "2026-09-12");
});

test("contexto operacional com enum invalido retorna 400", async () => {
  const ambiente = criarAmbiente();

  await executar(ambiente);
  const res = await executarContexto(ambiente, pathFaturamento().split("/").pop(), {
    ...contextoOperacionalPayload(),
    presencaComprador: "Presencial",
  });

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.codigo, "presenca_comprador_invalida");
});

test("contexto operacional com boolean invalido retorna 400", async () => {
  const ambiente = criarAmbiente();

  await executar(ambiente);
  const res = await executarContexto(ambiente, pathFaturamento().split("/").pop(), {
    ...contextoOperacionalPayload(),
    consumidorFinal: "true",
  });

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.codigo, "consumidor_final_invalido");
});

test("destino operacional e calculado no backend", async () => {
  const ambiente = criarAmbiente({
    venda: criarVenda({
      destinatarioSnapshot: {
        ...destinatarioSnapshot(),
        uf: "SP",
      },
    }),
  });

  await executar(ambiente);
  const res = await executarContexto(ambiente, pathFaturamento().split("/").pop(), {
    ...contextoOperacionalPayload(),
    destinoOperacao: "interna",
  });
  const faturamento = ambiente.db.get(pathFaturamento());

  assert.equal(res.statusCode, 200);
  assert.equal(faturamento.contextoFiscal.operacao.destinoOperacao, "interestadual");
});

test("contexto concorrente com preparacao nao gera preparado parcial", async () => {
  const ambiente = criarAmbiente({
    atorUid: "financeiro-1",
    usuarioEmpresa: { role: "financeiro", status: "ativo" },
  });

  await executar(ambiente);
  const [preparar, contexto] = await Promise.all([
    executarPreparar(ambiente),
    executarContexto(ambiente),
  ]);
  const faturamento = ambiente.db.get(pathFaturamento());

  assert.equal(preparar.statusCode, 409);
  assert.equal(contexto.statusCode, 200);
  assert.equal(faturamento.status, "rascunho");
  assert.equal(Object.hasOwn(faturamento, "preparadoEm"), false);
});

test("preparar faturamento inexistente retorna 404", async () => {
  const ambiente = criarAmbiente({ venda: null });

  const res = await executarPreparar(ambiente);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.codigo, "faturamento_nao_encontrado");
});

test("preparar faturamento de empresa nao autorizada nao acessa outro owner", async () => {
  const ambiente = criarAmbiente({ atorUid: "comercial-1" });
  ambiente.db.set(pathEmpresa("owner-2", "empresa-2"), {
    nome: "Outra Empresa",
    ownerUid: "owner-2",
    segmento: "comercio",
  });
  ambiente.db.set(
    pathFaturamento("venda-2", "owner-2", "empresa-2"),
    { status: "rascunho" }
  );

  const res = await executarPreparar(
    ambiente,
    "venda_venda-2_preparacao_v1",
    { empresaId: "empresa-2" }
  );

  assert.equal(res.statusCode, 404);
});

test("usuario sem permissao nao prepara faturamento", async () => {
  const ambiente = criarAmbiente({
    atorUid: "estoque-1",
    usuarioEmpresa: { role: "estoque", status: "ativo" },
  });

  ambiente.db.set(pathFaturamento(), { status: "rascunho" });
  const res = await executarPreparar(ambiente);

  assert.equal(res.statusCode, 403);
  assert.equal(ambiente.db.get(pathFaturamento()).status, "rascunho");
});

test("rascunho valido vira preparado com metadados", async () => {
  const ambiente = criarAmbiente({
    atorUid: "financeiro-1",
    usuarioEmpresa: { role: "financeiro", status: "ativo" },
  });

  await executar(ambiente);
  await executarContexto(ambiente);
  const res = await executarPreparar(ambiente);
  const faturamento = ambiente.db.get(pathFaturamento());

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, "preparado");
  assert.equal(res.body.reutilizado, false);
  assert.equal(faturamento.status, "preparado");
  assert.deepEqual(faturamento.pendencias, []);
  assert.deepEqual(faturamento.preparadoEm, SERVER_TIMESTAMP);
  assert.equal(faturamento.preparadoPor, "financeiro-1");
});

test("cadastro completo com contexto incompleto nao prepara", async () => {
  const ambiente = criarAmbiente();

  await executar(ambiente);
  const res = await executarPreparar(ambiente);
  const faturamento = ambiente.db.get(pathFaturamento());

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.codigo, "faturamento_com_pendencias");
  assert.deepEqual(res.body.pendencias, [
    "finalidade_operacao_ausente",
    "presenca_comprador_ausente",
    "consumidor_final_nao_informado",
    "indicador_ie_destinatario_ausente",
    "destino_operacao_indeterminado",
    "natureza_operacao_ausente",
  ]);
  assert.equal(faturamento.status, "rascunho");
});

test("rascunho com pendencia continua rascunho", async () => {
  const venda = criarVenda();
  delete venda.fiscalEmpresaSnapshot;
  const ambiente = criarAmbiente({ venda });

  await executar(ambiente);
  await executarContexto(ambiente);
  const res = await executarPreparar(ambiente);
  const faturamento = ambiente.db.get(pathFaturamento());

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.codigo, "faturamento_com_pendencias");
  assert.deepEqual(res.body.pendencias, [
    "emitente_snapshot_ausente",
    "destino_operacao_indeterminado",
  ]);
  assert.equal(faturamento.status, "rascunho");
  assert.equal(Object.hasOwn(faturamento, "preparadoEm"), false);
});

test("preparar faturamento ja preparado e idempotente", async () => {
  const ambiente = criarAmbiente();

  await executar(ambiente);
  await executarContexto(ambiente);
  await executarPreparar(ambiente);
  const antes = ambiente.db.get(pathFaturamento());
  const res = await executarPreparar(ambiente);
  const depois = ambiente.db.get(pathFaturamento());

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.reutilizado, true);
  assert.deepEqual(depois, antes);
});

test("cancelado nao pode ser preparado", async () => {
  const ambiente = criarAmbiente();

  await executar(ambiente);
  await executarCancelar(ambiente);
  const res = await executarPreparar(ambiente);

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.codigo, "faturamento_cancelado");
});

test("preparacao nao altera snapshots", async () => {
  const ambiente = criarAmbiente();

  await executar(ambiente);
  await executarContexto(ambiente);
  const antes = ambiente.db.get(pathFaturamento());
  await executarPreparar(ambiente);
  const depois = ambiente.db.get(pathFaturamento());

  assert.deepEqual(depois.origem, antes.origem);
  assert.deepEqual(depois.contextoFiscal, antes.contextoFiscal);
  assert.deepEqual(depois.itens, antes.itens);
  assert.deepEqual(depois.totais, antes.totais);
});

test("rascunho pode ser cancelado", async () => {
  const ambiente = criarAmbiente({
    atorUid: "financeiro-1",
    usuarioEmpresa: { role: "financeiro", status: "ativo" },
  });

  await executar(ambiente);
  const res = await executarCancelar(ambiente);
  const faturamento = ambiente.db.get(pathFaturamento());

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, "cancelado");
  assert.equal(faturamento.status, "cancelado");
  assert.deepEqual(faturamento.canceladoEm, SERVER_TIMESTAMP);
  assert.equal(faturamento.canceladoPor, "financeiro-1");
  assert.equal(faturamento.motivoCancelamento, "Erro operacional");
});

test("preparado pode ser cancelado", async () => {
  const ambiente = criarAmbiente();

  await executar(ambiente);
  await executarContexto(ambiente);
  await executarPreparar(ambiente);
  const res = await executarCancelar(ambiente);

  assert.equal(res.statusCode, 200);
  assert.equal(ambiente.db.get(pathFaturamento()).status, "cancelado");
});

test("cancelar faturamento inexistente retorna 404", async () => {
  const ambiente = criarAmbiente({ venda: null });

  const res = await executarCancelar(ambiente);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.codigo, "faturamento_nao_encontrado");
});

test("usuario sem permissao nao cancela faturamento", async () => {
  const ambiente = criarAmbiente({
    atorUid: "comercial-1",
    usuarioEmpresa: { role: "comercial", status: "ativo" },
  });

  await executar(ambiente);
  const res = await executarCancelar(ambiente);

  assert.equal(res.statusCode, 403);
  assert.equal(ambiente.db.get(pathFaturamento()).status, "rascunho");
});

test("cancelar faturamento de empresa cruzada e negado", async () => {
  const ambiente = criarAmbiente({ atorUid: "financeiro-1" });
  ambiente.db.set(pathEmpresa("owner-2", "empresa-2"), {
    nome: "Outra Empresa",
    ownerUid: "owner-2",
    segmento: "comercio",
  });
  ambiente.db.set(
    pathFaturamento("venda-2", "owner-2", "empresa-2"),
    { status: "rascunho" }
  );

  const res = await executarCancelar(
    ambiente,
    "venda_venda-2_preparacao_v1",
    { empresaId: "empresa-2" }
  );

  assert.equal(res.statusCode, 404);
});

test("cancelamento repetido e idempotente e preserva metadados", async () => {
  const ambiente = criarAmbiente({
    atorUid: "financeiro-1",
    usuarioEmpresa: { role: "financeiro", status: "ativo" },
  });

  await executar(ambiente);
  await executarCancelar(ambiente, pathFaturamento().split("/").pop(), {
    empresaId: "empresa-1",
    motivoCancelamento: "Primeiro motivo",
  });
  const antes = ambiente.db.get(pathFaturamento());
  const res = await executarCancelar(ambiente, pathFaturamento().split("/").pop(), {
    empresaId: "empresa-1",
    motivoCancelamento: "Segundo motivo",
  });
  const depois = ambiente.db.get(pathFaturamento());

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.reutilizado, true);
  assert.equal(depois.motivoCancelamento, "Primeiro motivo");
  assert.deepEqual(depois.canceladoEm, antes.canceladoEm);
  assert.equal(depois.canceladoPor, antes.canceladoPor);
});

test("cancelamento nao altera venda original", async () => {
  const ambiente = criarAmbiente();

  await executar(ambiente);
  const vendaAntes = ambiente.db.get(pathVenda());
  await executarCancelar(ambiente);
  const vendaDepois = ambiente.db.get(pathVenda());

  assert.deepEqual(vendaDepois, vendaAntes);
});

test("preparar e cancelar simultaneamente mantem estado final valido", async () => {
  const ambiente = criarAmbiente({
    atorUid: "financeiro-1",
    usuarioEmpresa: { role: "financeiro", status: "ativo" },
  });

  await executar(ambiente);
  await executarContexto(ambiente);
  const [preparar, cancelar] = await Promise.all([
    executarPreparar(ambiente),
    executarCancelar(ambiente),
  ]);
  const faturamento = ambiente.db.get(pathFaturamento());

  assert.equal([200, 409].includes(preparar.statusCode), true);
  assert.equal(cancelar.statusCode, 200);
  assert.equal(["preparado", "cancelado"].includes(faturamento.status), true);

  if (faturamento.status === "cancelado") {
    assert.equal(Object.hasOwn(faturamento, "canceladoEm"), true);
  }
});

test("determinar fiscal exige autenticacao", async () => {
  const ambiente = criarAmbiente();
  await executar(ambiente);
  const res = criarRes();

  await ambiente.determinarFiscalHandler({
    user: null,
    body: { empresaId: "empresa-1" },
    params: { faturamentoId: pathFaturamento().split("/").pop() },
  }, res);

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.codigo, "token_ausente");
});

test("determinar fiscal persiste resultado em rascunho autorizado", async () => {
  const ambiente = criarAmbiente({
    atorUid: "financeiro-1",
    usuarioEmpresa: { role: "financeiro", status: "ativo" },
    venda: criarVenda({
      itens: [
        {
          ...criarVenda().itens[0],
          fiscalSnapshot: fiscalItemSnapshotClassificado("revenda"),
        },
      ],
    }),
  });

  await executar(ambiente);
  await executarContexto(ambiente);
  const res = await executarDeterminarFiscal(ambiente);
  const faturamento = ambiente.db.get(pathFaturamento());

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.determinacaoFiscal.itens[0].cfopEfetivo, "5102");
  assert.deepEqual(faturamento.determinacaoFiscalAtualizadaEm, SERVER_TIMESTAMP);
  assert.equal(faturamento.determinacaoFiscalAtualizadaPor, "financeiro-1");
  assert.equal(faturamento.determinacaoFiscal.itens[0].cfopEfetivo, "5102");
});

test("comercial nao executa determinacao fiscal", async () => {
  const ambiente = criarAmbiente({
    atorUid: "comercial-1",
    usuarioEmpresa: { role: "comercial", status: "ativo" },
  });

  await executar(ambiente);
  await executarContexto(ambiente);
  const res = await executarDeterminarFiscal(ambiente);

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.codigo, "sem_permissao");
  assert.equal(Object.hasOwn(ambiente.db.get(pathFaturamento()), "determinacaoFiscal"), false);
});

test("determinar fiscal de empresa cruzada e negado", async () => {
  const ambiente = criarAmbiente({ atorUid: "financeiro-1" });
  ambiente.db.set(pathEmpresa("owner-2", "empresa-2"), {
    nome: "Outra Empresa",
    ownerUid: "owner-2",
    segmento: "comercio",
  });
  ambiente.db.set(
    pathFaturamento("venda-2", "owner-2", "empresa-2"),
    { status: "rascunho" }
  );

  const res = await executarDeterminarFiscal(
    ambiente,
    "venda_venda-2_preparacao_v1",
    { empresaId: "empresa-2" }
  );

  assert.equal(res.statusCode, 404);
});

test("determinar fiscal de faturamento inexistente retorna 404", async () => {
  const ambiente = criarAmbiente({ venda: null });

  const res = await executarDeterminarFiscal(ambiente);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.codigo, "faturamento_nao_encontrado");
});

test("determinar fiscal rejeita faturamento cancelado", async () => {
  const ambiente = criarAmbiente();

  await executar(ambiente);
  await executarCancelar(ambiente);
  const res = await executarDeterminarFiscal(ambiente);

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.codigo, "status_invalido");
});

test("determinar fiscal rejeita faturamento preparado", async () => {
  const ambiente = criarAmbiente({
    venda: criarVenda({
      itens: [
        {
          ...criarVenda().itens[0],
          fiscalSnapshot: fiscalItemSnapshotClassificado("revenda"),
        },
      ],
    }),
  });

  await executar(ambiente);
  await executarContexto(ambiente);
  await executarPreparar(ambiente);
  const antes = ambiente.db.get(pathFaturamento());
  const res = await executarDeterminarFiscal(ambiente);
  const depois = ambiente.db.get(pathFaturamento());

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.codigo, "status_invalido");
  assert.deepEqual(depois, antes);
});

test("determinar fiscal nao altera snapshots venda estoque ou financeiro", async () => {
  const venda = criarVenda({
    itens: [
      {
        ...criarVenda().itens[0],
        fiscalSnapshot: fiscalItemSnapshotClassificado("fabricado"),
      },
    ],
  });
  const ambiente = criarAmbiente({ venda });

  await executar(ambiente);
  await executarContexto(ambiente);
  const faturamentoAntes = ambiente.db.get(pathFaturamento());
  const vendaAntes = ambiente.db.get(pathVenda());
  await executarDeterminarFiscal(ambiente);
  const faturamentoDepois = ambiente.db.get(pathFaturamento());
  const vendaDepois = ambiente.db.get(pathVenda());

  assert.deepEqual(faturamentoDepois.origem, faturamentoAntes.origem);
  assert.deepEqual(faturamentoDepois.contextoFiscal, faturamentoAntes.contextoFiscal);
  assert.deepEqual(faturamentoDepois.itens, faturamentoAntes.itens);
  assert.deepEqual(faturamentoDepois.totais, faturamentoAntes.totais);
  assert.deepEqual(vendaDepois, vendaAntes);
});

test("reexecucao de determinacao fiscal e idempotente para mesma regra", async () => {
  const ambiente = criarAmbiente({
    venda: criarVenda({
      itens: [
        {
          ...criarVenda().itens[0],
          fiscalSnapshot: fiscalItemSnapshotClassificado("revenda"),
        },
      ],
    }),
  });

  await executar(ambiente);
  await executarContexto(ambiente);
  await executarDeterminarFiscal(ambiente);
  const primeira = ambiente.db.get(pathFaturamento()).determinacaoFiscal;
  await executarDeterminarFiscal(ambiente);
  const segunda = ambiente.db.get(pathFaturamento()).determinacaoFiscal;

  assert.deepEqual(segunda, primeira);
});

test("classificar tributacao exige autenticacao", async () => {
  const ambiente = criarAmbiente();
  await executar(ambiente);
  const res = criarRes();

  await ambiente.classificarTributacaoHandler({
    user: null,
    body: { empresaId: "empresa-1" },
    params: { faturamentoId: pathFaturamento().split("/").pop() },
  }, res);

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.codigo, "token_ausente");
});

test("classificar tributacao persiste resultado em rascunho autorizado", async () => {
  const ambiente = criarAmbiente({
    atorUid: "financeiro-1",
    usuarioEmpresa: { role: "financeiro", status: "ativo" },
    venda: criarVenda({
      itens: [
        {
          ...criarVenda().itens[0],
          fiscalSnapshot: fiscalItemSnapshotClassificado("revenda"),
        },
      ],
    }),
  });

  await executar(ambiente);
  await executarContexto(ambiente);
  await executarDeterminarFiscal(ambiente);
  const res = await executarClassificarTributacao(ambiente);
  const faturamento = ambiente.db.get(pathFaturamento());

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.classificacaoTributaria.regraVersao, "tributaria_v1");
  assert.deepEqual(res.body.classificacaoTributaria.itens[0].ibsCbs, {
    cst: null,
    cClassTrib: null,
    fonte: null,
  });
  assert.deepEqual(faturamento.classificacaoTributariaAtualizadaEm, SERVER_TIMESTAMP);
  assert.equal(faturamento.classificacaoTributariaAtualizadaPor, "financeiro-1");
  assert.equal(
    faturamento.classificacaoTributaria.pendencias.includes(
      "classificacao_ibs_cbs_nao_determinada"
    ),
    true
  );
});

test("administrador_empresa pode classificar tributacao", async () => {
  const ambiente = criarAmbiente({
    atorUid: "admin-empresa-1",
    usuarioEmpresa: { role: "administrador_empresa", status: "ativo" },
  });

  await executar(ambiente);
  const res = await executarClassificarTributacao(ambiente);

  assert.equal(res.statusCode, 200);
});

test("comercial e visualizacao nao classificam tributacao", async () => {
  for (const role of ["comercial", "visualizacao"]) {
    const ambiente = criarAmbiente({
      atorUid: `${role}-1`,
      usuarioEmpresa: { role, status: "ativo" },
    });

    ambiente.db.set(pathFaturamento(), { status: "rascunho" });
    const res = await executarClassificarTributacao(ambiente);

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.codigo, "sem_permissao");
    assert.equal(
      Object.hasOwn(
        ambiente.db.get(pathFaturamento()),
        "classificacaoTributaria"
      ),
      false
    );
  }
});

test("classificar tributacao de empresa cruzada e negado", async () => {
  const ambiente = criarAmbiente({ atorUid: "financeiro-1" });
  ambiente.db.set(pathEmpresa("owner-2", "empresa-2"), {
    nome: "Outra Empresa",
    ownerUid: "owner-2",
    segmento: "comercio",
  });
  ambiente.db.set(
    pathFaturamento("venda-2", "owner-2", "empresa-2"),
    { status: "rascunho" }
  );

  const res = await executarClassificarTributacao(
    ambiente,
    "venda_venda-2_preparacao_v1",
    { empresaId: "empresa-2" }
  );

  assert.equal(res.statusCode, 404);
});

test("classificar tributacao de faturamento inexistente retorna 404", async () => {
  const ambiente = criarAmbiente({ venda: null });

  const res = await executarClassificarTributacao(ambiente);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.codigo, "faturamento_nao_encontrado");
});

test("classificar tributacao rejeita faturamento cancelado", async () => {
  const ambiente = criarAmbiente();

  await executar(ambiente);
  await executarCancelar(ambiente);
  const res = await executarClassificarTributacao(ambiente);

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.codigo, "status_invalido");
});

test("classificar tributacao rejeita faturamento preparado", async () => {
  const ambiente = criarAmbiente();

  await executar(ambiente);
  await executarContexto(ambiente);
  await executarPreparar(ambiente);
  const antes = ambiente.db.get(pathFaturamento());
  const res = await executarClassificarTributacao(ambiente);
  const depois = ambiente.db.get(pathFaturamento());

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.codigo, "status_invalido");
  assert.deepEqual(depois, antes);
});

test("classificar tributacao nao altera snapshots determinacao venda estoque ou financeiro", async () => {
  const venda = criarVenda({
    itens: [
      {
        ...criarVenda().itens[0],
        fiscalSnapshot: fiscalItemSnapshotClassificado("fabricado"),
      },
    ],
  });
  const ambiente = criarAmbiente({ venda });

  await executar(ambiente);
  await executarContexto(ambiente);
  await executarDeterminarFiscal(ambiente);
  const faturamentoAntes = ambiente.db.get(pathFaturamento());
  const vendaAntes = ambiente.db.get(pathVenda());
  await executarClassificarTributacao(ambiente);
  const faturamentoDepois = ambiente.db.get(pathFaturamento());
  const vendaDepois = ambiente.db.get(pathVenda());

  assert.deepEqual(faturamentoDepois.origem, faturamentoAntes.origem);
  assert.deepEqual(faturamentoDepois.contextoFiscal, faturamentoAntes.contextoFiscal);
  assert.deepEqual(faturamentoDepois.itens, faturamentoAntes.itens);
  assert.deepEqual(faturamentoDepois.totais, faturamentoAntes.totais);
  assert.deepEqual(faturamentoDepois.determinacaoFiscal, faturamentoAntes.determinacaoFiscal);
  assert.deepEqual(vendaDepois, vendaAntes);
});

test("reexecucao de classificacao tributaria e idempotente para mesma regra", async () => {
  const ambiente = criarAmbiente({
    venda: criarVenda({
      itens: [
        {
          ...criarVenda().itens[0],
          fiscalSnapshot: fiscalItemSnapshotClassificado("revenda"),
        },
      ],
    }),
  });

  await executar(ambiente);
  await executarContexto(ambiente);
  await executarDeterminarFiscal(ambiente);
  await executarClassificarTributacao(ambiente);
  const primeira = ambiente.db.get(pathFaturamento()).classificacaoTributaria;
  await executarClassificarTributacao(ambiente);
  const segunda = ambiente.db.get(pathFaturamento()).classificacaoTributaria;

  assert.deepEqual(segunda, primeira);
});
