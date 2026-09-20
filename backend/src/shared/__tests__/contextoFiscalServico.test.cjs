"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { criarFaturamentoAtendimento, validarPreparacaoFaturamento } = require("../faturamento.cjs");
const { revisarContextoFiscalServico } = require("../contextoFiscalServico.cjs");
const { CATALOGO_SERVICOS_NFSE_V1_01_20260122: catalogoServicos } = require("../catalogoServicos.cjs");

const agendamento = {
  id: "agenda-1", status: "concluido", clienteId: "cliente-1", clienteNome: "Historico",
  servicoId: "servico-1", servicoNome: "Servico historico", valorServico: 100,
  data: "2026-09-01", dataRecebimento: "2026-09-08", dataEmissao: "2026-09-09",
  servicoFiscalSnapshot: { versao: 1, codigoTributacaoNacional: "001234" },
  localPrestacao: { tipo: "brasil", codigoMunicipio: "5209150", municipio: "Itumbiara", uf: "GO" },
};
const base = () => criarFaturamentoAtendimento({ agendamento });
const revisar = (faturamento, revisao, agora = "2026-09-18T10:00:00Z") =>
  revisarContextoFiscalServico({ faturamento, revisao, atorUid: "fiscal-1", agora, catalogoServicos });
const aplicar = (faturamento, atualizacoes) => ({
  ...faturamento,
  contextoFiscal: {
    ...faturamento.contextoFiscal,
    operacao: { ...faturamento.contextoFiscal.operacao,
      competenciaFiscal: atualizacoes["contextoFiscal.operacao.competenciaFiscal"] },
  },
  contextoFiscalServico: atualizacoes.contextoFiscalServico,
  pendencias: atualizacoes.pendencias,
});

test("competencia so nasce apos confirmacao manual de data valida", () => {
  const faturamento = base();
  assert.equal(faturamento.contextoFiscal.operacao.competenciaFiscal, null);
  const resultado = revisar(faturamento, { competenciaFiscal: "2026-09-02" });
  const atualizado = aplicar(faturamento, resultado.atualizacoes);
  assert.equal(atualizado.contextoFiscal.operacao.competenciaFiscal, "2026-09-02");
  assert.equal(atualizado.contextoFiscalServico.competenciaConfirmacao.confirmadoPor, "fiscal-1");
  assert.equal(atualizado.pendencias.includes("competencia_fiscal_ausente"), false);
  assert.equal(atualizado.pendencias.includes("local_prestacao_ausente"), true);
  assert.equal(atualizado.contextoFiscal.operacao.competenciaOperacional, "2026-09-01");
  assert.equal(validarPreparacaoFaturamento(atualizado).valido, false);
  assert.throws(() => revisar(faturamento, { competenciaFiscal: "2026-02-30" }), /competencia_fiscal_invalida/);
});

test("local fiscal difere do historico e classificacao manual nao altera snapshot", () => {
  const faturamento = base();
  const resultado = revisar(faturamento, {
    localPrestacaoFiscal: { tipo: "brasil", codigoMunicipio: "3550308", municipio: "Sao Paulo", uf: "SP", codigoPais: "BR" },
    classificacaoFiscalServico: { codigoTributacaoNacional: "010101", codigoTributacaoMunicipal: "", nbs: "", descricaoFiscal: "Consultoria" },
  });
  const atualizado = aplicar(faturamento, resultado.atualizacoes);
  assert.equal(atualizado.contextoFiscal.operacao.localPrestacao.codigoMunicipio, "5209150");
  assert.equal(atualizado.contextoFiscalServico.localPrestacaoFiscal.codigoMunicipio, "3550308");
  assert.equal(atualizado.itens[0].fiscalServicoSnapshot.codigoTributacaoNacional, "001234");
  assert.equal(atualizado.contextoFiscalServico.classificacaoFiscalServico.codigoTributacaoNacional, "010101");
  assert.deepEqual(atualizado.contextoFiscalServico.classificacaoFiscalServico.catalogo,
    { tipo: "nfse_servicos_nacional", versao: "v1.01-20260122" });
  assert.equal(atualizado.contextoFiscalServico.classificacaoFiscalServico.nbs, "");
  assert.equal(atualizado.pendencias.includes("local_prestacao_ausente"), false);
  assert.equal(atualizado.pendencias.includes("classificacao_servico_ausente"), false);
  assert.equal(atualizado.pendencias.includes("codigo_tributacao_nacional_ausente"), false);
  assert.equal(atualizado.pendencias.includes("competencia_fiscal_ausente"), true);
  assert.equal(atualizado.pendencias.includes("determinacao_tributaria_servico_pendente"), true);
  assert.equal(atualizado.contextoFiscalServico.historico[0].alteracoes.length, 2);
  assert.equal(revisar(atualizado, {
    localPrestacaoFiscal: { tipo: "brasil", codigoMunicipio: "3550308", municipio: "Sao Paulo", uf: "SP", codigoPais: "BR" },
    classificacaoFiscalServico: { codigoTributacaoNacional: "010101", codigoTributacaoMunicipal: "", nbs: "", descricaoFiscal: "Consultoria" },
  }).alterou, false);
});

test("dados invalidos e campos protegidos sao rejeitados sem inferencias", () => {
  const faturamento = base();
  assert.throws(() => revisar(faturamento, {}), /revisao_invalida/);
  assert.throws(() => revisar(faturamento, { cfopEfetivo: "5101" }), /campo_invalido/);
  assert.throws(() => revisar(faturamento, { classificacaoFiscalServico: { codigoTributacaoNacional: "" } }), /codigo_tributacao_nacional_ausente/);
  assert.throws(() => revisar(faturamento, { classificacaoFiscalServico: {
    codigoTributacaoNacional: "999999",
  } }), /codigo_tributacao_nacional_inexistente/);
  assert.throws(() => revisar(faturamento, { localPrestacaoFiscal: { tipo: "brasil", codigoMunicipio: "123", municipio: "X", uf: "GO", codigoPais: "BR" } }), /local_prestacao_invalido/);
  assert.equal("cfopEfetivo" in faturamento.itens[0], false);
  assert.equal("iss" in faturamento, false);
  assert.equal("ibsCbs" in faturamento, false);
});

test("classificacao historica sem catalogo permanece legivel em revisao independente", () => {
  const faturamento = structuredClone(base());
  faturamento.contextoFiscalServico = {
    versao: 1,
    classificacaoFiscalServico: {
      versao: 1, codigoTributacaoNacional: "009999", fonte: "manual",
    },
  };
  const resultado = revisar(faturamento, { competenciaFiscal: "2026-09-02" });
  assert.equal(resultado.atualizacoes.contextoFiscalServico.classificacaoFiscalServico.codigoTributacaoNacional, "009999");
  assert.equal(Object.hasOwn(resultado.atualizacoes.contextoFiscalServico.classificacaoFiscalServico, "catalogo"), false);
});

test("historico de revisoes permanece limitado", () => {
  let faturamento = base();
  for (let indice = 1; indice <= 25; indice += 1) {
    faturamento = aplicar(faturamento, revisar(faturamento, {
      competenciaFiscal: `2026-09-${String(indice).padStart(2, "0")}`,
    }, `2026-09-${String(indice).padStart(2, "0")}T10:00:00Z`).atualizacoes);
  }
  assert.equal(faturamento.contextoFiscalServico.historico.length, 20);
});
