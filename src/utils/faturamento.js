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
  PENDENCIAS_FATURAMENTO,
  PENDENCIAS_PREPARACAO_FATURAMENTO,
  PRESENCAS_COMPRADOR,
  criarContextoOperacionalFaturamento,
  criarFaturamentoVenda,
  derivarDestinoOperacao,
  validarPreparacaoFaturamento,
} = faturamento;
