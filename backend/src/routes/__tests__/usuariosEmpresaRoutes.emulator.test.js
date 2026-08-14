const test = require("node:test");
const assert = require("node:assert/strict");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

const {
  criarHandlerCriarConviteUsuarioEmpresa,
} = require("../usuariosEmpresaRoutes");

const PROJECT_ID = "demo-renovar-erp-limite-test";
const APP_NAME = "usuarios-empresa-emulator-test";
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
    app = admin.initializeApp({ projectId: PROJECT_ID }, APP_NAME);
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

const semearEmpresaComUmaVaga = async ({ criarSentinela = true } = {}) => {
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

test.after(async () => {
  if (db) {
    await limparEmulador();
  }

  if (app) {
    await app.delete();
  }
});
