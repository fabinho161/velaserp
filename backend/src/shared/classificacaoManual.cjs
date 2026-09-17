"use strict";

const { classificarTributacaoFaturamento, PENDENCIAS_CLASSIFICACAO_TRIBUTARIA } = require("./faturamento.cjs");
const { validarCatalogoTributario } = require("./catalogoTributario.cjs");
const { validarClassificacaoIbsCbs } = require("./motorTributario.cjs");

const erro = (codigo) => {
  const error = new Error(codigo);
  error.codigo = codigo;
  return error;
};

const texto = (valor) => typeof valor === "string" ? valor.trim() : "";
const PENDENCIA = PENDENCIAS_CLASSIFICACAO_TRIBUTARIA.CLASSIFICACAO_IBS_CBS_NAO_DETERMINADA;

const classificarManualmente = ({ faturamento, solicitacoes, catalogo, usuarioId, dataAuditoria }) => {
  if (!validarCatalogoTributario(catalogo) || catalogo.completo !== true) throw erro("catalogo_indisponivel");
  if (!Array.isArray(faturamento?.itens) || !Array.isArray(solicitacoes) || solicitacoes.length === 0) {
    throw erro("itens_invalidos");
  }
  if (!texto(usuarioId) || !dataAuditoria) throw erro("auditoria_invalida");
  const dataOperacao = faturamento.contextoFiscal?.operacao?.dataOperacao;
  const base = faturamento.classificacaoTributaria?.itens?.length === faturamento.itens.length
    ? structuredClone(faturamento.classificacaoTributaria)
    : structuredClone(classificarTributacaoFaturamento(faturamento));
  const vistos = new Set();
  let alterou = false;

  for (const solicitacao of solicitacoes) {
    const indice = solicitacao?.indice;
    if (!Number.isInteger(indice) || indice < 0 || indice >= faturamento.itens.length) throw erro("item_inexistente");
    if (vistos.has(indice)) throw erro("item_duplicado");
    vistos.add(indice);
    const itemOrigem = faturamento.itens[indice];
    if (texto(solicitacao.origemItemId) !== texto(itemOrigem.origemItemId)) throw erro("item_inexistente");
    const cst = texto(solicitacao.cst);
    const cClassTrib = texto(solicitacao.cClassTrib);
    if (!catalogo.csts.some((item) => item.cst === cst)) throw erro("cst_inexistente");
    const validacao = validarClassificacaoIbsCbs({ cst, cClassTrib, dataOperacao, catalogo });
    if (!validacao.valida) throw erro(validacao.pendencias[0] || "classificacao_invalida");
    if (solicitacao.observacao != null && typeof solicitacao.observacao !== "string") throw erro("observacao_invalida");
    const observacao = texto(solicitacao.observacao).replace(/\s+/g, " ");
    if (observacao.length > 500) throw erro("observacao_longa");
    const anterior = base.itens[indice];
    if (anterior.ibsCbs?.cst === cst && anterior.ibsCbs?.cClassTrib === cClassTrib &&
        texto(anterior.observacao) === observacao && anterior.origemClassificacao === "manual") continue;
    const historico = Array.isArray(anterior.historico) ? anterior.historico.slice(-19) : [];
    if (anterior.origemClassificacao === "manual") {
      historico.push({ cstAnterior: anterior.ibsCbs.cst, cClassTribAnterior: anterior.ibsCbs.cClassTrib,
        cstNovo: cst, cClassTribNovo: cClassTrib, usuarioId, data: dataAuditoria });
    }
    base.itens[indice] = {
      ...anterior,
      ibsCbs: { cst, cClassTrib, fonte: { tipo: "manual", versao: catalogo.versaoCatalogo } },
      origemClassificacao: "manual",
      catalogoVersao: catalogo.versaoCatalogo,
      observacao,
      classificadoPor: anterior.classificadoPor || usuarioId,
      classificadoEm: anterior.classificadoEm || dataAuditoria,
      atualizadoPor: usuarioId,
      atualizadoEm: dataAuditoria,
      historico,
      pendencias: (anterior.pendencias || []).filter((codigo) => codigo !== PENDENCIA),
    };
    alterou = true;
  }

  base.pendencias = [...new Set(base.itens.flatMap((item) => item.pendencias || [])
    .concat((base.pendencias || []).filter((codigo) => codigo !== PENDENCIA)))];
  if (base.itens.some((item) => !item.ibsCbs?.cst || !item.ibsCbs?.cClassTrib)) base.pendencias.push(PENDENCIA);
  if (base.itens.some((item) => item.origemClassificacao === "manual")) {
    base.origem = "manual";
    base.catalogoVersao = catalogo.versaoCatalogo;
  }
  return { classificacaoTributaria: base, alterou };
};

module.exports = { classificarManualmente };
