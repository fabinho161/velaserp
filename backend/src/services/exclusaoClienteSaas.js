const { FieldValue } = require("../firebaseAdmin");
const {
  calcularVagasOcupadas,
  montarPayloadControleUsuarios,
  obterControleUsuariosEmpresaRef,
  resolverLimiteUsuariosEmpresa,
} = require("./limiteUsuariosEmpresa");
const { normalizarRoleEmpresa } = require("../utils/perfisEmpresa");

const COLECAO_TOMBSTONES = "adminExclusoesClientes";

const criarErroHttp = (statusCode, message, codigo, extras = {}) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.codigo = codigo;
  error.extras = extras;
  return error;
};

const normalizarTexto = (valor) =>
  typeof valor === "string" ? valor.trim().toLowerCase() : "";

const validarUid = (uid) => {
  const normalizado = typeof uid === "string" ? uid.trim() : "";
  if (!normalizado || normalizado.includes("/")) {
    throw criarErroHttp(400, "UID do cliente invalido.", "uid_invalido");
  }
  return normalizado;
};

const dadosDocumento = (snapshot) => snapshot?.exists ? snapshot.data() || {} : {};

const listarDocs = async (query) => {
  const snapshot = await query.get();
  return snapshot.docs.map((docSnapshot) => ({
    id: docSnapshot.id,
    ...docSnapshot.data(),
  }));
};

const chaveParticipacao = ({ ownerUid, empresaId }) => `${ownerUid}/${empresaId}`;

const inventariarCliente = async ({ db, targetUid, targetData }) => {
  const email = normalizarTexto(targetData.email);
  const userRef = db.collection("users").doc(targetUid);
  const authPointerRef = db.collection("usuariosPorAuth").doc(targetUid);
  const [empresasUsuario, empresasAuth, convitesDoAlvo] = await Promise.all([
    listarDocs(userRef.collection("empresas")),
    listarDocs(authPointerRef.collection("empresas")),
    email
      ? listarDocs(db.collection("convitesEmpresa").where("email", "==", email))
      : Promise.resolve([]),
  ]);

  const empresasProprias = [];
  const participacoesMap = new Map();

  [...empresasUsuario, ...empresasAuth].forEach((empresa) => {
    const empresaId = String(empresa.empresaId || empresa.id || "").trim();
    const ownerUid = String(empresa.ownerUid || "").trim();
    if (!empresaId || !ownerUid) return;

    if (ownerUid === targetUid) {
      if (!empresasProprias.some((item) => item.empresaId === empresaId)) {
        empresasProprias.push({ empresaId, ownerUid });
      }
      return;
    }

    const participacao = {
      empresaId,
      ownerUid,
      usuarioEmpresaId: String(empresa.usuarioEmpresaId || "").trim(),
    };
    const chave = chaveParticipacao(participacao);
    const atual = participacoesMap.get(chave) || {};
    participacoesMap.set(chave, { ...atual, ...participacao });
  });

  const convidados = [];
  const convitesPendentesDoAlvo = convitesDoAlvo.filter((convite) =>
    ["pendente", "pending"].includes(normalizarTexto(convite.status))
  );
  const conviteIds = new Set(convitesPendentesDoAlvo.map((convite) => convite.id));

  for (const empresa of empresasProprias) {
    const empresaRef = userRef.collection("empresas").doc(empresa.empresaId);
    const [membros, convites] = await Promise.all([
      listarDocs(empresaRef.collection("usuariosEmpresa")),
      listarDocs(
        db.collection("convitesEmpresa")
          .where("ownerUid", "==", targetUid)
          .where("empresaId", "==", empresa.empresaId)
      ),
    ]);

    membros.forEach((membro) => {
      const uidAuth = String(membro.uidAuth || "").trim();
      if (uidAuth && uidAuth !== targetUid) {
        convidados.push({ uidAuth, empresaId: empresa.empresaId });
      }
    });
    convites.forEach((convite) => conviteIds.add(convite.id));
  }

  convitesPendentesDoAlvo.forEach((convite) => {
    const ownerUid = String(convite.ownerUid || "").trim();
    const empresaId = String(convite.empresaId || "").trim();
    if (!ownerUid || !empresaId || ownerUid === targetUid) return;
    const chave = chaveParticipacao({ ownerUid, empresaId });
    const atual = participacoesMap.get(chave) || { ownerUid, empresaId };
    participacoesMap.set(chave, {
      ...atual,
      usuarioEmpresaId: atual.usuarioEmpresaId || String(convite.usuarioEmpresaId || "").trim(),
    });
  });

  for (const participacao of participacoesMap.values()) {
    if (participacao.usuarioEmpresaId) continue;
    const membros = await listarDocs(
      db.collection("users").doc(participacao.ownerUid)
        .collection("empresas").doc(participacao.empresaId)
        .collection("usuariosEmpresa").where("uidAuth", "==", targetUid)
    );
    if (membros.length > 1) {
      throw criarErroHttp(
        409,
        "Ha mais de um vinculo do cliente na mesma empresa terceira.",
        "participacao_ambigua"
      );
    }
    if (membros.length === 1) participacao.usuarioEmpresaId = membros[0].id;
  }

  return {
    empresasProprias,
    participacoesTerceiros: [...participacoesMap.values()],
    convidadosEmpresasProprias: convidados,
    conviteIds: [...conviteIds],
    ponteirosUsuariosPorAuth: empresasAuth.map((empresa) => String(empresa.id)),
  };
};

const montarPreview = ({ uid, email, inventario }) => ({
  uid,
  email,
  empresasProprias: inventario.empresasProprias.length,
  participacoesTerceiros: inventario.participacoesTerceiros.length,
  vinculosConvidados: inventario.convidadosEmpresasProprias.length,
  convitesRelacionados: inventario.conviteIds.length,
});

const validarAtorAdminMaster = async ({ db, actorUid }) => {
  const actorSnapshot = await db.collection("users").doc(actorUid).get();
  if (!actorSnapshot.exists || dadosDocumento(actorSnapshot).role !== "admin_master") {
    throw criarErroHttp(403, "Apenas administradores master podem excluir clientes.", "sem_permissao");
  }
};

const prepararExclusao = async ({ db, actorUid, targetUid }) => {
  const uid = validarUid(targetUid);
  if (uid === actorUid) {
    throw criarErroHttp(403, "Nao e permitido excluir a propria conta.", "autoexclusao");
  }

  await validarAtorAdminMaster({ db, actorUid });
  const userSnapshot = await db.collection("users").doc(uid).get();
  if (!userSnapshot.exists) {
    throw criarErroHttp(404, "Cliente nao encontrado.", "cliente_nao_encontrado");
  }

  const targetData = dadosDocumento(userSnapshot);
  if (targetData.role === "admin_master") {
    throw criarErroHttp(403, "Contas admin_master nao podem ser excluidas.", "admin_master_protegido");
  }

  const email = normalizarTexto(targetData.email);
  if (!email) {
    throw criarErroHttp(409, "Cliente sem e-mail canonico para confirmacao.", "email_ausente");
  }

  const inventario = await inventariarCliente({ db, targetUid: uid, targetData });
  return { uid, email, inventario };
};

const obterPreviewExclusaoCliente = async ({ db, actorUid, targetUid }) => {
  const preparado = await prepararExclusao({ db, actorUid, targetUid });
  return montarPreview(preparado);
};

const atualizarTombstone = (ref, payload) => ref.set({
  ...payload,
  atualizadoEm: FieldValue.serverTimestamp(),
}, { merge: true });

const cancelarConvite = async ({ db, conviteId, actorUid }) => {
  await db.collection("convitesEmpresa").doc(conviteId).set({
    status: "cancelado",
    vagaReservada: false,
    canceladoPor: actorUid,
    canceladoEm: FieldValue.serverTimestamp(),
    atualizadoEm: FieldValue.serverTimestamp(),
  }, { merge: true });
};

const removerParticipacaoTerceiro = async ({ db, participacao, targetUid, actorUid }) => {
  const { ownerUid, empresaId, usuarioEmpresaId } = participacao;
  if (!ownerUid || !empresaId) return;

  if (usuarioEmpresaId) {
    const ownerRef = db.collection("users").doc(ownerUid);
    const empresaRef = ownerRef.collection("empresas").doc(empresaId);
    const usuariosEmpresaRef = empresaRef.collection("usuariosEmpresa");
    const usuarioEmpresaRef = usuariosEmpresaRef.doc(usuarioEmpresaId);
    const controleRef = obterControleUsuariosEmpresaRef({ db, ownerUid, empresaId });
    const assinaturaRef = ownerRef.collection("assinatura").doc("plano");
    const empresaUsuarioRef = db.collection("users").doc(targetUid)
      .collection("empresas").doc(empresaId);
    const vinculoUsuarioRef = db.collection("usuariosPorAuth").doc(targetUid)
      .collection("empresas").doc(empresaId);
    const convitesQuery = db.collection("convitesEmpresa")
      .where("usuarioEmpresaId", "==", usuarioEmpresaId);

    await db.runTransaction(async (transaction) => {
      const [empresaSnapshot, ownerSnapshot, usuarioSnapshot, membrosSnapshot,
        assinaturaSnapshot, convitesSnapshot] = await Promise.all([
        transaction.get(empresaRef),
        transaction.get(ownerRef),
        transaction.get(usuarioEmpresaRef),
        transaction.get(usuariosEmpresaRef),
        transaction.get(assinaturaRef),
        transaction.get(convitesQuery),
      ]);

      if (!empresaSnapshot.exists || !usuarioSnapshot.exists) return;
      const empresa = dadosDocumento(empresaSnapshot);
      if (empresa.ownerUid && empresa.ownerUid !== ownerUid) {
        throw criarErroHttp(409, "Empresa terceira possui owner divergente.", "owner_divergente");
      }

      const usuarioEmpresa = { id: usuarioEmpresaId, ...dadosDocumento(usuarioSnapshot) };
      const usuariosEmpresa = membrosSnapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...docSnapshot.data(),
      }));
      const agora = new Date();
      const limite = resolverLimiteUsuariosEmpresa({
        empresa,
        assinaturaOwner: dadosDocumento(assinaturaSnapshot),
      });
      const dadosRemocao = {
        status: "removido",
        convitePendente: false,
        removidoPor: usuarioEmpresa.removidoPor || actorUid,
        removidoEm: usuarioEmpresa.removidoEm || agora,
        atualizadoEm: agora,
        role: normalizarRoleEmpresa(usuarioEmpresa),
      };
      const usuariosFinais = usuariosEmpresa.map((usuario) =>
        usuario.id === usuarioEmpresaId ? { ...usuario, ...dadosRemocao } : usuario
      );
      const vagas = calcularVagasOcupadas({
        ownerUid,
        ownerEmail: dadosDocumento(ownerSnapshot).email || "",
        usuariosEmpresa: usuariosFinais,
        agora,
      });
      const payloadControle = montarPayloadControleUsuarios({
        quantidadeVagasOcupadas: vagas.quantidadeOcupada,
        limiteAplicado: limite.limite,
        plano: limite.plano,
        statusPlano: limite.statusPlano,
        fonteLimite: limite.fonteLimite,
        ultimaOperacao: `usuariosEmpresa.remover.${normalizarTexto(usuarioEmpresa.status)}`,
        ultimoAtorUid: actorUid,
        atualizadoEm: agora,
        reconciliadoEm: agora,
      });
      const dadosPonteiro = {
        status: "removido",
        removidoEm: agora,
        removidoPor: actorUid,
        atualizadoEm: agora,
        ownerUid,
        empresaId,
        usuarioEmpresaId,
      };

      transaction.set(usuarioEmpresaRef, dadosRemocao, { merge: true });
      transaction.set(empresaUsuarioRef, dadosPonteiro, { merge: true });
      transaction.set(vinculoUsuarioRef, dadosPonteiro, { merge: true });
      transaction.set(controleRef, payloadControle, { merge: true });

      convitesSnapshot.docs.forEach((conviteSnapshot) => {
        const convite = conviteSnapshot.data() || {};
        if (
          convite.ownerUid === ownerUid &&
          convite.empresaId === empresaId &&
          normalizarTexto(convite.status) === "pendente"
        ) {
          transaction.set(conviteSnapshot.ref, {
            status: "cancelado",
            canceladoEm: agora,
            canceladoPor: actorUid,
            atualizadoEm: agora,
          }, { merge: true });
        }
      });
    });
  }

  await Promise.all([
    db.collection("users").doc(targetUid).collection("empresas").doc(empresaId).delete(),
    db.collection("usuariosPorAuth").doc(targetUid).collection("empresas").doc(empresaId).delete(),
  ]);
};

const executarExclusaoCliente = async ({
  db,
  authClient,
  actorUid,
  targetUid,
  confirmacaoEmail,
}) => {
  const uid = validarUid(targetUid);
  await validarAtorAdminMaster({ db, actorUid });
  if (uid === actorUid) {
    throw criarErroHttp(403, "Nao e permitido excluir a propria conta.", "autoexclusao");
  }

  const tombstoneRef = db.collection(COLECAO_TOMBSTONES).doc(uid);
  const tombstoneSnapshot = await tombstoneRef.get();
  const tombstoneExistente = dadosDocumento(tombstoneSnapshot);

  if (tombstoneExistente.status === "concluido") {
    if (normalizarTexto(confirmacaoEmail) !== normalizarTexto(tombstoneExistente.email)) {
      throw criarErroHttp(400, "O e-mail de confirmacao nao corresponde ao cliente.", "email_confirmacao_divergente");
    }
    return { uid, email: tombstoneExistente.email, concluido: true, retomada: true };
  }
  if (tombstoneExistente.status === "em_andamento") {
    throw criarErroHttp(409, "A exclusao deste cliente ja esta em andamento.", "exclusao_em_andamento");
  }

  let preparado;
  if (tombstoneSnapshot.exists && tombstoneExistente.inventario) {
    const targetSnapshot = await db.collection("users").doc(uid).get();
    if (targetSnapshot.exists && dadosDocumento(targetSnapshot).role === "admin_master") {
      throw criarErroHttp(403, "Contas admin_master nao podem ser excluidas.", "admin_master_protegido");
    }
    preparado = {
      uid,
      email: normalizarTexto(tombstoneExistente.email),
      inventario: tombstoneExistente.inventario,
    };
  } else {
    preparado = await prepararExclusao({ db, actorUid, targetUid: uid });
  }

  if (!normalizarTexto(confirmacaoEmail) || normalizarTexto(confirmacaoEmail) !== preparado.email) {
    throw criarErroHttp(400, "O e-mail de confirmacao nao corresponde ao cliente.", "email_confirmacao_divergente");
  }
  if (typeof db.recursiveDelete !== "function") {
    throw criarErroHttp(500, "Exclusao recursiva indisponivel no backend.", "recursive_delete_indisponivel");
  }

  const reivindicacao = await db.runTransaction(async (transaction) => {
    const snapshotAtual = await transaction.get(tombstoneRef);
    const dadosAtuais = dadosDocumento(snapshotAtual);
    if (dadosAtuais.status === "concluido") return "concluido";
    if (dadosAtuais.status === "em_andamento") {
      throw criarErroHttp(409, "A exclusao deste cliente ja esta em andamento.", "exclusao_em_andamento");
    }

    transaction.set(tombstoneRef, {
      uid,
      email: preparado.email,
      atorUid: actorUid,
      status: "em_andamento",
      faseAtual: "inventario_concluido",
      inventario: preparado.inventario,
      iniciadoEm: dadosAtuais.iniciadoEm || FieldValue.serverTimestamp(),
      atualizadoEm: FieldValue.serverTimestamp(),
      erro: null,
    }, { merge: true });
    return "iniciada";
  });

  if (reivindicacao === "concluido") {
    return { uid, email: preparado.email, concluido: true, retomada: true };
  }

  let faseAtual = "inventario_concluido";
  try {
    faseAtual = "limpar_vinculos_convidados";
    await atualizarTombstone(tombstoneRef, { faseAtual });
    for (const vinculo of preparado.inventario.convidadosEmpresasProprias || []) {
      await Promise.all([
        db.collection("users").doc(vinculo.uidAuth).collection("empresas").doc(vinculo.empresaId).delete(),
        db.collection("usuariosPorAuth").doc(vinculo.uidAuth).collection("empresas").doc(vinculo.empresaId).delete(),
      ]);
    }

    faseAtual = "cancelar_convites";
    await atualizarTombstone(tombstoneRef, { faseAtual });
    for (const conviteId of preparado.inventario.conviteIds || []) {
      await cancelarConvite({ db, conviteId, actorUid });
    }

    faseAtual = "remover_participacoes_terceiros";
    await atualizarTombstone(tombstoneRef, { faseAtual });
    for (const participacao of preparado.inventario.participacoesTerceiros || []) {
      await removerParticipacaoTerceiro({ db, participacao, targetUid: uid, actorUid });
    }

    faseAtual = "excluir_empresas_proprias";
    await atualizarTombstone(tombstoneRef, { faseAtual });
    for (const empresa of preparado.inventario.empresasProprias || []) {
      await db.recursiveDelete(
        db.collection("users").doc(uid).collection("empresas").doc(empresa.empresaId)
      );
    }

    faseAtual = "excluir_ponteiros_auth";
    await atualizarTombstone(tombstoneRef, { faseAtual });
    await db.recursiveDelete(db.collection("usuariosPorAuth").doc(uid));

    faseAtual = "excluir_arvore_usuario";
    await atualizarTombstone(tombstoneRef, { faseAtual });
    await db.recursiveDelete(db.collection("users").doc(uid));

    faseAtual = "excluir_firebase_auth";
    await atualizarTombstone(tombstoneRef, { faseAtual });
    try {
      await authClient.deleteUser(uid);
    } catch (error) {
      if (error?.code !== "auth/user-not-found") throw error;
    }

    await atualizarTombstone(tombstoneRef, {
      status: "concluido",
      faseAtual: "concluido",
      concluidoEm: FieldValue.serverTimestamp(),
      erro: null,
    });
    return { uid, email: preparado.email, concluido: true, retomada: tombstoneSnapshot.exists };
  } catch (error) {
    await atualizarTombstone(tombstoneRef, {
      status: "falha",
      faseAtual,
      erro: {
        codigo: error?.code || error?.codigo || null,
        mensagem: error?.message || "Falha desconhecida.",
      },
    });
    error.parcial = true;
    error.faseAtual = faseAtual;
    throw error;
  }
};

module.exports = {
  COLECAO_TOMBSTONES,
  executarExclusaoCliente,
  obterPreviewExclusaoCliente,
  _internals: {
    inventariarCliente,
    normalizarTexto,
    validarUid,
  },
};
