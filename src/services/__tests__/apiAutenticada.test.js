import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { criarFetchAutenticado } from "../apiAutenticada.js";

const resposta = (status) => ({ status });

test("usuario autenticado usa token atual sem renovacao forcada", async () => {
  const chamadasToken = [];
  const chamadasFetch = [];
  const usuario = {
    uid: "usuario-1",
    async getIdToken(forcar) {
      chamadasToken.push(forcar);
      return "token-valido";
    },
  };
  const requisitar = criarFetchAutenticado({
    obterUsuario: () => usuario,
    fetchImpl: async (url, opcoes) => {
      chamadasFetch.push({ url, opcoes });
      return resposta(200);
    },
  });

  const resultado = await requisitar("https://api.exemplo/agenda", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  assert.equal(resultado.status, 200);
  assert.deepEqual(chamadasToken, [false]);
  assert.equal(chamadasFetch.length, 1);
  assert.equal(chamadasFetch[0].opcoes.headers.get("Authorization"), "Bearer token-valido");
  assert.equal(chamadasFetch[0].opcoes.headers.get("Content-Type"), "application/json");
});

test("ausencia de usuario autenticado falha de forma controlada", async () => {
  const requisitar = criarFetchAutenticado({
    obterUsuario: () => null,
    fetchImpl: async () => resposta(200),
  });

  await assert.rejects(
    () => requisitar("https://api.exemplo/agenda"),
    /Sua sessão expirou/,
  );
});

test("primeiro 401 renova token uma vez e repete a requisicao", async () => {
  const chamadasToken = [];
  let totalFetch = 0;
  const usuario = {
    uid: "usuario-1",
    async getIdToken(forcar) {
      chamadasToken.push(forcar);
      return forcar ? "token-renovado" : "token-expirado";
    },
  };
  const requisitar = criarFetchAutenticado({
    obterUsuario: () => usuario,
    fetchImpl: async (_url, opcoes) => {
      totalFetch += 1;
      assert.equal(
        opcoes.headers.get("Authorization"),
        totalFetch === 1 ? "Bearer token-expirado" : "Bearer token-renovado",
      );
      return resposta(totalFetch === 1 ? 401 : 201);
    },
  });

  const resultado = await requisitar("https://api.exemplo/agenda", { method: "POST" });

  assert.equal(resultado.status, 201);
  assert.equal(totalFetch, 2);
  assert.deepEqual(chamadasToken, [false, true]);
});

test("segundo 401 e devolvido sem criar loop", async () => {
  const chamadasToken = [];
  let totalFetch = 0;
  const usuario = {
    uid: "usuario-1",
    async getIdToken(forcar) {
      chamadasToken.push(forcar);
      return forcar ? "token-renovado" : "token-expirado";
    },
  };
  const requisitar = criarFetchAutenticado({
    obterUsuario: () => usuario,
    fetchImpl: async () => {
      totalFetch += 1;
      return resposta(401);
    },
  });

  const resultado = await requisitar("https://api.exemplo/agenda");

  assert.equal(resultado.status, 401);
  assert.equal(totalFetch, 2);
  assert.deepEqual(chamadasToken, [false, true]);
});

test("Agenda usa o fluxo autenticado centralizado", () => {
  const agendaApi = readFileSync(
    fileURLToPath(new URL("../agendaApi.js", import.meta.url)),
    "utf8",
  );

  assert.match(agendaApi, /import \{ fetchAutenticado \} from "\.\/apiAutenticada\.js"/);
  assert.match(agendaApi, /fetchAutenticado\(`/);
  assert.doesNotMatch(agendaApi, /getIdToken\(/);
});
