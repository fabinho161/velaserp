"use strict";

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

const dataValida = (valor) => {
  if (valor === null || valor === undefined) return true;
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const data = new Date(`${valor}T00:00:00.000Z`);
  return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === valor;
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

  const codigos = new Set();
  for (const item of catalogo.itens) {
    if (!item || typeof item !== "object" ||
        !codigoValido(item.cst) || !codigoValido(item.cClassTrib) ||
        typeof item.descricao !== "string" || !item.descricao.trim() ||
        !dataValida(item.inicioVigencia) || !dataValida(item.fimVigencia) ||
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
  validarCatalogoTributario,
  buscarClassificacaoPorCodigo,
  listarClassificacoesPorCst,
};
