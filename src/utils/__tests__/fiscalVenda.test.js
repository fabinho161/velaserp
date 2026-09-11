import assert from "node:assert/strict";
import test from "node:test";

import {
  criarFiscalEmpresaSnapshot,
  criarFiscalSnapshotItemVenda,
  criarDestinatarioSnapshotVenda,
  destinatarioVendaMudou,
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

test("cria snapshot do destinatario com cliente cadastrado completo", () => {
  const snapshot = criarDestinatarioSnapshotVenda({
    cliente: {
      id: "cliente-1",
      nome: "Cliente Completo",
      documento: "12345678900",
      email: "cliente@email.com",
      telefone: "62999990000",
      endereco: "Rua Central",
      cidade: "Itumbiara",
      uf: "GO",
      inscricaoEstadual: "nao incluir",
    },
  });

  assert.deepEqual(snapshot, {
    versao: 1,
    clienteId: "cliente-1",
    nome: "Cliente Completo",
    documento: "12345678900",
    email: "cliente@email.com",
    telefone: "62999990000",
    endereco: "Rua Central",
    cidade: "Itumbiara",
    uf: "GO",
  });
});

test("cria snapshot do destinatario com cliente cadastrado parcial", () => {
  const snapshot = criarDestinatarioSnapshotVenda({
    cliente: {
      id: "cliente-2",
      nome: "Cliente Parcial",
      uf: "SP",
    },
  });

  assert.deepEqual(snapshot, {
    versao: 1,
    clienteId: "cliente-2",
    nome: "Cliente Parcial",
    documento: "",
    email: "",
    telefone: "",
    endereco: "",
    cidade: "",
    uf: "SP",
  });
});

test("ausencia de cliente cria snapshot vazio e compativel", () => {
  assert.deepEqual(criarDestinatarioSnapshotVenda(), {
    versao: 1,
    clienteId: "",
    nome: "",
    documento: "",
    email: "",
    telefone: "",
    endereco: "",
    cidade: "",
    uf: "",
  });
});

test("cliente manual preserva somente nome informado", () => {
  const snapshot = criarDestinatarioSnapshotVenda({
    nome: "Cliente informado manualmente",
  });

  assert.deepEqual(snapshot, {
    versao: 1,
    clienteId: "",
    nome: "Cliente informado manualmente",
    documento: "",
    email: "",
    telefone: "",
    endereco: "",
    cidade: "",
    uf: "",
  });
});

test("Consumidor Final e preservado como texto cadastral", () => {
  const snapshot = criarDestinatarioSnapshotVenda({
    nome: "Consumidor Final",
  });

  assert.equal(snapshot.nome, "Consumidor Final");
  assert.equal(Object.hasOwn(snapshot, "consumidorFinal"), false);
  assert.equal(Object.hasOwn(snapshot, "contribuinteICMS"), false);
});

test("snapshot do destinatario usa versao 1", () => {
  assert.equal(criarDestinatarioSnapshotVenda().versao, 1);
});

test("snapshot do destinatario nao depende de mutacao posterior do cliente original", () => {
  const cliente = {
    id: "cliente-mutavel",
    nome: "Nome original",
    documento: "111",
    endereco: "Endereco original",
  };
  const snapshot = criarDestinatarioSnapshotVenda({ cliente });

  cliente.nome = "Nome alterado";
  cliente.documento = "222";
  cliente.endereco = "Endereco alterado";

  assert.equal(snapshot.nome, "Nome original");
  assert.equal(snapshot.documento, "111");
  assert.equal(snapshot.endereco, "Endereco original");
});

test("snapshot do destinatario nao inventa campos inexistentes", () => {
  const snapshot = criarDestinatarioSnapshotVenda({
    cliente: {
      id: "cliente-fiscal",
      nome: "Cliente Fiscal",
      indicadorIE: "9",
      contribuinteICMS: true,
      codigoMunicipioIBGE: "5208707",
    },
  });

  assert.equal(Object.hasOwn(snapshot, "indicadorIE"), false);
  assert.equal(Object.hasOwn(snapshot, "contribuinteICMS"), false);
  assert.equal(Object.hasOwn(snapshot, "codigoMunicipioIBGE"), false);
});

test("venda antiga sem snapshot permanece compativel na deteccao de destinatario", () => {
  assert.equal(
    destinatarioVendaMudou(
      { clienteId: "", cliente: "Cliente antigo" },
      { clienteId: "", cliente: "Cliente antigo" }
    ),
    false
  );
});

test("edicao sem troca de destinatario nao exige novo snapshot", () => {
  assert.equal(
    destinatarioVendaMudou(
      { clienteId: "cliente-1", clienteNome: "Cliente A" },
      { clienteId: "cliente-1", clienteNome: "Cliente A" }
    ),
    false
  );
});

test("edicao com troca de destinatario solicita novo snapshot", () => {
  assert.equal(
    destinatarioVendaMudou(
      { clienteId: "cliente-1", clienteNome: "Cliente A" },
      { clienteId: "cliente-2", clienteNome: "Cliente B" }
    ),
    true
  );
});
