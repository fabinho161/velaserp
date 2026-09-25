import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  normalizarSegmentoEmpresa,
  obterSegmentoEmpresa,
  segmentoPossuiModulo,
} from "../segmentosEmpresa.js";

test("normaliza os quatro segmentos validos", () => {
  for (const segmento of ["comercio", "industria", "oficina", "clientes"]) {
    assert.equal(normalizarSegmentoEmpresa(segmento), segmento);
    assert.equal(obterSegmentoEmpresa(segmento).id, segmento);
  }
});

test("normaliza alias legado servicos para o segmento canonico clientes", () => {
  assert.equal(normalizarSegmentoEmpresa("servicos"), "clientes");
  assert.equal(obterSegmentoEmpresa("servicos").id, "clientes");
  assert.equal(segmentoPossuiModulo("servicos", "agenda"), true);
  assert.equal(segmentoPossuiModulo("servicos", "financeiro"), true);
});

test("usa industria como fallback para valores invalidos, undefined e null", () => {
  assert.equal(normalizarSegmentoEmpresa("saude"), "industria");
  assert.equal(normalizarSegmentoEmpresa(undefined), "industria");
  assert.equal(normalizarSegmentoEmpresa(null), "industria");
});

test("identifica modulos por segmento", () => {
  assert.equal(segmentoPossuiModulo("industria", "producao"), true);
  assert.equal(segmentoPossuiModulo("comercio", "producao"), false);
  assert.equal(segmentoPossuiModulo(undefined, "producao"), true);
  assert.equal(segmentoPossuiModulo("oficina", "ordensServico"), true);
  assert.equal(segmentoPossuiModulo("clientes", "agenda"), true);
  assert.equal(segmentoPossuiModulo("oficina", "agenda"), false);
  assert.equal(segmentoPossuiModulo("industria", "agenda"), false);
  assert.equal(segmentoPossuiModulo("comercio", "agenda"), false);
});

test("producao pertence somente ao segmento industria", () => {
  assert.equal(segmentoPossuiModulo("industria", "producao"), true);
  assert.equal(segmentoPossuiModulo("comercio", "producao"), false);
  assert.equal(segmentoPossuiModulo("oficina", "producao"), false);
  assert.equal(segmentoPossuiModulo("clientes", "producao"), false);
});

test("relatorios pertence aos quatro segmentos", () => {
  for (const segmento of ["comercio", "industria", "oficina", "clientes"]) {
    assert.equal(segmentoPossuiModulo(segmento, "relatorios"), true);
  }
});

test("servicos pertence aos segmentos oficina e clientes", () => {
  assert.equal(segmentoPossuiModulo("oficina", "servicos"), true);
  assert.equal(segmentoPossuiModulo("clientes", "servicos"), true);
  assert.equal(segmentoPossuiModulo("industria", "servicos"), false);
  assert.equal(segmentoPossuiModulo("comercio", "servicos"), false);
});

test("vendaPecas pertence somente ao segmento oficina", () => {
  assert.equal(segmentoPossuiModulo("oficina", "vendaPecas"), true);
  assert.equal(segmentoPossuiModulo("industria", "vendaPecas"), false);
  assert.equal(segmentoPossuiModulo("comercio", "vendaPecas"), false);
  assert.equal(segmentoPossuiModulo("clientes", "vendaPecas"), false);
});

test("faturamento nao pertence a gestao de servicos", () => {
  assert.equal(segmentoPossuiModulo("comercio", "faturamento"), true);
  assert.equal(segmentoPossuiModulo("industria", "faturamento"), true);
  assert.equal(segmentoPossuiModulo("oficina", "faturamento"), true);
  assert.equal(segmentoPossuiModulo("clientes", "faturamento"), false);
  assert.equal(segmentoPossuiModulo("clientes", "atendimentos"), false);
});

test("parametros da empresa nao pertencem a gestao de servicos", () => {
  assert.equal(segmentoPossuiModulo("clientes", "parametrosEmpresa"), false);
  assert.equal(segmentoPossuiModulo("servicos", "parametrosEmpresa"), false);
  assert.equal(segmentoPossuiModulo("comercio", "parametrosEmpresa"), true);
  assert.equal(segmentoPossuiModulo("industria", "parametrosEmpresa"), true);
  assert.equal(segmentoPossuiModulo("oficina", "parametrosEmpresa"), true);
});

test("sidebar e rota de parametros usam a restricao central por segmento", () => {
  const sidebar = readFileSync(
    new URL("../../components/Sidebar.jsx", import.meta.url),
    "utf8"
  );
  const app = readFileSync(new URL("../../App.jsx", import.meta.url), "utf8");

  assert.match(
    sidebar,
    /path:\s*["']\/parametros-empresa["'][\s\S]*?modulo:\s*["']parametrosEmpresa["']/
  );
  assert.match(
    app,
    /path=["']\/parametros-empresa["'][\s\S]*?<SegmentoRoute modulo=["']parametrosEmpresa["']>/
  );
});
