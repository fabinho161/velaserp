import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../AdminClientes.jsx", import.meta.url), "utf8");

test("Admin Clientes oferece exclusao apenas para alvo que nao e admin_master", () => {
  assert.match(source, /cliente\.role !== "admin_master"/);
  assert.match(source, /label:[\s\S]*"Excluir cliente"/);
  assert.match(source, /danger: true/);
});

test("fluxo solicita preview e usa DELETE autenticado com confirmacao por e-mail", () => {
  assert.match(source, /\/exclusao-preview/);
  assert.match(source, /method: "DELETE"/);
  assert.match(source, /confirmacaoEmail: confirmacaoExclusao/);
  assert.match(source, /Authorization: `Bearer \$\{token\}`/);
});

test("modal bloqueia divergencia, apresenta loading, erro parcial e atualiza lista no sucesso", () => {
  assert.match(source, /confirmacaoExclusao\.trim\(\)\.toLowerCase\(\) !== previewExclusao\.email/);
  assert.match(source, /excluindoCliente \? "Excluindo\.\.\."/);
  assert.match(source, /error\.parcial/);
  assert.match(source, /await carregarClientes\(\)/);
  assert.match(source, /Cliente excluido definitivamente\./);
});
