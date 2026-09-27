import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  carregarFormularioEmpresa,
  formatarCepEmpresa,
  normalizarCepEmpresa,
  normalizarUfEmpresa,
  prepararConfiguracaoEmpresa,
} from "../configuracoesEmpresa.js";

test("empresa antiga sem endereco continua carregando sem interpretar cidade legado", () => {
  const form = carregarFormularioEmpresa({ cidade: "Itumbiara-GO" });

  assert.equal(form.cidade, "Itumbiara-GO");
  assert.deepEqual(form.endereco, {
    cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "",
  });
});

test("endereco estruturado e campos desconhecidos sao carregados", () => {
  const form = carregarFormularioEmpresa({
    campoFuturo: "preservado",
    endereco: { cep: "75500000", cidade: "Itumbiara", uf: "GO", referencia: "Centro" },
  });

  assert.equal(form.campoFuturo, "preservado");
  assert.equal(form.endereco.cidade, "Itumbiara");
  assert.equal(form.endereco.uf, "GO");
  assert.equal(form.endereco.referencia, "Centro");
});

test("salvamento prepara todos os campos opcionais do endereco", () => {
  const payload = prepararConfiguracaoEmpresa({
    nome: "Renovar",
    cidade: "Legado-GO",
    endereco: {
      cep: "75.500-000",
      logradouro: "Rua A",
      numero: "S/N",
      complemento: "Sala 2",
      bairro: "Centro",
      cidade: "Itumbiara",
      uf: "go",
    },
  });

  assert.deepEqual(payload.endereco, {
    cep: "75500000",
    logradouro: "Rua A",
    numero: "S/N",
    complemento: "Sala 2",
    bairro: "Centro",
    cidade: "Itumbiara",
    uf: "GO",
  });
  assert.equal(payload.cidade, "Legado-GO");
});

test("campos opcionais vazios permanecem validos", () => {
  const payload = prepararConfiguracaoEmpresa(carregarFormularioEmpresa());
  assert.deepEqual(payload.endereco, {
    cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "",
  });
});

test("CEP e UF possuem normalizacao cadastral previsivel", () => {
  assert.equal(normalizarCepEmpresa("12.345-678"), "12345678");
  assert.equal(formatarCepEmpresa("12345678"), "12345-678");
  assert.equal(normalizarUfEmpresa(" sp "), "SP");
  assert.equal(normalizarUfEmpresa("XX"), "");
});

test("personalizacao, logo e campos desconhecidos sao preservados no payload completo", () => {
  const payload = prepararConfiguracaoEmpresa({
    nome: "Renovar",
    logoBase64: "data:image/png;base64,abc",
    whiteLabel: { nomeSistema: "ERP Teste" },
    tema: { corPrimaria: "#123456" },
    campoFuturo: { ativo: true },
    endereco: { referencia: "Portao azul" },
  }, true);

  assert.equal(payload.logoBase64, "data:image/png;base64,abc");
  assert.equal(payload.whiteLabel.nomeSistema, "ERP Teste");
  assert.equal(payload.tema.corPrimaria, "#123456");
  assert.deepEqual(payload.campoFuturo, { ativo: true });
  assert.equal(payload.endereco.referencia, "Portao azul");
});

test("payload cadastral nao inclui nem modifica configuracao fiscal", () => {
  const payload = prepararConfiguracaoEmpresa({
    nome: "Renovar",
    endereco: { cidade: "Itumbiara", uf: "GO" },
  });

  assert.equal(Object.hasOwn(payload, "fiscal"), false);
});

test("falha de persistencia e propagada e impede sucesso falso", async () => {
  const contexto = await readFile(
    new URL("../../context/ERPContext.jsx", import.meta.url),
    "utf8"
  );
  const inicio = contexto.indexOf("const salvarConfiguracao =");
  const fim = contexto.indexOf("// ================================", inicio);
  const implementacao = contexto.slice(inicio, fim);

  assert.match(implementacao, /await setDoc\([\s\S]*?\{ merge: true \}\)/);
  assert.match(implementacao, /catch \(error\)[\s\S]*?throw error;/);
});
