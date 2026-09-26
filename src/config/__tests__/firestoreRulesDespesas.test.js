import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const rules = await readFile(new URL("../../../firestore.rules", import.meta.url), "utf8");
const bloco = rules.match(/match \/despesas\/\{documentId\} \{([\s\S]*?)\n\s{8}\}/)?.[1] || "";

test("rules exigem criacao canonica pendente e preservam CRUD financeiro", () => {
  assert.match(bloco, /despesaNovaPendenteValida\(\)/);
  assert.match(bloco, /statusFinanceiro == "pendente"/);
  assert.match(bloco, /pagamento == null/);
  assert.match(bloco, /canWriteModule\(userId, empresaId, "despesas"\)/);
});

test("rules impedem baixa e adulteracao de pagamento pelo Client SDK", () => {
  assert.match(bloco, /camposFinanceirosAutoritativosIntactos\(\)/);
  assert.match(bloco, /"statusFinanceiro", "pagamento", "criadoEm", "criadoPor"/);
  assert.match(bloco, /despesaEstavaPendente\(\)/);
  assert.match(bloco, /estadoDespesaPermitido\(\)/);
});
