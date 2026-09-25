const test = require("node:test");
const assert = require("node:assert/strict");
const app = require("../../server");
const {
  criarHandlerCriar,
  criarHandlerEditar,
  criarHandlerTransicao,
} = require("../agendaRoutes");

const caminhoEmpresa = "users/owner/empresas/empresa";

const criarBanco = ({ segmento = "clientes", role = "comercial", ativo = true, cliente = true, servico = true } = {}) => {
  let sequencia = 0;
  const docs = new Map([
    [caminhoEmpresa, { segmento, ownerUid: "owner" }],
    ["users/owner", {}],
    ["users/admin", { role: "admin_master" }],
    ["usuariosPorAuth/guest/empresas/empresa", {
      ownerUid: "owner", status: ativo ? "ativo" : "inativo", usuarioEmpresaId: "m1",
    }],
    [`${caminhoEmpresa}/usuariosEmpresa/m1`, {
      uidAuth: "guest", status: ativo ? "ativo" : "inativo", role,
    }],
  ]);
  if (cliente) docs.set(`${caminhoEmpresa}/clientesComerciais/c1`, {
    nome: "Cliente Canonico", telefone: "119999", email: "cliente@exemplo.com", ativo: true,
  });
  if (servico) docs.set(`${caminhoEmpresa}/servicos/s1`, {
    nome: "Servico Canonico", valor: 125, tempoEstimadoMinutos: 60, status: "ativo",
  });
  const snapshot = (path) => ({ exists: docs.has(path), id: path.split("/").at(-1), data: () => docs.get(path) });
  const ref = (path) => ({
    path, id: path.split("/").at(-1),
    collection: (nome) => collection(`${path}/${nome}`),
  });
  const collection = (path) => ({
    path,
    doc: (id) => ref(`${path}/${id || `novo${++sequencia}`}`),
    where: (campo, operador, valor) => ({ path, campo, operador, valor, consulta: true }),
  });
  const db = {
    collection,
    runTransaction: async (callback) => {
      const writes = [];
      const tx = {
        get: async (item) => {
          if (item.consulta) return {
            docs: [...docs.entries()]
              .filter(([path, data]) => path.startsWith(`${item.path}/`) &&
                path.slice(item.path.length + 1).split("/").length === 1 && data[item.campo] === item.valor)
              .map(([path]) => snapshot(path)),
          };
          return snapshot(item.path);
        },
        create: (item, data) => writes.push(() => docs.set(item.path, data)),
        set: (item, data, options = {}) => writes.push(() => docs.set(
          item.path,
          options.merge ? { ...docs.get(item.path), ...data } : data
        )),
        update: (item, data) => writes.push(() => docs.set(item.path, { ...docs.get(item.path), ...data })),
      };
      const resultado = await callback(tx);
      writes.forEach((write) => write());
      return resultado;
    },
  };
  return { db, docs };
};

const bodyValido = {
  ownerUid: "owner", empresaId: "empresa", clienteId: "c1", servicoId: "s1",
  data: "2026-09-24", horaInicio: "09:00", horaFim: "10:00", duracaoMinutos: 60,
  observacoes: "Observacao",
};

const chamar = async (handler, { body = bodyValido, uid = "owner", id = "a1" } = {}) => {
  const res = { status(codigo) { this.codigo = codigo; return this; }, json(payload) { this.payload = payload; return this; } };
  await handler({ body, user: uid ? { uid } : null, params: { id } }, res);
  return { statusHttp: res.codigo, ...res.payload };
};

test("rota final /api/agenda esta montada e autenticada", async () => {
  const server = app.listen(0);
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/agenda`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    });
    assert.equal(response.status, 401);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("criacao autorizada congela fontes canonicas sem produzir campos fiscais", async () => {
  const { db, docs } = criarBanco();
  const resposta = await chamar(criarHandlerCriar({ getDb: () => db, agora: () => "agora" }));
  assert.equal(resposta.statusHttp, 201);
  const salvo = docs.get(`${caminhoEmpresa}/agendamentos/novo1`);
  assert.equal(salvo.clienteNome, "Cliente Canonico");
  assert.equal(salvo.clienteEmail, "cliente@exemplo.com");
  assert.equal(salvo.servicoNome, "Servico Canonico");
  assert.equal(salvo.valorServico, 125);
  assert.equal(salvo.criadoPor, "owner");
  assert.equal(Object.hasOwn(salvo, "servicoFiscalSnapshot"), false);
  assert.equal(Object.hasOwn(salvo, "localPrestacao"), false);
  assert.equal(docs.get(`${caminhoEmpresa}/agendaControles/2026-09-24`).versao, 1);
});

test("payload arbitrario ou fiscal e rejeitado pela allowlist", async () => {
  for (const extra of [
    { campoArbitrario: "nao aceitar" },
    { servicoFiscalSnapshot: { nbs: "nao aceitar" } },
    { localPrestacao: { municipio: "Nao aceitar" } },
  ]) {
    const { db } = criarBanco();
    const resposta = await chamar(criarHandlerCriar({ getDb: () => db }), {
      body: { ...bodyValido, ...extra },
    });
    assert.equal(resposta.statusHttp, 422);
    assert.equal(resposta.codigo, "agenda_payload_invalido");
  }
});

test("clienteEmail e opcional", async () => {
  const { db, docs } = criarBanco();
  delete docs.get(`${caminhoEmpresa}/clientesComerciais/c1`).email;
  assert.equal((await chamar(criarHandlerCriar({ getDb: () => db }))).statusHttp, 201);
  assert.equal(docs.get(`${caminhoEmpresa}/agendamentos/novo1`).clienteEmail, "");
});

test("criacao nega vinculo, segmento, perfil, cliente e servico invalidos", async () => {
  for (const [opcoes, uid, status] of [
    [{ ativo: false }, "guest", 403],
    [{ segmento: "comercio" }, "owner", 403],
    [{ role: "visualizacao" }, "guest", 403],
    [{ cliente: false }, "owner", 422],
    [{ servico: false }, "owner", 422],
  ]) {
    const { db } = criarBanco(opcoes);
    assert.equal((await chamar(criarHandlerCriar({ getDb: () => db }), { uid })).statusHttp, status);
  }
});

test("criacao e reagendamento rejeitam conflito", async () => {
  const { db, docs } = criarBanco();
  docs.set(`${caminhoEmpresa}/agendamentos/existente`, {
    ...bodyValido, status: "agendado", horaInicio: "09:30", horaFim: "10:30",
  });
  const criar = await chamar(criarHandlerCriar({ getDb: () => db }));
  assert.equal(criar.statusHttp, 409);
  docs.set(`${caminhoEmpresa}/agendamentos/a1`, {
    ...bodyValido, status: "agendado", criadoPor: "owner", criadoEm: "antes",
  });
  const editar = await chamar(criarHandlerEditar({ getDb: () => db }), { id: "a1" });
  assert.equal(editar.statusHttp, 409);
});

test("edicao preserva snapshots e campos historicos quando entidades nao mudam", async () => {
  const { db, docs } = criarBanco();
  docs.set(`${caminhoEmpresa}/agendamentos/a1`, {
    clienteId: "c1", clienteNome: "Nome Historico", clienteTelefone: "antigo", clienteEmail: "antigo@x.com",
    servicoId: "s1", servicoNome: "Servico Historico", valorServico: 80,
    data: "2026-09-24", horaInicio: "08:00", horaFim: "09:00", duracaoMinutos: 60,
    status: "agendado", observacoes: "", criadoPor: "owner", criadoEm: "antes",
    localPrestacao: { legado: true }, servicoFiscalSnapshot: { legado: true },
  });
  const resposta = await chamar(criarHandlerEditar({ getDb: () => db, agora: () => "agora" }), {
    id: "a1", body: { ...bodyValido, horaInicio: "10:00", horaFim: "11:00" },
  });
  assert.equal(resposta.statusHttp, 200);
  const salvo = docs.get(`${caminhoEmpresa}/agendamentos/a1`);
  assert.equal(salvo.clienteNome, "Nome Historico");
  assert.equal(salvo.servicoNome, "Servico Historico");
  assert.deepEqual(salvo.localPrestacao, { legado: true });
  assert.deepEqual(salvo.servicoFiscalSnapshot, { legado: true });
  assert.equal(salvo.criadoEm, "antes");
  assert.equal(docs.get(`${caminhoEmpresa}/agendaControles/2026-09-24`).versao, 1);
});

test("edicao recota snapshots somente quando cliente e servico mudam explicitamente", async () => {
  const { db, docs } = criarBanco();
  docs.set(`${caminhoEmpresa}/clientesComerciais/c2`, {
    nome: "Cliente Novo", telefone: "2200", email: "novo@exemplo.com", ativo: true,
  });
  docs.set(`${caminhoEmpresa}/servicos/s2`, {
    nome: "Servico Novo", valor: 240, status: "ativo",
  });
  docs.set(`${caminhoEmpresa}/agendamentos/a1`, {
    clienteId: "c1", clienteNome: "Cliente Antigo", clienteTelefone: "1100", clienteEmail: "antigo@x.com",
    servicoId: "s1", servicoNome: "Servico Antigo", valorServico: 80,
    data: "2026-09-24", horaInicio: "08:00", horaFim: "09:00", duracaoMinutos: 60,
    status: "agendado", observacoes: "", criadoPor: "owner", criadoEm: "antes",
  });
  const resposta = await chamar(criarHandlerEditar({ getDb: () => db }), {
    id: "a1", body: { ...bodyValido, clienteId: "c2", servicoId: "s2", horaInicio: "10:00", horaFim: "11:00" },
  });
  assert.equal(resposta.statusHttp, 200);
  const salvo = docs.get(`${caminhoEmpresa}/agendamentos/a1`);
  assert.equal(salvo.clienteNome, "Cliente Novo");
  assert.equal(salvo.clienteEmail, "novo@exemplo.com");
  assert.equal(salvo.servicoNome, "Servico Novo");
  assert.equal(salvo.valorServico, 240);
});

test("edicao inexistente e estado terminal sao rejeitados", async () => {
  const { db, docs } = criarBanco();
  assert.equal((await chamar(criarHandlerEditar({ getDb: () => db }), { id: "ausente" })).statusHttp, 404);
  docs.set(`${caminhoEmpresa}/agendamentos/a1`, { ...bodyValido, status: "concluido" });
  assert.equal((await chamar(criarHandlerEditar({ getDb: () => db }), { id: "a1" })).statusHttp, 409);
});

test("reagendamento entre dias toca ambos os controles atomicamente", async () => {
  const { db, docs } = criarBanco();
  docs.set(`${caminhoEmpresa}/agendamentos/a1`, {
    clienteId: "c1", clienteNome: "Cliente", clienteTelefone: "", clienteEmail: "",
    servicoId: "s1", servicoNome: "Servico", valorServico: 125,
    data: "2026-09-24", horaInicio: "09:00", horaFim: "10:00", duracaoMinutos: 60,
    status: "agendado", observacoes: "", criadoPor: "owner", criadoEm: "antes",
  });
  const resposta = await chamar(criarHandlerEditar({ getDb: () => db, agora: () => "agora" }), {
    id: "a1", body: { ...bodyValido, data: "2026-09-25" },
  });
  assert.equal(resposta.statusHttp, 200);
  assert.equal(docs.get(`${caminhoEmpresa}/agendamentos/a1`).data, "2026-09-25");
  assert.equal(docs.get(`${caminhoEmpresa}/agendaControles/2026-09-24`).versao, 1);
  assert.equal(docs.get(`${caminhoEmpresa}/agendaControles/2026-09-25`).versao, 1);
});

test("destino ocupado preserva integralmente reagendamento de origem", async () => {
  const { db, docs } = criarBanco();
  const original = {
    clienteId: "c1", clienteNome: "Cliente", clienteTelefone: "", clienteEmail: "",
    servicoId: "s1", servicoNome: "Servico", valorServico: 125,
    data: "2026-09-24", horaInicio: "09:00", horaFim: "10:00", duracaoMinutos: 60,
    status: "agendado", observacoes: "", criadoPor: "owner", criadoEm: "antes",
  };
  docs.set(`${caminhoEmpresa}/agendamentos/a1`, original);
  docs.set(`${caminhoEmpresa}/agendamentos/a2`, { ...original, data: "2026-09-25", clienteNome: "Outro" });
  const resposta = await chamar(criarHandlerEditar({ getDb: () => db }), {
    id: "a1", body: { ...bodyValido, data: "2026-09-25" },
  });
  assert.equal(resposta.statusHttp, 409);
  assert.deepEqual(docs.get(`${caminhoEmpresa}/agendamentos/a1`), original);
  assert.equal([...docs.keys()].some((path) => path.includes("/agendaControles/")), false);
});

test("confirmacao inicio e cancelamento sao autoritativos e cancelamento e idempotente", async () => {
  const { db, docs } = criarBanco();
  docs.set(`${caminhoEmpresa}/agendamentos/a1`, { ...bodyValido, status: "agendado" });
  assert.equal((await chamar(criarHandlerTransicao("confirmar", { getDb: () => db, agora: () => "confirmado" }))).status, "confirmado");
  assert.equal((await chamar(criarHandlerTransicao("iniciar", { getDb: () => db, agora: () => "iniciado" }))).status, "em_atendimento");
  const cancelar = criarHandlerTransicao("cancelar", { getDb: () => db, agora: () => "cancelado" });
  assert.equal((await chamar(cancelar)).status, "cancelado");
  assert.equal((await chamar(cancelar)).reutilizado, true);
  assert.equal(docs.get(`${caminhoEmpresa}/agendamentos/a1`).canceladoEm, "cancelado");
  assert.equal(docs.get(`${caminhoEmpresa}/agendaControles/2026-09-24`).versao, 1);
});

test("cancelamento libera intervalo para nova criacao", async () => {
  const { db, docs } = criarBanco();
  docs.set(`${caminhoEmpresa}/agendamentos/a1`, { ...bodyValido, status: "agendado" });
  const cancelar = criarHandlerTransicao("cancelar", { getDb: () => db, agora: () => "cancelado" });
  assert.equal((await chamar(cancelar)).status, "cancelado");
  const criar = await chamar(criarHandlerCriar({ getDb: () => db, agora: () => "novo" }), {
    body: { ...bodyValido, horaInicio: "09:30", horaFim: "10:30" },
  });
  assert.equal(criar.statusHttp, 201);
  assert.equal(docs.get(`${caminhoEmpresa}/agendaControles/2026-09-24`).versao, 2);
});

test("transicao invalida e documento inexistente sao rejeitados", async () => {
  const { db, docs } = criarBanco();
  assert.equal((await chamar(criarHandlerTransicao("cancelar", { getDb: () => db }))).statusHttp, 404);
  docs.set(`${caminhoEmpresa}/agendamentos/a1`, { ...bodyValido, status: "concluido" });
  assert.equal((await chamar(criarHandlerTransicao("cancelar", { getDb: () => db }))).statusHttp, 409);
});
