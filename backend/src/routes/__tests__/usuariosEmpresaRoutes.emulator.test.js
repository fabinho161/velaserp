const test = require("node:test");
const assert = require("node:assert/strict");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

const {
  criarHandlerAtualizarStatusUsuarioEmpresa,
  criarHandlerCriarConviteUsuarioEmpresa,
} = require("../usuariosEmpresaRoutes");
const conviteRoutes = require("../conviteRoutes");

const {
  criarHandlerRemoverUsuarioEmpresa,
} = conviteRoutes;

const PROJECT_ID = "demo-renovar-erp-limite-test";
const OWNER_UID = "owner-emulator";
const EMPRESA_ID = "empresa-emulator";
const AGORA = new Date("2026-08-14T12:00:00.000Z");

let app;
let db;

const assertEmulatorIsolado = () => {
  assert.equal(
    typeof process.env.FIRESTORE_EMULATOR_HOST,
    "string",
    "FIRESTORE_EMULATOR_HOST deve estar definido pelo firebase emulators:exec."
  );
  assert.match(PROJECT_ID, /^demo-/);
  assert.equal(process.env.FIREBASE_SERVICE_ACCOUNT_JSON, undefined);
  assert.equal(process.env.GOOGLE_APPLICATION_CREDENTIALS, undefined);
};

const inicializarDb = () => {
  assertEmulatorIsolado();

  if (!app) {
    app = admin.apps.find((firebaseApp) => firebaseApp.name === "[DEFAULT]") ||
      admin.initializeApp({ projectId: PROJECT_ID });
    db = getFirestore(app);
  }

  return db;
};

const limparEmulador = async () => {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  const url = `http://${host}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
  const response = await fetch(url, { method: "DELETE" });

  assert.equal(response.ok, true, `Falha ao limpar dados do Firestore Emulator: ${response.status}`);
};

const criarBarreiraUmaVez = (esperados = 2) => {
  let contador = 0;
  let liberada = false;
  let resolver;
  const promise = new Promise((resolve) => {
    resolver = resolve;
  });

  return {
    async aguardar() {
      if (liberada) return;

      contador += 1;

      if (contador >= esperados) {
        liberada = true;
        resolver();
        return;
      }

      await Promise.race([
        promise,
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error("Timeout aguardando concorrencia no Emulator.")), 5000);
        }),
      ]);
    },
  };
};

const criarDbInstrumentado = ({ barreiraSentinela = null } = {}) => {
  const firestore = inicializarDb();
  const metricas = {
    callbacksTransacao: 0,
    leiturasSentinela: 0,
  };

  return {
    db: {
      collection: (...args) => firestore.collection(...args),
      runTransaction: (callback, options) =>
        firestore.runTransaction(async (transaction) => {
          metricas.callbacksTransacao += 1;

          const transactionInstrumentada = {
            get: async (ref) => {
              const snapshot = await transaction.get(ref);

              if (String(ref.path || "").endsWith("/controles/usuarios")) {
                metricas.leiturasSentinela += 1;

                if (barreiraSentinela) {
                  await barreiraSentinela.aguardar();
                }
              }

              return snapshot;
            },
            set: (...args) => transaction.set(...args),
            update: (...args) => transaction.update(...args),
            delete: (...args) => transaction.delete(...args),
            create: (...args) => transaction.create(...args),
          };

          return callback(transactionInstrumentada);
        }, options),
    },
    metricas,
  };
};

const empresaRef = () =>
  inicializarDb()
    .collection("users")
    .doc(OWNER_UID)
    .collection("empresas")
    .doc(EMPRESA_ID);

const usuariosEmpresaRef = () => empresaRef().collection("usuariosEmpresa");

const controleRef = () => empresaRef().collection("controles").doc("usuarios");

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

const criarExecutor = ({ barreiraSentinela = null } = {}) => {
  let indice = 0;
  const envios = [];
  const { db: dbInstrumentado, metricas } = criarDbInstrumentado({ barreiraSentinela });
  const handler = criarHandlerCriarConviteUsuarioEmpresa({
    getDb: () => dbInstrumentado,
    gerarToken: () => {
      indice += 1;
      return `token-emulator-${indice}`;
    },
    gerarIdUsuarioEmpresa: () => {
      indice += 1;
      return `usuario-emulator-${indice}`;
    },
    criarDataAtual: () => AGORA,
    getBaseUrl: () => "http://app.local",
    enviarEmailConvite: async (payload) => {
      envios.push(payload);
      return { provider: "fake-emulator" };
    },
  });

  return {
    envios,
    handler,
    metricas,
  };
};

const criarExecutorStatus = ({ barreiraSentinela = null } = {}) => {
  const { db: dbInstrumentado, metricas } = criarDbInstrumentado({ barreiraSentinela });
  const handler = criarHandlerAtualizarStatusUsuarioEmpresa({
    getDb: () => dbInstrumentado,
    criarDataAtual: () => AGORA,
  });

  return {
    handler,
    metricas,
  };
};

const criarExecutorRemocao = ({ barreiraSentinela = null } = {}) => {
  const { db: dbInstrumentado, metricas } = criarDbInstrumentado({ barreiraSentinela });
  const handler = criarHandlerRemoverUsuarioEmpresa({
    getDb: () => dbInstrumentado,
    criarDataAtual: () => AGORA,
  });

  return {
    handler,
    metricas,
  };
};

const getHandlerAceitarConviteRegistrado = () => {
  const camada = conviteRoutes.stack.find((layer) => layer.route?.path === "/aceitar");
  const handler = camada?.route?.stack?.at(-1)?.handle;

  assert.equal(typeof handler, "function", "Handler de aceite deve estar registrado em /aceitar.");

  return handler;
};

const executarConvite = async ({ handler, email, nome = "Usuario Emulator" }) => {
  const req = {
    user: {
      uid: OWNER_UID,
      email: "owner@erp.com",
    },
    params: {
      ownerUid: OWNER_UID,
      empresaId: EMPRESA_ID,
    },
    body: {
      nome,
      email,
      role: "visualizacao",
    },
  };
  const res = criarRes();

  await handler(req, res);
  return res;
};

const executarStatus = async ({ handler, usuarioEmpresaId, status }) => {
  const req = {
    user: {
      uid: OWNER_UID,
      email: "owner@erp.com",
    },
    params: {
      ownerUid: OWNER_UID,
      empresaId: EMPRESA_ID,
      usuarioEmpresaId,
    },
    body: {
      status,
    },
  };
  const res = criarRes();

  await handler(req, res);
  return res;
};

const executarRemocao = async ({ handler, usuarioEmpresaId }) => {
  const req = {
    user: {
      uid: OWNER_UID,
      email: "owner@erp.com",
    },
    body: {
      ownerUid: OWNER_UID,
      empresaId: EMPRESA_ID,
      usuarioEmpresaId,
    },
  };
  const res = criarRes();

  await handler(req, res);
  return res;
};

const executarAceite = async ({ token, uid = "aceite-auth", email = "aceite@erp.com" }) => {
  const req = {
    user: {
      uid,
      email,
    },
    body: {
      token,
    },
  };
  const res = criarRes();

  await getHandlerAceitarConviteRegistrado()(req, res);
  return res;
};

const semearEmpresaComUmaVaga = async ({ criarSentinela = true } = {}) => {
  const dadosPonteiroAtivo = {
    nome: "Empresa Emulator",
    ownerUid: OWNER_UID,
    empresaId: EMPRESA_ID,
    usuarioEmpresaId: "ativo-existente",
    email: "ativo@erp.com",
    role: "visualizacao",
    status: "ativo",
    convitePendente: false,
    atualizadoEm: AGORA,
  };

  await inicializarDb().collection("users").doc(OWNER_UID).set({
    email: "owner@erp.com",
    role: "cliente",
  });
  await empresaRef().set({
    nome: "Empresa Emulator",
    ownerUid: OWNER_UID,
    planoEspelho: {
      plano: "basico",
      status: "active",
    },
  });
  await usuariosEmpresaRef().doc("ativo-existente").set({
    nome: "Usuario Ativo",
    email: "ativo@erp.com",
    uidAuth: "ativo-existente",
    status: "ativo",
    role: "visualizacao",
  });
  await inicializarDb()
    .collection("users")
    .doc("ativo-existente")
    .collection("empresas")
    .doc(EMPRESA_ID)
    .set(dadosPonteiroAtivo);
  await inicializarDb()
    .collection("usuariosPorAuth")
    .doc("ativo-existente")
    .collection("empresas")
    .doc(EMPRESA_ID)
    .set(dadosPonteiroAtivo);

  if (criarSentinela) {
    await controleRef().set({
      quantidadeVagasOcupadas: 2,
      limiteAplicado: 3,
      plano: "basico",
      statusPlano: "active",
      fonteLimite: "planoEspelho",
      versao: 1,
    });
  }
};

const semearPendenteValido = async ({ email = "pendente@erp.com", token = "token-pendente" } = {}) => {
  await usuariosEmpresaRef().doc("pendente-existente").set({
    nome: "Usuario Pendente",
    email,
    role: "visualizacao",
    status: "pendente",
    convitePendente: true,
    conviteToken: token,
    conviteExpiraEm: new Date("2026-08-21T12:00:00.000Z"),
    vagaReservada: true,
  });
  await inicializarDb().collection("convitesEmpresa").doc(token).set({
    token,
    ownerUid: OWNER_UID,
    empresaId: EMPRESA_ID,
    usuarioEmpresaId: "pendente-existente",
    nome: "Usuario Pendente",
    email,
    role: "visualizacao",
    status: "pendente",
    expiraEm: new Date("2026-08-21T12:00:00.000Z"),
  });
};

const semearUsuarioInativo = async ({ id, uidAuth, email }) => {
  const dadosPonteiro = {
    nome: "Empresa Emulator",
    ownerUid: OWNER_UID,
    empresaId: EMPRESA_ID,
    usuarioEmpresaId: id,
    email,
    role: "visualizacao",
    status: "inativo",
    convitePendente: false,
    atualizadoEm: AGORA,
  };

  await usuariosEmpresaRef().doc(id).set({
    nome: `Usuario ${id}`,
    email,
    uidAuth,
    status: "inativo",
    role: "visualizacao",
    convitePendente: false,
    dono: false,
    atualizadoEm: AGORA,
  });
  await inicializarDb()
    .collection("users")
    .doc(uidAuth)
    .collection("empresas")
    .doc(EMPRESA_ID)
    .set(dadosPonteiro);
  await inicializarDb()
    .collection("usuariosPorAuth")
    .doc(uidAuth)
    .collection("empresas")
    .doc(EMPRESA_ID)
    .set(dadosPonteiro);
};

const semearUsuarioAtivo = async ({ id, uidAuth, email }) => {
  const dadosPonteiro = {
    nome: "Empresa Emulator",
    ownerUid: OWNER_UID,
    empresaId: EMPRESA_ID,
    usuarioEmpresaId: id,
    email,
    role: "visualizacao",
    status: "ativo",
    convitePendente: false,
    atualizadoEm: AGORA,
  };

  await usuariosEmpresaRef().doc(id).set({
    nome: `Usuario ${id}`,
    email,
    uidAuth,
    status: "ativo",
    role: "visualizacao",
    convitePendente: false,
    dono: false,
    atualizadoEm: AGORA,
  });
  await inicializarDb()
    .collection("users")
    .doc(uidAuth)
    .collection("empresas")
    .doc(EMPRESA_ID)
    .set(dadosPonteiro);
  await inicializarDb()
    .collection("usuariosPorAuth")
    .doc(uidAuth)
    .collection("empresas")
    .doc(EMPRESA_ID)
    .set(dadosPonteiro);
};

const semearUsuarioPendenteAceite = async () => {
  await usuariosEmpresaRef().doc("pendente-aceite").set({
    nome: "Usuario Aceite",
    email: "aceite@erp.com",
    status: "pendente",
    role: "visualizacao",
    convitePendente: true,
    conviteToken: "token-aceite",
    conviteExpiraEm: new Date("2026-08-21T12:00:00.000Z"),
    vagaReservada: true,
    dono: false,
  });
  await inicializarDb().collection("convitesEmpresa").doc("token-aceite").set({
    token: "token-aceite",
    ownerUid: OWNER_UID,
    empresaId: EMPRESA_ID,
    usuarioEmpresaId: "pendente-aceite",
    nome: "Usuario Aceite",
    email: "aceite@erp.com",
    role: "visualizacao",
    status: "pendente",
    expiraEm: new Date("2026-08-21T12:00:00.000Z"),
  });
};

const carregarEstado = async () => {
  const [usuariosSnapshot, convitesSnapshot, controleSnapshot] = await Promise.all([
    usuariosEmpresaRef().get(),
    inicializarDb().collection("convitesEmpresa").get(),
    controleRef().get(),
  ]);
  const usuarios = usuariosSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
  const convites = convitesSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  return {
    usuarios,
    convites,
    controle: controleSnapshot.exists ? controleSnapshot.data() : null,
  };
};

const contarPendentesNovos = (usuarios, emails) =>
  usuarios.filter(
    (usuario) =>
      usuario.status === "pendente" &&
      usuario.vagaReservada === true &&
      emails.includes(usuario.email)
  ).length;

const validarUltimaVaga = async ({ resultados, emails, envios }) => {
  const status = resultados.map((resultado) => resultado.value.statusCode).sort();
  const estado = await carregarEstado();
  const convitesPendentes = estado.convites.filter(
    (convite) => convite.status === "pendente" && emails.includes(convite.email)
  );

  assert.deepEqual(status, [200, 409]);
  assert.equal(contarPendentesNovos(estado.usuarios, emails), 1);
  assert.equal(convitesPendentes.length, 1);
  assert.equal(estado.controle.quantidadeVagasOcupadas, 3);
  assert.equal(estado.controle.limiteAplicado, 3);
  assert.equal(envios.length, 1);

  return estado;
};

test("concorrencia real no Emulator permite somente uma criacao na ultima vaga", async () => {
  for (let tentativa = 0; tentativa < 5; tentativa += 1) {
    await limparEmulador();
    await semearEmpresaComUmaVaga();

    const barreiraSentinela = criarBarreiraUmaVez(2);
    const { envios, handler, metricas } = criarExecutor({ barreiraSentinela });
    const emails = [`novo-a-${tentativa}@erp.com`, `novo-b-${tentativa}@erp.com`];
    const resultados = await Promise.allSettled([
      executarConvite({ handler, email: emails[0], nome: "Novo A" }),
      executarConvite({ handler, email: emails[1], nome: "Novo B" }),
    ]);

    assert.equal(resultados.every((resultado) => resultado.status === "fulfilled"), true);
    await validarUltimaVaga({ resultados, emails, envios });
    assert.ok(metricas.leiturasSentinela >= 2);
    assert.ok(metricas.callbacksTransacao >= 2);
  }
});

test("sentinela inexistente e criada sem permitir duas reservas concorrentes", async () => {
  await limparEmulador();
  await semearEmpresaComUmaVaga({ criarSentinela: false });

  const barreiraSentinela = criarBarreiraUmaVez(2);
  const { envios, handler } = criarExecutor({ barreiraSentinela });
  const emails = ["sem-sentinela-a@erp.com", "sem-sentinela-b@erp.com"];
  const resultados = await Promise.allSettled([
    executarConvite({ handler, email: emails[0] }),
    executarConvite({ handler, email: emails[1] }),
  ]);
  const estado = await validarUltimaVaga({ resultados, emails, envios });

  assert.ok(estado.controle);
});

test("reenvio delta zero concorre com nova criacao e preserva limite real", async () => {
  await limparEmulador();
  await semearEmpresaComUmaVaga();
  await semearPendenteValido();
  await controleRef().set({
    quantidadeVagasOcupadas: 3,
    limiteAplicado: 3,
    plano: "basico",
    statusPlano: "active",
    fonteLimite: "planoEspelho",
    versao: 1,
  });

  const barreiraSentinela = criarBarreiraUmaVez(2);
  const { envios, handler } = criarExecutor({ barreiraSentinela });
  const resultados = await Promise.allSettled([
    executarConvite({ handler, email: "pendente@erp.com", nome: "Pendente" }),
    executarConvite({ handler, email: "nova-sem-vaga@erp.com", nome: "Nova Sem Vaga" }),
  ]);
  const status = resultados.map((resultado) => resultado.value.statusCode).sort();
  const estado = await carregarEstado();

  assert.deepEqual(status, [200, 409]);
  assert.equal(envios.length, 1);
  assert.equal(estado.controle.quantidadeVagasOcupadas, 3);
  assert.equal(
    estado.usuarios.filter((usuario) => usuario.email === "nova-sem-vaga@erp.com").length,
    0
  );
  assert.equal(
    estado.convites.filter((convite) => convite.email === "pendente@erp.com" && convite.status === "pendente").length,
    1
  );
});

test("empresa acima do limite permite delta zero e nega nova reserva", async () => {
  await limparEmulador();
  await inicializarDb().collection("users").doc(OWNER_UID).set({
    email: "owner@erp.com",
    role: "cliente",
  });
  await empresaRef().set({
    nome: "Empresa Acima Limite",
    ownerUid: OWNER_UID,
    planoEspelho: {
      plano: "gratis",
      status: "active",
    },
  });
  await semearPendenteValido({ email: "pendente-acima@erp.com", token: "token-pendente-acima" });
  await controleRef().set({
    quantidadeVagasOcupadas: 2,
    limiteAplicado: 1,
    plano: "gratis",
    statusPlano: "active",
    fonteLimite: "planoEspelho",
    versao: 1,
  });

  const barreiraSentinela = criarBarreiraUmaVez(2);
  const { envios, handler } = criarExecutor({ barreiraSentinela });
  const resultados = await Promise.allSettled([
    executarConvite({ handler, email: "pendente-acima@erp.com", nome: "Pendente Acima" }),
    executarConvite({ handler, email: "nova-acima@erp.com", nome: "Nova Acima" }),
  ]);
  const status = resultados.map((resultado) => resultado.value.statusCode).sort();
  const estado = await carregarEstado();

  assert.deepEqual(status, [200, 409]);
  assert.equal(envios.length, 1);
  assert.equal(estado.controle.quantidadeVagasOcupadas, 2);
  assert.equal(
    estado.usuarios.filter((usuario) => usuario.email === "nova-acima@erp.com").length,
    0
  );
});

test("reativacao e novo convite disputando ultima vaga permitem somente uma operacao", async () => {
  await limparEmulador();
  await semearEmpresaComUmaVaga();
  await semearUsuarioInativo({
    id: "inativo-reativar",
    uidAuth: "uid-reativar",
    email: "reativar@erp.com",
  });

  const barreiraSentinela = criarBarreiraUmaVez(2);
  const { envios, handler: conviteHandler } = criarExecutor({ barreiraSentinela });
  const { handler: statusHandler } = criarExecutorStatus({ barreiraSentinela });
  const resultados = await Promise.allSettled([
    executarStatus({
      handler: statusHandler,
      usuarioEmpresaId: "inativo-reativar",
      status: "ativo",
    }),
    executarConvite({
      handler: conviteHandler,
      email: "disputa-convite@erp.com",
      nome: "Disputa Convite",
    }),
  ]);
  const status = resultados.map((resultado) => resultado.value.statusCode).sort();
  const estado = await carregarEstado();
  const aprovadas = resultados.filter((resultado) => resultado.value.statusCode === 200).length;
  const negadas = resultados.filter((resultado) => resultado.value.statusCode === 409).length;

  assert.deepEqual(status, [200, 409]);
  assert.equal(aprovadas, 1);
  assert.equal(negadas, 1);
  assert.equal(estado.controle.quantidadeVagasOcupadas, 3);
  assert.equal(estado.controle.limiteAplicado, 3);
  assert.ok(envios.length <= 1);
});

test("duas reativacoes disputando ultima vaga permitem somente uma", async () => {
  await limparEmulador();
  await semearEmpresaComUmaVaga();
  await semearUsuarioInativo({
    id: "inativo-a",
    uidAuth: "uid-inativo-a",
    email: "inativo-a@erp.com",
  });
  await semearUsuarioInativo({
    id: "inativo-b",
    uidAuth: "uid-inativo-b",
    email: "inativo-b@erp.com",
  });

  const barreiraSentinela = criarBarreiraUmaVez(2);
  const { handler } = criarExecutorStatus({ barreiraSentinela });
  const resultados = await Promise.allSettled([
    executarStatus({ handler, usuarioEmpresaId: "inativo-a", status: "ativo" }),
    executarStatus({ handler, usuarioEmpresaId: "inativo-b", status: "ativo" }),
  ]);
  const status = resultados.map((resultado) => resultado.value.statusCode).sort();
  const estado = await carregarEstado();
  const reativados = estado.usuarios.filter(
    (usuario) => ["inativo-a", "inativo-b"].includes(usuario.id) && usuario.status === "ativo"
  );

  assert.deepEqual(status, [200, 409]);
  assert.equal(reativados.length, 1);
  assert.equal(estado.controle.quantidadeVagasOcupadas, 3);
});

test("reativacao concorrendo com inativacao mantem sentinela coerente", async () => {
  await limparEmulador();
  await semearEmpresaComUmaVaga();
  await semearUsuarioAtivo({
    id: "ativo-inativar",
    uidAuth: "uid-ativo-inativar",
    email: "ativo-inativar@erp.com",
  });
  await semearUsuarioInativo({
    id: "inativo-reativar",
    uidAuth: "uid-inativo-reativar",
    email: "inativo-reativar@erp.com",
  });
  await controleRef().set({
    quantidadeVagasOcupadas: 3,
    limiteAplicado: 3,
    plano: "basico",
    statusPlano: "active",
    fonteLimite: "planoEspelho",
    versao: 1,
  });

  const barreiraSentinela = criarBarreiraUmaVez(2);
  const { handler } = criarExecutorStatus({ barreiraSentinela });
  const resultados = await Promise.allSettled([
    executarStatus({ handler, usuarioEmpresaId: "inativo-reativar", status: "ativo" }),
    executarStatus({ handler, usuarioEmpresaId: "ativo-inativar", status: "inativo" }),
  ]);
  const estado = await carregarEstado();
  const ativosNaoOwner = estado.usuarios.filter(
    (usuario) => usuario.uidAuth !== OWNER_UID && usuario.status === "ativo"
  ).length;

  assert.equal(resultados.every((resultado) => resultado.status === "fulfilled"), true);
  assert.ok(estado.controle.quantidadeVagasOcupadas >= 2);
  assert.ok(estado.controle.quantidadeVagasOcupadas <= 3);
  assert.equal(estado.controle.quantidadeVagasOcupadas, ativosNaoOwner + 1);
});

test("operacao idempotente concorrente nao duplica consumo de vaga", async () => {
  await limparEmulador();
  await semearEmpresaComUmaVaga();

  const barreiraSentinela = criarBarreiraUmaVez(2);
  const { handler } = criarExecutorStatus({ barreiraSentinela });
  const resultados = await Promise.allSettled([
    executarStatus({ handler, usuarioEmpresaId: "ativo-existente", status: "ativo" }),
    executarStatus({ handler, usuarioEmpresaId: "ativo-existente", status: "ativo" }),
  ]);
  const estado = await carregarEstado();

  assert.equal(resultados.every((resultado) => resultado.status === "fulfilled"), true);
  assert.deepEqual(
    resultados.map((resultado) => resultado.value.statusCode),
    [200, 200]
  );
  assert.equal(estado.controle.quantidadeVagasOcupadas, 2);
});

test("remocao concorrendo com novo convite preserva limite e sentinela", async () => {
  await limparEmulador();
  await semearEmpresaComUmaVaga();
  await semearUsuarioAtivo({
    id: "ativo-remover",
    uidAuth: "uid-ativo-remover",
    email: "ativo-remover@erp.com",
  });
  await controleRef().set({
    quantidadeVagasOcupadas: 3,
    limiteAplicado: 3,
    plano: "basico",
    statusPlano: "active",
    fonteLimite: "planoEspelho",
    versao: 1,
  });

  const barreiraSentinela = criarBarreiraUmaVez(2);
  const { envios, handler: conviteHandler } = criarExecutor({ barreiraSentinela });
  const { handler: remocaoHandler } = criarExecutorRemocao({ barreiraSentinela });
  const resultados = await Promise.allSettled([
    executarRemocao({ handler: remocaoHandler, usuarioEmpresaId: "ativo-remover" }),
    executarConvite({ handler: conviteHandler, email: "remocao-convite@erp.com" }),
  ]);
  const estado = await carregarEstado();

  assert.equal(resultados.every((resultado) => resultado.status === "fulfilled"), true);
  assert.ok(resultados.some((resultado) => resultado.value.statusCode === 200));
  assert.ok([2, 3].includes(estado.controle.quantidadeVagasOcupadas));
  assert.equal(estado.controle.quantidadeVagasOcupadas <= estado.controle.limiteAplicado, true);
  assert.ok(envios.length <= 1);
});

test("remocao concorrendo com reativacao preserva contagem real", async () => {
  await limparEmulador();
  await semearEmpresaComUmaVaga();
  await semearUsuarioAtivo({
    id: "ativo-remover",
    uidAuth: "uid-ativo-remover",
    email: "ativo-remover@erp.com",
  });
  await semearUsuarioInativo({
    id: "inativo-reativar",
    uidAuth: "uid-inativo-reativar",
    email: "inativo-reativar@erp.com",
  });
  await controleRef().set({
    quantidadeVagasOcupadas: 3,
    limiteAplicado: 3,
    plano: "basico",
    statusPlano: "active",
    fonteLimite: "planoEspelho",
    versao: 1,
  });

  const barreiraSentinela = criarBarreiraUmaVez(2);
  const { handler: remocaoHandler } = criarExecutorRemocao({ barreiraSentinela });
  const { handler: statusHandler } = criarExecutorStatus({ barreiraSentinela });
  const resultados = await Promise.allSettled([
    executarRemocao({ handler: remocaoHandler, usuarioEmpresaId: "ativo-remover" }),
    executarStatus({ handler: statusHandler, usuarioEmpresaId: "inativo-reativar", status: "ativo" }),
  ]);
  const estado = await carregarEstado();
  const ativosNaoOwner = estado.usuarios.filter(
    (usuario) => usuario.uidAuth !== OWNER_UID && usuario.status === "ativo"
  ).length;

  assert.equal(resultados.every((resultado) => resultado.status === "fulfilled"), true);
  assert.equal(estado.controle.quantidadeVagasOcupadas, ativosNaoOwner + 1);
  assert.equal(estado.controle.quantidadeVagasOcupadas <= estado.controle.limiteAplicado, true);
});

test("remocao concorrendo com aceite nao deixa acesso ativo residual", async () => {
  await limparEmulador();
  await semearEmpresaComUmaVaga();
  await semearUsuarioPendenteAceite();
  await controleRef().set({
    quantidadeVagasOcupadas: 3,
    limiteAplicado: 3,
    plano: "basico",
    statusPlano: "active",
    fonteLimite: "planoEspelho",
    versao: 1,
  });

  const { handler: remocaoHandler } = criarExecutorRemocao();
  const resultados = await Promise.allSettled([
    executarRemocao({ handler: remocaoHandler, usuarioEmpresaId: "pendente-aceite" }),
    executarAceite({ token: "token-aceite" }),
  ]);
  const estado = await carregarEstado();
  const usuario = estado.usuarios.find((item) => item.id === "pendente-aceite");
  const ponteiroEmpresa = await inicializarDb()
    .collection("users")
    .doc("aceite-auth")
    .collection("empresas")
    .doc(EMPRESA_ID)
    .get();
  const ponteiroAuth = await inicializarDb()
    .collection("usuariosPorAuth")
    .doc("aceite-auth")
    .collection("empresas")
    .doc(EMPRESA_ID)
    .get();

  assert.equal(resultados.every((resultado) => resultado.status === "fulfilled"), true);
  assert.equal(resultados.some((resultado) => resultado.value.statusCode === 200), true);
  assert.equal(usuario.status, "removido");
  assert.notEqual(ponteiroEmpresa.data()?.status, "ativo");
  assert.notEqual(ponteiroAuth.data()?.status, "ativo");
  assert.equal(estado.controle.quantidadeVagasOcupadas, 2);
});

test("duas remocoes simultaneas do mesmo usuario sao idempotentes", async () => {
  await limparEmulador();
  await semearEmpresaComUmaVaga();
  await semearUsuarioAtivo({
    id: "ativo-remover",
    uidAuth: "uid-ativo-remover",
    email: "ativo-remover@erp.com",
  });
  await controleRef().set({
    quantidadeVagasOcupadas: 3,
    limiteAplicado: 3,
    plano: "basico",
    statusPlano: "active",
    fonteLimite: "planoEspelho",
    versao: 1,
  });

  const barreiraSentinela = criarBarreiraUmaVez(2);
  const { handler } = criarExecutorRemocao({ barreiraSentinela });
  const resultados = await Promise.allSettled([
    executarRemocao({ handler, usuarioEmpresaId: "ativo-remover" }),
    executarRemocao({ handler, usuarioEmpresaId: "ativo-remover" }),
  ]);
  const estado = await carregarEstado();
  const usuario = estado.usuarios.find((item) => item.id === "ativo-remover");

  assert.equal(resultados.every((resultado) => resultado.status === "fulfilled"), true);
  assert.deepEqual(resultados.map((resultado) => resultado.value.statusCode), [200, 200]);
  assert.equal(usuario.status, "removido");
  assert.equal(estado.controle.quantidadeVagasOcupadas, 2);
});

test.after(async () => {
  if (db) {
    await limparEmulador();
  }

  if (app) {
    await app.delete();
  }
});
