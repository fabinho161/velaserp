const PENDENCIAS_FATURAMENTO = Object.freeze({
  EMITENTE_SNAPSHOT_AUSENTE: "emitente_snapshot_ausente",
  DESTINATARIO_SNAPSHOT_AUSENTE: "destinatario_snapshot_ausente",
  ITEM_FISCAL_SNAPSHOT_AUSENTE: "item_fiscal_snapshot_ausente",
});

const PENDENCIAS_PREPARACAO_FATURAMENTO = Object.freeze({
  ...PENDENCIAS_FATURAMENTO,
  EMITENTE_CNPJ_AUSENTE: "emitente_cnpj_ausente",
  EMITENTE_REGIME_TRIBUTARIO_AUSENTE: "emitente_regime_tributario_ausente",
  EMITENTE_UF_AUSENTE: "emitente_uf_ausente",
  EMITENTE_MUNICIPIO_AUSENTE: "emitente_municipio_ausente",
  EMITENTE_AMBIENTE_FISCAL_AUSENTE: "emitente_ambiente_fiscal_ausente",
  DESTINATARIO_NOME_AUSENTE: "destinatario_nome_ausente",
  ITENS_AUSENTES: "itens_ausentes",
  ITEM_DESCRICAO_AUSENTE: "item_descricao_ausente",
  ITEM_QUANTIDADE_INVALIDA: "item_quantidade_invalida",
  ITEM_VALOR_UNITARIO_INVALIDO: "item_valor_unitario_invalido",
  ITEM_TOTAL_INVALIDO: "item_total_invalido",
  ITEM_NCM_AUSENTE: "item_ncm_ausente",
  ITEM_UNIDADE_TRIBUTAVEL_AUSENTE: "item_unidade_tributavel_ausente",
});

const ORDEM_PENDENCIAS_PREPARACAO = Object.freeze([
  PENDENCIAS_PREPARACAO_FATURAMENTO.EMITENTE_SNAPSHOT_AUSENTE,
  PENDENCIAS_PREPARACAO_FATURAMENTO.EMITENTE_CNPJ_AUSENTE,
  PENDENCIAS_PREPARACAO_FATURAMENTO.EMITENTE_REGIME_TRIBUTARIO_AUSENTE,
  PENDENCIAS_PREPARACAO_FATURAMENTO.EMITENTE_UF_AUSENTE,
  PENDENCIAS_PREPARACAO_FATURAMENTO.EMITENTE_MUNICIPIO_AUSENTE,
  PENDENCIAS_PREPARACAO_FATURAMENTO.EMITENTE_AMBIENTE_FISCAL_AUSENTE,
  PENDENCIAS_PREPARACAO_FATURAMENTO.DESTINATARIO_SNAPSHOT_AUSENTE,
  PENDENCIAS_PREPARACAO_FATURAMENTO.DESTINATARIO_NOME_AUSENTE,
  PENDENCIAS_PREPARACAO_FATURAMENTO.ITENS_AUSENTES,
  PENDENCIAS_PREPARACAO_FATURAMENTO.ITEM_FISCAL_SNAPSHOT_AUSENTE,
  PENDENCIAS_PREPARACAO_FATURAMENTO.ITEM_DESCRICAO_AUSENTE,
  PENDENCIAS_PREPARACAO_FATURAMENTO.ITEM_QUANTIDADE_INVALIDA,
  PENDENCIAS_PREPARACAO_FATURAMENTO.ITEM_VALOR_UNITARIO_INVALIDO,
  PENDENCIAS_PREPARACAO_FATURAMENTO.ITEM_TOTAL_INVALIDO,
  PENDENCIAS_PREPARACAO_FATURAMENTO.ITEM_NCM_AUSENTE,
  PENDENCIAS_PREPARACAO_FATURAMENTO.ITEM_UNIDADE_TRIBUTAVEL_AUSENTE,
]);

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

const textoPreenchido = (valor) => textoSeguro(valor).trim().length > 0;

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

const adicionarPendencia = (pendencias, codigo) => {
  if (codigo) pendencias.add(codigo);
};

const validarEmitentePreparacao = (faturamento, pendencias) => {
  const emitente = faturamento?.contextoFiscal?.emitente;

  if (!ehObjeto(emitente)) {
    adicionarPendencia(
      pendencias,
      PENDENCIAS_PREPARACAO_FATURAMENTO.EMITENTE_SNAPSHOT_AUSENTE
    );
    return;
  }

  if (!textoPreenchido(emitente.cnpj)) {
    adicionarPendencia(pendencias, PENDENCIAS_PREPARACAO_FATURAMENTO.EMITENTE_CNPJ_AUSENTE);
  }

  if (!textoPreenchido(emitente.regimeTributario)) {
    adicionarPendencia(
      pendencias,
      PENDENCIAS_PREPARACAO_FATURAMENTO.EMITENTE_REGIME_TRIBUTARIO_AUSENTE
    );
  }

  if (!textoPreenchido(emitente.uf)) {
    adicionarPendencia(pendencias, PENDENCIAS_PREPARACAO_FATURAMENTO.EMITENTE_UF_AUSENTE);
  }

  if (!textoPreenchido(emitente.municipio)) {
    adicionarPendencia(
      pendencias,
      PENDENCIAS_PREPARACAO_FATURAMENTO.EMITENTE_MUNICIPIO_AUSENTE
    );
  }

  if (!textoPreenchido(emitente.ambienteFiscal)) {
    adicionarPendencia(
      pendencias,
      PENDENCIAS_PREPARACAO_FATURAMENTO.EMITENTE_AMBIENTE_FISCAL_AUSENTE
    );
  }
};

const validarDestinatarioPreparacao = (faturamento, pendencias) => {
  const destinatario = faturamento?.contextoFiscal?.destinatario;

  if (!ehObjeto(destinatario)) {
    adicionarPendencia(
      pendencias,
      PENDENCIAS_PREPARACAO_FATURAMENTO.DESTINATARIO_SNAPSHOT_AUSENTE
    );
    return;
  }

  if (!textoPreenchido(destinatario.nome)) {
    adicionarPendencia(
      pendencias,
      PENDENCIAS_PREPARACAO_FATURAMENTO.DESTINATARIO_NOME_AUSENTE
    );
  }
};

const validarItemPreparacao = (item, pendencias) => {
  if (!textoPreenchido(item?.descricao)) {
    adicionarPendencia(pendencias, PENDENCIAS_PREPARACAO_FATURAMENTO.ITEM_DESCRICAO_AUSENTE);
  }

  if (!Number.isFinite(Number(item?.quantidade)) || Number(item?.quantidade) <= 0) {
    adicionarPendencia(pendencias, PENDENCIAS_PREPARACAO_FATURAMENTO.ITEM_QUANTIDADE_INVALIDA);
  }

  if (!Number.isFinite(Number(item?.valorUnitario)) || Number(item?.valorUnitario) < 0) {
    adicionarPendencia(
      pendencias,
      PENDENCIAS_PREPARACAO_FATURAMENTO.ITEM_VALOR_UNITARIO_INVALIDO
    );
  }

  if (!Number.isFinite(Number(item?.total)) || Number(item?.total) < 0) {
    adicionarPendencia(pendencias, PENDENCIAS_PREPARACAO_FATURAMENTO.ITEM_TOTAL_INVALIDO);
  }

  if (!ehObjeto(item?.fiscalSnapshot)) {
    adicionarPendencia(
      pendencias,
      PENDENCIAS_PREPARACAO_FATURAMENTO.ITEM_FISCAL_SNAPSHOT_AUSENTE
    );
    return;
  }

  if (!textoPreenchido(item.fiscalSnapshot.ncm)) {
    adicionarPendencia(pendencias, PENDENCIAS_PREPARACAO_FATURAMENTO.ITEM_NCM_AUSENTE);
  }

  if (!textoPreenchido(item.fiscalSnapshot.unidadeTributavel)) {
    adicionarPendencia(
      pendencias,
      PENDENCIAS_PREPARACAO_FATURAMENTO.ITEM_UNIDADE_TRIBUTAVEL_AUSENTE
    );
  }
};

const ordenarPendenciasPreparacao = (pendencias) => {
  const pendenciasSet = new Set(pendencias);
  const ordenadas = ORDEM_PENDENCIAS_PREPARACAO.filter((codigo) =>
    pendenciasSet.has(codigo)
  );
  const extras = [...pendenciasSet]
    .filter((codigo) => !ORDEM_PENDENCIAS_PREPARACAO.includes(codigo))
    .sort();

  return [...ordenadas, ...extras];
};

const validarPreparacaoFaturamento = (faturamento = {}) => {
  const pendencias = new Set(Array.isArray(faturamento.pendencias)
    ? faturamento.pendencias
    : []);
  const itens = Array.isArray(faturamento.itens) ? faturamento.itens : [];

  validarEmitentePreparacao(faturamento, pendencias);
  validarDestinatarioPreparacao(faturamento, pendencias);

  if (itens.length === 0) {
    adicionarPendencia(pendencias, PENDENCIAS_PREPARACAO_FATURAMENTO.ITENS_AUSENTES);
  }

  itens.forEach((item) => validarItemPreparacao(item, pendencias));

  const pendenciasOrdenadas = ordenarPendenciasPreparacao(pendencias);

  return congelarProfundo({
    valido: pendenciasOrdenadas.length === 0,
    pendencias: pendenciasOrdenadas,
  });
};

module.exports = {
  PENDENCIAS_FATURAMENTO,
  PENDENCIAS_PREPARACAO_FATURAMENTO,
  criarFaturamentoVenda,
  validarPreparacaoFaturamento,
};
