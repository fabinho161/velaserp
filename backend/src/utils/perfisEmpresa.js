const PERFIL_ADMIN_EMPRESA = "administrador_empresa";

const PERFIS_EMPRESA_LABELS = {
  administrador_empresa: "Administrador da Empresa",
  financeiro: "Financeiro",
  producao: "Producao",
  comercial: "Comercial",
  estoque: "Estoque",
  visualizacao: "Visualizacao",
};

const getPerfilEmpresaLabel = (perfil) =>
  PERFIS_EMPRESA_LABELS[perfil] || PERFIS_EMPRESA_LABELS.visualizacao;

const isPerfilAdminEmpresa = (perfil) => perfil === PERFIL_ADMIN_EMPRESA;

module.exports = {
  getPerfilEmpresaLabel,
  isPerfilAdminEmpresa,
  PERFIL_ADMIN_EMPRESA,
};
