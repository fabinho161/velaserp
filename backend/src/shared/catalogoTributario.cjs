"use strict";

const dadosOficiaisV160 = require("./catalogos/ibs-cbs-cclasstrib-2025.002-v1.60.json");

const congelarProfundo = (valor) => {
  if (valor && typeof valor === "object" && !Object.isFrozen(valor)) {
    Object.values(valor).forEach(congelarProfundo);
    Object.freeze(valor);
  }
  return valor;
};

const CATALOGO_IBS_CBS_2025_002_V1_60 = congelarProfundo(dadosOficiaisV160);

// Reference metadata only. No official rows are bundled until a verified source is available.
const CATALOGO_IBS_CBS_REFERENCIA = Object.freeze({
  tipo: "ibs_cbs_cclasstrib",
  versaoCatalogo: "2025.002-v1.60",
  referencia: Object.freeze({
    documento: "IT 2025.002",
    versaoDocumento: "1.60",
    dataDocumento: "2026-06-22",
    dataPublicacao: "2026-06-23",
  }),
  completo: false,
  itens: Object.freeze([]),
});

const codigoValido = (valor) =>
  typeof valor === "string" && /^\d+$/.test(valor);

const indicadoresValidos = (indicadores) =>
  indicadores === undefined ||
  (indicadores && typeof indicadores === "object" && !Array.isArray(indicadores) &&
    Object.entries(indicadores).every(([chave, valor]) =>
      /^(Ind|Possui)/.test(chave) && typeof valor === "boolean"
    ));

const dataValida = (valor) => {
  if (valor === null || valor === undefined) return true;
  if (typeof valor !== "string" ||
      !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?)?$/.test(valor)) return false;
  const data = new Date(`${valor.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== valor.slice(0, 10)) return false;
  if (valor.length === 10) return true;
  return Number(valor.slice(11, 13)) < 24 && Number(valor.slice(14, 16)) < 60 &&
    Number(valor.slice(17, 19)) < 60;
};

const validarCatalogoTributario = (catalogo) => {
  if (!catalogo || typeof catalogo !== "object" || Array.isArray(catalogo)) return false;
  if (catalogo.tipo !== "ibs_cbs_cclasstrib") return false;
  if (typeof catalogo.versaoCatalogo !== "string" || !catalogo.versaoCatalogo.trim()) return false;
  const referencia = catalogo.referencia;
  if (!referencia || typeof referencia !== "object" ||
      typeof referencia.documento !== "string" || !referencia.documento.trim() ||
      typeof referencia.versaoDocumento !== "string" || !referencia.versaoDocumento.trim() ||
      !dataValida(referencia.dataDocumento) || !dataValida(referencia.dataPublicacao)) return false;
  if (!Array.isArray(catalogo.itens)) return false;
  if (catalogo.completo === true && catalogo.itens.length === 0) return false;

  const csts = Array.isArray(catalogo.csts) ? catalogo.csts : null;
  if (catalogo.csts !== undefined && !csts) return false;
  if (catalogo.completo === true && (!csts || csts.length === 0)) return false;
  if (csts) {
    const codigosCst = new Set();
    for (const cst of csts) {
      if (!cst || !codigoValido(cst.cst) || codigosCst.has(cst.cst) ||
          typeof cst.nome !== "string" || !cst.nome.trim() ||
          !dataValida(cst.inicioVigencia) || !dataValida(cst.fimVigencia) ||
          !dataValida(cst.dataPublicacao) ||
          (cst.inicioVigencia && cst.fimVigencia && cst.inicioVigencia > cst.fimVigencia) ||
          !indicadoresValidos(cst.indicadores)) return false;
      codigosCst.add(cst.cst);
    }
  }

  const codigos = new Set();
  for (const item of catalogo.itens) {
    if (!item || typeof item !== "object" ||
        !codigoValido(item.cst) || !codigoValido(item.cClassTrib) ||
        item.cClassTrib.slice(0, 3) !== item.cst ||
        (csts && !csts.some((cst) => cst.cst === item.cst)) ||
        typeof item.descricao !== "string" || !item.descricao.trim() ||
        !dataValida(item.inicioVigencia) || !dataValida(item.fimVigencia) ||
        !dataValida(item.dataPublicacao) || !indicadoresValidos(item.indicadores) ||
        (item.inicioVigencia && item.fimVigencia && item.inicioVigencia > item.fimVigencia) ||
        codigos.has(item.cClassTrib)) return false;
    codigos.add(item.cClassTrib);
  }
  return true;
};

const copiarItem = (item, catalogo) => item ? {
  ...structuredClone(item),
  origemCatalogo: {
    tipo: catalogo.tipo,
    versaoCatalogo: catalogo.versaoCatalogo,
    referencia: { ...catalogo.referencia },
  },
} : null;

const buscarClassificacaoPorCodigo = (cClassTrib, catalogo) => {
  if (!validarCatalogoTributario(catalogo) || !codigoValido(cClassTrib)) return null;
  return copiarItem(catalogo.itens.find((item) => item.cClassTrib === cClassTrib), catalogo);
};

const listarClassificacoesPorCst = (cst, catalogo) => {
  if (!validarCatalogoTributario(catalogo) || !codigoValido(cst)) return [];
  return catalogo.itens.filter((item) => item.cst === cst).map((item) => copiarItem(item, catalogo));
};

module.exports = {
  CATALOGO_IBS_CBS_REFERENCIA,
  CATALOGO_IBS_CBS_2025_002_V1_60,
  validarCatalogoTributario,
  buscarClassificacaoPorCodigo,
  listarClassificacoesPorCst,
};
