const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const app = require("../../server");
const {
  criarHandlerCriar,
  criarHandlerEditar,
  criarHandlerExcluir,
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
  const obterCampo = (data, campo) => campo.split(".").reduce((valor, chave) => valor?.[chave], data);
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
                path.slice(item.path.length + 1).split("/").length === 1 &&
                obterCampo(data, item.campo) === item.valor)
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
        delete: (item) => writes.push(() => docs.delete(item.path)),
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

const bodyMultisservico = (servicoIds = ["s1"]) => {
  const { servicoId: _servicoId, ...body } = bodyValido;
  return { ...body, servicoIds };
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
    const deleteResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/agenda/a1`, {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: "{}",
    });
    assert.equal(deleteResponse.status, 401);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("Rules mantem exclusao direta de agendamentos bloqueada", () => {
  const rules = readFileSync(path.resolve(__dirname, "../../../..", "firestore.rules"), "utf8");
  assert.match(
    rules,
    /match \/agendamentos\/\{agendamentoId\}\s*\{[\s\S]*?allow create, update: if false;\s*allow delete: if false;/,
  );
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

test("contrato multisservico aceita um item e mantem agregados de compatibilidade", async () => {
  const { db, docs } = criarBanco();
  const resposta = await chamar(criarHandlerCriar({ getDb: () => db, agora: () => "agora" }), {
    body: bodyMultisservico(),
  });
  assert.equal(resposta.statusHttp, 201);
  const salvo = docs.get(`${caminhoEmpresa}/agendamentos/novo1`);
  assert.deepEqual(salvo.servicosSnapshot, [
    { servicoId: "s1", servicoNome: "Servico Canonico", duracaoMinutos: 60, valorUnitario: 125 },
  ]);
  assert.equal(salvo.valorTotalServicos, 125);
  assert.equal(salvo.duracaoTotalServicos, 60);
  assert.equal(salvo.servicoId, "s1");
  assert.equal(salvo.servicoNome, "Servico Canonico");
  assert.equal(salvo.valorServico, 125);
});

test("contrato multisservico aceita exatamente dois servicos distintos", async () => {
  const { db, docs } = criarBanco();
  docs.set(`${caminhoEmpresa}/servicos/s2`, {
    nome: "Segundo", valor: 75, tempoEstimadoMinutos: 30, status: "ativo",
  });
  const resposta = await chamar(criarHandlerCriar({ getDb: () => db }), {
    body: bodyMultisservico(["s1", "s2"]),
  });
  assert.equal(resposta.statusHttp, 201);
  const salvo = docs.get(`${caminhoEmpresa}/agendamentos/novo1`);
  assert.equal(salvo.servicosSnapshot.length, 2);
  assert.equal(salvo.valorTotalServicos, 200);
  assert.equal(salvo.duracaoTotalServicos, 90);
});

test("contrato multisservico preserva ordem, totaliza snapshots canonicos e separa duracao operacional", async () => {
  const { db, docs } = criarBanco();
  docs.set(`${caminhoEmpresa}/servicos/s2`, {
    nome: "Alinhamento", valor: 120, tempoEstimadoMinutos: 45, status: "ativo",
  });
  docs.set(`${caminhoEmpresa}/servicos/s3`, {
    nome: "Cortesia", valor: 0, tempoEstimadoMinutos: 0, status: "ativo",
  });
  const resposta = await chamar(criarHandlerCriar({ getDb: () => db, agora: () => "agora" }), {
    body: { ...bodyMultisservico(["s2", "s1", "s3"]), horaFim: "12:00", duracaoMinutos: 180 },
  });
  assert.equal(resposta.statusHttp, 201);
  const salvo = docs.get(`${caminhoEmpresa}/agendamentos/novo1`);
  assert.deepEqual(salvo.servicosSnapshot.map((item) => item.servicoId), ["s2", "s1", "s3"]);
  assert.deepEqual(salvo.servicosSnapshot.map((item) => item.servicoNome), [
    "Alinhamento", "Servico Canonico", "Cortesia",
  ]);
  assert.equal(salvo.valorTotalServicos, 245);
  assert.equal(salvo.valorServico, 245);
  assert.equal(salvo.duracaoTotalServicos, 105);
  assert.equal(salvo.duracaoMinutos, 180);
  assert.equal(salvo.servicoNome, "Alinhamento + 2 serviços");
});

test("servicoIds presente tem precedencia e payload novo invalido nunca recorre ao legado", async () => {
  for (const servicoIds of [[], [""], ["s1", "s1"], "s1"]) {
    const { db, docs } = criarBanco();
    const resposta = await chamar(criarHandlerCriar({ getDb: () => db }), {
      body: { ...bodyValido, servicoIds },
    });
    assert.equal(resposta.statusHttp, 422);
    assert.equal([...docs.keys()].some((chave) => chave.includes("/agendamentos/")), false);
    assert.equal([...docs.keys()].some((chave) => chave.includes("/agendaControles/")), false);
  }

  const { db, docs } = criarBanco();
  docs.set(`${caminhoEmpresa}/servicos/s2`, {
    nome: "Segundo", valor: 50, tempoEstimadoMinutos: 30, status: "ativo",
  });
  const resposta = await chamar(criarHandlerCriar({ getDb: () => db }), {
    body: { ...bodyValido, servicoIds: ["s2"] },
  });
  assert.equal(resposta.statusHttp, 201);
  assert.equal(docs.get(`${caminhoEmpresa}/agendamentos/novo1`).servicoId, "s2");
});

test("falha de qualquer servico impede integralmente a criacao multisservico", async () => {
  for (const segundo of [null, { nome: "Inativo", valor: 20, tempoEstimadoMinutos: 30, status: "inativo" }]) {
    const { db, docs } = criarBanco();
    if (segundo) docs.set(`${caminhoEmpresa}/servicos/s2`, segundo);
    const resposta = await chamar(criarHandlerCriar({ getDb: () => db }), {
      body: bodyMultisservico(["s1", "s2"]),
    });
    assert.equal(resposta.statusHttp, 422);
    assert.equal([...docs.keys()].some((chave) => chave.includes("/agendamentos/")), false);
    assert.equal([...docs.keys()].some((chave) => chave.includes("/agendaControles/")), false);
  }
});

test("servico existente somente em outro tenant nao e aceito", async () => {
  const { db, docs } = criarBanco();
  docs.set("users/owner/empresas/outra/servicos/s2", {
    nome: "Outro tenant", valor: 20, tempoEstimadoMinutos: 30, status: "ativo",
  });
  const resposta = await chamar(criarHandlerCriar({ getDb: () => db }), {
    body: bodyMultisservico(["s1", "s2"]),
  });
  assert.equal(resposta.statusHttp, 422);
  assert.equal([...docs.keys()].some((chave) => chave.includes("/agendamentos/")), false);
});

test("multisservico valida nome valor e duracao exclusivamente nos documentos do tenant", async () => {
  for (const servico of [
    { nome: "", valor: 20, tempoEstimadoMinutos: 30, status: "ativo" },
    { nome: "Servico", valor: -1, tempoEstimadoMinutos: 30, status: "ativo" },
    { nome: "Servico", valor: 20, tempoEstimadoMinutos: "", status: "ativo" },
  ]) {
    const { db, docs } = criarBanco();
    docs.set(`${caminhoEmpresa}/servicos/s2`, servico);
    const resposta = await chamar(criarHandlerCriar({ getDb: () => db }), {
      body: bodyMultisservico(["s1", "s2"]),
    });
    assert.equal(resposta.statusHttp, 422);
  }
});

test("agenda aceita empresa legada servicos para owner e administrador_empresa", async () => {
  const owner = criarBanco({ segmento: "servicos" });
  assert.equal((await chamar(criarHandlerCriar({ getDb: () => owner.db }))).statusHttp, 201);

  const administrador = criarBanco({ segmento: "servicos", role: "administrador_empresa" });
  assert.equal((await chamar(
    criarHandlerCriar({ getDb: () => administrador.db }),
    { uid: "guest" },
  )).statusHttp, 201);
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

test("edicao de horario ou observacao preserva integralmente snapshots multisservico", async () => {
  const { db, docs } = criarBanco();
  docs.set(`${caminhoEmpresa}/servicos/s2`, {
    nome: "Cadastro Atual", valor: 999, tempoEstimadoMinutos: 10, status: "ativo",
  });
  const snapshots = [
    { servicoId: "s1", servicoNome: "Historico A", duracaoMinutos: 60, valorUnitario: 80 },
    { servicoId: "s2", servicoNome: "Historico B", duracaoMinutos: 45, valorUnitario: 70 },
  ];
  docs.set(`${caminhoEmpresa}/agendamentos/a1`, {
    clienteId: "c1", clienteNome: "Cliente", clienteTelefone: "", clienteEmail: "",
    servicosSnapshot: snapshots, valorTotalServicos: 150, duracaoTotalServicos: 105,
    servicoId: "s1", servicoNome: "Historico A + 1 serviço", valorServico: 150,
    data: "2026-09-24", horaInicio: "08:00", horaFim: "09:45", duracaoMinutos: 105,
    status: "agendado", observacoes: "antes", criadoPor: "owner", criadoEm: "antes",
  });
  const resposta = await chamar(criarHandlerEditar({ getDb: () => db, agora: () => "agora" }), {
    id: "a1",
    body: { ...bodyMultisservico(["s1", "s2"]), horaInicio: "10:00", horaFim: "12:00", duracaoMinutos: 120, observacoes: "depois" },
  });
  assert.equal(resposta.statusHttp, 200);
  const salvo = docs.get(`${caminhoEmpresa}/agendamentos/a1`);
  assert.deepEqual(salvo.servicosSnapshot, snapshots);
  assert.equal(salvo.valorTotalServicos, 150);
  assert.equal(salvo.duracaoTotalServicos, 105);
  assert.equal(salvo.duracaoMinutos, 120);
  assert.equal(salvo.observacoes, "depois");
});

test("edicao somente de observacao preserva snapshots e agregados multisservico", async () => {
  const { db, docs } = criarBanco();
  const snapshots = [
    { servicoId: "s1", servicoNome: "Historico", duracaoMinutos: 60, valorUnitario: 80 },
  ];
  docs.set(`${caminhoEmpresa}/agendamentos/a1`, {
    clienteId: "c1", clienteNome: "Cliente", servicosSnapshot: snapshots,
    valorTotalServicos: 80, duracaoTotalServicos: 60,
    servicoId: "s1", servicoNome: "Historico", valorServico: 80,
    data: bodyValido.data, horaInicio: bodyValido.horaInicio, horaFim: bodyValido.horaFim,
    duracaoMinutos: bodyValido.duracaoMinutos, status: "agendado", observacoes: "antes",
  });
  docs.get(`${caminhoEmpresa}/servicos/s1`).valor = 999;
  const resposta = await chamar(criarHandlerEditar({ getDb: () => db }), {
    id: "a1", body: { ...bodyMultisservico(["s1"]), observacoes: "depois" },
  });
  assert.equal(resposta.statusHttp, 200);
  const salvo = docs.get(`${caminhoEmpresa}/agendamentos/a1`);
  assert.deepEqual(salvo.servicosSnapshot, snapshots);
  assert.equal(salvo.valorTotalServicos, 80);
  assert.equal(salvo.observacoes, "depois");
});

test("frontend legado nao reduz silenciosamente documento multisservico ao editar horario", async () => {
  const { db, docs } = criarBanco();
  const snapshots = [
    { servicoId: "s1", servicoNome: "A", duracaoMinutos: 60, valorUnitario: 100 },
    { servicoId: "s2", servicoNome: "B", duracaoMinutos: 30, valorUnitario: 50 },
  ];
  docs.set(`${caminhoEmpresa}/agendamentos/a1`, {
    clienteId: "c1", clienteNome: "Cliente", servicosSnapshot: snapshots,
    valorTotalServicos: 150, duracaoTotalServicos: 90,
    servicoId: "s1", servicoNome: "A + 1 serviço", valorServico: 150,
    data: "2026-09-24", horaInicio: "08:00", horaFim: "09:30", duracaoMinutos: 90,
    status: "agendado", observacoes: "",
  });
  const resposta = await chamar(criarHandlerEditar({ getDb: () => db }), {
    id: "a1", body: { ...bodyValido, horaInicio: "10:00", horaFim: "11:30", duracaoMinutos: 90 },
  });
  assert.equal(resposta.statusHttp, 200);
  assert.deepEqual(docs.get(`${caminhoEmpresa}/agendamentos/a1`).servicosSnapshot, snapshots);
});

test("alteracao da composicao preserva mantidos, congela adicionados e respeita ordem", async () => {
  const { db, docs } = criarBanco();
  docs.set(`${caminhoEmpresa}/servicos/s2`, {
    nome: "Novo B", valor: 200, tempoEstimadoMinutos: 45, status: "ativo",
  });
  docs.set(`${caminhoEmpresa}/servicos/s3`, {
    nome: "Novo C", valor: 30, tempoEstimadoMinutos: 15, status: "ativo",
  });
  const historicoA = { servicoId: "s1", servicoNome: "Historico A", duracaoMinutos: 60, valorUnitario: 80 };
  docs.set(`${caminhoEmpresa}/agendamentos/a1`, {
    clienteId: "c1", clienteNome: "Cliente", servicosSnapshot: [historicoA],
    valorTotalServicos: 80, duracaoTotalServicos: 60,
    servicoId: "s1", servicoNome: "Historico A", valorServico: 80,
    data: "2026-09-24", horaInicio: "08:00", horaFim: "09:00", duracaoMinutos: 60,
    status: "confirmado", observacoes: "",
  });
  const resposta = await chamar(criarHandlerEditar({ getDb: () => db }), {
    id: "a1", body: bodyMultisservico(["s3", "s1", "s2"]),
  });
  assert.equal(resposta.statusHttp, 200);
  const salvo = docs.get(`${caminhoEmpresa}/agendamentos/a1`);
  assert.deepEqual(salvo.servicosSnapshot, [
    { servicoId: "s3", servicoNome: "Novo C", duracaoMinutos: 15, valorUnitario: 30 },
    historicoA,
    { servicoId: "s2", servicoNome: "Novo B", duracaoMinutos: 45, valorUnitario: 200 },
  ]);
  assert.equal(salvo.valorTotalServicos, 310);
  assert.equal(salvo.duracaoTotalServicos, 120);
  assert.equal(salvo.servicoId, "s3");
  assert.equal(salvo.servicoNome, "Novo C + 2 serviços");
});

test("alteracao da composicao nao relê servico historico mantido", async () => {
  const { db, docs } = criarBanco();
  const historicoA = {
    servicoId: "s1", servicoNome: "Historico A", duracaoMinutos: 60, valorUnitario: 80,
  };
  docs.set(`${caminhoEmpresa}/agendamentos/a1`, {
    clienteId: "c1", clienteNome: "Cliente", servicosSnapshot: [historicoA],
    valorTotalServicos: 80, duracaoTotalServicos: 60,
    servicoId: "s1", servicoNome: "Historico A", valorServico: 80,
    data: "2026-09-24", horaInicio: "08:00", horaFim: "09:00", duracaoMinutos: 60,
    status: "confirmado", observacoes: "",
  });
  docs.delete(`${caminhoEmpresa}/servicos/s1`);
  docs.set(`${caminhoEmpresa}/servicos/s2`, {
    nome: "Novo B", valor: 120, tempoEstimadoMinutos: 45, status: "ativo",
  });

  const resposta = await chamar(criarHandlerEditar({ getDb: () => db }), {
    id: "a1", body: bodyMultisservico(["s1", "s2"]),
  });

  assert.equal(resposta.statusHttp, 200);
  const salvo = docs.get(`${caminhoEmpresa}/agendamentos/a1`);
  assert.deepEqual(salvo.servicosSnapshot, [
    historicoA,
    { servicoId: "s2", servicoNome: "Novo B", duracaoMinutos: 45, valorUnitario: 120 },
  ]);
  assert.equal(salvo.valorTotalServicos, 200);
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

test("exclusao remove agendamento sem vinculos e toca controle do dia", async () => {
  const { db, docs } = criarBanco();
  docs.set(`${caminhoEmpresa}/agendamentos/a1`, { ...bodyValido, status: "agendado" });

  const resposta = await chamar(criarHandlerExcluir({ getDb: () => db, agora: () => "excluido" }));

  assert.equal(resposta.statusHttp, 200);
  assert.equal(resposta.agendamentoId, "a1");
  assert.equal(docs.has(`${caminhoEmpresa}/agendamentos/a1`), false);
  assert.equal(docs.get(`${caminhoEmpresa}/agendaControles/2026-09-24`).versao, 1);
});

test("exclusao bloqueia conta a receber vinculada sem alterar documentos", async () => {
  const { db, docs } = criarBanco();
  const agendaPath = `${caminhoEmpresa}/agendamentos/a1`;
  const contaPath = `${caminhoEmpresa}/contasReceber/atendimento_a1`;
  docs.set(agendaPath, { ...bodyValido, status: "concluido" });
  docs.set(contaPath, { origem: { tipo: "atendimento", documentoId: "a1" } });

  const resposta = await chamar(criarHandlerExcluir({ getDb: () => db }));

  assert.equal(resposta.statusHttp, 409);
  assert.equal(resposta.codigo, "agenda_possui_vinculo");
  assert.equal(docs.has(agendaPath), true);
  assert.equal(docs.has(contaPath), true);
});

test("exclusao bloqueia faturamento historico vinculado", async () => {
  const { db, docs } = criarBanco();
  const agendaPath = `${caminhoEmpresa}/agendamentos/a1`;
  const faturamentoPath = `${caminhoEmpresa}/faturamentos/atendimento_a1_preparacao_v1`;
  docs.set(agendaPath, { ...bodyValido, status: "agendado" });
  docs.set(faturamentoPath, { origem: { tipo: "atendimento", documentoId: "a1" } });

  const resposta = await chamar(criarHandlerExcluir({ getDb: () => db }));

  assert.equal(resposta.statusHttp, 409);
  assert.equal(docs.has(agendaPath), true);
  assert.equal(docs.has(faturamentoPath), true);
});

test("exclusao rejeita inexistente, cross-tenant e perfil sem permissao", async () => {
  const inexistente = criarBanco();
  assert.equal((await chamar(criarHandlerExcluir({ getDb: () => inexistente.db }))).statusHttp, 404);

  const crossTenant = criarBanco();
  crossTenant.docs.set(`${caminhoEmpresa}/agendamentos/a1`, { ...bodyValido, status: "agendado" });
  const respostaCrossTenant = await chamar(criarHandlerExcluir({ getDb: () => crossTenant.db }), {
    body: { ownerUid: "outro-owner", empresaId: "outra-empresa" },
  });
  assert.equal(respostaCrossTenant.statusHttp, 404);
  assert.equal(crossTenant.docs.has(`${caminhoEmpresa}/agendamentos/a1`), true);

  const semPermissao = criarBanco({ role: "visualizacao" });
  semPermissao.docs.set(`${caminhoEmpresa}/agendamentos/a1`, { ...bodyValido, status: "agendado" });
  assert.equal((await chamar(
    criarHandlerExcluir({ getDb: () => semPermissao.db }),
    { uid: "guest" },
  )).statusHttp, 403);
});
