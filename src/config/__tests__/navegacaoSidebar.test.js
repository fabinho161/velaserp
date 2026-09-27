import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PERMISSOES_EMPRESA, temPermissaoEmpresa } from "../perfisEmpresa.js";

test("Sidebar combina clientes operacionais com permissao CRM", async () => {
  const sidebar = await readFile(
    new URL("../../components/Sidebar.jsx", import.meta.url),
    "utf8"
  );

  assert.match(
    sidebar,
    /podeVerMenu\(PERMISSOES_EMPRESA\.crm, podeUsarClientesOperacionais\)/
  );
  assert.match(sidebar, /path: "\/clientes"/);
  assert.match(sidebar, /modulo: "clientes"/);
});

test("comercial ve Clientes sem receber modulos administrativos", () => {
  assert.equal(temPermissaoEmpresa("comercial", PERMISSOES_EMPRESA.crm), true);

  for (const permissao of [
    PERMISSOES_EMPRESA.financeiro,
    PERMISSOES_EMPRESA.configuracoes,
    PERMISSOES_EMPRESA.usuariosEmpresa,
  ]) {
    assert.equal(temPermissaoEmpresa("comercial", permissao), false);
  }
});

test("visualizacao continua sem Clientes", () => {
  assert.equal(
    temPermissaoEmpresa("visualizacao", PERMISSOES_EMPRESA.crm),
    false
  );
});
