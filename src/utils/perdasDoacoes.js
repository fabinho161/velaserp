import {
  converterQuantidade,
  normalizarUnidade,
} from "./unidadesMedida.js";

export const prepararBaixaInsumo = ({
  quantidade,
  unidadeInformada,
  unidadeEstoque,
  unidades = [],
  saldoDisponivel = 0,
  custoUnitarioSnapshot = 0,
} = {}) => {
  const quantidadeInformada = Number(quantidade);
  const origem = normalizarUnidade(unidadeInformada);
  const destino = normalizarUnidade(unidadeEstoque);

  if (!Number.isFinite(quantidadeInformada) || quantidadeInformada <= 0) {
    return { ok: false, motivo: "quantidade_invalida", baixa: null };
  }

  if (!origem || !destino) {
    return { ok: false, motivo: "unidade_invalida", baixa: null };
  }

  const conversao = converterQuantidade({
    quantidade: quantidadeInformada,
    unidadeOrigem: origem,
    unidadeDestino: destino,
    unidades,
  });

  if (!conversao.ok) {
    return { ok: false, motivo: conversao.motivo, baixa: null };
  }

  const quantidadeNormalizada = Number(conversao.quantidade);

  if (!Number.isFinite(quantidadeNormalizada) || quantidadeNormalizada <= 0) {
    return { ok: false, motivo: "quantidade_normalizada_invalida", baixa: null };
  }

  if (quantidadeNormalizada > Number(saldoDisponivel || 0)) {
    return {
      ok: false,
      motivo: "estoque_insuficiente",
      baixa: {
        quantidade: quantidadeNormalizada,
        quantidadeInformada,
        unidadeInformada: origem,
        unidadeEstoque: destino,
      },
    };
  }

  const custoUnitario = Number(custoUnitarioSnapshot || 0);

  return {
    ok: true,
    motivo: "",
    baixa: {
      quantidade: quantidadeNormalizada,
      quantidadeInformada,
      unidadeInformada: origem,
      unidadeEstoque: destino,
      unidade: destino,
      custoUnitarioSnapshot: custoUnitario,
      custoTotalSnapshot: quantidadeNormalizada * custoUnitario,
    },
  };
};

export const obterQuantidadeExibicaoBaixa = (registro = {}) => {
  const tipoItem = String(registro.tipoItem || "produto").toLowerCase();
  const quantidadeInformada = Number(registro.quantidadeInformada);

  if (
    tipoItem === "insumo" &&
    Number.isFinite(quantidadeInformada) &&
    registro.unidadeInformada
  ) {
    return {
      quantidade: quantidadeInformada,
      unidade: normalizarUnidade(registro.unidadeInformada),
    };
  }

  return {
    quantidade: Number(registro.quantidade || 0),
    unidade: registro.unidade || "",
  };
};

export const obterQuantidadeNormalizadaBaixa = (registro = {}) =>
  Number(registro.quantidade || 0);
