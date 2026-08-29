import { extrairNumeroPedido } from "./sortUtils.js";
import { normalizarChaveProduto, textoProdutoSeguro } from "./estoqueProdutos.js";

const STATUS_PRODUTO_INATIVO = new Set([
  "inativo",
  "removido",
  "excluido",
  "excluído",
  "cancelado",
]);

const isObjeto = (valor) =>
  valor !== null && typeof valor === "object" && !Array.isArray(valor);

const normalizarDataPedido = (valor) => {
  if (!valor) return null;

  if (typeof valor?.toDate === "function") {
    const data = valor.toDate();
    return Number.isNaN(data.getTime()) ? null : data;
  }

  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? null : valor;
  }

  if (
    isObjeto(valor) &&
    Number.isFinite(valor.seconds)
  ) {
    const data = new Date(
      valor.seconds * 1000 + Math.floor(Number(valor.nanoseconds || 0) / 1000000)
    );
    return Number.isNaN(data.getTime()) ? null : data;
  }

  if (typeof valor !== "string") return null;

  const texto = valor.trim();
  if (!texto) return null;

  const dataIsoCurta = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dataIsoCurta) {
    const [, ano, mes, dia] = dataIsoCurta;
    const data = new Date(Number(ano), Number(mes) - 1, Number(dia));
    return Number.isNaN(data.getTime()) ? null : data;
  }

  const dataBR = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (dataBR) {
    const [, dia, mes, ano, hora = "0", minuto = "0", segundo = "0"] = dataBR;
    const data = new Date(
      Number(ano),
      Number(mes) - 1,
      Number(dia),
      Number(hora),
      Number(minuto),
      Number(segundo)
    );
    return Number.isNaN(data.getTime()) ? null : data;
  }

  const data = new Date(texto);
  return Number.isNaN(data.getTime()) ? null : data;
};

export const obterDataPedido = (pedido = {}) =>
  normalizarDataPedido(
    pedido.data ||
      pedido.criadoEm ||
      pedido.createdAt
  );

const obterDataDesempatePedido = (pedido = {}) =>
  normalizarDataPedido(
    pedido.criadoEm ||
      pedido.createdAt ||
      pedido.atualizadoEm ||
      pedido.updatedAt ||
      pedido.data
  );

export const formatarDataPedidoBR = (valor) => {
  const data = normalizarDataPedido(valor);
  if (!data) return "-";

  return data.toLocaleDateString("pt-BR");
};

export const ordenarUltimosPedidos = (vendas = [], limite = 5) =>
  [...vendas]
    .sort((pedidoA, pedidoB) => {
      const dataA = obterDataPedido(pedidoA);
      const dataB = obterDataPedido(pedidoB);
      const timestampA = dataA ? dataA.getTime() : Number.NEGATIVE_INFINITY;
      const timestampB = dataB ? dataB.getTime() : Number.NEGATIVE_INFINITY;

      if (timestampA !== timestampB) return timestampB - timestampA;

      const criadoA = obterDataDesempatePedido(pedidoA);
      const criadoB = obterDataDesempatePedido(pedidoB);
      const timestampCriadoA = criadoA ? criadoA.getTime() : Number.NEGATIVE_INFINITY;
      const timestampCriadoB = criadoB ? criadoB.getTime() : Number.NEGATIVE_INFINITY;

      if (timestampCriadoA !== timestampCriadoB) {
        return timestampCriadoB - timestampCriadoA;
      }

      const numeroA = extrairNumeroPedido(pedidoA.numeroPedido);
      const numeroB = extrairNumeroPedido(pedidoB.numeroPedido);

      if (numeroA !== numeroB) return numeroB - numeroA;

      return String(pedidoB.id || "").localeCompare(String(pedidoA.id || ""), "pt-BR", {
        numeric: true,
        sensitivity: "base",
      });
    })
    .slice(0, limite);

const produtoEstaAtivoParaDashboard = (produto = {}) => {
  const status = String(produto.status || "ativo").trim().toLowerCase();

  return produto.ativo !== false && !STATUS_PRODUTO_INATIVO.has(status);
};

const montarDescricaoProduto = (produto = {}) =>
  [
    produto.codigo ? `${produto.codigo} -` : "",
    produto.nome || produto.nomeProduto || produto.produtoNome || "",
    produto.tipo || "",
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim() ||
  textoProdutoSeguro(produto.produto || produto.nome || produto.produtoNome, "");

const obterAliasesProduto = (produto = {}) => [
  produto.produto,
  montarDescricaoProduto(produto),
  produto.nome,
  produto.nomeProduto,
  produto.produtoNome,
  produto.codigo,
  produto.codigo && produto.nome
    ? `${produto.codigo} - ${produto.nome}${produto.tipo ? ` ${produto.tipo}` : ""}`
    : "",
]
  .map((alias) => normalizarChaveProduto(textoProdutoSeguro(alias, "")))
  .filter(Boolean);

const obterAliasesItemVenda = (item = {}, venda = {}) => [
  item.produto,
  item.nomeProduto,
  item.produtoNome,
  item.codigo,
  item.codigoProduto,
  venda.produto,
  venda.nomeProduto,
  venda.produtoNome,
  venda.codigo,
  venda.codigoProduto,
]
  .map((alias) => normalizarChaveProduto(textoProdutoSeguro(alias, "")))
  .filter(Boolean);

const criarIndiceProdutosAtivos = (produtos = []) => {
  const porId = new Map();
  const porAlias = new Map();

  produtos
    .filter(produtoEstaAtivoParaDashboard)
    .forEach((produto) => {
      const produtoId = produto.id || produto.produtoId || "";
      if (!produtoId) return;

      porId.set(produtoId, produto);
      obterAliasesProduto(produto).forEach((alias) => {
        if (!porAlias.has(alias)) porAlias.set(alias, produtoId);
      });
    });

  return { porId, porAlias };
};

const resolverProdutoAtivoItem = (item = {}, venda = {}, indiceProdutos) => {
  const produtoId = item.produtoId || venda.produtoId || "";

  if (produtoId && indiceProdutos.porId.has(produtoId)) {
    return {
      id: produtoId,
      produto: indiceProdutos.porId.get(produtoId),
    };
  }

  const alias = obterAliasesItemVenda(item, venda).find((chave) =>
    indiceProdutos.porAlias.has(chave)
  );

  if (!alias) return null;

  const id = indiceProdutos.porAlias.get(alias);
  return {
    id,
    produto: indiceProdutos.porId.get(id),
  };
};

export const calcularRankingLucroProdutos = ({
  vendas = [],
  produtos = [],
} = {}) => {
  const indiceProdutos = criarIndiceProdutosAtivos(produtos);
  const produtosVendidos = new Map();

  vendas.forEach((venda) => {
    const itensVenda =
      Array.isArray(venda.itens) && venda.itens.length > 0
        ? venda.itens
        : venda.produto
        ? [
            {
              produto: venda.produto,
              produtoId: venda.produtoId,
              quantidade: venda.quantidade,
              total: venda.total,
              lucro: venda.lucro,
            },
          ]
        : [];

    itensVenda.forEach((item) => {
      const produtoAtivo = resolverProdutoAtivoItem(item, venda, indiceProdutos);
      if (!produtoAtivo) return;

      const produtoCadastro = produtoAtivo.produto || {};
      const chave = produtoAtivo.id;
      const nomeProduto =
        montarDescricaoProduto(produtoCadastro) ||
        textoProdutoSeguro(item.produto || venda.produto, "Produto sem nome");

      if (!produtosVendidos.has(chave)) {
        produtosVendidos.set(chave, {
          id: chave,
          produto: nomeProduto,
          quantidade: 0,
          faturamento: 0,
          lucro: 0,
        });
      }

      const acumulado = produtosVendidos.get(chave);
      acumulado.quantidade += Number(item.quantidade || 0);
      acumulado.faturamento += Number(item.total || 0);
      acumulado.lucro += Number(item.lucro || 0);
    });
  });

  return Array.from(produtosVendidos.values()).sort(
    (a, b) => b.lucro - a.lucro
  );
};
