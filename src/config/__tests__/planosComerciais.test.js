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

test("matriz de recursos respeita a nova distribuicao comercial", () => {
  assert.deepEqual(featuresPorPlano, {
    gratis: {
      relatoriosOperacionais: true,
      vendas: false, crmComercial: false, crmBasico: false,
      crmInteligente: false, crmWhatsapp: false, crmFollowUp: false,
    },
    basico: {
      relatoriosOperacionais: true,
      vendas: true, crmComercial: true, crmBasico: true,
      crmInteligente: false, crmWhatsapp: false, crmFollowUp: false,
    },
    profissional: {
      relatoriosOperacionais: true,
      vendas: true, crmComercial: true, crmBasico: true,
      crmInteligente: true, crmWhatsapp: false, crmFollowUp: true,
    },
    premium: {
      relatoriosOperacionais: true,
      vendas: true, crmComercial: true, crmBasico: true,
      crmInteligente: true, crmWhatsapp: true, crmFollowUp: true,
    },
  });
});

test("gates profissionais e premium permanecem separados", () => {
  assert.equal(PLANOS.basico.dre, false);
  assert.equal(PLANOS.basico.pdfProfissional, false);
  assert.equal(PLANOS.profissional.dre, true);
  assert.equal(PLANOS.profissional.pdfProfissional, true);
  assert.equal(PLANOS.profissional.relatoriosAvancados, false);
  assert.equal(PLANOS.profissional.crmWhatsapp, false);
  assert.equal(PLANOS.premium.relatoriosAvancados, true);
  assert.equal(PLANOS.premium.crmWhatsapp, true);
});

test("rota e sidebar combinam plano com RBAC para relatorios", async () => {
  const app = await readFile(new URL("../../App.jsx", import.meta.url), "utf8");
  const sidebar = await readFile(new URL("../../components/Sidebar.jsx", import.meta.url), "utf8");

  assert.match(app, /EmpresaPermissionRoute permissao=\{PERMISSOES_EMPRESA\.relatorios\}/);
  assert.match(app, /permitido=\{podeUsarRelatoriosOperacionais\}/);
  assert.match(sidebar, /podeVerMenu\(PERMISSOES_EMPRESA\.relatorios, podeUsarRelatoriosOperacionais\)/);
});

test("pagina deriva os precos e limites da configuracao e preserva Mais popular", async () => {
  const pagina = await readFile(new URL("../../pages/Planos.jsx", import.meta.url), "utf8");

  assert.match(pagina, /Object\.entries\(PLANOS\)/);
  assert.match(pagina, /moedaBR\(plano\.preco\)/);
  assert.match(pagina, /formatarLimitePlano\(plano\)/);
  assert.match(pagina, /Mais popular/);
  assert.match(pagina, /normalizarSegmentoEmpresa/);
  assert.match(pagina, /SECOES_RECURSOS_POR_SEGMENTO\[segmentoAtual\]/);
  assert.match(pagina, /Gerencie clientes, servicos, agenda e financeiro/);
  assert.doesNotMatch(pagina, /Venda de Pecas/);
});
