import assert from "node:assert/strict";
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
});

test("relatorios pertence aos quatro segmentos", () => {
  for (const segmento of ["comercio", "industria", "oficina", "clientes"]) {
    assert.equal(segmentoPossuiModulo(segmento, "relatorios"), true);
  }
});

test("servicos pertence somente ao segmento oficina", () => {
  assert.equal(segmentoPossuiModulo("oficina", "servicos"), true);
  assert.equal(segmentoPossuiModulo("comercio", "servicos"), false);
});

test("vendaPecas pertence somente ao segmento oficina", () => {
  assert.equal(segmentoPossuiModulo("oficina", "vendaPecas"), true);
  assert.equal(segmentoPossuiModulo("industria", "vendaPecas"), false);
  assert.equal(segmentoPossuiModulo("comercio", "vendaPecas"), false);
  assert.equal(segmentoPossuiModulo("clientes", "vendaPecas"), false);
});
