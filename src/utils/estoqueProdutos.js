const normalizarTextoProduto = (valor = "") =>
  String(valor)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

export const normalizarChaveProduto = (valor = "") => normalizarTextoProduto(valor);

export const textoProdutoSeguro = (valor, fallback = "-") => {
  if (valor === null || valor === undefined || valor === "") return fallback;

  if (typeof valor === "object") {
    const partes = [
      valor.codigo,
      valor.nome || valor.nomeProduto || valor.produtoNome,
      valor.tipo,
    ].filter(Boolean);

    return partes.length > 0 ? partes.join(" ") : fallback;
  }

  return String(valor);
};

const montarDescricaoProduto = (registro = {}) => {
  if (typeof registro.produto === "string" && registro.produto.trim()) {
    return registro.produto.trim();
  }

  const codigo = registro.codigo || registro.codigoProduto || "";
  const nome = registro.nome || registro.nomeProduto || registro.produtoNome || "";
  const tipo = registro.tipo || "";
  const descricao = [
    codigo ? `${codigo} -` : "",
    nome,
    tipo,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return descricao || textoProdutoSeguro(registro.produto || registro.nome || registro.nomeProduto);
};

const obterAliasesProduto = (registro = {}) => {
  const codigo = registro.codigo || registro.codigoProduto || "";
  const nome = registro.nome || registro.nomeProduto || registro.produtoNome || "";
  const tipo = registro.tipo || "";

  return [
    registro.produto,
    montarDescricaoProduto(registro),
    nome,
    nome && tipo ? `${nome} ${tipo}` : "",
    codigo && nome ? `${codigo} - ${nome}${tipo ? ` ${tipo}` : ""}` : "",
    codigo,
  ]
    .map((alias) => normalizarTextoProduto(textoProdutoSeguro(alias, "")))
    .filter(Boolean);
};

const obterAliasesItemVenda = (item = {}, venda = {}) => [
  item.produto,
  item.nomeProduto,
  item.produtoNome,
  item.codigo && item.nomeProduto
    ? `${item.codigo} - ${item.nomeProduto}${item.tipo ? ` ${item.tipo}` : ""}`
    : "",
  venda.produto,
]
  .map((alias) => normalizarTextoProduto(textoProdutoSeguro(alias, "")))
  .filter(Boolean);

const obterAliasesBaixaEstoque = (baixa = {}) => [
  baixa.produtoNome,
  baixa.produto,
  baixa.nomeProduto,
  baixa.codigoProduto && baixa.produtoNome
    ? `${baixa.codigoProduto} - ${baixa.produtoNome}${baixa.tipo ? ` ${baixa.tipo}` : ""}`
    : "",
]
  .map((alias) => normalizarTextoProduto(textoProdutoSeguro(alias, "")))
  .filter(Boolean);

const vendaMovimentaEstoque = (venda = {}) => {
  const expedicao = String(venda.statusExpedicao || "").toLowerCase();
  const pagamento = String(venda.statusPagamento || "").toLowerCase();

  return expedicao !== "cancelado" && pagamento !== "cancelado";
};

export const calcularEstoqueProdutos = ({
  produtos = [],
  producoes = [],
  vendas = [],
  perdasDoacoes = [],
  ignorarVendaIndex = null,
  ignorarVendaId = "",
} = {}) => {
  const mapa = new Map();
  const aliases = new Map();

  const garantirItem = (registro = {}) => {
    const descricao = montarDescricaoProduto(registro);
    const chaveInicial = normalizarTextoProduto(descricao);
    const aliasesRegistro = obterAliasesProduto(registro);
    const chaveExistente = aliasesRegistro.find((alias) => aliases.has(alias));
    const chave = chaveExistente ? aliases.get(chaveExistente) : chaveInicial;

    if (!mapa.has(chave)) {
      mapa.set(chave, {
        produto: descricao,
        produzido: 0,
        vendido: 0,
        baixado: 0,
        custoTotal: 0,
        estoqueMinimo: Number(registro.estoqueMinimo || 0),
      });
    }

    aliasesRegistro.forEach((alias) => aliases.set(alias, chave));
    return mapa.get(chave);
  };

  (produtos || []).forEach((produto) => {
    garantirItem(produto);
  });

  (producoes || []).forEach((producao) => {
    const item = garantirItem(producao);
    item.produzido += Number(producao.quantidade || 0);
    item.custoTotal += Number(producao.custoTotal || 0);
  });

  (vendas || []).forEach((venda, vendaIndex) => {
    if (ignorarVendaIndex !== null && ignorarVendaIndex === vendaIndex) return;
    if (ignorarVendaId && venda.id === ignorarVendaId) return;
    if (!vendaMovimentaEstoque(venda)) return;

    const itensVenda = Array.isArray(venda.itens) && venda.itens.length > 0
      ? venda.itens
      : [{ produto: venda.produto, quantidade: venda.quantidade }];

    itensVenda.forEach((itemVenda) => {
      const aliasesVenda = obterAliasesItemVenda(itemVenda, venda);
      const chave = aliasesVenda.find((alias) => aliases.has(alias));
      const item = chave
        ? mapa.get(aliases.get(chave))
        : garantirItem({ produto: itemVenda?.produto || venda.produto });

      item.vendido += Number(itemVenda?.quantidade || 0);
    });
  });

  (perdasDoacoes || []).forEach((baixa) => {
    if (String(baixa.status || "ativo").toLowerCase() === "cancelado") return;

    const aliasesBaixa = obterAliasesBaixaEstoque(baixa);
    const chave = aliasesBaixa.find((alias) => aliases.has(alias));
    const item = chave
      ? mapa.get(aliases.get(chave))
      : garantirItem({ produto: baixa.produtoNome || baixa.produto });

    item.baixado += Number(baixa.quantidade || 0);
  });

  return Array.from(mapa.values()).map((item) => {
    const saldoReal = item.produzido - item.vendido - item.baixado;
    const saldo = Math.max(0, saldoReal);
    const custoMedio = item.produzido > 0 ? item.custoTotal / item.produzido : 0;

    return {
      ...item,
      saldo,
      saldoReal,
      custoMedio,
      valorEstoque: saldo * custoMedio,
    };
  });
};
