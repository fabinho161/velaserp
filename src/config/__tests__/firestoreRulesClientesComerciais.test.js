import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const rules = readFileSync(
  fileURLToPath(new URL("../../../firestore.rules", import.meta.url)),
  "utf8",
);

const inicioClientes = rules.indexOf("match /clientesComerciais/{documentId}");
const fimClientes = rules.indexOf("match /usuariosPorAuth/", inicioClientes);
const regraClientes = rules.slice(inicioClientes, fimClientes);
const leituraClientes = regraClientes.match(/allow read:[\s\S]*?\]\);/)?.[0] || "";
const escritaClientes = regraClientes.match(/allow create, update:[^;]+;/)?.[0] || "";
const inicioPermissoesEscrita = rules.indexOf("function canWriteModuleRole");
const fimPermissoesEscrita = rules.indexOf(
  "function hasCompanyModulePermissionLink",
  inicioPermissoesEscrita,
);
const permissoesEscrita = rules.slice(inicioPermissoesEscrita, fimPermissoesEscrita);

test("owner le clientesComerciais pelo bypass controlado de hasCompanyRole", () => {
  assert.match(rules, /function hasCompanyRole\([\s\S]*?return isOwner\(ownerUid\) \|\|/);
  assert.match(leituraClientes, /hasCompanyRole\(userId, empresaId/);
});

test("administrador_empresa le clientesComerciais", () => {
  assert.match(leituraClientes, /"administrador_empresa"/);
});

test("comercial le clientesComerciais", () => {
  assert.match(leituraClientes, /"comercial"/);
});

test("financeiro le clientesComerciais", () => {
  assert.match(leituraClientes, /"financeiro"/);
});

test("visualizacao le clientesComerciais", () => {
  assert.match(leituraClientes, /"visualizacao"/);
});

test("usuario sem vinculo nao recebe leitura de clientesComerciais", () => {
  assert.match(rules, /function hasCompanyRole\([\s\S]*?hasCompanyMemberRole\(ownerUid, empresaId, roles\);/);
  assert.match(rules, /function hasValidCompanyLink\([\s\S]*?get\(linkPath\)\.data\.status == "ativo"/);
});

test("vinculo de outra empresa nao autoriza clientesComerciais", () => {
  assert.match(rules, /function hasValidCompanyLink\([\s\S]*?get\(linkPath\)\.data\.ownerUid == ownerUid/);
  assert.match(rules, /function hasValidCompanyLink\([\s\S]*?companyUserPath\([\s\S]*?empresaId/);
});

test("financeiro nao ganha escrita de clientesComerciais", () => {
  assert.equal(
    escritaClientes.trim(),
    'allow create, update: if canWriteModule(userId, empresaId, "clientesComerciais");',
  );
  const escritaFinanceiro = permissoesEscrita.match(/isCompanyRole\(role, perfil, \["financeiro"\]\)[\s\S]*?\.hasAny\(\[modulo\]\)/)?.[0] || "";
  assert.doesNotMatch(escritaFinanceiro, /clientesComerciais/);
});

test("visualizacao continua sem escrita e delete de cliente continua negado", () => {
  assert.doesNotMatch(permissoesEscrita, /"visualizacao"/);
  assert.match(regraClientes, /allow delete: if false;/);
});

test("rules tratam servicos apenas como alias legado de clientes", () => {
  assert.match(rules, /segmento == "clientes"[\s\S]*?\.data\.segmento == "servicos"/);
  assert.match(rules, /function isCompanySegmentForServices[\s\S]*?\.data\.segmento == "servicos"/);
});
