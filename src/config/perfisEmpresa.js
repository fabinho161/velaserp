export const PERMISSOES_EMPRESA = {
  dashboard: "dashboard",
  insumos: "insumos",
  produtos: "produtos",
  producao: "producao",
  estoque: "estoque",
  vendas: "vendas",
  crm: "crm",
  financeiro: "financeiro",
  relatorios: "relatorios",
  configuracoes: "configuracoes",
  parametros: "parametros",
  usuariosEmpresa: "usuarios_empresa",
  planos: "planos",
};

export const PERFIS_EMPRESA = {
  administrador_empresa: {
    label: "Administrador da Empresa",
    permissoes: ["*"],
  },
  financeiro: {
    label: "Financeiro",
    permissoes: [
      PERMISSOES_EMPRESA.dashboard,
      PERMISSOES_EMPRESA.financeiro,
      PERMISSOES_EMPRESA.relatorios,
    ],
  },
  producao: {
    label: "Producao",
    permissoes: [
      PERMISSOES_EMPRESA.dashboard,
      PERMISSOES_EMPRESA.insumos,
      PERMISSOES_EMPRESA.produtos,
      PERMISSOES_EMPRESA.producao,
      PERMISSOES_EMPRESA.estoque,
    ],
  },
  comercial: {
    label: "Comercial",
    permissoes: [
      PERMISSOES_EMPRESA.dashboard,
      PERMISSOES_EMPRESA.vendas,
      PERMISSOES_EMPRESA.crm,
      PERMISSOES_EMPRESA.relatorios,
    ],
  },
  estoque: {
    label: "Estoque",
    permissoes: [
      PERMISSOES_EMPRESA.dashboard,
      PERMISSOES_EMPRESA.insumos,
      PERMISSOES_EMPRESA.estoque,
    ],
  },
  visualizacao: {
    label: "Visualizacao",
    permissoes: [
      PERMISSOES_EMPRESA.dashboard,
      PERMISSOES_EMPRESA.relatorios,
    ],
    somenteLeitura: true,
  },
};

export const PERFIL_EMPRESA_PADRAO = "visualizacao";
export const PERFIL_DONO_EMPRESA = "administrador_empresa";

export const normalizarRoleEmpresa = (valor = PERFIL_EMPRESA_PADRAO) => {
  const role =
    typeof valor === "object"
      ? valor?.role || valor?.perfil || valor?.profile
      : valor;
  const roleTratado = String(role || PERFIL_EMPRESA_PADRAO).trim();

  return PERFIS_EMPRESA[roleTratado] ? roleTratado : PERFIL_EMPRESA_PADRAO;
};

export const getPerfilEmpresaConfig = (role = PERFIL_EMPRESA_PADRAO) =>
  PERFIS_EMPRESA[normalizarRoleEmpresa(role)] || PERFIS_EMPRESA[PERFIL_EMPRESA_PADRAO];

export const getPermissoesPerfilEmpresa = (role) =>
  getPerfilEmpresaConfig(role).permissoes || [];

export const temPermissaoEmpresa = (role, permissao) => {
  const permissoes = getPermissoesPerfilEmpresa(role);
  return permissoes.includes("*") || permissoes.includes(permissao);
};

export const perfilEmpresaSomenteLeitura = (role) =>
  Boolean(getPerfilEmpresaConfig(role).somenteLeitura);
