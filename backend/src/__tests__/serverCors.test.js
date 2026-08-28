const assert = require("node:assert/strict");
const test = require("node:test");

process.env.CORS_ORIGINS = "https://renovarerp.com.br,http://localhost:5173,http://127.0.0.1:5173";

const app = require("../server");

const iniciarServidor = () =>
  new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
    server.once("error", reject);
  });

const fecharServidor = (server) =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

const enviarPreflight = async ({ server, origin, method, headers }) => {
  const { port } = server.address();

  return fetch(`http://127.0.0.1:${port}/api/empresas/owner/empresa/usuarios/usuario/status`, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": method,
      "Access-Control-Request-Headers": headers,
    },
  });
};

test("preflight CORS permite PATCH com Authorization e Content-Type para origem autorizada", async () => {
  const server = await iniciarServidor();

  try {
    const response = await enviarPreflight({
      server,
      origin: "https://renovarerp.com.br",
      method: "PATCH",
      headers: "authorization,content-type",
    });

    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), "https://renovarerp.com.br");
    assert.match(response.headers.get("access-control-allow-methods") || "", /\bPATCH\b/);

    const allowedHeaders = response.headers.get("access-control-allow-headers") || "";
    assert.match(allowedHeaders, /Authorization/i);
    assert.match(allowedHeaders, /Content-Type/i);
  } finally {
    await fecharServidor(server);
  }
});

test("preflight CORS nao concede permissao para origem nao autorizada", async () => {
  const server = await iniciarServidor();
  const consoleErrorOriginal = console.error;

  try {
    console.error = () => {};

    const response = await enviarPreflight({
      server,
      origin: "https://exemplo-nao-autorizado.com",
      method: "PATCH",
      headers: "authorization,content-type",
    });

    assert.notEqual(response.headers.get("access-control-allow-origin"), "https://exemplo-nao-autorizado.com");
  } finally {
    console.error = consoleErrorOriginal;
    await fecharServidor(server);
  }
});
