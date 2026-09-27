const test = require("node:test");
const assert = require("node:assert/strict");

const {
  montarAssinaturaGratisAtiva,
  normalizarAssinatura,
} = require("../sincronizarPlanoEspelhoEmpresasOwner");

test("monta assinatura gratis ativa com o contrato canonico", () => {
  const timestamp = { timestamp: true };

  assert.deepEqual(montarAssinaturaGratisAtiva(timestamp), {
    plano: "gratis",
    status: "active",
    vencimento: null,
    ativadoManual: true,
    formaPagamento: "manual",
    valorPago: 0,
    observacao: "",
    limiteUsuariosManual: null,
    motivoLiberacaoUsuarios: "",
    atualizadoEm: timestamp,
  });
});

test("normaliza limites de usuarios conforme a matriz comercial vigente", () => {
  const limites = {
    gratis: 1,
    basico: 2,
    profissional: 5,
    premium: 15,
  };

  Object.entries(limites).forEach(([plano, limiteUsuarios]) => {
    assert.deepEqual(normalizarAssinatura({ plano, status: "active" }), {
      plano,
      status: "active",
      nivel: ["gratis", "basico", "profissional", "premium"].indexOf(plano),
      limiteUsuarios,
      limiteUsuariosManual: null,
    });
  });
});

test("normalizador permanece conservador para assinatura ausente ou invalida", () => {
  assert.equal(normalizarAssinatura({}).status, "inactive");
  assert.deepEqual(normalizarAssinatura({ plano: "enterprise", status: "trial" }), {
    plano: "gratis",
    status: "inactive",
    nivel: 0,
    limiteUsuarios: 1,
    limiteUsuariosManual: null,
  });
});
