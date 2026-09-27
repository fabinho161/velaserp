import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("listener da empresa convidada depende do segmento escalar, nao do objeto que atualiza", async () => {
  const contexto = await readFile(new URL("../ERPContext.jsx", import.meta.url), "utf8");
  const inicio = contexto.indexOf("const empresaConvidada =");
  const fim = contexto.indexOf("const podeGerenciarUsuariosEmpresa", inicio);
  const efeitoEmpresaConvidada = contexto.slice(inicio, fim);

  assert.match(
    contexto,
    /const segmentoEmpresaSelecionada = normalizarSegmentoEmpresa\([\s\S]*?empresaSelecionada\?\.segmento[\s\S]*?\);/
  );
  assert.match(efeitoEmpresaConvidada, /segmento: segmentoEmpresaSelecionada/);
  assert.match(efeitoEmpresaConvidada, /segmentoEmpresaSelecionada,/);
  assert.doesNotMatch(efeitoEmpresaConvidada, /\n\s*empresaSelecionada,\n/);
});
