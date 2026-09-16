"use strict";

const {
  buscarClassificacaoPorCodigo,
  validarCatalogoTributario,
} = require("./catalogoTributario.cjs");
const { PENDENCIAS_CLASSIFICACAO_TRIBUTARIA } = require("./faturamento.cjs");

const VERSAO_MOTOR_IBS_CBS = "motor_ibs_cbs_v1";

const PENDENCIAS_MOTOR_IBS_CBS = Object.freeze({
  ENTRADA_INVALIDA: "entrada_invalida",
  CATALOGO_AUSENTE: "catalogo_tributario_ausente",
  CATALOGO_INCOMPLETO: "catalogo_tributario_incompleto",
  DATA_OPERACAO_AUSENTE: "data_operacao_ausente",
  CONTEXTO_INCOMPLETO: "contexto_operacional_incompleto",
  DETERMINACAO_AUSENTE: PENDENCIAS_CLASSIFICACAO_TRIBUTARIA.DETERMINACAO_FISCAL_AUSENTE,
  DETERMINACAO_ITEM_INCOMPLETA:
    PENDENCIAS_CLASSIFICACAO_TRIBUTARIA.DETERMINACAO_FISCAL_ITEM_INCOMPLETA,
  REGIME_AUSENTE: PENDENCIAS_CLASSIFICACAO_TRIBUTARIA.REGIME_TRIBUTARIO_AUSENTE,
  CLASSIFICACAO_NAO_DETERMINADA:
    PENDENCIAS_CLASSIFICACAO_TRIBUTARIA.CLASSIFICACAO_IBS_CBS_NAO_DETERMINADA,
  REGRA_NAO_IMPLEMENTADA: "regra_nao_implementada",
  CODIGO_INEXISTENTE: "classificacao_tributaria_inexistente",
  CST_INCOMPATIVEL: "cst_incompativel_com_classificacao",
  FORA_VIGENCIA: "classificacao_fora_vigencia",
});

const ehObjeto = (valor) => valor !== null && typeof valor === "object" && !Array.isArray(valor);
const texto = (valor) => typeof valor === "string" ? valor.trim() : "";
const ordenar = (valores) => [...new Set(valores)].sort();

const congelarProfundo = (valor) => {
  if (valor && typeof valor === "object" && !Object.isFrozen(valor)) {
    Object.values(valor).forEach(congelarProfundo);
    Object.freeze(valor);
  }
  return valor;
};

const dataHistorica = (valor) => {
  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? null : valor.toISOString().slice(0, 10);
  }
  if (ehObjeto(valor) && Number.isFinite(valor._seconds ?? valor.seconds)) {
    const data = new Date((valor._seconds ?? valor.seconds) * 1000);
    return Number.isNaN(data.getTime()) ? null : data.toISOString().slice(0, 10);
  }
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const data = new Date(`${valor}T00:00:00.000Z`);
  return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === valor
    ? valor
    : null;
};

const validarClassificacaoIbsCbs = ({ cst, cClassTrib, dataOperacao, catalogo } = {}) => {
  const pendencias = [];
  if (!catalogo) pendencias.push(PENDENCIAS_MOTOR_IBS_CBS.CATALOGO_AUSENTE);
  else if (!validarCatalogoTributario(catalogo) || catalogo.completo !== true) {
    pendencias.push(PENDENCIAS_MOTOR_IBS_CBS.CATALOGO_INCOMPLETO);
  }

  const data = dataHistorica(dataOperacao);
  if (!data) pendencias.push(PENDENCIAS_MOTOR_IBS_CBS.DATA_OPERACAO_AUSENTE);

  if (pendencias.length === 0) {
    const classificacao = buscarClassificacaoPorCodigo(cClassTrib, catalogo);
    if (!classificacao) pendencias.push(PENDENCIAS_MOTOR_IBS_CBS.CODIGO_INEXISTENTE);
    else {
      if (classificacao.cst !== cst) pendencias.push(PENDENCIAS_MOTOR_IBS_CBS.CST_INCOMPATIVEL);
      if ((classificacao.inicioVigencia && data < classificacao.inicioVigencia.slice(0, 10)) ||
          (classificacao.fimVigencia && data > classificacao.fimVigencia.slice(0, 10))) {
        pendencias.push(PENDENCIAS_MOTOR_IBS_CBS.FORA_VIGENCIA);
      }
    }
  }

  return congelarProfundo({ valida: pendencias.length === 0, pendencias: ordenar(pendencias) });
};

const avaliarTributacaoIbsCbs = ({ faturamento, catalogo, regraVersao = VERSAO_MOTOR_IBS_CBS } = {}) => {
  const pendencias = [];
  const valido = ehObjeto(faturamento) && Array.isArray(faturamento.itens);
  if (!valido || regraVersao !== VERSAO_MOTOR_IBS_CBS) {
    pendencias.push(PENDENCIAS_MOTOR_IBS_CBS.ENTRADA_INVALIDA);
  }
  if (!catalogo) pendencias.push(PENDENCIAS_MOTOR_IBS_CBS.CATALOGO_AUSENTE);
  else if (!validarCatalogoTributario(catalogo) || catalogo.completo !== true) {
    pendencias.push(PENDENCIAS_MOTOR_IBS_CBS.CATALOGO_INCOMPLETO);
  }

  const contexto = valido && ehObjeto(faturamento.contextoFiscal) ? faturamento.contextoFiscal : {};
  const emitente = ehObjeto(contexto.emitente) ? contexto.emitente : {};
  const operacao = ehObjeto(contexto.operacao) ? contexto.operacao : {};
  const data = dataHistorica(operacao.dataOperacao);
  if (!data) pendencias.push(PENDENCIAS_MOTOR_IBS_CBS.DATA_OPERACAO_AUSENTE);
  if (!ehObjeto(contexto.emitente) || !ehObjeto(contexto.destinatario) ||
      !ehObjeto(contexto.operacao) || !texto(operacao.destinoOperacao)) {
    pendencias.push(PENDENCIAS_MOTOR_IBS_CBS.CONTEXTO_INCOMPLETO);
  }
  if (!texto(emitente.regimeTributario)) pendencias.push(PENDENCIAS_MOTOR_IBS_CBS.REGIME_AUSENTE);

  const determinacao = valido && ehObjeto(faturamento.determinacaoFiscal)
    ? faturamento.determinacaoFiscal
    : null;
  if (!determinacao) pendencias.push(PENDENCIAS_MOTOR_IBS_CBS.DETERMINACAO_AUSENTE);
  const itensDeterminados = Array.isArray(determinacao?.itens) ? determinacao.itens : [];
  const itens = valido ? faturamento.itens.map((item, indice) => {
    const itemDeterminado = itensDeterminados.find((atual) => atual?.indice === indice);
    const itemPendencias = [];
    if (!itemDeterminado || !texto(itemDeterminado.cfopEfetivo) ||
        (Array.isArray(itemDeterminado.pendencias) && itemDeterminado.pendencias.length > 0)) {
      itemPendencias.push(determinacao
        ? PENDENCIAS_MOTOR_IBS_CBS.DETERMINACAO_ITEM_INCOMPLETA
        : PENDENCIAS_MOTOR_IBS_CBS.DETERMINACAO_AUSENTE);
    }
    itemPendencias.push(PENDENCIAS_MOTOR_IBS_CBS.REGRA_NAO_IMPLEMENTADA);
    itemPendencias.push(PENDENCIAS_MOTOR_IBS_CBS.CLASSIFICACAO_NAO_DETERMINADA);
    pendencias.push(...itemPendencias);

    const evidencias = [
      ["data_operacao", data],
      ["destino_operacao", texto(operacao.destinoOperacao)],
      ["regime_tributario", texto(emitente.regimeTributario)],
      ["cfop_efetivo", texto(itemDeterminado?.cfopEfetivo)],
      ["origem_produto", texto(item?.fiscalSnapshot?.origemProduto)],
      ["ncm", texto(item?.fiscalSnapshot?.ncm)],
    ].filter(([, valor]) => valor).map(([codigo, valor]) => ({ codigo, valor }));

    return {
      origemItemId: texto(item?.origemItemId),
      indice,
      status: "pendente",
      resultado: { cst: null, cClassTrib: null },
      evidencias,
      regrasAplicadas: [],
      pendencias: ordenar(itemPendencias),
    };
  }) : [];

  pendencias.push(PENDENCIAS_MOTOR_IBS_CBS.REGRA_NAO_IMPLEMENTADA);
  pendencias.push(PENDENCIAS_MOTOR_IBS_CBS.CLASSIFICACAO_NAO_DETERMINADA);
  return congelarProfundo({
    versao: 1,
    regraVersao: VERSAO_MOTOR_IBS_CBS,
    catalogoVersao: texto(catalogo?.versaoCatalogo) || null,
    status: "pendente",
    itens,
    pendencias: ordenar(pendencias),
  });
};

module.exports = {
  VERSAO_MOTOR_IBS_CBS,
  PENDENCIAS_MOTOR_IBS_CBS,
  avaliarTributacaoIbsCbs,
  validarClassificacaoIbsCbs,
};
