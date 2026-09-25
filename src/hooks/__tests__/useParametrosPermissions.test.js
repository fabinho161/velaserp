import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fonte = readFileSync(
  fileURLToPath(new URL("../useParametros.js", import.meta.url)),
  "utf8",
);

test("carregamento de parametros usa fallback local sem escrita implicita", () => {
  const inicioCarregamento = fonte.indexOf("const loadParametros");
  const fimCarregamento = fonte.indexOf("useEffect(() =>", inicioCarregamento);
  const carregamento = fonte.slice(inicioCarregamento, fimCarregamento);

  assert.match(carregamento, /setState\(defaultValues\)/);
  assert.doesNotMatch(carregamento, /\bsetDoc\s*\(/);
});
