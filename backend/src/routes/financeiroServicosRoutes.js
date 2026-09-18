const express = require("express");
const authFirebase = require("../middlewares/authFirebase");
const { FieldValue, getDb } = require("../firebaseAdmin");
const { normalizarRoleEmpresa } = require("../utils/perfisEmpresa");
const {
  FORMAS_PAGAMENTO, idContaAtendimento, montarContaAtendimento,
} = require("../shared/contasReceberServicos.cjs");

const router = express.Router();
const ROLES_AGENDA = new Set(["administrador_empresa", "comercial"]);
const ROLES_FINANCEIRO = new Set(["administrador_empresa", "financeiro"]);

const erro = (status, mensagem) => Object.assign(new Error(mensagem), { status });
const idValido = (valor) => typeof valor === "string" && valor.trim() && !valor.includes("/");
const existe = (snap) => Boolean(snap?.exists);

const validarEscopo = (req) => {
  const { ownerUid, empresaId } = req.body || {};
  if (!idValido(ownerUid) || !idValido(empresaId)) throw erro(400, "Empresa invalida.");
  return { ownerUid: ownerUid.trim(), empresaId: empresaId.trim() };
};

const verificarAcesso = async (db, tx, { uid, ownerUid, empresaId, permissao }) => {
  const empresaRef = db.collection("users").doc(ownerUid).collection("empresas").doc(empresaId);
  const atorRef = db.collection("users").doc(uid);
  const [empresaSnap, atorSnap] = await Promise.all([tx.get(empresaRef), tx.get(atorRef)]);
  if (!existe(empresaSnap)) throw erro(404, "Empresa nao encontrada.");
  if (empresaSnap.data().segmento !== "clientes" ||
      (empresaSnap.data().ownerUid && empresaSnap.data().ownerUid !== ownerUid)) {
    throw erro(403, "Operacao indisponivel para esta empresa.");
  }
  if (uid === ownerUid || atorSnap.data()?.role === "admin_master") return empresaRef;

  const authRef = db.collection("usuariosPorAuth").doc(uid).collection("empresas").doc(empresaId);
  const userRef = atorRef.collection("empresas").doc(empresaId);
  const [authSnap, userSnap] = await Promise.all([tx.get(authRef), tx.get(userRef)]);
  const vinculo = existe(authSnap) ? authSnap.data() : existe(userSnap) ? userSnap.data() : null;
  if (!vinculo || vinculo.ownerUid !== ownerUid || vinculo.status !== "ativo" ||
      !idValido(vinculo.usuarioEmpresaId)) throw erro(403, "Vinculo ativo nao encontrado.");

  const membroRef = empresaRef.collection("usuariosEmpresa").doc(vinculo.usuarioEmpresaId);
  const membroSnap = await tx.get(membroRef);
  const membro = membroSnap.data();
  if (!existe(membroSnap) || membro.uidAuth !== uid || membro.status !== "ativo") {
    throw erro(403, "Vinculo ativo nao encontrado.");
  }
  const roles = permissao === "agenda" ? ROLES_AGENDA : ROLES_FINANCEIRO;
  if (!roles.has(normalizarRoleEmpresa(membro))) throw erro(403, "Permissao insuficiente.");
  return empresaRef;
};

const executar = (handler) => async (req, res) => {
  try {
    if (!req.user?.uid) throw erro(401, "Autenticacao necessaria.");
    const resultado = await handler(req);
    res.status(200).json({ ok: true, ...resultado });
  } catch (error) {
    const status = error.status || 500;
    if (status === 500) console.error("Erro no financeiro de servicos:", error);
    res.status(status).json({ ok: false, error: status === 500 ? "Nao foi possivel concluir a operacao." : error.message });
  }
};

const garantirConta = ({ tx, empresaRef, agendamentoId, agendamento, atorUid, timestamp, contaSnap }) => {
  const contaRef = empresaRef.collection("contasReceber").doc(idContaAtendimento(agendamentoId));
  if (existe(contaSnap)) {
    const origem = contaSnap.data()?.origem;
    if (origem?.tipo !== "atendimento" || origem.documentoId !== agendamentoId) {
      throw erro(409, "Origem financeira inconsistente.");
    }
    return { criada: false, contaId: contaRef.id };
  }
  let conta;
  try {
    conta = montarContaAtendimento({ agendamentoId, agendamento, atorUid, timestamp });
  } catch (error) {
    throw erro(422, error.message);
  }
  if (!conta) return { criada: false, contaId: null, pendencia: "Atendimento gratuito; nenhuma cobranca criada." };
  tx.create(contaRef, conta);
  return { criada: true, contaId: contaRef.id };
};

const criarHandlerConcluir = ({ getDb: obterDb = getDb, agora = () => FieldValue.serverTimestamp() } = {}) =>
  executar(async (req) => {
    const { ownerUid, empresaId } = validarEscopo(req);
    const agendamentoId = req.body?.agendamentoId;
    if (!idValido(agendamentoId)) throw erro(400, "Atendimento invalido.");
    const db = obterDb();
    return db.runTransaction(async (tx) => {
      const empresaRef = await verificarAcesso(db, tx, {
        uid: req.user.uid, ownerUid, empresaId, permissao: "agenda",
      });
      const agendaRef = empresaRef.collection("agendamentos").doc(agendamentoId);
      const contaRef = empresaRef.collection("contasReceber").doc(idContaAtendimento(agendamentoId));
      const [agendaSnap, contaSnap] = await Promise.all([tx.get(agendaRef), tx.get(contaRef)]);
      if (!existe(agendaSnap)) throw erro(404, "Atendimento nao encontrado.");
      const agendamento = agendaSnap.data();
      if (agendamento.status !== "concluido" &&
          !["agendado", "confirmado", "em_atendimento"].includes(agendamento.status)) {
        throw erro(409, "Estado do atendimento nao permite conclusao.");
      }
      if (agendamento.status !== "concluido" && existe(contaSnap)) {
        throw erro(409, "Conta existente para atendimento nao concluido.");
      }
      const timestamp = agora();
      const concluido = agendamento.status === "concluido"
        ? agendamento
        : { ...agendamento, status: "concluido", concluidoEm: timestamp };
      const resultado = garantirConta({
        tx, empresaRef, agendamentoId, agendamento: concluido,
        atorUid: req.user.uid, timestamp, contaSnap,
      });
      if (agendamento.status !== "concluido") {
        tx.update(agendaRef, { status: "concluido", concluidoEm: timestamp, atualizadoEm: timestamp });
      }
      return { ...resultado, status: "concluido" };
    });
  });

const criarHandlerSincronizar = ({ getDb: obterDb = getDb, agora = () => FieldValue.serverTimestamp() } = {}) =>
  executar(async (req) => {
    const { ownerUid, empresaId } = validarEscopo(req);
    const db = obterDb();
    const empresaRef = await db.runTransaction((tx) => verificarAcesso(db, tx, {
      uid: req.user.uid, ownerUid, empresaId, permissao: "financeiro",
    }));
    const agendaSnap = await empresaRef.collection("agendamentos").where("status", "==", "concluido").get();
    let criadas = 0;
    const pendencias = [];
    for (const docSnap of agendaSnap.docs) {
      try {
        const resultado = await db.runTransaction(async (tx) => {
          const empresa = await verificarAcesso(db, tx, {
            uid: req.user.uid, ownerUid, empresaId, permissao: "financeiro",
          });
          const agendaRef = empresa.collection("agendamentos").doc(docSnap.id);
          const contaRef = empresa.collection("contasReceber").doc(idContaAtendimento(docSnap.id));
          const [atual, conta] = await Promise.all([tx.get(agendaRef), tx.get(contaRef)]);
          if (!existe(atual) || atual.data().status !== "concluido") return { criada: false };
          return garantirConta({
            tx, empresaRef: empresa, agendamentoId: docSnap.id,
            agendamento: atual.data(), atorUid: req.user.uid, timestamp: agora(), contaSnap: conta,
          });
        });
        if (resultado.criada) criadas += 1;
        if (resultado.pendencia) pendencias.push({ agendamentoId: docSnap.id, motivo: resultado.pendencia });
      } catch (error) {
        if (error.status === 422) pendencias.push({ agendamentoId: docSnap.id, motivo: error.message });
        else throw error;
      }
    }
    return { criadas, pendencias };
  });

const criarHandlerReceber = ({ getDb: obterDb = getDb, agora = () => FieldValue.serverTimestamp() } = {}) =>
  executar(async (req) => {
    const { ownerUid, empresaId } = validarEscopo(req);
    const { contaId, dataRecebimento, formaPagamento } = req.body || {};
    if (!idValido(contaId) || !/^\d{4}-\d{2}-\d{2}$/.test(String(dataRecebimento || "")) ||
        !FORMAS_PAGAMENTO.includes(formaPagamento)) throw erro(400, "Dados do recebimento invalidos.");
    const db = obterDb();
    return db.runTransaction(async (tx) => {
      const empresaRef = await verificarAcesso(db, tx, {
        uid: req.user.uid, ownerUid, empresaId, permissao: "financeiro",
      });
      const contaRef = empresaRef.collection("contasReceber").doc(contaId);
      const snap = await tx.get(contaRef);
      if (!existe(snap)) throw erro(404, "Conta nao encontrada.");
      const conta = snap.data();
      if (conta.status !== "pendente" || conta.origem?.tipo !== "atendimento") {
        throw erro(409, "Conta ja recebida ou indisponivel.");
      }
      const timestamp = agora();
      tx.update(contaRef, {
        status: "recebido",
        pagamento: {
          dataRecebimento, formaPagamento, valorRecebido: conta.valor,
          recebidoEm: timestamp, recebidoPor: req.user.uid,
        },
        atualizadoEm: timestamp,
      });
      return { contaId, status: "recebido" };
    });
  });

router.post("/concluir", authFirebase, criarHandlerConcluir());
router.post("/sincronizar", authFirebase, criarHandlerSincronizar());
router.post("/receber", authFirebase, criarHandlerReceber());

module.exports = { router, criarHandlerConcluir, criarHandlerSincronizar, criarHandlerReceber };
