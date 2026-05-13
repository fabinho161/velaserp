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

const normalizarTextoRole = (valor) =>
  String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");

const normalizarRoleEmpresa = (valor = ROLE_EMPRESA_PADRAO) => {
  const role =
    typeof valor === "object"
      ? valor?.role || valor?.perfil || valor?.profile
      : valor;
  const roleTratado = String(role || ROLE_EMPRESA_PADRAO).trim();
  const roleNormalizado = normalizarTextoRole(roleTratado);

  if (ROLES_EMPRESA_LABELS[roleTratado]) return roleTratado;

  const rolePorLabel = Object.entries(ROLES_EMPRESA_LABELS).find(
    ([key, label]) =>
      normalizarTextoRole(key) === roleNormalizado ||
      normalizarTextoRole(label) === roleNormalizado
  );

  return rolePorLabel ? rolePorLabel[0] : ROLE_EMPRESA_PADRAO;
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
