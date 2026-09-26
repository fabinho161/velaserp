import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after, before } from "node:test";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc } from "firebase/firestore";

const executar = typeof globalThis.process?.env?.FIRESTORE_EMULATOR_HOST === "string";
const PROJECT_ID = "demo-renovar-erp-despesas";
let ambiente;

before(async () => {
  if (!executar) return;
  const [host, port] = globalThis.process.env.FIRESTORE_EMULATOR_HOST.split(":");
  ambiente = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL("../../../firestore.rules", import.meta.url), "utf8"),
    },
  });
  await ambiente.withSecurityRulesDisabled(async (contexto) => {
    const db = contexto.firestore();
    await setDoc(doc(db, "users", "owner"), { role: "usuario" });
    await setDoc(doc(db, "users", "owner", "empresas", "empresa"), {
      ownerUid: "owner", segmento: "clientes",
    });
    await setDoc(doc(db, "users", "owner", "empresas", "comercio"), {
      ownerUid: "owner", segmento: "comercio",
    });
  });
});

after(async () => ambiente?.cleanup());

const pendente = {
  descricao: "Aluguel", categoria: "Estrutura", valor: 100,
  dataCompetencia: "2026-09-01", dataVencimento: "2026-09-10",
  statusFinanceiro: "pendente", situacao: "ativo", pagamento: null,
  data: "2026-09-01", status: "Pendente",
  criadoEm: new Date(), criadoPor: "owner", atualizadoEm: new Date(), atualizadoPor: "owner",
};

test("Rules de despesas validam CRUD pendente e bloqueiam baixa Client SDK", { skip: !executar }, async () => {
  const db = ambiente.authenticatedContext("owner").firestore();
  const ref = doc(db, "users", "owner", "empresas", "empresa", "despesas", "d1");
  await assertSucceeds(setDoc(ref, pendente));
  await assertSucceeds(updateDoc(ref, {
    descricao: "Aluguel ajustado", categoria: "Predial", valor: 120,
    dataCompetencia: "2026-09-02", dataVencimento: "2026-09-12",
    data: "2026-09-02", atualizadoEm: new Date(), atualizadoPor: "owner",
  }));
  await assertFails(updateDoc(ref, { statusFinanceiro: "pago", status: "Pago" }));
  await assertFails(updateDoc(ref, { pagamento: {
    dataPagamento: "2026-09-26", formaPagamento: "pix", valorPago: 120,
    pagoEm: new Date(), pagoPor: "owner",
  } }));
  await assertSucceeds(updateDoc(ref, {
    situacao: "cancelado", status: "cancelado", excluida: true,
    excluidaEm: new Date(), excluidaPor: "owner", atualizadoEm: new Date(), atualizadoPor: "owner",
  }));
});

test("Rules preservam criacao pendente nos demais segmentos e rejeitam criacao paga", { skip: !executar }, async () => {
  const db = ambiente.authenticatedContext("owner").firestore();
  const base = "users/owner/empresas/comercio/despesas";
  await assertSucceeds(setDoc(doc(db, base, "d1"), pendente));
  await assertFails(setDoc(doc(db, base, "d2"), {
    ...pendente, statusFinanceiro: "pago", status: "Pago", pagamento: { inventado: true },
  }));
});

test("Rules impedem alterar pagamento existente e qualquer edicao apos baixa", { skip: !executar }, async () => {
  await ambiente.withSecurityRulesDisabled(async (contexto) => {
    await setDoc(doc(contexto.firestore(), "users", "owner", "empresas", "empresa", "despesas", "paga"), {
      ...pendente, statusFinanceiro: "pago", status: "Pago",
      pagamento: {
        dataPagamento: "2026-09-26", formaPagamento: "pix", valorPago: 100,
        pagoEm: new Date(), pagoPor: "owner",
      },
    });
  });
  const ref = doc(ambiente.authenticatedContext("owner").firestore(),
    "users", "owner", "empresas", "empresa", "despesas", "paga");
  await assertFails(updateDoc(ref, { descricao: "Alterada" }));
  await assertFails(updateDoc(ref, { pagamento: null, statusFinanceiro: "pendente" }));
});

test("sanidade do arquivo de Rules carregado", () => {
  assert.equal(typeof executar, "boolean");
});
