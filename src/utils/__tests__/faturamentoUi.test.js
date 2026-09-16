import assert from "node:assert/strict";
import test from "node:test";

import {
  calcularKpisFaturamento,
  descreverPendenciaClassificacaoTributaria,
  descreverPendenciaDeterminacaoFiscal,
  descreverPendenciasClassificacaoTributaria,
  descreverPendenciaFaturamento,
  descreverPendenciasDeterminacaoFiscal,
  descreverPendenciasFaturamento,
  filtrarFaturamentos,
  formatarConsumidorFinalFiscal,
  formatarDestinoOperacao,
  formatarDestinoFiscal,
  formatarFinalidadeFiscal,
  formatarFonteCfop,
  formatarIndicadorIEFiscal,
  formatarOrigemFaturamento,
  formatarOrigemProdutoFiscal,
  formatarSituacaoClassificacaoTributariaItem,
  formatarSituacaoDeterminacaoItem,
  formatarStatusFaturamento,
  obterSituacaoClassificacaoTributariaItem,
  obterSituacaoDeterminacaoItem,
} from "../faturamentoUi.js";

const faturamento = (dados = {}) => ({
  id: "fat-1",
  status: "rascunho",
  origem: {
    tipo: "venda",
    numeroDocumento: "PED-0001",
  },
  contextoFiscal: {
    destinatario: {
      nome: "Cliente Teste",
    },
    operacao: {
      dataOperacao: "2026-09-12",
    },
  },
  pendencias: [],
  ...dados,
});

test("formata labels de status origem destino e pendencias", () => {
  assert.equal(formatarStatusFaturamento("preparado"), "Preparado");
  assert.equal(formatarOrigemFaturamento("venda_pecas"), "Venda de Peças");
  assert.equal(formatarDestinoOperacao("interestadual"), "Interestadual");
  assert.equal(
    descreverPendenciaFaturamento("item_ncm_ausente"),
    "Um ou mais itens não possuem NCM no snapshot fiscal."
  );
});

test("calcula kpis por status e pendencias", () => {
  assert.deepEqual(
    calcularKpisFaturamento([
      faturamento(),
      faturamento({ status: "preparado" }),
      faturamento({ status: "cancelado" }),
      faturamento({ pendencias: ["item_ncm_ausente"] }),
    ]),
    {
      total: 4,
      rascunhos: 2,
      preparados: 1,
      cancelados: 1,
      comPendencias: 1,
    }
  );
});

test("converte lista de codigos de pendencia em mensagens amigaveis", () => {
  assert.deepEqual(
    descreverPendenciasFaturamento([
      "emitente_snapshot_ausente",
      "destinatario_snapshot_ausente",
      "item_fiscal_snapshot_ausente",
    ]),
    [
      "Snapshot fiscal do emitente ausente.",
      "Snapshot do destinatário ausente.",
      "Um ou mais itens não possuem snapshot fiscal.",
    ]
  );
});

test("filtra por status origem destinatario e periodo", () => {
  const lista = [
    faturamento(),
    faturamento({
      id: "fat-2",
      status: "preparado",
      origem: { tipo: "venda_pecas", numeroDocumento: "PEC-0001" },
      contextoFiscal: {
        destinatario: { nome: "Outro Cliente" },
        operacao: { dataOperacao: "2026-10-01" },
      },
    }),
  ];

  assert.deepEqual(
    filtrarFaturamentos(lista, {
      status: "preparado",
      origem: "venda_pecas",
      busca: "outro",
      dataInicial: "2026-10-01",
      dataFinal: "2026-10-31",
    }).map((item) => item.id),
    ["fat-2"]
  );
});

test("filtra periodo com timestamp serializado do backend", () => {
  const lista = [
    faturamento({
      id: "fat-timestamp",
      contextoFiscal: {
        destinatario: { nome: "Cliente Timestamp" },
        operacao: { dataOperacao: { _seconds: 1799755200, _nanoseconds: 0 } },
      },
    }),
  ];

  assert.deepEqual(
    filtrarFaturamentos(lista, {
      dataInicial: "2027-01-12",
      dataFinal: "2027-01-12",
    }).map((item) => item.id),
    ["fat-timestamp"]
  );
});

test("formata labels da determinacao fiscal", () => {
  assert.equal(formatarDestinoFiscal("interna"), "Interna");
  assert.equal(formatarDestinoFiscal("interestadual"), "Interestadual");
  assert.equal(formatarDestinoFiscal("exterior"), "Não determinado");
  assert.equal(formatarFinalidadeFiscal("normal"), "Normal");
  assert.equal(formatarConsumidorFinalFiscal(true), "Sim");
  assert.equal(formatarConsumidorFinalFiscal(false), "Não");
  assert.equal(formatarConsumidorFinalFiscal(null), "Não informado");
  assert.equal(formatarIndicadorIEFiscal("contribuinte"), "Contribuinte");
  assert.equal(formatarIndicadorIEFiscal("contribuinte_isento"), "Contribuinte isento");
  assert.equal(formatarIndicadorIEFiscal("nao_contribuinte"), "Não contribuinte");
  assert.equal(formatarOrigemProdutoFiscal("fabricado"), "Fabricado");
  assert.equal(formatarOrigemProdutoFiscal("revenda"), "Revenda");
});

test("descreve pendencias fiscais com fallback seguro", () => {
  assert.equal(
    descreverPendenciaDeterminacaoFiscal("cfop_nao_determinado"),
    "CFOP não determinado."
  );
  assert.equal(
    descreverPendenciaDeterminacaoFiscal("codigo_novo"),
    "Pendência fiscal não mapeada: codigo_novo"
  );
  assert.deepEqual(
    descreverPendenciasDeterminacaoFiscal([
      "classificacao_item_insuficiente",
      "regime_tributario_ausente",
    ]),
    [
      "Classificação fiscal do item insuficiente.",
      "Regime tributário do emitente ausente.",
    ]
  );
});

test("determina situacao visual do item fiscal", () => {
  assert.equal(
    obterSituacaoDeterminacaoItem({ cfopEfetivo: "5101", pendencias: [] }),
    "determinado"
  );
  assert.equal(
    obterSituacaoDeterminacaoItem({ cfopEfetivo: null, pendencias: [] }),
    "pendente"
  );
  assert.equal(
    obterSituacaoDeterminacaoItem({
      cfopEfetivo: "5101",
      pendencias: ["cfop_nao_determinado"],
    }),
    "pendente"
  );
  assert.equal(formatarSituacaoDeterminacaoItem("determinado"), "Determinado");
  assert.equal(formatarSituacaoDeterminacaoItem("pendente"), "Pendente");
});

test("formata fonte de cfop sem duplicar regra fiscal", () => {
  assert.equal(formatarFonteCfop("venda_revenda_interna"), "Revenda interna");
  assert.equal(formatarFonteCfop("manual"), "manual");
  assert.equal(
    formatarFonteCfop({ regra: "venda_producao_interna", regraVersao: "fiscal_v1" }),
    "Produção interna (fiscal_v1)"
  );
  assert.equal(formatarFonteCfop(null), "-");
});

test("descreve pendencias tributarias com fallback seguro", () => {
  assert.equal(
    descreverPendenciaClassificacaoTributaria("determinacao_fiscal_ausente"),
    "A determinação fiscal ainda não foi realizada."
  );
  assert.equal(
    descreverPendenciaClassificacaoTributaria("codigo_novo"),
    "Pendência tributária não mapeada: codigo_novo"
  );
  assert.deepEqual(
    descreverPendenciasClassificacaoTributaria([
      "determinacao_fiscal_item_incompleta",
      "classificacao_ibs_cbs_nao_determinada",
    ]),
    [
      "A determinação fiscal do item está incompleta.",
      "A classificação IBS/CBS ainda não pôde ser determinada com segurança.",
    ]
  );
});

test("determina situacao visual do item tributario", () => {
  assert.equal(
    obterSituacaoClassificacaoTributariaItem({
      ibsCbs: { cst: "000", cClassTrib: "000001", fonte: { tipo: "tabela" } },
      pendencias: [],
    }),
    "classificado"
  );
  assert.equal(
    obterSituacaoClassificacaoTributariaItem({
      ibsCbs: { cst: null, cClassTrib: null, fonte: null },
      pendencias: [],
    }),
    "pendente"
  );
  assert.equal(
    obterSituacaoClassificacaoTributariaItem({
      ibsCbs: { cst: "000", cClassTrib: "000001", fonte: { tipo: "tabela" } },
      pendencias: ["classificacao_ibs_cbs_nao_determinada"],
    }),
    "pendente"
  );
  assert.equal(formatarSituacaoClassificacaoTributariaItem("classificado"), "Classificado");
  assert.equal(formatarSituacaoClassificacaoTributariaItem("pendente"), "Pendente");
});
