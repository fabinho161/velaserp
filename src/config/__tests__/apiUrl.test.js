import assert from "node:assert/strict";
import test from "node:test";
import { resolverApiUrl } from "../apiUrl.js";

test("usa backend local por padrão em desenvolvimento", () => {
  assert.equal(resolverApiUrl({ mode: "development" }), "http://localhost:10000");
});

test("usa backend do Render por padrão em produção", () => {
  assert.equal(
    resolverApiUrl({ mode: "production" }),
    "https://renovarerp-api.onrender.com",
  );
});

test("prioriza VITE_API_BASE_URL e remove barra final", () => {
  assert.equal(
    resolverApiUrl({
      mode: "development",
      apiBaseUrl: "https://api.exemplo.com/",
      apiUrl: "https://legada.exemplo.com",
    }),
    "https://api.exemplo.com",
  );
});

test("mantém compatibilidade com VITE_API_URL", () => {
  assert.equal(
    resolverApiUrl({ mode: "development", apiUrl: "https://legada.exemplo.com/" }),
    "https://legada.exemplo.com",
  );
});

test("impede URL local em build de produção", () => {
  assert.throws(
    () => resolverApiUrl({ mode: "production", apiBaseUrl: "http://localhost:10000" }),
    /Build de produção não pode utilizar uma URL local/,
  );
});
