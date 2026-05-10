const ROLE_ADMIN_EMPRESA = "administrador_empresa";
const ROLE_EMPRESA_PADRAO = "visualizacao";

const ROLES_EMPRESA_LABELS = {
  administrador_empresa: "Administrador da Empresa",
  financeiro: "Financeiro",
  producao: "Producao",
  comercial: "Comercial",
  estoque: "Estoque",
  visualizacao: "Visualizacao",
};

const normalizarRoleEmpresa = (valor = ROLE_EMPRESA_PADRAO) => {
  const role =
    typeof valor === "object"
      ? valor?.role || valor?.perfil || valor?.profile
      : valor;
  const roleTratado = String(role || ROLE_EMPRESA_PADRAO).trim();

  return ROLES_EMPRESA_LABELS[roleTratado] ? roleTratado : ROLE_EMPRESA_PADRAO;
};

const getRoleEmpresaLabel = (role) =>
  ROLES_EMPRESA_LABELS[normalizarRoleEmpresa(role)] || ROLES_EMPRESA_LABELS.visualizacao;

const isRoleAdminEmpresa = (role) => normalizarRoleEmpresa(role) === ROLE_ADMIN_EMPRESA;

module.exports = {
  getRoleEmpresaLabel,
  isRoleAdminEmpresa,
  normalizarRoleEmpresa,
  ROLE_ADMIN_EMPRESA,
};
