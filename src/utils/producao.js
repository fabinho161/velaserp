export const calcularCustoMedioInsumo = (compras = []) => {
  const qtdTotal = compras.reduce(
    (total, compra) => total + Number(compra.quantidade || 0),
    0
  );

  const valorTotal = compras.reduce(
    (total, compra) => total + Number(compra.valorTotal || 0),
    0
  );

  return qtdTotal > 0 ? valorTotal / qtdTotal : 0;
};

export const normalizarQuantidadeProduzida = (quantidade) => {
  const valor = Number(quantidade);
  return Number.isFinite(valor) && valor > 0 ? valor : null;
};

export const calcularConsumosInsumosProducao = ({
  produtoSelecionado,
  insumos = [],
  quantidadeProduzida,
} = {}) => {
  const quantidade = Number(quantidadeProduzida || 0);

  if (!produtoSelecionado) return [];

  return insumos.map((insumo) => {
    const consumoUnitario = Number(
      produtoSelecionado.consumos?.[insumo.nome] || 0
    );
    const quantidadeTotal = consumoUnitario * quantidade;
    const custoMedio = calcularCustoMedioInsumo(insumo.compras || []);

    return {
      nome: insumo.nome,
      unidade: insumo.unidade,
      quantidadeTotal,
      custoMedio,
      custoTotal: quantidadeTotal * custoMedio,
    };
  });
};

export const validarEstoqueInsumosProducao = ({
  consumosCalculados = [],
  insumos = [],
  estoqueInsumos = [],
} = {}) => {
  for (const consumo of consumosCalculados) {
    const insumo = insumos.find((item) => item.nome === consumo.nome);
    const estoqueInsumo = estoqueInsumos.find(
      (item) => item.insumoId === insumo?.id || item.nome === consumo.nome
    );
    const saldo = Number(estoqueInsumo?.saldo ?? insumo?.estoque ?? 0);
    const quantidadeTotal = Number(consumo.quantidadeTotal || 0);

    if (insumo && insumo.nome !== "Energia" && saldo < quantidadeTotal) {
      return {
        ok: false,
        insumo,
        saldo,
        quantidadeTotal,
      };
    }
  }

  return { ok: true };
};

export const calcularComponentesProdutoProducao = ({
  produtoSelecionado,
  produtos = [],
  quantidadeProduzida,
} = {}) => {
  const quantidade = Number(quantidadeProduzida || 0);
  const produtosPorId = new Map(produtos.map((produto) => [produto.id, produto]));

  if (!produtoSelecionado) return [];

  return Object.values(produtoSelecionado.componentesProduto || {})
    .map((componente) => {
      const produtoComponente =
        produtosPorId.get(componente.produtoId) ||
        produtos.find((produto) => produto.codigo === componente.codigo);
      const quantidadeUnitario = Number(componente.quantidade || 0);
      const quantidadeTotal = quantidadeUnitario * quantidade;
      const custoUnitarioSnapshot = Number(
        componente.custoUnitarioSnapshot ||
          produtoComponente?.custoUnitario ||
          0
      );

      return {
        produtoId: componente.produtoId || produtoComponente?.id || "",
        codigo: componente.codigo || produtoComponente?.codigo || "",
        nome: componente.nome || produtoComponente?.nome || "",
        unidade: componente.unidade || produtoComponente?.unidade || "un",
        quantidadeUnitario,
        quantidadeTotal,
        custoUnitarioSnapshot,
        custoTotal: quantidadeTotal * custoUnitarioSnapshot,
      };
    })
    .filter((componente) => componente.quantidadeTotal > 0);
};
