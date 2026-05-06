export const extrairNumeroPedido = (numeroPedido = "") => {
  const match = String(numeroPedido).match(/(\d+)\s*$/);
  return match ? Number(match[1]) : 0;
};

export const extrairNumeroCodigo = (codigo = "") => {
  const match = String(codigo).match(/(\d+)\s*$/);
  return match ? Number(match[1]) : 0;
};

export const alternarOrdenacao = (ordenacaoAtual, chave) => {
  if (ordenacaoAtual?.chave === chave) {
    return {
      chave,
      direcao: ordenacaoAtual.direcao === "asc" ? "desc" : "asc",
    };
  }

  return { chave, direcao: "asc" };
};

export const compararValores = (valorA, valorB) => {
  const a = valorA ?? "";
  const b = valorB ?? "";

  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }

  return String(a).localeCompare(String(b), "pt-BR", {
    numeric: true,
    sensitivity: "base",
  });
};

export const ordenarPorConfig = (lista, ordenacao, getValor) => {
  if (!ordenacao?.chave) return [...lista];

  return [...lista].sort((itemA, itemB) => {
    const comparacao = compararValores(
      getValor(itemA, ordenacao.chave),
      getValor(itemB, ordenacao.chave)
    );

    return ordenacao.direcao === "desc" ? -comparacao : comparacao;
  });
};
