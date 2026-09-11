const FISCAL_ITEM_PADRAO = Object.freeze({
  versao: 1,
  ncm: "",
  cest: "",
  cfopPadrao: "",
  origem: "",
  unidadeTributavel: "",
});

const FISCAL_EMPRESA_PADRAO = Object.freeze({
  versao: 1,
  regimeTributario: "",
  cnpj: "",
  inscricaoEstadual: "",
  inscricaoMunicipal: "",
  cnae: "",
  uf: "",
  municipio: "",
  ambienteFiscal: "",
});

const valorTextoFiscal = (valor) => {
  if (valor === null || valor === undefined) return "";
  return String(valor);
};

export const criarFiscalSnapshotItemVenda = (produto = {}) => {
  const fiscal = produto && typeof produto.fiscal === "object" && !Array.isArray(produto.fiscal)
    ? produto.fiscal
    : {};

  return Object.freeze({
    ...FISCAL_ITEM_PADRAO,
    ncm: valorTextoFiscal(fiscal.ncm),
    cest: valorTextoFiscal(fiscal.cest),
    cfopPadrao: valorTextoFiscal(fiscal.cfopPadrao),
    origem: valorTextoFiscal(fiscal.origem),
    unidadeTributavel: valorTextoFiscal(fiscal.unidadeTributavel),
  });
};

export const criarFiscalEmpresaSnapshot = (configuracaoFiscal = {}) => {
  const fiscal =
    configuracaoFiscal &&
    typeof configuracaoFiscal === "object" &&
    !Array.isArray(configuracaoFiscal)
      ? configuracaoFiscal
      : {};

  return Object.freeze({
    ...FISCAL_EMPRESA_PADRAO,
    regimeTributario: valorTextoFiscal(fiscal.regimeTributario),
    cnpj: valorTextoFiscal(fiscal.cnpj),
    inscricaoEstadual: valorTextoFiscal(fiscal.inscricaoEstadual),
    inscricaoMunicipal: valorTextoFiscal(fiscal.inscricaoMunicipal),
    cnae: valorTextoFiscal(fiscal.cnae),
    uf: valorTextoFiscal(fiscal.uf),
    municipio: valorTextoFiscal(fiscal.municipio),
    ambienteFiscal: valorTextoFiscal(fiscal.ambienteFiscal),
  });
};
