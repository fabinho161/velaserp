const PLANOS_PAGOS = {
  basico: {
    nome: "Basico",
    valor: 49,
  },
  profissional: {
    nome: "Profissional",
    valor: 99,
  },
  premium: {
    nome: "Premium",
    valor: 149,
  },
};

const normalizarPlano = (plano) => {
  return String(plano || "").trim().toLowerCase();
};

const validarPlanoPago = (plano) => {
  const planoSolicitado = normalizarPlano(plano);
  return PLANOS_PAGOS[planoSolicitado] ? planoSolicitado : null;
};

module.exports = {
  PLANOS_PAGOS,
  normalizarPlano,
  validarPlanoPago,
};
