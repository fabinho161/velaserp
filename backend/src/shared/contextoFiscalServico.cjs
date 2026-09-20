"use strict";

const { PENDENCIAS_SERVICO } = require("./faturamento.cjs");
const { buscarServicoPorCodigo, validarCatalogoServicos } = require("./catalogoServicos.cjs");

const CAMPOS_REVISAO = new Set(["competenciaFiscal", "localPrestacaoFiscal", "classificacaoFiscalServico"]);
const PENDENCIAS_REVISAO = new Set([
  PENDENCIAS_SERVICO.CLASSIFICACAO_AUSENTE,
  PENDENCIAS_SERVICO.LOCAL_PRESTACAO_AUSENTE,
  PENDENCIAS_SERVICO.COMPETENCIA_FISCAL_PENDENTE,
  "competencia_fiscal_ausente",
  "codigo_tributacao_nacional_ausente",
  PENDENCIAS_SERVICO.DETERMINACAO_TRIBUTARIA_PENDENTE,
]);

const falha = (codigo) => {
  const error = new Error(codigo);
  error.codigo = codigo;
  throw error;
};
const objeto = (valor) => valor && typeof valor === "object" && !Array.isArray(valor);
const texto = (valor, limite = 500) => {
  if (typeof valor !== "string" || valor.length > limite) falha("campo_invalido");
  return valor.trim();
};
const dataValida = (valor) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const data = new Date(`${valor}T00:00:00.000Z`);
  return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === valor;
};
const validarChaves = (valor, permitidas) => {
  if (!objeto(valor) || Object.keys(valor).some((chave) => !permitidas.includes(chave))) falha("campo_invalido");
};

const revisarContextoFiscalServico = ({ faturamento, revisao, atorUid, agora, catalogoServicos }) => {
  validarChaves(revisao, [...CAMPOS_REVISAO]);
  if (Object.keys(revisao).length === 0 || !atorUid || !agora) falha("revisao_invalida");
  const anterior = objeto(faturamento.contextoFiscalServico) ? faturamento.contextoFiscalServico : {};
  const novo = { ...anterior, versao: 1 };
  const alteracoes = [];
  const auditar = (campo, antes, depois) => {
    if (JSON.stringify(antes ?? null) === JSON.stringify(depois)) return;
    alteracoes.push({ campo, anterior: antes ?? null, novo: depois });
  };

  let competenciaFiscal = faturamento.contextoFiscal?.operacao?.competenciaFiscal || null;
  if (Object.hasOwn(revisao, "competenciaFiscal")) {
    const data = texto(revisao.competenciaFiscal, 10);
    if (!dataValida(data)) falha("competencia_fiscal_invalida");
    auditar("competenciaFiscal", competenciaFiscal, data);
    competenciaFiscal = data;
    if (alteracoes.some((item) => item.campo === "competenciaFiscal")) {
      novo.competenciaConfirmacao = { fonte: "manual", confirmadoPor: atorUid, confirmadoEm: agora };
    }
  }

  if (Object.hasOwn(revisao, "localPrestacaoFiscal")) {
    const local = revisao.localPrestacaoFiscal;
    validarChaves(local, ["tipo", "codigoMunicipio", "municipio", "uf", "codigoPais"]);
    const validado = {
      tipo: texto(local.tipo, 16),
      codigoMunicipio: texto(local.codigoMunicipio, 7),
      municipio: texto(local.municipio, 120),
      uf: texto(local.uf, 2).toUpperCase(),
      codigoPais: texto(local.codigoPais, 2),
    };
    if (validado.tipo !== "brasil" || !/^\d{7}$/.test(validado.codigoMunicipio) ||
        !validado.municipio || !/^[A-Z]{2}$/.test(validado.uf) || validado.codigoPais !== "BR") {
      falha("local_prestacao_invalido");
    }
    const antes = novo.localPrestacaoFiscal || null;
    const conteudoAnterior = antes && Object.fromEntries(Object.keys(validado).map((campo) => [campo, antes[campo]]));
    auditar("localPrestacaoFiscal", conteudoAnterior, validado);
    if (alteracoes.some((item) => item.campo === "localPrestacaoFiscal")) {
      novo.localPrestacaoFiscal = { ...validado, fonte: "manual", confirmadoPor: atorUid, confirmadoEm: agora };
    }
  }

  if (Object.hasOwn(revisao, "classificacaoFiscalServico")) {
    const classificacao = revisao.classificacaoFiscalServico;
    validarChaves(classificacao, ["codigoTributacaoNacional", "codigoTributacaoMunicipal", "nbs", "descricaoFiscal"]);
    const validada = {
      versao: 1,
      codigoTributacaoNacional: texto(classificacao.codigoTributacaoNacional, 32),
      codigoTributacaoMunicipal: texto(classificacao.codigoTributacaoMunicipal || "", 32),
      nbs: texto(classificacao.nbs || "", 32),
      descricaoFiscal: texto(classificacao.descricaoFiscal || "", 500),
    };
    if (!validada.codigoTributacaoNacional) falha("codigo_tributacao_nacional_ausente");
    if (!validarCatalogoServicos(catalogoServicos)) falha("catalogo_servicos_indisponivel");
    const itemCatalogo = buscarServicoPorCodigo(validada.codigoTributacaoNacional, catalogoServicos);
    if (!itemCatalogo) falha("codigo_tributacao_nacional_inexistente");
    validada.catalogo = {
      tipo: catalogoServicos.tipo,
      versao: catalogoServicos.versaoCatalogo,
    };
    const antes = novo.classificacaoFiscalServico || null;
    const conteudoAnterior = antes && Object.fromEntries(Object.keys(validada).map((campo) => [campo, antes[campo]]));
    auditar("classificacaoFiscalServico", conteudoAnterior, validada);
    if (alteracoes.some((item) => item.campo === "classificacaoFiscalServico")) {
      novo.classificacaoFiscalServico = { ...validada, fonte: "manual", confirmadoPor: atorUid, confirmadoEm: agora };
    }
  }

  if (alteracoes.length === 0) return { alterou: false, atualizacoes: {} };
  novo.historico = [...(Array.isArray(anterior.historico) ? anterior.historico : []).slice(-19),
    { usuarioId: atorUid, data: agora, fonte: "manual", alteracoes }];
  const pendencias = (Array.isArray(faturamento.pendencias) ? faturamento.pendencias : [])
    .filter((codigo) => !PENDENCIAS_REVISAO.has(codigo));
  if (!competenciaFiscal) pendencias.push("competencia_fiscal_ausente");
  if (!novo.localPrestacaoFiscal) pendencias.push(PENDENCIAS_SERVICO.LOCAL_PRESTACAO_AUSENTE);
  if (!novo.classificacaoFiscalServico) pendencias.push(PENDENCIAS_SERVICO.CLASSIFICACAO_AUSENTE);
  if (!novo.classificacaoFiscalServico?.codigoTributacaoNacional) pendencias.push("codigo_tributacao_nacional_ausente");
  pendencias.push(PENDENCIAS_SERVICO.DETERMINACAO_TRIBUTARIA_PENDENTE);

  return {
    alterou: true,
    atualizacoes: {
      contextoFiscalServico: novo,
      "contextoFiscal.operacao.competenciaFiscal": competenciaFiscal,
      pendencias: [...new Set(pendencias)],
    },
  };
};

module.exports = { revisarContextoFiscalServico };
