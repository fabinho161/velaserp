const PENDENCIAS_FATURAMENTO = Object.freeze({
  EMITENTE_SNAPSHOT_AUSENTE: "emitente_snapshot_ausente",
  DESTINATARIO_SNAPSHOT_AUSENTE: "destinatario_snapshot_ausente",
  ITEM_FISCAL_SNAPSHOT_AUSENTE: "item_fiscal_snapshot_ausente",
});

const PENDENCIAS_SERVICO = Object.freeze({
  CLASSIFICACAO_AUSENTE: "classificacao_servico_ausente",
  LOCAL_PRESTACAO_AUSENTE: "local_prestacao_ausente",
  COMPETENCIA_FISCAL_PENDENTE: "competencia_fiscal_pendente",
  TOMADOR_FISCAL_INCOMPLETO: "tomador_fiscal_incompleto",
  PRESTADOR_FISCAL_INCOMPLETO: "prestador_fiscal_incompleto",
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
  FINALIDADE_OPERACAO_AUSENTE: "finalidade_operacao_ausente",
  FINALIDADE_OPERACAO_INVALIDA: "finalidade_operacao_invalida",
  PRESENCA_COMPRADOR_AUSENTE: "presenca_comprador_ausente",
  PRESENCA_COMPRADOR_INVALIDA: "presenca_comprador_invalida",
  CONSUMIDOR_FINAL_NAO_INFORMADO: "consumidor_final_nao_informado",
  CONSUMIDOR_FINAL_INVALIDO: "consumidor_final_invalido",
  INDICADOR_IE_DESTINATARIO_AUSENTE: "indicador_ie_destinatario_ausente",
  INDICADOR_IE_DESTINATARIO_INVALIDO: "indicador_ie_destinatario_invalido",
  DESTINO_OPERACAO_INDETERMINADO: "destino_operacao_indeterminado",
  DESTINO_OPERACAO_INVALIDO: "destino_operacao_invalido",
  NATUREZA_OPERACAO_AUSENTE: "natureza_operacao_ausente",
});

const PENDENCIAS_DETERMINACAO_FISCAL = Object.freeze({
  CLASSIFICACAO_ITEM_INSUFICIENTE: "classificacao_item_insuficiente",
  CFOP_NAO_DETERMINADO: "cfop_nao_determinado",
  DESTINO_OPERACAO_NAO_SUPORTADO: "destino_operacao_nao_suportado",
  FINALIDADE_OPERACAO_NAO_SUPORTADA: "finalidade_operacao_nao_suportada",
  ORIGEM_FATURAMENTO_NAO_SUPORTADA: "origem_faturamento_nao_suportada",
  REGIME_TRIBUTARIO_AUSENTE: "regime_tributario_ausente",
});

const PENDENCIAS_CLASSIFICACAO_TRIBUTARIA = Object.freeze({
  DETERMINACAO_FISCAL_AUSENTE: "determinacao_fiscal_ausente",
  DETERMINACAO_FISCAL_ITEM_INCOMPLETA: "determinacao_fiscal_item_incompleta",
  REGIME_TRIBUTARIO_AUSENTE: "regime_tributario_ausente",
  CLASSIFICACAO_IBS_CBS_NAO_DETERMINADA: "classificacao_ibs_cbs_nao_determinada",
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
  PENDENCIAS_PREPARACAO_FATURAMENTO.FINALIDADE_OPERACAO_AUSENTE,
  PENDENCIAS_PREPARACAO_FATURAMENTO.FINALIDADE_OPERACAO_INVALIDA,
  PENDENCIAS_PREPARACAO_FATURAMENTO.PRESENCA_COMPRADOR_AUSENTE,
  PENDENCIAS_PREPARACAO_FATURAMENTO.PRESENCA_COMPRADOR_INVALIDA,
  PENDENCIAS_PREPARACAO_FATURAMENTO.CONSUMIDOR_FINAL_NAO_INFORMADO,
  PENDENCIAS_PREPARACAO_FATURAMENTO.CONSUMIDOR_FINAL_INVALIDO,
  PENDENCIAS_PREPARACAO_FATURAMENTO.INDICADOR_IE_DESTINATARIO_AUSENTE,
  PENDENCIAS_PREPARACAO_FATURAMENTO.INDICADOR_IE_DESTINATARIO_INVALIDO,
  PENDENCIAS_PREPARACAO_FATURAMENTO.DESTINO_OPERACAO_INDETERMINADO,
  PENDENCIAS_PREPARACAO_FATURAMENTO.DESTINO_OPERACAO_INVALIDO,
  PENDENCIAS_PREPARACAO_FATURAMENTO.NATUREZA_OPERACAO_AUSENTE,
]);

const FINALIDADES_OPERACAO = Object.freeze({
  NORMAL: "normal",
  DEVOLUCAO: "devolucao",
  COMPLEMENTAR: "complementar",
  AJUSTE: "ajuste",
});
const FINALIDADES_OPERACAO_SUPORTADAS = Object.freeze([
  FINALIDADES_OPERACAO.NORMAL,
]);
const PRESENCAS_COMPRADOR = Object.freeze({
  PRESENCIAL: "presencial",
  INTERNET: "internet",
  TELEFONE: "telefone",
  ENTREGA_DOMICILIO: "entrega_domicilio",
  NAO_PRESENCIAL_OUTROS: "nao_presencial_outros",
});
const INDICADORES_IE_DESTINATARIO = Object.freeze({
  CONTRIBUINTE: "contribuinte",
  CONTRIBUINTE_ISENTO: "contribuinte_isento",
  NAO_CONTRIBUINTE: "nao_contribuinte",
});
const DESTINOS_OPERACAO = Object.freeze({
  INTERNA: "interna",
  INTERESTADUAL: "interestadual",
  EXTERIOR: "exterior",
});

const VERSAO_FATURAMENTO = 1;
const VERSAO_DETERMINACAO_FISCAL = 1;
const VERSAO_CLASSIFICACAO_TRIBUTARIA = 1;
const REGRA_DETERMINACAO_FISCAL = "fiscal_v1";
const REGRA_CLASSIFICACAO_TRIBUTARIA = "tributaria_v1";
const STATUS_INICIAL = "rascunho";
const TIPO_VENDA_PECAS = "pecas";
const LIMITE_NATUREZA_OPERACAO = 120;
const FINALIDADES_OPERACAO_SUPORTADAS_SET = new Set(FINALIDADES_OPERACAO_SUPORTADAS);
const PRESENCAS_COMPRADOR_SET = new Set(Object.values(PRESENCAS_COMPRADOR));
const INDICADORES_IE_DESTINATARIO_SET = new Set(
  Object.values(INDICADORES_IE_DESTINATARIO)
);
const DESTINOS_OPERACAO_SET = new Set(Object.values(DESTINOS_OPERACAO));
const ORIGENS_FATURAMENTO_DETERMINACAO_SUPORTADAS = new Set([
  "venda",
  "venda_pecas",
]);
const ORIGENS_PRODUTO_OPERACIONAIS = Object.freeze({
  FABRICADO: "fabricado",
  REVENDA: "revenda",
});
const UFS_BRASIL = new Set([
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
]);

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

const textoTratado = (valor) => textoSeguro(valor).replace(/\s+/g, " ").trim();

const numeroSeguro = (valor) => {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
};

const criarErroDominio = (codigo, mensagem) => {
  const erro = new Error(mensagem);
  erro.codigo = codigo;
  return erro;
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

const ehFaturamentoServico = (faturamento = {}) =>
  faturamento.origem?.tipo === "atendimento" ||
  (Array.isArray(faturamento.itens) && faturamento.itens.some((item) => item?.tipoItem === "servico"));

const criarFaturamentoAtendimento = ({ agendamento = {}, cliente = null, fiscalEmpresa = null } = {}) => {
  const valor = agendamento.valorServico;
  if (agendamento.status !== "concluido" || !textoPreenchido(agendamento.id) ||
      !textoPreenchido(agendamento.clienteId) || !textoPreenchido(agendamento.servicoId) ||
      !textoPreenchido(agendamento.servicoNome) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(textoSeguro(agendamento.data)) ||
      typeof valor !== "number" || !Number.isFinite(valor) || valor < 0) {
    throw criarErroDominio("atendimento_invalido", "Atendimento concluido sem dados historicos validos.");
  }

  const fiscalTomador = ehObjeto(cliente?.fiscal) ? cliente.fiscal : {};
  const enderecoFiscal = ehObjeto(fiscalTomador.enderecoFiscal) ? fiscalTomador.enderecoFiscal : {};
  const destinatario = {
    versao: 1,
    clienteId: textoSeguro(agendamento.clienteId),
    nome: textoSeguro(agendamento.clienteNome),
    telefone: textoSeguro(agendamento.clienteTelefone),
    tipoPessoa: textoSeguro(fiscalTomador.tipoPessoa),
    cpf: textoSeguro(fiscalTomador.cpf),
    cnpj: textoSeguro(fiscalTomador.cnpj),
    inscricaoEstadual: textoSeguro(fiscalTomador.inscricaoEstadual),
    indicadorIECadastral: textoSeguro(fiscalTomador.indicadorIECadastral),
    enderecoFiscal: {
      paisCodigo: textoSeguro(enderecoFiscal.paisCodigo),
      paisNome: textoSeguro(enderecoFiscal.paisNome),
      municipioCodigo: textoSeguro(enderecoFiscal.municipioCodigo),
      municipioNome: textoSeguro(cliente?.cidade),
      uf: textoSeguro(cliente?.uf),
    },
  };
  const fiscal = ehObjeto(fiscalEmpresa) ? fiscalEmpresa : {};
  const emitente = {
    versao: 1,
    regimeTributario: textoSeguro(fiscal.regimeTributario),
    cnpj: textoSeguro(fiscal.cnpj),
    inscricaoEstadual: textoSeguro(fiscal.inscricaoEstadual),
    inscricaoMunicipal: textoSeguro(fiscal.inscricaoMunicipal),
    cnae: textoSeguro(fiscal.cnae),
    uf: textoSeguro(fiscal.uf),
    municipio: textoSeguro(fiscal.municipio),
    ambienteFiscal: textoSeguro(fiscal.ambienteFiscal),
  };
  const fiscalServico = ehObjeto(agendamento.servicoFiscalSnapshot)
    ? agendamento.servicoFiscalSnapshot : null;
  const fiscalServicoSnapshot = fiscalServico ? {
    versao: 1,
    codigoTributacaoNacional: textoSeguro(fiscalServico.codigoTributacaoNacional),
    codigoTributacaoMunicipal: textoSeguro(fiscalServico.codigoTributacaoMunicipal),
    nbs: textoSeguro(fiscalServico.nbs),
    descricaoFiscal: textoSeguro(fiscalServico.descricaoFiscal),
  } : null;
  const localInformado = agendamento.localPrestacao;
  const localPrestacao = ehObjeto(localInformado) && localInformado.tipo === "brasil" &&
    /^\d{7}$/.test(textoSeguro(localInformado.codigoMunicipio)) &&
    textoPreenchido(localInformado.municipio) && /^[A-Z]{2}$/.test(textoSeguro(localInformado.uf))
    ? {
      tipo: "brasil", codigoMunicipio: textoSeguro(localInformado.codigoMunicipio),
      municipio: textoSeguro(localInformado.municipio), uf: textoSeguro(localInformado.uf),
      codigoPais: "BR",
    } : null;
  const pendencias = [
    PENDENCIAS_SERVICO.COMPETENCIA_FISCAL_PENDENTE,
  ];
  if (!fiscalServicoSnapshot?.codigoTributacaoNacional) {
    pendencias.push(PENDENCIAS_SERVICO.CLASSIFICACAO_AUSENTE);
  }
  if (!localPrestacao) pendencias.push(PENDENCIAS_SERVICO.LOCAL_PRESTACAO_AUSENTE);
  if (!destinatario.nome || (!destinatario.cpf && !destinatario.cnpj)) {
    pendencias.push(PENDENCIAS_SERVICO.TOMADOR_FISCAL_INCOMPLETO);
  }
  if (!emitente.cnpj || !emitente.inscricaoMunicipal || !emitente.municipio) {
    pendencias.push(PENDENCIAS_SERVICO.PRESTADOR_FISCAL_INCOMPLETO);
  }

  return congelarProfundo({
    versao: VERSAO_FATURAMENTO,
    origem: { tipo: "atendimento", documentoId: agendamento.id, numeroDocumento: "" },
    contextoFiscal: {
      versao: VERSAO_FATURAMENTO,
      emitente,
      destinatario,
      operacao: {
        tipoOperacao: "atendimento", segmento: "clientes",
        dataOperacao: agendamento.data,
        competenciaOperacional: agendamento.data,
        competenciaFiscal: null,
        localPrestacao,
      },
    },
    itens: [{
      tipoItem: "servico", origemItemId: agendamento.servicoId,
      descricao: agendamento.servicoNome, quantidade: 1, unidade: "",
      valorUnitario: valor, desconto: 0, total: valor,
      servicoSnapshot: {
        servicoId: agendamento.servicoId, nome: agendamento.servicoNome,
        valorServico: valor,
      },
      fiscalServicoSnapshot,
      fiscalSnapshot: null,
    }],
    totais: { valorBruto: valor, desconto: 0, valorLiquido: valor },
    status: STATUS_INICIAL,
    pendencias,
  });
};

const normalizarUf = (uf) => {
  const ufTratada = textoTratado(uf).toUpperCase();
  return UFS_BRASIL.has(ufTratada) ? ufTratada : "";
};

const derivarDestinoOperacao = ({ emitente = null, destinatario = null } = {}) => {
  const ufEmitente = normalizarUf(emitente?.uf);
  const ufDestinatario = normalizarUf(destinatario?.uf);

  if (!ufEmitente || !ufDestinatario) return null;

  return ufEmitente === ufDestinatario
    ? DESTINOS_OPERACAO.INTERNA
    : DESTINOS_OPERACAO.INTERESTADUAL;
};

const validarEnumOperacional = ({ valor, valores, codigo, mensagem }) => {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor !== "string" || !valores.has(valor)) {
    throw criarErroDominio(codigo, mensagem);
  }

  return valor;
};

const validarFinalidadeOperacao = (finalidadeOperacao) => {
  if (
    finalidadeOperacao !== null &&
    finalidadeOperacao !== undefined &&
    finalidadeOperacao !== "" &&
    !FINALIDADES_OPERACAO_SUPORTADAS_SET.has(finalidadeOperacao)
  ) {
    throw criarErroDominio(
      "finalidade_operacao_invalida",
      "Finalidade da operacao invalida."
    );
  }

  return validarEnumOperacional({
    valor: finalidadeOperacao,
    valores: FINALIDADES_OPERACAO_SUPORTADAS_SET,
    codigo: "finalidade_operacao_invalida",
    mensagem: "Finalidade da operacao invalida.",
  });
};

const validarConsumidorFinal = (consumidorFinal) => {
  if (consumidorFinal === null || consumidorFinal === undefined) return null;
  if (typeof consumidorFinal !== "boolean") {
    throw criarErroDominio(
      "consumidor_final_invalido",
      "Consumidor final deve ser booleano."
    );
  }

  return consumidorFinal;
};

const validarNaturezaOperacao = (naturezaOperacao) => {
  if (naturezaOperacao === null || naturezaOperacao === undefined) return "";
  if (typeof naturezaOperacao !== "string") {
    throw criarErroDominio(
      "natureza_operacao_invalida",
      "Natureza da operacao invalida."
    );
  }

  const naturezaTratada = textoTratado(naturezaOperacao);

  if (naturezaTratada.length > LIMITE_NATUREZA_OPERACAO) {
    throw criarErroDominio(
      "natureza_operacao_invalida",
      "Natureza da operacao muito longa."
    );
  }

  return naturezaTratada;
};

const normalizarPayloadContextoOperacional = (payload = {}) => {
  if (!ehObjeto(payload)) {
    throw criarErroDominio("payload_invalido", "Payload do contexto fiscal invalido.");
  }

  return {
    finalidadeOperacao: validarFinalidadeOperacao(payload.finalidadeOperacao),
    presencaComprador: validarEnumOperacional({
      valor: payload.presencaComprador,
      valores: PRESENCAS_COMPRADOR_SET,
      codigo: "presenca_comprador_invalida",
      mensagem: "Presenca do comprador invalida.",
    }),
    consumidorFinal: validarConsumidorFinal(payload.consumidorFinal),
    indicadorIEDestinatario: validarEnumOperacional({
      valor: payload.indicadorIEDestinatario,
      valores: INDICADORES_IE_DESTINATARIO_SET,
      codigo: "indicador_ie_destinatario_invalido",
      mensagem: "Indicador de IE do destinatario invalido.",
    }),
    naturezaOperacao: validarNaturezaOperacao(payload.naturezaOperacao),
  };
};

const criarContextoOperacionalFaturamento = ({
  faturamento = {},
  payload = {},
} = {}) => {
  const contextoFiscal = ehObjeto(faturamento.contextoFiscal)
    ? faturamento.contextoFiscal
    : {};
  const operacaoAtual = ehObjeto(contextoFiscal.operacao)
    ? contextoFiscal.operacao
    : {};
  const dadosOperacionais = normalizarPayloadContextoOperacional(payload);

  return congelarProfundo({
    tipoOperacao: textoSeguro(operacaoAtual.tipoOperacao),
    segmento: textoSeguro(operacaoAtual.segmento),
    dataOperacao: clonarProfundo(operacaoAtual.dataOperacao || ""),
    finalidadeOperacao: dadosOperacionais.finalidadeOperacao,
    presencaComprador: dadosOperacionais.presencaComprador,
    consumidorFinal: dadosOperacionais.consumidorFinal,
    indicadorIEDestinatario: dadosOperacionais.indicadorIEDestinatario,
    destinoOperacao: derivarDestinoOperacao({
      emitente: contextoFiscal.emitente,
      destinatario: contextoFiscal.destinatario,
    }),
    naturezaOperacao: dadosOperacionais.naturezaOperacao,
  });
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

const validarOperacaoPreparacao = (faturamento, pendencias) => {
  const operacao = faturamento?.contextoFiscal?.operacao;

  if (!ehObjeto(operacao)) {
    adicionarPendencia(
      pendencias,
      PENDENCIAS_PREPARACAO_FATURAMENTO.FINALIDADE_OPERACAO_AUSENTE
    );
    adicionarPendencia(
      pendencias,
      PENDENCIAS_PREPARACAO_FATURAMENTO.PRESENCA_COMPRADOR_AUSENTE
    );
    adicionarPendencia(
      pendencias,
      PENDENCIAS_PREPARACAO_FATURAMENTO.CONSUMIDOR_FINAL_NAO_INFORMADO
    );
    adicionarPendencia(
      pendencias,
      PENDENCIAS_PREPARACAO_FATURAMENTO.INDICADOR_IE_DESTINATARIO_AUSENTE
    );
    adicionarPendencia(
      pendencias,
      PENDENCIAS_PREPARACAO_FATURAMENTO.DESTINO_OPERACAO_INDETERMINADO
    );
    adicionarPendencia(
      pendencias,
      PENDENCIAS_PREPARACAO_FATURAMENTO.NATUREZA_OPERACAO_AUSENTE
    );
    return;
  }

  if (!textoPreenchido(operacao.finalidadeOperacao)) {
    adicionarPendencia(
      pendencias,
      PENDENCIAS_PREPARACAO_FATURAMENTO.FINALIDADE_OPERACAO_AUSENTE
    );
  } else if (!FINALIDADES_OPERACAO_SUPORTADAS_SET.has(operacao.finalidadeOperacao)) {
    adicionarPendencia(
      pendencias,
      PENDENCIAS_PREPARACAO_FATURAMENTO.FINALIDADE_OPERACAO_INVALIDA
    );
  }

  if (!textoPreenchido(operacao.presencaComprador)) {
    adicionarPendencia(
      pendencias,
      PENDENCIAS_PREPARACAO_FATURAMENTO.PRESENCA_COMPRADOR_AUSENTE
    );
  } else if (!PRESENCAS_COMPRADOR_SET.has(operacao.presencaComprador)) {
    adicionarPendencia(
      pendencias,
      PENDENCIAS_PREPARACAO_FATURAMENTO.PRESENCA_COMPRADOR_INVALIDA
    );
  }

  if (operacao.consumidorFinal === null || operacao.consumidorFinal === undefined) {
    adicionarPendencia(
      pendencias,
      PENDENCIAS_PREPARACAO_FATURAMENTO.CONSUMIDOR_FINAL_NAO_INFORMADO
    );
  } else if (typeof operacao.consumidorFinal !== "boolean") {
    adicionarPendencia(
      pendencias,
      PENDENCIAS_PREPARACAO_FATURAMENTO.CONSUMIDOR_FINAL_INVALIDO
    );
  }

  if (!textoPreenchido(operacao.indicadorIEDestinatario)) {
    adicionarPendencia(
      pendencias,
      PENDENCIAS_PREPARACAO_FATURAMENTO.INDICADOR_IE_DESTINATARIO_AUSENTE
    );
  } else if (!INDICADORES_IE_DESTINATARIO_SET.has(operacao.indicadorIEDestinatario)) {
    adicionarPendencia(
      pendencias,
      PENDENCIAS_PREPARACAO_FATURAMENTO.INDICADOR_IE_DESTINATARIO_INVALIDO
    );
  }

  if (!textoPreenchido(operacao.destinoOperacao)) {
    adicionarPendencia(
      pendencias,
      PENDENCIAS_PREPARACAO_FATURAMENTO.DESTINO_OPERACAO_INDETERMINADO
    );
  } else if (!DESTINOS_OPERACAO_SET.has(operacao.destinoOperacao)) {
    adicionarPendencia(
      pendencias,
      PENDENCIAS_PREPARACAO_FATURAMENTO.DESTINO_OPERACAO_INVALIDO
    );
  }

  if (!textoPreenchido(operacao.naturezaOperacao)) {
    adicionarPendencia(
      pendencias,
      PENDENCIAS_PREPARACAO_FATURAMENTO.NATUREZA_OPERACAO_AUSENTE
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
  if (ehFaturamentoServico(faturamento)) {
    const operacao = faturamento.contextoFiscal?.operacao || {};
    const item = faturamento.itens?.find((atual) => atual?.tipoItem === "servico");
    return congelarProfundo({
      valido: false,
      pendencias: [...new Set([
        ...(Array.isArray(faturamento.pendencias) ? faturamento.pendencias : []),
        ...(!item?.fiscalServicoSnapshot?.codigoTributacaoNacional
          ? [PENDENCIAS_SERVICO.CLASSIFICACAO_AUSENTE] : []),
        ...(!operacao.localPrestacao ? [PENDENCIAS_SERVICO.LOCAL_PRESTACAO_AUSENTE] : []),
        PENDENCIAS_SERVICO.COMPETENCIA_FISCAL_PENDENTE,
      ])],
    });
  }
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
  validarOperacaoPreparacao(faturamento, pendencias);

  const pendenciasOrdenadas = ordenarPendenciasPreparacao(pendencias);

  return congelarProfundo({
    valido: pendenciasOrdenadas.length === 0,
    pendencias: pendenciasOrdenadas,
  });
};

const obterContextoOperacaoFiscal = (faturamento = {}) => {
  const operacao = ehObjeto(faturamento.contextoFiscal?.operacao)
    ? faturamento.contextoFiscal.operacao
    : {};

  return {
    destinoOperacao: textoSeguro(operacao.destinoOperacao),
    finalidadeOperacao: textoSeguro(operacao.finalidadeOperacao),
    consumidorFinal:
      typeof operacao.consumidorFinal === "boolean"
        ? operacao.consumidorFinal
        : null,
    indicadorIEDestinatario: textoSeguro(operacao.indicadorIEDestinatario),
  };
};

const obterClassificacaoFiscalItem = (item = {}) => {
  const fiscalSnapshot = ehObjeto(item.fiscalSnapshot) ? item.fiscalSnapshot : {};
  const classificacao =
    fiscalSnapshot.origemProduto ||
    fiscalSnapshot.classificacaoProduto ||
    item.origemProduto ||
    item.classificacaoProduto ||
    item.classificacaoFiscal;

  return textoSeguro(classificacao).trim().toLowerCase();
};

const criarFonteCfop = (regra) => ({
  regra,
  regraVersao: REGRA_DETERMINACAO_FISCAL,
});

const determinarCfopItem = ({ item = {}, operacao = {}, origemFaturamento = "" } = {}) => {
  const pendencias = new Set();
  const destinoOperacao = textoSeguro(operacao.destinoOperacao);
  const finalidadeOperacao = textoSeguro(operacao.finalidadeOperacao);

  if (!ORIGENS_FATURAMENTO_DETERMINACAO_SUPORTADAS.has(origemFaturamento)) {
    adicionarPendencia(
      pendencias,
      PENDENCIAS_DETERMINACAO_FISCAL.ORIGEM_FATURAMENTO_NAO_SUPORTADA
    );
  }

  if (finalidadeOperacao !== FINALIDADES_OPERACAO.NORMAL) {
    adicionarPendencia(
      pendencias,
      PENDENCIAS_DETERMINACAO_FISCAL.FINALIDADE_OPERACAO_NAO_SUPORTADA
    );
  }

  if (
    destinoOperacao !== DESTINOS_OPERACAO.INTERNA &&
    destinoOperacao !== DESTINOS_OPERACAO.INTERESTADUAL
  ) {
    adicionarPendencia(
      pendencias,
      PENDENCIAS_DETERMINACAO_FISCAL.DESTINO_OPERACAO_NAO_SUPORTADO
    );
  }

  const classificacao = obterClassificacaoFiscalItem(item);
  const itemFabricado = classificacao === ORIGENS_PRODUTO_OPERACIONAIS.FABRICADO;
  const itemRevenda = classificacao === ORIGENS_PRODUTO_OPERACIONAIS.REVENDA;

  if (!itemFabricado && !itemRevenda) {
    adicionarPendencia(
      pendencias,
      PENDENCIAS_DETERMINACAO_FISCAL.CLASSIFICACAO_ITEM_INSUFICIENTE
    );
  }

  if (pendencias.size > 0) {
    adicionarPendencia(pendencias, PENDENCIAS_DETERMINACAO_FISCAL.CFOP_NAO_DETERMINADO);
    return {
      cfopEfetivo: null,
      fonteCfop: null,
      pendencias: [...pendencias].sort(),
    };
  }

  if (itemFabricado && destinoOperacao === DESTINOS_OPERACAO.INTERNA) {
    return {
      cfopEfetivo: "5101",
      fonteCfop: criarFonteCfop("venda_producao_interna"),
      pendencias: [],
    };
  }

  if (itemFabricado && destinoOperacao === DESTINOS_OPERACAO.INTERESTADUAL) {
    return {
      cfopEfetivo: "6101",
      fonteCfop: criarFonteCfop("venda_producao_interestadual"),
      pendencias: [],
    };
  }

  if (itemRevenda && destinoOperacao === DESTINOS_OPERACAO.INTERNA) {
    return {
      cfopEfetivo: "5102",
      fonteCfop: criarFonteCfop("venda_revenda_interna"),
      pendencias: [],
    };
  }

  if (itemRevenda && destinoOperacao === DESTINOS_OPERACAO.INTERESTADUAL) {
    return {
      cfopEfetivo: "6102",
      fonteCfop: criarFonteCfop("venda_revenda_interestadual"),
      pendencias: [],
    };
  }

  return {
    cfopEfetivo: null,
    fonteCfop: null,
    pendencias: [PENDENCIAS_DETERMINACAO_FISCAL.CFOP_NAO_DETERMINADO],
  };
};

const determinarFiscalFaturamento = (faturamento = {}) => {
  const operacao = obterContextoOperacaoFiscal(faturamento);
  const origemFaturamento = textoSeguro(faturamento.origem?.tipo);
  const itens = Array.isArray(faturamento.itens) ? faturamento.itens : [];
  const pendencias = new Set();

  if (!textoPreenchido(faturamento.contextoFiscal?.emitente?.regimeTributario)) {
    adicionarPendencia(
      pendencias,
      PENDENCIAS_DETERMINACAO_FISCAL.REGIME_TRIBUTARIO_AUSENTE
    );
  }

  const itensDeterminados = itens.map((item, indice) => {
    const resultado = determinarCfopItem({
      item,
      operacao,
      origemFaturamento,
    });

    resultado.pendencias.forEach((pendencia) => adicionarPendencia(pendencias, pendencia));

    return {
      origemItemId: textoSeguro(item?.origemItemId),
      indice,
      cfopEfetivo: resultado.cfopEfetivo,
      fonteCfop: resultado.fonteCfop,
      pendencias: resultado.pendencias,
    };
  });

  return congelarProfundo({
    versao: VERSAO_DETERMINACAO_FISCAL,
    regraVersao: REGRA_DETERMINACAO_FISCAL,
    operacao,
    itens: itensDeterminados,
    pendencias: [...pendencias].sort(),
  });
};

const ordenarPendenciasClassificacaoTributaria = (pendencias) => {
  const ordem = [
    PENDENCIAS_CLASSIFICACAO_TRIBUTARIA.DETERMINACAO_FISCAL_AUSENTE,
    PENDENCIAS_CLASSIFICACAO_TRIBUTARIA.DETERMINACAO_FISCAL_ITEM_INCOMPLETA,
    PENDENCIAS_CLASSIFICACAO_TRIBUTARIA.REGIME_TRIBUTARIO_AUSENTE,
    PENDENCIAS_CLASSIFICACAO_TRIBUTARIA.CLASSIFICACAO_IBS_CBS_NAO_DETERMINADA,
  ];
  const pendenciasSet = new Set(pendencias);
  const ordenadas = ordem.filter((codigo) => pendenciasSet.has(codigo));
  const extras = [...pendenciasSet]
    .filter((codigo) => !ordem.includes(codigo))
    .sort();

  return [...ordenadas, ...extras];
};

const criarIbsCbsNaoClassificado = () => ({
  cst: null,
  cClassTrib: null,
  fonte: null,
});

const localizarDeterminacaoItem = ({ determinacaoFiscal = {}, item = {}, indice }) => {
  const itensDeterminados = Array.isArray(determinacaoFiscal.itens)
    ? determinacaoFiscal.itens
    : [];
  const porIndice = itensDeterminados.find((itemDeterminado) =>
    Number(itemDeterminado?.indice) === indice
  );

  if (porIndice) return porIndice;

  const origemItemId = textoSeguro(item?.origemItemId);
  if (!origemItemId) return null;

  return itensDeterminados.find((itemDeterminado) =>
    textoSeguro(itemDeterminado?.origemItemId) === origemItemId
  ) || null;
};

const criarItemClassificacaoTributaria = ({
  item = {},
  indice,
  determinacaoFiscal = null,
  determinacaoAusente = false,
} = {}) => {
  const pendencias = new Set();
  const itemDeterminado = determinacaoAusente
    ? null
    : localizarDeterminacaoItem({ determinacaoFiscal, item, indice });
  const pendenciasDeterminacao = Array.isArray(itemDeterminado?.pendencias)
    ? itemDeterminado.pendencias
    : [];

  if (determinacaoAusente) {
    adicionarPendencia(
      pendencias,
      PENDENCIAS_CLASSIFICACAO_TRIBUTARIA.DETERMINACAO_FISCAL_AUSENTE
    );
  } else if (!itemDeterminado || !textoPreenchido(itemDeterminado.cfopEfetivo) ||
    pendenciasDeterminacao.length > 0) {
    adicionarPendencia(
      pendencias,
      PENDENCIAS_CLASSIFICACAO_TRIBUTARIA.DETERMINACAO_FISCAL_ITEM_INCOMPLETA
    );
  }

  adicionarPendencia(
    pendencias,
    PENDENCIAS_CLASSIFICACAO_TRIBUTARIA.CLASSIFICACAO_IBS_CBS_NAO_DETERMINADA
  );

  return {
    origemItemId: textoSeguro(item?.origemItemId),
    indice,
    ibsCbs: criarIbsCbsNaoClassificado(),
    pendencias: ordenarPendenciasClassificacaoTributaria(pendencias),
  };
};

const classificarTributacaoFaturamento = (faturamento = {}) => {
  const determinacaoFiscal = ehObjeto(faturamento.determinacaoFiscal)
    ? faturamento.determinacaoFiscal
    : null;
  const itens = Array.isArray(faturamento.itens) ? faturamento.itens : [];
  const pendencias = new Set();
  const determinacaoAusente = !determinacaoFiscal;

  if (determinacaoAusente) {
    adicionarPendencia(
      pendencias,
      PENDENCIAS_CLASSIFICACAO_TRIBUTARIA.DETERMINACAO_FISCAL_AUSENTE
    );
  }

  if (!textoPreenchido(faturamento.contextoFiscal?.emitente?.regimeTributario)) {
    adicionarPendencia(
      pendencias,
      PENDENCIAS_CLASSIFICACAO_TRIBUTARIA.REGIME_TRIBUTARIO_AUSENTE
    );
  }

  const itensClassificados = itens.map((item, indice) => {
    const itemClassificado = criarItemClassificacaoTributaria({
      item,
      indice,
      determinacaoFiscal,
      determinacaoAusente,
    });

    itemClassificado.pendencias.forEach((pendencia) =>
      adicionarPendencia(pendencias, pendencia)
    );

    return itemClassificado;
  });

  adicionarPendencia(
    pendencias,
    PENDENCIAS_CLASSIFICACAO_TRIBUTARIA.CLASSIFICACAO_IBS_CBS_NAO_DETERMINADA
  );

  return congelarProfundo({
    versao: VERSAO_CLASSIFICACAO_TRIBUTARIA,
    regraVersao: REGRA_CLASSIFICACAO_TRIBUTARIA,
    itens: itensClassificados,
    pendencias: ordenarPendenciasClassificacaoTributaria(pendencias),
  });
};

const faturamentoApi = {
  PENDENCIAS_SERVICO,
  criarFaturamentoAtendimento,
  ehFaturamentoServico,
  DESTINOS_OPERACAO,
  FINALIDADES_OPERACAO,
  FINALIDADES_OPERACAO_SUPORTADAS,
  INDICADORES_IE_DESTINATARIO,
  PENDENCIAS_CLASSIFICACAO_TRIBUTARIA,
  PENDENCIAS_DETERMINACAO_FISCAL,
  PENDENCIAS_FATURAMENTO,
  PENDENCIAS_PREPARACAO_FATURAMENTO,
  PRESENCAS_COMPRADOR,
  classificarTributacaoFaturamento,
  criarContextoOperacionalFaturamento,
  criarFaturamentoVenda,
  determinarCfopItem,
  determinarFiscalFaturamento,
  derivarDestinoOperacao,
  validarPreparacaoFaturamento,
};

if (typeof globalThis !== "undefined") {
  globalThis.__RENOVAR_ERP_FATURAMENTO__ = faturamentoApi;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = faturamentoApi;
}
