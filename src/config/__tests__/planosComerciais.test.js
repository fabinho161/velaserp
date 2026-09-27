import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { PLANOS, featuresPorPlano } from "../planos.js";

const matriz = {
  gratis: { preco: 0, empresas: 1, usuarios: 1 },
  basico: { preco: 19.9, empresas: 1, usuarios: 2 },
  profissional: { preco: 39.9, empresas: 3, usuarios: 5 },
  premium: { preco: 69.9, empresas: 10, usuarios: 15 },
};

test("matriz comercial central possui precos e limites oficiais", () => {
  for (const [plano, esperado] of Object.entries(matriz)) {
    assert.deepEqual(
      {
        preco: PLANOS[plano].preco,
        empresas: PLANOS[plano].empresas,
        usuarios: PLANOS[plano].usuarios,
      },
      esperado,
    );
  }
});

test("atualizacao comercial nao redistribui os recursos dos planos", () => {
  assert.deepEqual(featuresPorPlano, {
    gratis: {
      vendas: false, crmComercial: false, crmBasico: false,
      crmInteligente: false, crmWhatsapp: false, crmFollowUp: false,
    },
    basico: {
      vendas: true, crmComercial: true, crmBasico: true,
      crmInteligente: false, crmWhatsapp: false, crmFollowUp: false,
    },
    profissional: {
      vendas: true, crmComercial: true, crmBasico: true,
      crmInteligente: true, crmWhatsapp: false, crmFollowUp: true,
    },
    premium: {
      vendas: true, crmComercial: true, crmBasico: true,
      crmInteligente: true, crmWhatsapp: true, crmFollowUp: true,
    },
  });
});

test("pagina deriva os precos e limites da configuracao e preserva Mais popular", async () => {
  const pagina = await readFile(new URL("../../pages/Planos.jsx", import.meta.url), "utf8");

  assert.match(pagina, /Object\.entries\(PLANOS\)/);
  assert.match(pagina, /moedaBR\(plano\.preco\)/);
  assert.match(pagina, /formatarLimitePlano\(plano\)/);
  assert.match(pagina, /Mais popular/);
});
