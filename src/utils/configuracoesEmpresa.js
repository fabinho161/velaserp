export const ENDERECO_EMPRESA_PADRAO = Object.freeze({
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  uf: "",
});

export const UFS_BRASIL = Object.freeze([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
]);

export const normalizarCepEmpresa = (valor) =>
  String(valor || "").replace(/\D/g, "").slice(0, 8);

export const formatarCepEmpresa = (valor) => {
  const cep = normalizarCepEmpresa(valor);
  return cep.length > 5 ? `${cep.slice(0, 5)}-${cep.slice(5)}` : cep;
};

export const normalizarUfEmpresa = (valor) => {
  const uf = String(valor || "").trim().toUpperCase();
  return UFS_BRASIL.includes(uf) ? uf : "";
};

export const carregarFormularioEmpresa = (configuracao = {}) => ({
  nome: "",
  cnpj: "",
  cidade: "",
  telefone: "",
  email: "",
  logoUrl: "",
  ...configuracao,
  endereco: {
    ...ENDERECO_EMPRESA_PADRAO,
    ...(configuracao.endereco || {}),
  },
});

export const prepararConfiguracaoEmpresa = (form = {}, podePersonalizar = false) => {
  const enderecoAtual = form.endereco || {};
  const dadosBasicos = {
    nome: form.nome || "",
    cnpj: form.cnpj || "",
    cidade: form.cidade || "",
    telefone: form.telefone || "",
    email: form.email || "",
    endereco: {
      ...enderecoAtual,
      cep: normalizarCepEmpresa(enderecoAtual.cep),
      logradouro: enderecoAtual.logradouro || "",
      numero: enderecoAtual.numero || "",
      complemento: enderecoAtual.complemento || "",
      bairro: enderecoAtual.bairro || "",
      cidade: enderecoAtual.cidade || "",
      uf: normalizarUfEmpresa(enderecoAtual.uf),
    },
  };

  return podePersonalizar ? { ...form, ...dadosBasicos } : dadosBasicos;
};
