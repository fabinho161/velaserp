"use strict";

const dadosOficiais = require("./catalogos/nfse-servicos-nacional-v1.01-20260122.json");

const congelarProfundo = (valor) => {
  if (valor && typeof valor === "object" && !Object.isFrozen(valor)) {
    Object.values(valor).forEach(congelarProfundo);
    Object.freeze(valor);
  }
  return valor;
};

const codigoValido = (valor) => typeof valor === "string" && /^\d{6}$/.test(valor);
const textoValido = (valor) => typeof valor === "string" && Boolean(valor.trim());

const validarCatalogoServicos = (catalogo) => {
  if (!catalogo || typeof catalogo !== "object" || Array.isArray(catalogo)) return false;
  if (catalogo.tipo !== "nfse_servicos_nacional" || !textoValido(catalogo.versaoCatalogo)) return false;
  if (catalogo.completo !== true || catalogo.vigenciaPorRegistro !== false) return false;
  if (!catalogo.referencia || !textoValido(catalogo.referencia.documento) ||
      !textoValido(catalogo.referencia.versaoDocumento) || catalogo.referencia.ambiente !== "producao" ||
      !textoValido(catalogo.referencia.fonte) || !textoValido(catalogo.referencia.url)) return false;
  if (!catalogo.proveniencia || !/^[a-f0-9]{64}$/.test(catalogo.proveniencia.sha256Fonte) ||
      !/^[a-f0-9]{64}$/.test(catalogo.proveniencia.sha256ConteudoTransformado)) return false;
  if (!Array.isArray(catalogo.itens) || catalogo.itens.length === 0 || !Array.isArray(catalogo.nbs)) return false;

  const codigos = new Set();
  for (const item of catalogo.itens) {
    if (!item || !codigoValido(item.codigoTributacaoNacional) ||
        !/^\d{2}$/.test(item.item) || !/^\d{2}$/.test(item.subitem) || !/^\d{2}$/.test(item.desdobroNacional) ||
        item.codigoTributacaoNacional !== `${item.item}${item.subitem}${item.desdobroNacional}` ||
        !textoValido(item.descricao) || codigos.has(item.codigoTributacaoNacional)) return false;
    codigos.add(item.codigoTributacaoNacional);
  }

  const codigosNbs = new Set();
  for (const item of catalogo.nbs) {
    if (!item || !textoValido(item.codigo) || typeof item.descricao !== "string" || codigosNbs.has(item.codigo)) return false;
    codigosNbs.add(item.codigo);
  }
  return true;
};

const copiarItem = (item, catalogo) => item ? {
  ...structuredClone(item),
  origemCatalogo: { tipo: catalogo.tipo, versaoCatalogo: catalogo.versaoCatalogo },
} : null;

const buscarServicoPorCodigo = (codigo, catalogo) => {
  if (!validarCatalogoServicos(catalogo) || !codigoValido(codigo)) return null;
  return copiarItem(catalogo.itens.find((item) => item.codigoTributacaoNacional === codigo), catalogo);
};

const pesquisarServicos = (termo, catalogo, limite = 50) => {
  if (!validarCatalogoServicos(catalogo) || typeof termo !== "string" ||
      !Number.isInteger(limite) || limite <= 0) return [];
  const busca = termo.trim().toLocaleLowerCase("pt-BR");
  return catalogo.itens
    .filter((item) => !busca || item.codigoTributacaoNacional.includes(busca) ||
      item.descricao.toLocaleLowerCase("pt-BR").includes(busca))
    .slice(0, Math.min(limite, 100))
    .map((item) => copiarItem(item, catalogo));
};

const CATALOGO_SERVICOS_NFSE_V1_01_20260122 = congelarProfundo(dadosOficiais);

module.exports = {
  CATALOGO_SERVICOS_NFSE_V1_01_20260122,
  validarCatalogoServicos,
  buscarServicoPorCodigo,
  pesquisarServicos,
};
