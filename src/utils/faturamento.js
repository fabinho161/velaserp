import * as faturamentoModulo from "../../backend/src/shared/faturamento.cjs";

const faturamento =
  faturamentoModulo.default ||
  globalThis.__RENOVAR_ERP_FATURAMENTO__ ||
  faturamentoModulo;

export const {
  DESTINOS_OPERACAO,
  FINALIDADES_OPERACAO,
  FINALIDADES_OPERACAO_SUPORTADAS,
  INDICADORES_IE_DESTINATARIO,
  PENDENCIAS_CLASSIFICACAO_TRIBUTARIA,
  PENDENCIAS_DETERMINACAO_FISCAL,
  PENDENCIAS_FATURAMENTO,
  PENDENCIAS_PREPARACAO_FATURAMENTO,
  PRESENCAS_COMPRADOR,
  classificarTributacaoFaturamento,
  criarContextoOperacionalFaturamento,
  criarFaturamentoVenda,
  determinarCfopItem,
  determinarFiscalFaturamento,
  derivarDestinoOperacao,
  validarPreparacaoFaturamento,
} = faturamento;
