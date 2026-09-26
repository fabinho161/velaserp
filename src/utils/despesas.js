const CAMPOS_CONTRATO_EXPLICITO = [
  "dataCompetencia",
  "dataVencimento",
  "statusFinanceiro",
  "situacao",
  "pagamento",
];

const possuiCampo = (objeto, campo) => Object.prototype.hasOwnProperty.call(objeto, campo);

const texto = (valor) => typeof valor === "string" ? valor.trim() : "";

const valorFinanceiro = (valor) =>
  typeof valor === "number" && Number.isFinite(valor) && valor >= 0 ? valor : null;

const anoBissexto = (ano) => ano % 400 === 0 || (ano % 4 === 0 && ano % 100 !== 0);

export const normalizarDataCivilDespesa = (valor) => {
  if (typeof valor !== "string") return null;
  const data = valor.trim();
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  if (!partes) return null;

  const ano = Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);
  const diasPorMes = [31, anoBissexto(ano) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (mes < 1 || mes > 12 || dia < 1 || dia > diasPorMes[mes - 1]) return null;

  return data;
};

export const normalizarStatusFinanceiroDespesa = (status) => {
  const statusNormalizado = texto(status).toLowerCase();
  if (statusNormalizado === "pago") return "pago";
  if (statusNormalizado === "pendente") return "pendente";
  return null;
};

export const obterSituacaoDespesa = (despesa = {}) => {
  if (!despesa || typeof despesa !== "object" || Array.isArray(despesa)) return "ativo";
  const statusLegado = texto(despesa.status).toLowerCase();
  const situacaoExplicita = texto(despesa.situacao).toLowerCase();

  return despesa.excluida === true || statusLegado === "cancelado" ||
    statusLegado === "cancelada" || situacaoExplicita === "cancelado" ||
    situacaoExplicita === "cancelada"
    ? "cancelado"
    : "ativo";
};

export const ehDespesaLegada = (despesa = {}) => {
  if (!despesa || typeof despesa !== "object" || Array.isArray(despesa)) return true;
  if (despesa.origemSchema === "legado") return true;
  return !CAMPOS_CONTRATO_EXPLICITO.some((campo) => possuiCampo(despesa, campo));
};

export const FORMAS_PAGAMENTO_DESPESA = [
  "pix", "dinheiro", "cartao_credito", "cartao_debito", "boleto", "transferencia", "outro",
];

const clonarValor = (valor) => {
  if (valor === null || valor === undefined || typeof valor !== "object") return valor ?? null;
  try {
    return structuredClone(valor);
  } catch {
    if (Array.isArray(valor)) return valor.map(clonarValor);
    return Object.fromEntries(Object.entries(valor).map(([chave, item]) => [chave, clonarValor(item)]));
  }
};

export const normalizarPagamentoDespesa = (pagamento) => {
  if (!pagamento || typeof pagamento !== "object" || Array.isArray(pagamento)) return null;

  const dataPagamento = normalizarDataCivilDespesa(pagamento.dataPagamento);
  const formaPagamento = texto(pagamento.formaPagamento);
  const valorPago = valorFinanceiro(pagamento.valorPago);
  const pagoPor = texto(pagamento.pagoPor);
  const pagoEmValido = pagamento.pagoEm !== null && pagamento.pagoEm !== undefined;

  if (!dataPagamento || !formaPagamento || valorPago === null || !pagoPor || !pagoEmValido) {
    return null;
  }

  return {
    dataPagamento,
    formaPagamento,
    valorPago,
    pagoEm: clonarValor(pagamento.pagoEm),
    pagoPor,
  };
};

export const normalizarDespesa = (entrada) => {
  const entradaValida = Boolean(entrada) && typeof entrada === "object" && !Array.isArray(entrada);
  const despesa = entradaValida ? entrada : {};
  const legado = ehDespesaLegada(despesa);
  const statusExplicito = possuiCampo(despesa, "statusFinanceiro")
    ? despesa.statusFinanceiro
    : despesa.status;
  const statusFinanceiro = normalizarStatusFinanceiroDespesa(statusExplicito) ||
    (entradaValida && legado && !possuiCampo(despesa, "status") ? "pago" : null);
  const dataCompetencia = possuiCampo(despesa, "dataCompetencia")
    ? normalizarDataCivilDespesa(despesa.dataCompetencia)
    : legado
      ? normalizarDataCivilDespesa(despesa.data)
      : null;

  return {
    id: texto(despesa.id),
    descricao: texto(despesa.descricao),
    categoria: texto(despesa.categoria),
    valor: valorFinanceiro(despesa.valor),
    dataCompetencia,
    dataVencimento: possuiCampo(despesa, "dataVencimento")
      ? normalizarDataCivilDespesa(despesa.dataVencimento)
      : null,
    statusFinanceiro,
    situacao: obterSituacaoDespesa(despesa),
    pagamento: normalizarPagamentoDespesa(despesa.pagamento),
    legado,
    criadoEm: clonarValor(despesa.criadoEm),
    criadoPor: texto(despesa.criadoPor),
    atualizadoEm: clonarValor(despesa.atualizadoEm),
    atualizadoPor: texto(despesa.atualizadoPor),
  };
};

export const podeRegistrarPagamentoDespesa = (despesa) => {
  const normalizada = normalizarDespesa(despesa);
  return normalizada.situacao === "ativo" && normalizada.statusFinanceiro === "pendente" &&
    normalizada.pagamento === null && typeof normalizada.valor === "number" && normalizada.valor > 0;
};

export const podeEditarDespesa = (despesa) => {
  const normalizada = normalizarDespesa(despesa);
  return normalizada.situacao === "ativo" && normalizada.statusFinanceiro === "pendente" &&
    normalizada.pagamento === null;
};

export const podeCancelarDespesa = (despesa) => {
  const normalizada = normalizarDespesa(despesa);
  return normalizada.situacao === "ativo" && normalizada.statusFinanceiro === "pendente" &&
    normalizada.pagamento === null;
};

const normalizarCamposEditaveis = (dados = {}, { exigirVencimento = true } = {}) => {
  const descricao = texto(dados.descricao);
  const categoria = texto(dados.categoria);
  const valorInformado = typeof dados.valor === "string" ? dados.valor.trim() : dados.valor;
  const valor = valorInformado === "" ? null : Number(valorInformado);
  const dataCompetencia = normalizarDataCivilDespesa(dados.dataCompetencia);
  const dataVencimento = normalizarDataCivilDespesa(dados.dataVencimento);

  if (!descricao || !categoria || !Number.isFinite(valor) || valor <= 0 ||
      !dataCompetencia || (exigirVencimento && !dataVencimento)) {
    return null;
  }

  return {
    descricao,
    categoria,
    valor,
    dataCompetencia,
    dataVencimento: exigirVencimento ? dataVencimento : null,
  };
};

const normalizarAuditoria = ({ uid, timestamp } = {}) => ({
  uid: texto(uid),
  timestamp: timestamp ?? null,
});

export const montarPayloadNovaDespesa = (dados, auditoria) => {
  const campos = normalizarCamposEditaveis(dados);
  const { uid, timestamp } = normalizarAuditoria(auditoria);
  if (!campos || !uid || timestamp === null) return null;

  return {
    descricao: campos.descricao,
    categoria: campos.categoria,
    valor: campos.valor,
    dataCompetencia: campos.dataCompetencia,
    dataVencimento: campos.dataVencimento,
    statusFinanceiro: "pendente",
    situacao: "ativo",
    pagamento: null,
    data: campos.dataCompetencia,
    status: "Pendente",
    criadoEm: timestamp,
    criadoPor: uid,
    atualizadoEm: timestamp,
    atualizadoPor: uid,
  };
};

export const montarAtualizacaoDespesa = (despesa, dados, auditoria) => {
  const legado = ehDespesaLegada(despesa);
  const campos = normalizarCamposEditaveis(dados, { exigirVencimento: !legado });
  const { uid, timestamp } = normalizarAuditoria(auditoria);
  if (!campos || !uid || timestamp === null) return null;

  const atualizacao = {
    descricao: campos.descricao,
    categoria: campos.categoria,
    valor: campos.valor,
    data: campos.dataCompetencia,
    atualizadoEm: timestamp,
    atualizadoPor: uid,
  };

  if (legado) return atualizacao;

  return {
    ...atualizacao,
    dataCompetencia: campos.dataCompetencia,
    dataVencimento: campos.dataVencimento,
  };
};

export const montarCancelamentoDespesa = (despesa, auditoria) => {
  const { uid, timestamp } = normalizarAuditoria(auditoria);
  if (!uid || timestamp === null) return null;

  return {
    excluida: true,
    excluidaEm: timestamp,
    excluidaPor: uid,
    status: "cancelado",
    atualizadoEm: timestamp,
    atualizadoPor: uid,
    ...(!ehDespesaLegada(despesa) ? { situacao: "cancelado" } : {}),
  };
};
