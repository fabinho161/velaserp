export const SEGMENTO_EMPRESA_PADRAO = "industria";

export const SEGMENTOS_EMPRESA = {
  comercio: {
    id: "comercio",
    nome: "Comercio",
    descricao: "Operacao comercial com produtos, estoque, vendas e clientes.",
    modulos: [
      "dashboard",
      "produtos",
      "estoque",
      "vendas",
      "faturamento",
      "clientes",
      "financeiro",
      "fornecedores",
      "relatorios",
      "configuracoes",
    ],
  },
  industria: {
    id: "industria",
    nome: "Industria",
    descricao: "Operacao industrial com insumos, producao, estoque e vendas.",
    modulos: [
      "dashboard",
      "produtos",
      "insumos",
      "producao",
      "estoque",
      "perdasDoacoes",
      "vendas",
      "faturamento",
      "clientes",
      "financeiro",
      "fornecedores",
      "relatorios",
      "configuracoes",
    ],
  },
  oficina: {
    id: "oficina",
    nome: "Oficina",
    descricao: "Operacao de oficina com clientes, veiculos e ordens de servico.",
    modulos: [
      "dashboard",
      "clientes",
      "veiculos",
      "servicos",
      "ordensServico",
      "vendaPecas",
      "faturamento",
      "produtos",
      "estoque",
      "financeiro",
      "fornecedores",
      "relatorios",
      "configuracoes",
    ],
  },
  clientes: {
    id: "clientes",
    nome: "Gestão de Serviços",
    descricao: "Gestão de clientes, agenda, atendimentos e financeiro.",
    modulos: [
      "dashboard",
      "clientes",
      "servicos",
      "agenda",
      "financeiro",
      "relatorios",
      "configuracoes",
    ],
  },
};

const SEGMENTOS_VALIDOS = new Set(Object.keys(SEGMENTOS_EMPRESA));
const ALIASES_SEGMENTO_EMPRESA = {
  servicos: "clientes",
};

export const normalizarSegmentoEmpresa = (segmento) => {
  const segmentoTratado = String(segmento || "").trim().toLowerCase();
  const segmentoCanonico = ALIASES_SEGMENTO_EMPRESA[segmentoTratado] || segmentoTratado;

  return SEGMENTOS_VALIDOS.has(segmentoCanonico)
    ? segmentoCanonico
    : SEGMENTO_EMPRESA_PADRAO;
};

export const obterSegmentoEmpresa = (segmento) =>
  SEGMENTOS_EMPRESA[normalizarSegmentoEmpresa(segmento)];

export const segmentoPossuiModulo = (segmento, modulo) => {
  const moduloTratado = String(modulo || "").trim();

  if (!moduloTratado) return false;

  return obterSegmentoEmpresa(segmento).modulos.includes(moduloTratado);
};
