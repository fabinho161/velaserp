import { INDICADORES_IE_DESTINATARIO } from "./faturamento.js";

export const TIPOS_PESSOA_FISCAL = Object.freeze({
  FISICA: "pessoa_fisica",
  JURIDICA: "pessoa_juridica",
  EXTERIOR: "exterior",
});

const tiposPessoa = new Set(Object.values(TIPOS_PESSOA_FISCAL));
const indicadoresIE = new Set(Object.values(INDICADORES_IE_DESTINATARIO));
const texto = (valor) => String(valor ?? "").trim();
const digitos = (valor) => texto(valor).replace(/\D/g, "");

export const prepararFiscalCliente = (fiscal = {}, { uf = "" } = {}) => {
  const tipoPessoa = texto(fiscal?.tipoPessoa);
  const cpf = digitos(fiscal?.cpf);
  const cnpj = digitos(fiscal?.cnpj);
  const inscricaoEstadual = texto(fiscal?.inscricaoEstadual);
  const indicadorIECadastral = texto(fiscal?.indicadorIECadastral);
  const endereco = fiscal?.enderecoFiscal || {};
  const paisCodigo = texto(endereco.paisCodigo);
  const paisNome = texto(endereco.paisNome);
  const municipioCodigo = texto(endereco.municipioCodigo);
  const ufTratada = texto(uf).toUpperCase();

  if (tipoPessoa && !tiposPessoa.has(tipoPessoa)) throw new Error("Selecione um tipo de pessoa válido.");
  if ((cpf || cnpj) && !tipoPessoa) throw new Error("Selecione o tipo de pessoa para informar CPF ou CNPJ.");
  if (cpf && cnpj) throw new Error("Informe CPF ou CNPJ, não ambos.");
  if (tipoPessoa === TIPOS_PESSOA_FISCAL.FISICA && cnpj) throw new Error("Pessoa física não pode ter CNPJ como identificação principal.");
  if (tipoPessoa === TIPOS_PESSOA_FISCAL.JURIDICA && cpf) throw new Error("Pessoa jurídica não pode ter CPF como identificação principal.");
  if (tipoPessoa === TIPOS_PESSOA_FISCAL.EXTERIOR && (cpf || cnpj)) throw new Error("Cliente do exterior não usa CPF ou CNPJ brasileiro neste cadastro.");
  if (cpf && cpf.length !== 11) throw new Error("CPF deve ter 11 dígitos.");
  if (cnpj && cnpj.length !== 14) throw new Error("CNPJ deve ter 14 dígitos.");
  if (indicadorIECadastral && !indicadoresIE.has(indicadorIECadastral)) throw new Error("Selecione uma situação de inscrição estadual válida.");
  if (tipoPessoa !== TIPOS_PESSOA_FISCAL.EXTERIOR && ufTratada && !/^[A-Z]{2}$/.test(ufTratada)) {
    throw new Error("UF deve ter duas letras.");
  }
  if (municipioCodigo && !/^\d+$/.test(municipioCodigo)) throw new Error("Código do município deve conter apenas dígitos.");

  if (![tipoPessoa, cpf, cnpj, inscricaoEstadual, indicadorIECadastral,
    paisCodigo, paisNome, municipioCodigo].some(Boolean)) return null;

  return {
    tipoPessoa: tipoPessoa || null,
    cpf,
    cnpj,
    inscricaoEstadual,
    indicadorIECadastral: indicadorIECadastral || null,
    enderecoFiscal: { paisCodigo, paisNome, municipioCodigo },
  };
};

export const criarFiscalDestinatarioSnapshot = (cliente = {}) => {
  const fiscal = cliente?.fiscal;
  if (!fiscal || typeof fiscal !== "object" || Array.isArray(fiscal)) return null;
  const endereco = fiscal.enderecoFiscal && typeof fiscal.enderecoFiscal === "object"
    ? fiscal.enderecoFiscal
    : {};

  return {
    tipoPessoa: tiposPessoa.has(fiscal.tipoPessoa) ? fiscal.tipoPessoa : null,
    cpf: texto(fiscal.cpf),
    cnpj: texto(fiscal.cnpj),
    inscricaoEstadual: texto(fiscal.inscricaoEstadual),
    indicadorIECadastral: indicadoresIE.has(fiscal.indicadorIECadastral)
      ? fiscal.indicadorIECadastral
      : null,
    enderecoFiscal: {
      paisCodigo: texto(endereco.paisCodigo),
      paisNome: texto(endereco.paisNome),
      uf: fiscal.tipoPessoa === TIPOS_PESSOA_FISCAL.EXTERIOR ? "" : texto(cliente.uf),
      municipioCodigo: fiscal.tipoPessoa === TIPOS_PESSOA_FISCAL.EXTERIOR ? "" : texto(endereco.municipioCodigo),
      municipioNome: texto(cliente.cidade),
    },
  };
};
