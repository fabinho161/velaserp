export const featuresPorPlano = {
  gratis: {
    vendas: false,
    crmComercial: false,
    crmBasico: false,
    crmInteligente: false,
    crmWhatsapp: false,
    crmFollowUp: false,
  },
  basico: {
    vendas: true,
    crmComercial: true,
    crmBasico: true,
    crmInteligente: false,
    crmWhatsapp: false,
    crmFollowUp: false,
  },
  profissional: {
    vendas: true,
    crmComercial: true,
    crmBasico: true,
    crmInteligente: true,
    crmWhatsapp: false,
    crmFollowUp: true,
  },
  premium: {
    vendas: true,
    crmComercial: true,
    crmBasico: true,
    crmInteligente: true,
    crmWhatsapp: true,
    crmFollowUp: true,
  },
};

export const PLANO_ORDEM = {
  gratis: 0,
  basico: 1,
  profissional: 2,
  premium: 3,
};

export const PLANOS = {
  gratis: {
    nome: "Grátis",
    preco: 0,
    empresas: 1,
    usuarios: 1,
    vendasMes: 0,
    dre: false,
    pdfProfissional: false,
    personalizacao: false,
    relatoriosAvancados: false,
    ...featuresPorPlano.gratis,
    recursos: [
      "Dashboard básico",
      "1 empresa",
      "1 usuário",
      "Produção básica",
      "Estoque básico",
      "Financeiro simples",
    ],
    limitacoes: [
      "Sem Vendas",
      "Sem CRM",
      "Sem DRE",
      "Sem PDF profissional",
      "Sem relatórios avançados",
      "Sem CRM inteligente",
    ],
  },

  basico: {
    nome: "Básico",
    preco: 19.9,
    empresas: 1,
    usuarios: 2,
    vendasMes: null,
    dre: false,
    pdfProfissional: false,
    personalizacao: false,
    relatoriosAvancados: false,
    ...featuresPorPlano.basico,
    recursos: [
      "1 empresa",
      "Até 2 usuários",
      "Vendas ilimitadas",
      "Operação comercial básica",
      "Cadastro de clientes",
      "CRM básico de clientes",
      "Histórico simples por cliente",
    ],
    limitacoes: [
      "Sem DRE avançado",
      "Sem PDF profissional",
      "Sem recompra inteligente",
      "Sem follow-up comercial",
      "Sem relatórios avançados",
    ],
  },

  profissional: {
    nome: "Profissional",
    preco: 39.9,
    empresas: 3,
    usuarios: 5,
    vendasMes: null,
    dre: true,
    pdfProfissional: true,
    personalizacao: false,
    relatoriosAvancados: false,
    ...featuresPorPlano.profissional,
    recursos: [
      "Tudo do Básico",
      "Até 3 empresas",
      "Até 5 usuários",
      "DRE completo",
      "PDF profissional com logo",
      "CRM inteligente",
      "Recompra prevista",
      "Indicadores da carteira",
      "Follow-up comercial",
    ],
    limitacoes: [
      "Sem identidade visual completa",
      "Sem relatórios avançados premium",
      "Sem WhatsApp integrado ao CRM",
    ],
  },

  premium: {
    nome: "Premium",
    preco: 69.9,
    empresas: 10,
    usuarios: 15,
    vendasMes: null,
    dre: true,
    pdfProfissional: true,
    personalizacao: true,
    relatoriosAvancados: true,
    ...featuresPorPlano.premium,
    recursos: [
      "Tudo do Profissional",
      "Até 10 empresas",
      "Até 15 usuários",
      "Identidade visual completa",
      "Relatórios avançados",
      "CRM completo",
      "WhatsApp para clientes",
      "Follow-up comercial",
      "Contatos de hoje",
      "Prioridade no suporte",
    ],
    limitacoes: [],
  },
};

export const assinaturaGratisPadrao = {
  plano: "gratis",
  status: "active",
  vencimento: null,
  ativadoManual: true,
  formaPagamento: "manual",
  valorPago: 0,
  observacao: "",
  limiteUsuariosManual: null,
  motivoLiberacaoUsuarios: "",
};

export const getPlanoConfig = (plano = "gratis") => {
  return PLANOS[plano] || PLANOS.gratis;
};

export const getPlanoNivel = (plano = "gratis") => {
  return PLANO_ORDEM[plano] ?? PLANO_ORDEM.gratis;
};

export const normalizarLimiteUsuariosManual = (limite) => {
  const numero = Number(limite);
  return Number.isFinite(numero) && numero > 0 ? Math.floor(numero) : null;
};

export const getLimiteUsuariosEfetivo = (plano = "gratis", limiteManual = null) => {
  const limitePlano = getPlanoConfig(plano).usuarios;
  const limiteManualNormalizado = normalizarLimiteUsuariosManual(limiteManual);

  if (limitePlano === null) return limiteManualNormalizado;
  if (!limiteManualNormalizado) return limitePlano;

  return Math.max(limitePlano, limiteManualNormalizado);
};
