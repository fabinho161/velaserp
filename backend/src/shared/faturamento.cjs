const PENDENCIAS_FATURAMENTO = Object.freeze({
  EMITENTE_SNAPSHOT_AUSENTE: "emitente_snapshot_ausente",
  DESTINATARIO_SNAPSHOT_AUSENTE: "destinatario_snapshot_ausente",
  ITEM_FISCAL_SNAPSHOT_AUSENTE: "item_fiscal_snapshot_ausente",
});

const VERSAO_FATURAMENTO = 1;
const STATUS_INICIAL = "rascunho";
const TIPO_VENDA_PECAS = "pecas";

const ehObjeto = (valor) =>
  valor !== null && typeof valor === "object" && !Array.isArray(valor);

const clonarProfundo = (valor) => {
  if (Array.isArray(valor)) {
    return valor.map((item) => clonarProfundo(item));
  }

  if (valor instanceof Date) {
    return new Date(valor.getTime());
  }

  if (ehObjeto(valor)) {
    return Object.fromEntries(
      Object.entries(valor).map(([chave, item]) => [chave, clonarProfundo(item)])
    );
  }

  return valor;
};

const congelarProfundo = (valor) => {
  if (!ehObjeto(valor) && !Array.isArray(valor)) return valor;

  for (const item of Object.values(valor)) {
    congelarProfundo(item);
  }

  return Object.freeze(valor);
};

const clonarSnapshot = (snapshot) =>
  ehObjeto(snapshot) ? clonarProfundo(snapshot) : null;

const textoSeguro = (valor) => {
  if (valor === null || valor === undefined) return "";
  return String(valor);
};

const numeroSeguro = (valor) => {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
};

const obterTipoOrigem = (venda = {}) =>
  venda.tipoVenda === TIPO_VENDA_PECAS ? "venda_pecas" : "venda";

const obterTipoItem = (tipoOrigem) =>
  tipoOrigem === "venda_pecas" ? "peca" : "mercadoria";

const obterItensVenda = (venda = {}) => {
  if (Array.isArray(venda.itens)) return venda.itens;
  if (venda.produto || venda.produtoNome || venda.quantidade) return [venda];
  return [];
};

const obterDescricaoItem = (item = {}) =>
  item.produtoNome || item.nomeProduto || item.produto || item.nome || "";

const obterUnidadeItem = (item = {}) =>
  item.unidade || item.fiscalSnapshot?.unidadeTributavel || "";

const criarItemFaturamento = (item = {}, tipoItem) => ({
  tipoItem,
  origemItemId: textoSeguro(item.produtoId || item.id || ""),
  descricao: textoSeguro(obterDescricaoItem(item)),
  quantidade: numeroSeguro(item.quantidade),
  unidade: textoSeguro(obterUnidadeItem(item)),
  valorUnitario: numeroSeguro(item.valorUnitario),
  desconto: numeroSeguro(item.desconto),
  total: numeroSeguro(item.total),
  fiscalSnapshot: clonarSnapshot(item.fiscalSnapshot),
});

const criarPendencias = ({ venda = {}, itens = [] }) => {
  const pendencias = [];

  if (!ehObjeto(venda.fiscalEmpresaSnapshot)) {
    pendencias.push(PENDENCIAS_FATURAMENTO.EMITENTE_SNAPSHOT_AUSENTE);
  }

  if (!ehObjeto(venda.destinatarioSnapshot)) {
    pendencias.push(PENDENCIAS_FATURAMENTO.DESTINATARIO_SNAPSHOT_AUSENTE);
  }

  if (itens.some((item) => !ehObjeto(item.fiscalSnapshot))) {
    pendencias.push(PENDENCIAS_FATURAMENTO.ITEM_FISCAL_SNAPSHOT_AUSENTE);
  }

  return pendencias;
};

const criarFaturamentoVenda = ({ venda = {}, segmento = "" } = {}) => {
  const tipoOrigem = obterTipoOrigem(venda);
  const itensOriginais = obterItensVenda(venda);
  const tipoItem = obterTipoItem(tipoOrigem);
  const itens = itensOriginais.map((item) => criarItemFaturamento(item, tipoItem));
  const faturamento = {
    versao: VERSAO_FATURAMENTO,
    origem: {
      tipo: tipoOrigem,
      documentoId: textoSeguro(venda.id),
      numeroDocumento: textoSeguro(venda.numeroPedido),
    },
    contextoFiscal: {
      versao: VERSAO_FATURAMENTO,
      emitente: clonarSnapshot(venda.fiscalEmpresaSnapshot),
      destinatario: clonarSnapshot(venda.destinatarioSnapshot),
      operacao: {
        tipoOperacao: tipoOrigem,
        segmento: textoSeguro(segmento),
        dataOperacao: clonarProfundo(venda.data || ""),
      },
    },
    itens,
    totais: {
      valorBruto: numeroSeguro(venda.valorBruto),
      desconto: numeroSeguro(venda.desconto),
      valorLiquido: numeroSeguro(venda.total),
    },
    status: STATUS_INICIAL,
    pendencias: criarPendencias({ venda, itens: itensOriginais }),
  };

  return congelarProfundo(faturamento);
};

module.exports = {
  PENDENCIAS_FATURAMENTO,
  criarFaturamentoVenda,
};
