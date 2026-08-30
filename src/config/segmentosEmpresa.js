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
    nome: "Clientes",
    descricao: "Gestao de clientes, agenda, atendimentos e financeiro.",
    modulos: [
      "dashboard",
      "clientes",
      "agenda",
      "atendimentos",
      "financeiro",
      "relatorios",
      "configuracoes",
    ],
  },
};

const SEGMENTOS_VALIDOS = new Set(Object.keys(SEGMENTOS_EMPRESA));

export const normalizarSegmentoEmpresa = (segmento) => {
  const segmentoTratado = String(segmento || "").trim().toLowerCase();

  return SEGMENTOS_VALIDOS.has(segmentoTratado)
    ? segmentoTratado
    : SEGMENTO_EMPRESA_PADRAO;
};

export const obterSegmentoEmpresa = (segmento) =>
  SEGMENTOS_EMPRESA[normalizarSegmentoEmpresa(segmento)];

export const segmentoPossuiModulo = (segmento, modulo) => {
  const moduloTratado = String(modulo || "").trim();

  if (!moduloTratado) return false;

  return obterSegmentoEmpresa(segmento).modulos.includes(moduloTratado);
};
