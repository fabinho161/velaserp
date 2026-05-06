const PLANOS_PAGOS = {
  basico: {
    nome: "Basico",
    valor: 1,
  },
  profissional: {
    nome: "Profissional",
    valor: 1,
  },
  premium: {
    nome: "Premium",
    valor: 1,
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
