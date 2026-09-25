const test = require("node:test");
const assert = require("node:assert/strict");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const { criarHandlerCriar } = require("../agendaRoutes");

const PROJECT_ID = "demo-renovar-erp-agenda-concorrencia";
const OWNER_UID = "owner-agenda";
const EMPRESA_ID = "empresa-agenda";

let app;
let firestore;

const inicializar = () => {
  assert.equal(typeof process.env.FIRESTORE_EMULATOR_HOST, "string");
  if (!app) {
    app = admin.initializeApp({ projectId: PROJECT_ID }, "agenda-concorrencia");
    firestore = getFirestore(app);
  }
  return firestore;
};

const limpar = async () => {
  const response = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: "DELETE" }
  );
  assert.equal(response.ok, true);
};

const prepararEmpresa = async (empresaId = EMPRESA_ID) => {
  const db = inicializar();
  const empresa = db.collection("users").doc(OWNER_UID).collection("empresas").doc(empresaId);
  await Promise.all([
    empresa.set({ segmento: "clientes", ownerUid: OWNER_UID }),
    empresa.collection("clientesComerciais").doc("c1").set({
      nome: "Cliente", telefone: "", email: "", ativo: true,
    }),
    empresa.collection("servicos").doc("s1").set({
      nome: "Servico", valor: 100, status: "ativo",
    }),
  ]);
};

const criarBarreira = (esperados = 2) => {
  let chegadas = 0;
  let liberada = false;
  let liberar;
  const promessa = new Promise((resolve) => { liberar = resolve; });
  return async () => {
    if (liberada) return;
    chegadas += 1;
    if (chegadas >= esperados) {
      liberada = true;
      liberar();
      return;
    }
    await Promise.race([
      promessa,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout na barreira concorrente.")), 5000)),
    ]);
  };
};

const instrumentarDb = (barreira) => {
  const db = inicializar();
  return {
    collection: (...args) => db.collection(...args),
    runTransaction: (callback) => db.runTransaction(async (transaction) => callback({
      get: async (referencia) => {
        const snapshot = await transaction.get(referencia);
        if (String(referencia.path || "").includes("/agendaControles/")) await barreira();
        return snapshot;
      },
      create: (...args) => transaction.create(...args),
      set: (...args) => transaction.set(...args),
      update: (...args) => transaction.update(...args),
    })),
  };
};

const chamar = async (db, { empresaId = EMPRESA_ID, data = "2026-09-24", horaInicio, horaFim }) => {
  const handler = criarHandlerCriar({ getDb: () => db, agora: () => admin.firestore.FieldValue.serverTimestamp() });
  const res = { status(codigo) { this.codigo = codigo; return this; }, json(payload) { this.payload = payload; return this; } };
  const inicio = Number(horaInicio.slice(0, 2)) * 60 + Number(horaInicio.slice(3));
  const fim = Number(horaFim.slice(0, 2)) * 60 + Number(horaFim.slice(3));
  await handler({
    user: { uid: OWNER_UID },
    body: {
      ownerUid: OWNER_UID, empresaId, clienteId: "c1", servicoId: "s1", data,
      horaInicio, horaFim, duracaoMinutos: fim - inicio, observacoes: "",
    },
  }, res);
  return { statusHttp: res.codigo, ...res.payload };
};

const listarAtivos = async (empresaId = EMPRESA_ID) => {
  const snapshot = await inicializar().collection("users").doc(OWNER_UID).collection("empresas")
    .doc(empresaId).collection("agendamentos").get();
  return snapshot.docs.map((doc) => doc.data()).filter((item) => item.status !== "cancelado");
};

test.beforeEach(async () => {
  await limpar();
  await prepararEmpresa();
});

test.after(async () => {
  if (app) await app.delete();
});

test("duas criacoes concorrentes no mesmo intervalo deixam exatamente uma ativa", async () => {
  const barreira = criarBarreira();
  const resultados = await Promise.all([
    chamar(instrumentarDb(barreira), { horaInicio: "09:00", horaFim: "10:00" }),
    chamar(instrumentarDb(barreira), { horaInicio: "09:00", horaFim: "10:00" }),
  ]);
  assert.deepEqual(resultados.map((item) => item.statusHttp).sort(), [201, 409]);
  assert.equal((await listarAtivos()).length, 1);
});

test("duas criacoes concorrentes parcialmente sobrepostas deixam uma ativa", async () => {
  const barreira = criarBarreira();
  const resultados = await Promise.all([
    chamar(instrumentarDb(barreira), { horaInicio: "09:00", horaFim: "10:00" }),
    chamar(instrumentarDb(barreira), { horaInicio: "09:30", horaFim: "10:30" }),
  ]);
  assert.deepEqual(resultados.map((item) => item.statusHttp).sort(), [201, 409]);
  assert.equal((await listarAtivos()).length, 1);
});

test("intervalos concorrentes adjacentes podem ser criados", async () => {
  const barreira = criarBarreira();
  const resultados = await Promise.all([
    chamar(instrumentarDb(barreira), { horaInicio: "09:00", horaFim: "10:00" }),
    chamar(instrumentarDb(barreira), { horaInicio: "10:00", horaFim: "11:00" }),
  ]);
  assert.deepEqual(resultados.map((item) => item.statusHttp).sort(), [201, 201]);
  assert.equal((await listarAtivos()).length, 2);
});

test("datas e empresas diferentes nao disputam o mesmo controle", async () => {
  await prepararEmpresa("empresa-outra");
  const barreira = criarBarreira();
  const resultados = await Promise.all([
    chamar(instrumentarDb(barreira), { data: "2026-09-24", horaInicio: "09:00", horaFim: "10:00" }),
    chamar(instrumentarDb(barreira), { data: "2026-09-25", horaInicio: "09:00", horaFim: "10:00" }),
    chamar(instrumentarDb(async () => {}), {
      empresaId: "empresa-outra", data: "2026-09-24", horaInicio: "09:00", horaFim: "10:00",
    }),
  ]);
  assert.deepEqual(resultados.map((item) => item.statusHttp).sort(), [201, 201, 201]);
});
