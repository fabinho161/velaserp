const assert = require("node:assert/strict");
const test = require("node:test");
const { criarRouterAdminClientes } = require("../adminClientesRoutes");

const obterHandlers = (router, path, method) => {
  const layer = router.stack.find((item) =>
    item.route?.path === path && item.route?.methods?.[method]
  );
  return layer.route.stack.map((item) => item.handle);
};

const criarResposta = () => ({
  statusCode: 200,
  payload: null,
  status(code) { this.statusCode = code; return this; },
  json(payload) { this.payload = payload; return this; },
});

const executarPilha = async (handlers, req, res) => {
  let index = 0;
  const next = async () => {
    const handler = handlers[index++];
    if (handler) await handler(req, res, next);
  };
  await next();
};

test("preview sem autenticacao e negado pelo middleware", async () => {
  let serviceCalled = false;
  const router = criarRouterAdminClientes({
    authMiddleware: (req, res) => res.status(401).json({ ok: false }),
    obterPreviewDependencia: async () => { serviceCalled = true; },
  });
  const handlers = obterHandlers(router, "/clientes/:uid/exclusao-preview", "get");
  const res = criarResposta();
  await executarPilha(handlers, { params: { uid: "alvo" } }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(serviceCalled, false);
});

test("preview autenticado encaminha UID do ator e alvo", async () => {
  let received;
  const router = criarRouterAdminClientes({
    getDbDependencia: () => ({ id: "db" }),
    authMiddleware: (req, res, next) => { req.user = { uid: "admin" }; return next(); },
    obterPreviewDependencia: async (args) => {
      received = args;
      return { uid: "alvo", email: "cliente@erp.com" };
    },
  });
  const res = criarResposta();
  await executarPilha(
    obterHandlers(router, "/clientes/:uid/exclusao-preview", "get"),
    { params: { uid: "alvo" } },
    res
  );
  assert.equal(received.actorUid, "admin");
  assert.equal(received.targetUid, "alvo");
  assert.equal(res.payload.ok, true);
});

test("DELETE encaminha confirmacao e informa falha parcial", async () => {
  const parcial = new Error("falha operacional");
  parcial.parcial = true;
  parcial.faseAtual = "excluir_empresas_proprias";
  const router = criarRouterAdminClientes({
    getDbDependencia: () => ({}),
    getAuthClientDependencia: () => ({}),
    authMiddleware: (req, res, next) => { req.user = { uid: "admin" }; return next(); },
    executarExclusaoDependencia: async (args) => {
      assert.equal(args.confirmacaoEmail, "cliente@erp.com");
      throw parcial;
    },
  });
  const res = criarResposta();
  await executarPilha(
    obterHandlers(router, "/clientes/:uid", "delete"),
    { params: { uid: "alvo" }, body: { confirmacaoEmail: "cliente@erp.com" } },
    res
  );
  assert.equal(res.statusCode, 500);
  assert.equal(res.payload.parcial, true);
  assert.equal(res.payload.faseAtual, "excluir_empresas_proprias");
});
