const express = require("express");
const authFirebase = require("../middlewares/authFirebase");
const { FieldValue, getDb } = require("../firebaseAdmin");
const { normalizarRoleEmpresa } = require("../utils/perfisEmpresa");
const { empresaPertenceAoSegmento } = require("../utils/segmentosEmpresa");
const {
  existeConflitoAgenda,
  montarSnapshotCliente,
  montarSnapshotServico,
  validarIntervaloAgenda,
} = require("../shared/agendaOperacional.cjs");

const router = express.Router();
const ROLES_AGENDA = new Set(["administrador_empresa", "comercial"]);
const TRANSICOES = {
  confirmar: { de: ["agendado"], para: "confirmado", marco: "confirmadoEm" },
  iniciar: { de: ["agendado", "confirmado"], para: "em_atendimento", marco: "iniciadoEm" },
  cancelar: { de: ["agendado", "confirmado", "em_atendimento"], para: "cancelado", marco: "canceladoEm" },
};
const CAMPOS_INTENCAO = new Set([
  "ownerUid", "empresaId", "clienteId", "servicoId", "data",
  "horaInicio", "horaFim", "duracaoMinutos", "observacoes",
]);

const erro = (status, mensagem, codigo) => Object.assign(new Error(mensagem), { status, codigo });
const idValido = (valor) => typeof valor === "string" && valor.trim() && !valor.includes("/");
const existe = (snap) => Boolean(snap?.exists);
const dados = (snap) => existe(snap) ? snap.data() : null;

const validarEscopo = (body = {}) => {
  if (!idValido(body.ownerUid) || !idValido(body.empresaId)) {
    throw erro(400, "Empresa invalida.", "agenda_empresa_invalida");
  }
  return { ownerUid: body.ownerUid.trim(), empresaId: body.empresaId.trim() };
};

const verificarAcessoAgenda = async (db, tx, { uid, ownerUid, empresaId }) => {
  const empresaRef = db.collection("users").doc(ownerUid).collection("empresas").doc(empresaId);
  const atorRef = db.collection("users").doc(uid);
  const [empresaSnap, atorSnap] = await Promise.all([tx.get(empresaRef), tx.get(atorRef)]);
  if (!existe(empresaSnap)) throw erro(404, "Empresa nao encontrada.", "agenda_empresa_invalida");
  if (!empresaPertenceAoSegmento(dados(empresaSnap).segmento, "clientes") ||
      (dados(empresaSnap).ownerUid && dados(empresaSnap).ownerUid !== ownerUid)) {
    throw erro(403, "Operacao indisponivel para esta empresa.", "agenda_sem_permissao");
  }
  if (uid === ownerUid || dados(atorSnap)?.role === "admin_master") return empresaRef;

  const authRef = db.collection("usuariosPorAuth").doc(uid).collection("empresas").doc(empresaId);
  const userRef = atorRef.collection("empresas").doc(empresaId);
  const [authSnap, userSnap] = await Promise.all([tx.get(authRef), tx.get(userRef)]);
  const vinculo = dados(authSnap) || dados(userSnap);
  if (!vinculo || vinculo.ownerUid !== ownerUid || vinculo.status !== "ativo" ||
      !idValido(vinculo.usuarioEmpresaId)) {
    throw erro(403, "Vinculo ativo nao encontrado.", "agenda_sem_permissao");
  }
  const membroSnap = await tx.get(empresaRef.collection("usuariosEmpresa").doc(vinculo.usuarioEmpresaId));
  const membro = dados(membroSnap);
  if (!membro || membro.uidAuth !== uid || membro.status !== "ativo" ||
      !ROLES_AGENDA.has(normalizarRoleEmpresa(membro))) {
    throw erro(403, "Permissao insuficiente.", "agenda_sem_permissao");
  }
  return empresaRef;
};

const responder = (handler) => async (req, res) => {
  try {
    if (!req.user?.uid) throw erro(401, "Autenticacao necessaria.", "agenda_sem_permissao");
    const resultado = await handler(req);
    const status = resultado.statusHttp || 200;
    delete resultado.statusHttp;
    res.status(status).json({ ok: true, ...resultado });
  } catch (error) {
    const status = error.status || 500;
    if (status === 500) console.error("Erro na Agenda:", error);
    res.status(status).json({
      ok: false,
      error: status === 500 ? "Nao foi possivel concluir a operacao." : error.message,
      codigo: error.codigo || "agenda_erro_interno",
    });
  }
};

const obterEntidade = async (tx, ref, codigo, mensagem) => {
  const snap = await tx.get(ref);
  if (!existe(snap)) throw erro(422, mensagem, codigo);
  return snap.data();
};

const obterConflitos = async (tx, agendaRef, data) => {
  const snapshot = await tx.get(agendaRef.where("data", "==", data));
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
};

const lerControlesAgenda = async (tx, empresaRef, datas) => {
  const datasOrdenadas = [...new Set(datas)].sort();
  const controles = datasOrdenadas.map((data) => ({
    data,
    ref: empresaRef.collection("agendaControles").doc(data),
  }));
  const snapshots = await Promise.all(controles.map(({ ref }) => tx.get(ref)));
  return controles.map((controle, indice) => ({ ...controle, snapshot: snapshots[indice] }));
};

const tocarControlesAgenda = (tx, controles, timestamp) => {
  for (const { data, ref, snapshot } of controles) {
    const versaoAtual = Number(snapshot.exists ? snapshot.data()?.versao : 0);
    tx.set(ref, {
      data,
      versao: Number.isSafeInteger(versaoAtual) && versaoAtual >= 0 ? versaoAtual + 1 : 1,
      atualizadoEm: timestamp,
    }, { merge: true });
  }
};

const montarDadosIntencao = (body) => {
  if (Object.keys(body || {}).some((campo) => !CAMPOS_INTENCAO.has(campo))) {
    throw erro(422, "Payload de agendamento invalido.", "agenda_payload_invalido");
  }
  if (!idValido(body.clienteId)) throw erro(422, "Cliente invalido.", "agenda_cliente_invalido");
  if (!idValido(body.servicoId)) throw erro(422, "Servico invalido.", "agenda_servico_invalido");
  const intervalo = validarIntervaloAgenda(body);
  return {
    clienteId: body.clienteId.trim(),
    servicoId: body.servicoId.trim(),
    ...intervalo,
    observacoes: String(body.observacoes ?? "").trim(),
  };
};

const criarHandlerCriar = ({ getDb: obterDb = getDb, agora = () => FieldValue.serverTimestamp() } = {}) =>
  responder(async (req) => {
    const escopo = validarEscopo(req.body);
    const intencao = montarDadosIntencao(req.body);
    const db = obterDb();
    const agendaId = db.collection("users").doc(escopo.ownerUid).collection("empresas")
      .doc(escopo.empresaId).collection("agendamentos").doc().id;
    return db.runTransaction(async (tx) => {
      const empresaRef = await verificarAcessoAgenda(db, tx, { uid: req.user.uid, ...escopo });
      const agendaRef = empresaRef.collection("agendamentos");
      const controles = await lerControlesAgenda(tx, empresaRef, [intencao.data]);
      const [cliente, servico, existentes] = await Promise.all([
        obterEntidade(tx, empresaRef.collection("clientesComerciais").doc(intencao.clienteId),
          "agenda_cliente_invalido", "Cliente invalido."),
        obterEntidade(tx, empresaRef.collection("servicos").doc(intencao.servicoId),
          "agenda_servico_invalido", "Servico invalido."),
        obterConflitos(tx, agendaRef, intencao.data),
      ]);
      if (cliente.ativo === false) throw erro(422, "Cliente invalido.", "agenda_cliente_invalido");
      if (String(servico.status || "ativo").toLowerCase() === "inativo") {
        throw erro(422, "Servico invalido.", "agenda_servico_invalido");
      }
      const documento = {
        ...montarSnapshotCliente(intencao.clienteId, cliente),
        ...montarSnapshotServico(intencao.servicoId, servico, intencao.duracaoMinutos),
        data: intencao.data,
        horaInicio: intencao.horaInicio,
        horaFim: intencao.horaFim,
        status: "agendado",
        observacoes: intencao.observacoes,
        criadoPor: req.user.uid,
        criadoEm: agora(),
        atualizadoEm: agora(),
      };
      if (existeConflitoAgenda(documento, existentes)) {
        throw erro(409, "Ja existe um agendamento nesse horario.", "agenda_conflito_horario");
      }
      tocarControlesAgenda(tx, controles, documento.atualizadoEm);
      tx.create(agendaRef.doc(agendaId), documento);
      return { statusHttp: 201, agendamento: { id: agendaId, ...documento } };
    });
  });

const criarHandlerEditar = ({ getDb: obterDb = getDb, agora = () => FieldValue.serverTimestamp() } = {}) =>
  responder(async (req) => {
    const escopo = validarEscopo(req.body);
    if (!idValido(req.params?.id)) throw erro(400, "Agendamento invalido.", "agenda_nao_encontrada");
    const intencao = montarDadosIntencao(req.body);
    const db = obterDb();
    return db.runTransaction(async (tx) => {
      const empresaRef = await verificarAcessoAgenda(db, tx, { uid: req.user.uid, ...escopo });
      const agendaRef = empresaRef.collection("agendamentos");
      const documentoRef = agendaRef.doc(req.params.id);
      const atualSnap = await tx.get(documentoRef);
      if (!existe(atualSnap)) throw erro(404, "Agendamento nao encontrado.", "agenda_nao_encontrada");
      const atual = atualSnap.data();
      if (!["agendado", "confirmado"].includes(atual.status)) {
        throw erro(409, "Este atendimento nao permite edicao.", "agenda_transicao_invalida");
      }
      const clienteAlterado = atual.clienteId !== intencao.clienteId;
      const servicoAlterado = atual.servicoId !== intencao.servicoId;
      const controles = await lerControlesAgenda(tx, empresaRef, [atual.data, intencao.data]);
      const [cliente, servico, existentes] = await Promise.all([
        clienteAlterado ? obterEntidade(tx, empresaRef.collection("clientesComerciais").doc(intencao.clienteId),
          "agenda_cliente_invalido", "Cliente invalido.") : Promise.resolve(null),
        servicoAlterado ? obterEntidade(tx, empresaRef.collection("servicos").doc(intencao.servicoId),
          "agenda_servico_invalido", "Servico invalido.") : Promise.resolve(null),
        obterConflitos(tx, agendaRef, intencao.data),
      ]);
      if (clienteAlterado && cliente.ativo === false) throw erro(422, "Cliente invalido.", "agenda_cliente_invalido");
      if (servicoAlterado && String(servico.status || "ativo").toLowerCase() === "inativo") {
        throw erro(422, "Servico invalido.", "agenda_servico_invalido");
      }
      const patch = {
        ...(clienteAlterado ? montarSnapshotCliente(intencao.clienteId, cliente) : {}),
        ...(servicoAlterado ? montarSnapshotServico(intencao.servicoId, servico, intencao.duracaoMinutos) : {}),
        data: intencao.data,
        horaInicio: intencao.horaInicio,
        horaFim: intencao.horaFim,
        duracaoMinutos: intencao.duracaoMinutos,
        observacoes: intencao.observacoes,
        atualizadoEm: agora(),
      };
      const candidato = { ...atual, ...patch };
      if (existeConflitoAgenda(candidato, existentes, req.params.id)) {
        throw erro(409, "Ja existe um agendamento nesse horario.", "agenda_conflito_horario");
      }
      tocarControlesAgenda(tx, controles, patch.atualizadoEm);
      tx.update(documentoRef, patch);
      return { agendamento: { id: req.params.id, ...candidato } };
    });
  });

const criarHandlerTransicao = (acao, { getDb: obterDb = getDb, agora = () => FieldValue.serverTimestamp() } = {}) =>
  responder(async (req) => {
    const regra = TRANSICOES[acao];
    const escopo = validarEscopo(req.body);
    if (!regra || !idValido(req.params?.id)) throw erro(400, "Agendamento invalido.", "agenda_nao_encontrada");
    const db = obterDb();
    return db.runTransaction(async (tx) => {
      const empresaRef = await verificarAcessoAgenda(db, tx, { uid: req.user.uid, ...escopo });
      const documentoRef = empresaRef.collection("agendamentos").doc(req.params.id);
      const snap = await tx.get(documentoRef);
      if (!existe(snap)) throw erro(404, "Agendamento nao encontrado.", "agenda_nao_encontrada");
      const atual = snap.data();
      if (atual.status === regra.para) return { agendamentoId: req.params.id, status: regra.para, reutilizado: true };
      if (!regra.de.includes(atual.status)) {
        throw erro(409, "Transicao de atendimento invalida.", "agenda_transicao_invalida");
      }
      const timestamp = agora();
      if (acao === "cancelar") {
        const controles = await lerControlesAgenda(tx, empresaRef, [atual.data]);
        tocarControlesAgenda(tx, controles, timestamp);
      }
      tx.update(documentoRef, { status: regra.para, [regra.marco]: timestamp, atualizadoEm: timestamp });
      return { agendamentoId: req.params.id, status: regra.para, reutilizado: false };
    });
  });

const possuiVinculoAtendimento = (snapshot, agendamentoId) =>
  snapshot.docs.some((docSnap) => {
    const origem = docSnap.data()?.origem;
    return origem?.tipo === "atendimento" && origem.documentoId === agendamentoId;
  });

const criarHandlerExcluir = ({ getDb: obterDb = getDb, agora = () => FieldValue.serverTimestamp() } = {}) =>
  responder(async (req) => {
    const escopo = validarEscopo(req.body);
    if (!idValido(req.params?.id)) throw erro(400, "Agendamento invalido.", "agenda_nao_encontrada");
    const db = obterDb();
    return db.runTransaction(async (tx) => {
      const empresaRef = await verificarAcessoAgenda(db, tx, { uid: req.user.uid, ...escopo });
      const documentoRef = empresaRef.collection("agendamentos").doc(req.params.id);
      const agendamentoSnap = await tx.get(documentoRef);
      if (!existe(agendamentoSnap)) {
        throw erro(404, "Agendamento nao encontrado.", "agenda_nao_encontrada");
      }

      const [contasSnapshot, faturamentosSnapshot] = await Promise.all([
        tx.get(empresaRef.collection("contasReceber").where("origem.documentoId", "==", req.params.id)),
        tx.get(empresaRef.collection("faturamentos").where("origem.documentoId", "==", req.params.id)),
      ]);
      if (possuiVinculoAtendimento(contasSnapshot, req.params.id) ||
          possuiVinculoAtendimento(faturamentosSnapshot, req.params.id)) {
        throw erro(
          409,
          "Este agendamento possui movimentacao financeira ou faturamento vinculado e nao pode ser excluido.",
          "agenda_possui_vinculo"
        );
      }

      const agendamento = agendamentoSnap.data();
      const controles = await lerControlesAgenda(tx, empresaRef, [agendamento.data]);
      tocarControlesAgenda(tx, controles, agora());
      tx.delete(documentoRef);
      return { agendamentoId: req.params.id };
    });
  });

router.post("/", authFirebase, criarHandlerCriar());
router.put("/:id", authFirebase, criarHandlerEditar());
router.delete("/:id", authFirebase, criarHandlerExcluir());
router.post("/:id/confirmar", authFirebase, criarHandlerTransicao("confirmar"));
router.post("/:id/iniciar", authFirebase, criarHandlerTransicao("iniciar"));
router.post("/:id/cancelar", authFirebase, criarHandlerTransicao("cancelar"));

module.exports = {
  router,
  criarHandlerCriar,
  criarHandlerEditar,
  criarHandlerExcluir,
  criarHandlerTransicao,
  lerControlesAgenda,
  tocarControlesAgenda,
  verificarAcessoAgenda,
};
