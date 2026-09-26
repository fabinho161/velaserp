const express = require("express");
const authFirebase = require("../middlewares/authFirebase");
const { FieldValue, getDb } = require("../firebaseAdmin");
const { FORMAS_PAGAMENTO } = require("../shared/contasReceberServicos.cjs");
const {
  erro, executar, existe, idValido, resolverAcessoEmpresa,
} = require("../shared/financeiroAutorizacao.cjs");

const router = express.Router();
const possuiCampo = (objeto, campo) => Object.prototype.hasOwnProperty.call(objeto, campo);
const texto = (valor) => typeof valor === "string" ? valor.trim() : "";

const dataCivilValida = (valor) => {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto(valor));
  if (!partes) return false;
  const ano = Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);
  const bissexto = ano % 400 === 0 || (ano % 4 === 0 && ano % 100 !== 0);
  const dias = [31, bissexto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return mes >= 1 && mes <= 12 && dia >= 1 && dia <= dias[mes - 1];
};

const ehLegada = (despesa) => despesa.origemSchema === "legado" ||
  !["dataCompetencia", "dataVencimento", "statusFinanceiro", "situacao", "pagamento"]
    .some((campo) => possuiCampo(despesa, campo));

const cancelada = (despesa) => despesa.excluida === true ||
  ["cancelado", "cancelada"].includes(texto(despesa.situacao).toLowerCase()) ||
  ["cancelado", "cancelada"].includes(texto(despesa.status).toLowerCase());

const pagamentoEstruturadoValido = (pagamento) => Boolean(
  pagamento && typeof pagamento === "object" && !Array.isArray(pagamento) &&
  dataCivilValida(pagamento.dataPagamento) &&
  FORMAS_PAGAMENTO.includes(pagamento.formaPagamento) &&
  typeof pagamento.valorPago === "number" && Number.isFinite(pagamento.valorPago) &&
  pagamento.valorPago > 0 && pagamento.pagoEm && idValido(pagamento.pagoPor)
);

const criarHandlerPagar = ({ getDb: obterDb = getDb, agora = () => FieldValue.serverTimestamp() } = {}) =>
  executar(async (req) => {
    const { empresaId, despesaId, dataPagamento, formaPagamento } = req.body || {};
    if (!idValido(empresaId) || !idValido(despesaId) || !dataCivilValida(dataPagamento) ||
        !FORMAS_PAGAMENTO.includes(formaPagamento)) {
      throw erro(400, "Dados do pagamento invalidos.");
    }

    const db = obterDb();
    return db.runTransaction(async (tx) => {
      const empresaRef = await resolverAcessoEmpresa(db, tx, {
        uid: req.user.uid,
        empresaId: empresaId.trim(),
        permissao: "financeiro",
      });
      const despesaRef = empresaRef.collection("despesas").doc(despesaId.trim());
      const snap = await tx.get(despesaRef);
      if (!existe(snap)) throw erro(404, "Despesa nao encontrada.");

      const despesa = snap.data();
      const legado = ehLegada(despesa);
      const statusLegado = texto(despesa.status).toLowerCase();
      if (cancelada(despesa)) throw erro(409, "Despesa cancelada nao pode ser paga.");

      if (despesa.statusFinanceiro === "pago") {
        if (!pagamentoEstruturadoValido(despesa.pagamento)) {
          throw erro(409, "Despesa paga possui dados financeiros inconsistentes.");
        }
        return { despesaId: snap.id, status: "pago", idempotente: true, historico: false };
      }
      if (legado && (!possuiCampo(despesa, "status") || statusLegado === "pago")) {
        return { despesaId: snap.id, status: "pago", idempotente: true, historico: true };
      }

      const pendente = legado
        ? statusLegado === "pendente"
        : despesa.statusFinanceiro === "pendente" && despesa.situacao === "ativo" &&
          (despesa.pagamento === null || despesa.pagamento === undefined);
      if (!pendente) throw erro(409, "Estado da despesa nao permite pagamento.");
      if (typeof despesa.valor !== "number" || !Number.isFinite(despesa.valor) || despesa.valor <= 0) {
        throw erro(422, "Valor da despesa invalido.");
      }

      const timestamp = agora();
      const pagamento = {
        dataPagamento,
        formaPagamento,
        valorPago: despesa.valor,
        pagoEm: timestamp,
        pagoPor: req.user.uid,
      };
      const atualizacao = {
        statusFinanceiro: "pago",
        pagamento,
        status: "Pago",
        atualizadoEm: timestamp,
        atualizadoPor: req.user.uid,
      };
      if (legado) atualizacao.origemSchema = "legado";
      tx.update(despesaRef, atualizacao);
      return {
        despesaId: snap.id,
        status: "pago",
        idempotente: false,
        pagamento: { dataPagamento, formaPagamento, valorPago: despesa.valor },
      };
    });
  }, "pagamento de despesas");

router.post("/pagar", authFirebase, criarHandlerPagar());

module.exports = { router, criarHandlerPagar };
