export const STATUS_FATURAMENTO_OPCOES = Object.freeze([
  { valor: "todos", label: "Todos os status" },
  { valor: "rascunho", label: "Rascunhos" },
  { valor: "preparado", label: "Preparados" },
  { valor: "cancelado", label: "Cancelados" },
]);

export const ORIGEM_FATURAMENTO_OPCOES = Object.freeze([
  { valor: "todos", label: "Todas as origens" },
  { valor: "venda", label: "Venda" },
  { valor: "venda_pecas", label: "Venda de Peças" },
]);

export const LABELS_PENDENCIAS_FATURAMENTO = Object.freeze({
  emitente_snapshot_ausente: "Snapshot fiscal do emitente ausente.",
  destinatario_snapshot_ausente: "Snapshot do destinatário ausente.",
  item_fiscal_snapshot_ausente: "Um ou mais itens não possuem snapshot fiscal.",
  emitente_cnpj_ausente: "CNPJ do emitente ausente.",
  emitente_regime_tributario_ausente: "Regime tributário do emitente ausente.",
  emitente_uf_ausente: "UF do emitente ausente.",
  emitente_municipio_ausente: "Município do emitente ausente.",
  emitente_ambiente_fiscal_ausente: "Ambiente fiscal do emitente ausente.",
  destinatario_nome_ausente: "Nome do destinatário ausente.",
  itens_ausentes: "Nenhum item foi encontrado no faturamento.",
  item_descricao_ausente: "Um ou mais itens não possuem descrição.",
  item_quantidade_invalida: "Um ou mais itens possuem quantidade inválida.",
  item_valor_unitario_invalido: "Um ou mais itens possuem valor unitário inválido.",
  item_total_invalido: "Um ou mais itens possuem total inválido.",
  item_ncm_ausente: "Um ou mais itens não possuem NCM no snapshot fiscal.",
  item_unidade_tributavel_ausente:
    "Um ou mais itens não possuem unidade tributável no snapshot fiscal.",
  finalidade_operacao_ausente: "Finalidade da operação ausente.",
  finalidade_operacao_invalida: "Finalidade da operação inválida.",
  presenca_comprador_ausente: "Presença do comprador ausente.",
  presenca_comprador_invalida: "Presença do comprador inválida.",
  consumidor_final_nao_informado: "Informe se o destinatário é consumidor final.",
  consumidor_final_invalido: "Consumidor final possui valor inválido.",
  indicador_ie_destinatario_ausente: "Indicador de IE do destinatário ausente.",
  indicador_ie_destinatario_invalido: "Indicador de IE do destinatário inválido.",
  destino_operacao_indeterminado: "Destino da operação não determinado pelas UFs.",
  destino_operacao_invalido: "Destino da operação inválido.",
  natureza_operacao_ausente: "Natureza da operação ausente.",
});

export const LABELS_PENDENCIAS_DETERMINACAO_FISCAL = Object.freeze({
  classificacao_item_insuficiente: "Classificação fiscal do item insuficiente.",
  cfop_nao_determinado: "CFOP não determinado.",
  destino_operacao_nao_suportado: "Destino da operação ainda não suportado.",
  finalidade_operacao_nao_suportada: "Finalidade da operação ainda não suportada.",
  origem_faturamento_nao_suportada: "Origem do faturamento ainda não suportada.",
  regime_tributario_ausente: "Regime tributário do emitente ausente.",
});

export const LABELS_PENDENCIAS_CLASSIFICACAO_TRIBUTARIA = Object.freeze({
  determinacao_fiscal_ausente: "A determinação fiscal ainda não foi realizada.",
  determinacao_fiscal_item_incompleta: "A determinação fiscal do item está incompleta.",
  regime_tributario_ausente:
    "O regime tributário do emitente não está disponível no snapshot.",
  classificacao_ibs_cbs_nao_determinada:
    "A classificação IBS/CBS ainda não pôde ser determinada com segurança.",
});

const texto = (valor) => String(valor || "").trim();

const textoBusca = (valor) =>
  texto(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const millisData = (valor) => {
  if (!valor) return 0;
  if (typeof valor.toMillis === "function") return valor.toMillis();
  if (typeof valor === "object") {
    const segundosTimestamp = valor.seconds ?? valor._seconds;
    if (Number.isFinite(segundosTimestamp)) return segundosTimestamp * 1000;
  }
  if (valor instanceof Date) return valor.getTime();
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto(valor))) {
    const [ano, mes, dia] = texto(valor).split("-").map(Number);
    return new Date(ano, mes - 1, dia).getTime();
  }

  const data = Date.parse(valor);
  return Number.isFinite(data) ? data : 0;
};

export const formatarStatusFaturamento = (status) => {
  const statusTratado = texto(status).toLowerCase();
  const labels = {
    rascunho: "Rascunho",
    preparado: "Preparado",
    cancelado: "Cancelado",
  };

  return labels[statusTratado] || "Rascunho";
};

export const formatarOrigemFaturamento = (origem) => {
  const tipo = texto(typeof origem === "object" ? origem?.tipo : origem);
  const labels = {
    venda: "Venda",
    venda_pecas: "Venda de Peças",
  };

  return labels[tipo] || "Venda";
};

export const formatarDestinoOperacao = (destino) => {
  const labels = {
    interna: "Interna",
    interestadual: "Interestadual",
    exterior: "Exterior",
  };

  return labels[texto(destino)] || "Não determinado";
};

export const formatarDestinoFiscal = (destino) => {
  const labels = {
    interna: "Interna",
    interestadual: "Interestadual",
  };

  return labels[texto(destino)] || "Não determinado";
};

export const formatarFinalidadeFiscal = (finalidade) => {
  const labels = {
    normal: "Normal",
  };

  return labels[texto(finalidade)] || "Não determinada";
};

export const formatarConsumidorFinalFiscal = (valor) => {
  if (valor === true) return "Sim";
  if (valor === false) return "Não";
  return "Não informado";
};

export const formatarIndicadorIEFiscal = (indicador) => {
  const labels = {
    contribuinte: "Contribuinte",
    contribuinte_isento: "Contribuinte isento",
    nao_contribuinte: "Não contribuinte",
  };

  return labels[texto(indicador)] || "Não informado";
};

export const formatarOrigemProdutoFiscal = (origemProduto) => {
  const labels = {
    fabricado: "Fabricado",
    revenda: "Revenda",
  };

  return labels[texto(origemProduto)] || "Não informada";
};

export const formatarFonteCfop = (fonteCfop) => {
  const labels = {
    venda_producao_interna: "Produção interna",
    venda_producao_interestadual: "Produção interestadual",
    venda_revenda_interna: "Revenda interna",
    venda_revenda_interestadual: "Revenda interestadual",
  };

  if (typeof fonteCfop === "string") {
    const fonte = texto(fonteCfop);
    return labels[fonte] || fonte || "-";
  }
  if (!fonteCfop || typeof fonteCfop !== "object") return "-";

  const regra = texto(fonteCfop.regra);
  const regraVersao = texto(fonteCfop.regraVersao);
  const regraFormatada = labels[regra] || regra;

  if (regraFormatada && regraVersao) return `${regraFormatada} (${regraVersao})`;
  return regraFormatada || regraVersao || "-";
};

export const descreverPendenciaFaturamento = (codigo) =>
  LABELS_PENDENCIAS_FATURAMENTO[codigo] || `Pendência não mapeada: ${codigo}`;

export const descreverPendenciasFaturamento = (pendencias = []) =>
  (Array.isArray(pendencias) ? pendencias : []).map((pendencia) =>
    descreverPendenciaFaturamento(pendencia)
  );

export const descreverPendenciaDeterminacaoFiscal = (codigo) =>
  LABELS_PENDENCIAS_DETERMINACAO_FISCAL[codigo] ||
  `Pendência fiscal não mapeada: ${codigo}`;

export const descreverPendenciasDeterminacaoFiscal = (pendencias = []) =>
  (Array.isArray(pendencias) ? pendencias : []).map((pendencia) =>
    descreverPendenciaDeterminacaoFiscal(pendencia)
  );

export const descreverPendenciaClassificacaoTributaria = (codigo) =>
  LABELS_PENDENCIAS_CLASSIFICACAO_TRIBUTARIA[codigo] ||
  `Pendência tributária não mapeada: ${codigo}`;

export const descreverPendenciasClassificacaoTributaria = (pendencias = []) =>
  (Array.isArray(pendencias) ? pendencias : []).map((pendencia) =>
    descreverPendenciaClassificacaoTributaria(pendencia)
  );

export const obterSituacaoDeterminacaoItem = (item = {}) => {
  const pendencias = Array.isArray(item.pendencias) ? item.pendencias : [];
  return item.cfopEfetivo && pendencias.length === 0 ? "determinado" : "pendente";
};

export const formatarSituacaoDeterminacaoItem = (situacao) =>
  situacao === "determinado" ? "Determinado" : "Pendente";

export const obterSituacaoClassificacaoTributariaItem = (item = {}) => {
  const pendencias = Array.isArray(item.pendencias) ? item.pendencias : [];
  return item.ibsCbs?.cst && item.ibsCbs?.cClassTrib && pendencias.length === 0
    ? "classificado"
    : "pendente";
};

export const formatarSituacaoClassificacaoTributariaItem = (situacao) =>
  situacao === "classificado" ? "Classificado" : "Pendente";

export const calcularKpisFaturamento = (faturamentos = []) => {
  const lista = Array.isArray(faturamentos) ? faturamentos : [];

  return {
    total: lista.length,
    rascunhos: lista.filter((item) => texto(item.status).toLowerCase() === "rascunho").length,
    preparados: lista.filter((item) => texto(item.status).toLowerCase() === "preparado").length,
    cancelados: lista.filter((item) => texto(item.status).toLowerCase() === "cancelado").length,
    comPendencias: lista.filter((item) => Array.isArray(item.pendencias) && item.pendencias.length > 0).length,
  };
};

export const filtrarFaturamentos = (faturamentos = [], filtros = {}) => {
  const busca = textoBusca(filtros.busca);
  const status = texto(filtros.status || "todos");
  const origem = texto(filtros.origem || "todos");
  const dataInicial = texto(filtros.dataInicial);
  const dataFinal = texto(filtros.dataFinal);
  const inicio = dataInicial ? millisData(`${dataInicial}T00:00:00`) : null;
  const fim = dataFinal ? millisData(`${dataFinal}T23:59:59`) : null;

  return (Array.isArray(faturamentos) ? faturamentos : []).filter((faturamento) => {
    const statusAtual = texto(faturamento.status || "rascunho").toLowerCase();
    const tipoOrigem = texto(faturamento.origem?.tipo || "venda");
    const dataOperacao = millisData(
      faturamento.contextoFiscal?.operacao?.dataOperacao ||
      faturamento.criadoEm ||
      faturamento.atualizadoEm
    );
    const destinatario = faturamento.contextoFiscal?.destinatario?.nome || "";
    const numero = faturamento.origem?.numeroDocumento || "";

    if (status !== "todos" && statusAtual !== status) return false;
    if (origem !== "todos" && tipoOrigem !== origem) return false;
    if (inicio !== null && dataOperacao < inicio) return false;
    if (fim !== null && dataOperacao > fim) return false;

    if (!busca) return true;

    return [
      destinatario,
      numero,
      faturamento.id,
      formatarOrigemFaturamento(tipoOrigem),
    ].some((valor) => textoBusca(valor).includes(busca));
  });
};
