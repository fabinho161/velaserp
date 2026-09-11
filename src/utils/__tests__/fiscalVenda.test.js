import assert from "node:assert/strict";
import test from "node:test";

import {
  criarFiscalEmpresaSnapshot,
  criarFiscalSnapshotItemVenda,
} from "../fiscalVenda.js";

test("cria snapshot fiscal de item com todos os campos cadastrados", () => {
  const snapshot = criarFiscalSnapshotItemVenda({
    fiscal: {
      ncm: "34060000",
      cest: "2803800",
      cfopPadrao: "5102",
      origem: "0",
      unidadeTributavel: "un",
      aliquotaIcms: 18,
    },
  });

  assert.deepEqual(snapshot, {
    versao: 1,
    ncm: "34060000",
    cest: "2803800",
    cfopPadrao: "5102",
    origem: "0",
    unidadeTributavel: "un",
  });
});

test("cria snapshot fiscal de item com campos parciais", () => {
  const snapshot = criarFiscalSnapshotItemVenda({
    fiscal: {
      ncm: "33074900",
      unidadeTributavel: "kg",
    },
  });

  assert.deepEqual(snapshot, {
    versao: 1,
    ncm: "33074900",
    cest: "",
    cfopPadrao: "",
    origem: "",
    unidadeTributavel: "kg",
  });
});

test("produto legado sem fiscal recebe snapshot vazio versionado", () => {
  const snapshot = criarFiscalSnapshotItemVenda({ nome: "Produto legado" });

  assert.deepEqual(snapshot, {
    versao: 1,
    ncm: "",
    cest: "",
    cfopPadrao: "",
    origem: "",
    unidadeTributavel: "",
  });
});

test("snapshot de item nao depende de mutacao posterior do produto original", () => {
  const produto = {
    fiscal: {
      ncm: "11111111",
      cfopPadrao: "5102",
    },
  };
  const snapshot = criarFiscalSnapshotItemVenda(produto);

  produto.fiscal.ncm = "22222222";
  produto.fiscal.cfopPadrao = "6102";

  assert.equal(snapshot.ncm, "11111111");
  assert.equal(snapshot.cfopPadrao, "5102");
});

test("cria snapshot fiscal da empresa com configuracao completa", () => {
  const snapshot = criarFiscalEmpresaSnapshot({
    regimeTributario: "Simples Nacional",
    cnpj: "11222333000144",
    inscricaoEstadual: "123456789",
    inscricaoMunicipal: "987654",
    cnae: "4789001",
    uf: "SP",
    municipio: "Sao Paulo",
    ambienteFiscal: "Homologacao",
    aliquotaIcmsPadrao: 18,
  });

  assert.deepEqual(snapshot, {
    versao: 1,
    regimeTributario: "Simples Nacional",
    cnpj: "11222333000144",
    inscricaoEstadual: "123456789",
    inscricaoMunicipal: "987654",
    cnae: "4789001",
    uf: "SP",
    municipio: "Sao Paulo",
    ambienteFiscal: "Homologacao",
  });
});

test("cria snapshot fiscal da empresa com configuracao parcial", () => {
  const snapshot = criarFiscalEmpresaSnapshot({
    regimeTributario: "Lucro Presumido",
    uf: "RJ",
  });

  assert.deepEqual(snapshot, {
    versao: 1,
    regimeTributario: "Lucro Presumido",
    cnpj: "",
    inscricaoEstadual: "",
    inscricaoMunicipal: "",
    cnae: "",
    uf: "RJ",
    municipio: "",
    ambienteFiscal: "",
  });
});

test("campos fiscais nao sao inventados", () => {
  const itemSnapshot = criarFiscalSnapshotItemVenda({
    fiscal: {
      ncm: "12345678",
      cst: "060",
      cClassTrib: "000001",
    },
  });
  const empresaSnapshot = criarFiscalEmpresaSnapshot({
    regimeTributario: "MEI",
    certificadoDigital: "nao incluir",
  });

  assert.equal(Object.hasOwn(itemSnapshot, "cst"), false);
  assert.equal(Object.hasOwn(itemSnapshot, "cClassTrib"), false);
  assert.equal(Object.hasOwn(empresaSnapshot, "certificadoDigital"), false);
});

test("snapshots fiscais usam versao 1", () => {
  assert.equal(criarFiscalSnapshotItemVenda().versao, 1);
  assert.equal(criarFiscalEmpresaSnapshot().versao, 1);
});
