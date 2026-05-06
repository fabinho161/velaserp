import { useCallback, useState } from "react";
import { alternarOrdenacao, ordenarPorConfig } from "../utils/sortUtils";

export function useTableSort(ordenacaoInicial) {
  const [ordenacao, setOrdenacao] = useState(ordenacaoInicial);

  const ordenar = useCallback(
    (lista, getValor) => ordenarPorConfig(lista, ordenacao, getValor),
    [ordenacao]
  );

  const ordenarPor = useCallback((chave) => {
    setOrdenacao((atual) => alternarOrdenacao(atual, chave));
  }, []);

  const indicador = useCallback(
    (chave) => {
      if (ordenacao.chave !== chave) return "";
      return ordenacao.direcao === "asc" ? "↑" : "↓";
    },
    [ordenacao]
  );

  const ativo = useCallback(
    (chave) => ordenacao.chave === chave,
    [ordenacao]
  );

  return {
    ordenacao,
    ordenar,
    ordenarPor,
    indicador,
    ativo,
  };
}
