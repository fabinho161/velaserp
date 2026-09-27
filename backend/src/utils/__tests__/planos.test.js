const assert = require("node:assert/strict");
const test = require("node:test");

const { PLANOS_PAGOS, validarPlanoPago } = require("../planos");

test("backend cobra os precos oficiais dos planos pagos", () => {
  assert.deepEqual(PLANOS_PAGOS, {
    basico: { nome: "Basico", valor: 19.9 },
    profissional: { nome: "Profissional", valor: 39.9 },
    premium: { nome: "Premium", valor: 69.9 },
  });
});

test("validacao de plano pago permanece inalterada", () => {
  assert.equal(validarPlanoPago("BASICO"), "basico");
  assert.equal(validarPlanoPago("profissional"), "profissional");
  assert.equal(validarPlanoPago("premium"), "premium");
  assert.equal(validarPlanoPago("gratis"), null);
});
