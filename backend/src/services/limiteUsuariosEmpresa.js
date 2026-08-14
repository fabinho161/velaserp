const { FieldValue } = require("../firebaseAdmin");

const PLANOS_USUARIOS = Object.freeze({
  gratis: Object.freeze({ nivel: 0, limiteUsuarios: 1 }),
  basico: Object.freeze({ nivel: 1, limiteUsuarios: 3 }),
  profissional: Object.freeze({ nivel: 2, limiteUsuarios: 8 }),
  premium: Object.freeze({ nivel: 3, limiteUsuarios: 25 }),
});

const STATUS_PLANO_VALIDOS = new Set(["active", "inactive", "blocked"]);
const STATUS_MEMBRO_PRIORIDADE = Object.freeze({
  ativo: 4,
  pendente: 3,
  inativo: 2,
  removido: 1,
});
const LIMITE_MANUAL_MAXIMO = 1000;
const VERSAO_CONTROLE_USUARIOS = 1;

const normalizarTexto = (valor) => String(valor || "").trim().toLowerCase();

const normalizarEmail = (email) => {
  if (typeof email !== "string") return "";
  return email.trim().toLowerCase();
};

const normalizarStatusMembro = (status) => {
  const statusNormalizado = normalizarTexto(status);
  return STATUS_MEMBRO_PRIORIDADE[statusNormalizado] ? statusNormalizado : "removido";
};

const normalizarId = (valor) => {
  if (typeof valor !== "string") return "";
  return valor.trim();
};

const validarSegmentoFirestore = (nomeCampo, valor) => {
  const valorNormalizado = normalizarId(valor);

  if (!valorNormalizado || valorNormalizado.includes("/")) {
    throw new Error(`${nomeCampo} invalido.`);
  }

  return valorNormalizado;
};

const toDateInfo = (valor) => {
  if (valor === null || valor === undefined || valor === "") {
    return {
      data: null,
      informado: false,
      invalido: false,
    };
  }

  if (valor instanceof Date) {
    return {
      data: Number.isNaN(valor.getTime()) ? null : valor,
      informado: true,
      invalido: Number.isNaN(valor.getTime()),
    };
  }

  if (typeof valor.toDate === "function") {
    const data = valor.toDate();

    return {
      data: data instanceof Date && !Number.isNaN(data.getTime()) ? data : null,
      informado: true,
      invalido: !(data instanceof Date) || Number.isNaN(data.getTime()),
    };
  }

  const data = new Date(valor);

  return {
    data: Number.isNaN(data.getTime()) ? null : data,
    informado: true,
    invalido: Number.isNaN(data.getTime()),
  };
};

const documentoParaMembro = (entrada, indice) => {
  if (entrada && typeof entrada.data === "function") {
    return {
      id: entrada.id || "",
      dados: entrada.data() || {},
      indice,
    };
  }

  const dados = entrada && typeof entrada === "object" && !Array.isArray(entrada)
    ? entrada
    : {};

  return {
    id: normalizarId(dados.id),
    dados,
    indice,
  };
};

const obterChavesIdentidadeMembro = ({
  id,
  dados,
  ownerUid,
  ownerEmailNormalizado,
  indice,
}) => {
  const uidAuth = normalizarId(dados.uidAuth);
  const emailNormalizado = normalizarEmail(dados.email);
  const chaves = [];
  const inconsistencias = [];
  const ownerPorUid = uidAuth && uidAuth === ownerUid;
  const ownerPorDocumento = id && id === ownerUid;
  const ownerPorEmail = !uidAuth &&
    ownerEmailNormalizado &&
    emailNormalizado &&
    emailNormalizado === ownerEmailNormalizado;
  const ownerPorFlag = dados.dono === true;

  if (
    uidAuth &&
    uidAuth !== ownerUid &&
    ownerEmailNormalizado &&
    emailNormalizado === ownerEmailNormalizado
  ) {
    inconsistencias.push({
      tipo: "email_owner_com_uid_divergente",
      usuarioEmpresaId: id || null,
    });
  }

  if (ownerPorFlag && !ownerPorUid && !ownerPorDocumento && !ownerPorEmail) {
    inconsistencias.push({
      tipo: "flag_dono_sem_uid_owner",
      usuarioEmpresaId: id || null,
    });
  }

  if (ownerPorUid || ownerPorDocumento || ownerPorEmail) {
    chaves.push(`owner:${ownerUid}`);
  } else {
    if (uidAuth) chaves.push(`uidAuth:${uidAuth}`);
    if (emailNormalizado) chaves.push(`email:${emailNormalizado}`);
  }

  if (chaves.length === 0) {
    chaves.push(`doc:${id || `indice:${String(indice).padStart(4, "0")}`}`);
  }

  return {
    chaves,
    emailNormalizado,
    uidAuth,
    inconsistencias,
    owner: ownerPorUid || ownerPorDocumento || ownerPorEmail,
  };
};

const classificarReservaPendente = ({ dados, agora }) => {
  if (normalizarStatusMembro(dados.status) !== "pendente") {
    return {
      consomeVaga: false,
      tipoReserva: null,
      expirado: false,
      inconsistencias: [],
    };
  }

  const inconsistencias = [];
  const expiraEmInfo = toDateInfo(dados.conviteExpiraEm || dados.expiraEm);
  const expirado = Boolean(
    expiraEmInfo.data && expiraEmInfo.data.getTime() < agora.getTime()
  );

  if (expiraEmInfo.invalido) {
    inconsistencias.push({
      tipo: "convite_expiracao_invalida",
    });
  } else if (!expiraEmInfo.informado) {
    inconsistencias.push({
      tipo: "pendente_sem_data_expiracao",
    });
  }

  if (expirado) {
    return {
      consomeVaga: false,
      tipoReserva: "pendente_expirado",
      expirado: true,
      inconsistencias: [{
        tipo: "pendente_expirado_nao_reserva_vaga",
      }],
    };
  }

  if (dados.vagaReservada === true) {
    return {
      consomeVaga: true,
      tipoReserva: "explicita",
      expirado: false,
      inconsistencias,
    };
  }

  if (dados.convitePendente === true || dados.conviteToken) {
    inconsistencias.push({
      tipo: "pendente_legado_sem_vagaReservada",
    });

    return {
      consomeVaga: true,
      tipoReserva: "legado_sem_marca",
      expirado: false,
      inconsistencias,
    };
  }

  inconsistencias.push({
    tipo: "pendente_sem_convite_ou_reserva",
  });

  return {
    consomeVaga: true,
    tipoReserva: "pendente_inconsistente",
    expirado: false,
    inconsistencias,
  };
};

const membroConsomeVaga = ({ status, dados, owner, agora }) => {
  if (owner) return true;
  if (status === "ativo") return true;
  if (status === "pendente") {
    return classificarReservaPendente({ dados, agora }).consomeVaga;
  }

  return false;
};

const escolherRegistroConservador = (registros) => {
  return [...registros].sort((a, b) => {
    const prioridadeA = STATUS_MEMBRO_PRIORIDADE[a.status] || 0;
    const prioridadeB = STATUS_MEMBRO_PRIORIDADE[b.status] || 0;

    if (prioridadeA !== prioridadeB) return prioridadeB - prioridadeA;
    return a.indice - b.indice;
  })[0];
};

const criarGrupo = (registro, chaves) => ({
  chaves: new Set(chaves),
  registros: [registro],
});

const mesclarGrupos = (grupos, indicesGrupos) => {
  const [indicePrincipal, ...restantes] = indicesGrupos;
  const principal = grupos[indicePrincipal];

  restantes
    .sort((a, b) => b - a)
    .forEach((indice) => {
      const grupo = grupos[indice];
      grupo.chaves.forEach((chave) => principal.chaves.add(chave));
      principal.registros.push(...grupo.registros);
      grupos.splice(indice, 1);
    });

  return principal;
};

const agruparMembrosPorIdentidade = (registros) => {
  const grupos = [];

  registros.forEach((registro) => {
    const indicesEncontrados = grupos
      .map((grupo, indice) => ({
        grupo,
        indice,
      }))
      .filter(({ grupo }) => registro.chaves.some((chave) => grupo.chaves.has(chave)))
      .map(({ indice }) => indice);

    const grupo = indicesEncontrados.length > 0
      ? mesclarGrupos(grupos, indicesEncontrados)
      : criarGrupo(registro, registro.chaves);

    if (indicesEncontrados.length === 0) {
      grupos.push(grupo);
    } else {
      registro.chaves.forEach((chave) => grupo.chaves.add(chave));
      grupo.registros.push(registro);
    }
  });

  return grupos;
};

const calcularVagasOcupadas = ({
  ownerUid,
  ownerEmail = "",
  usuariosEmpresa = [],
  agora = new Date(),
}) => {
  const ownerUidNormalizado = validarSegmentoFirestore("ownerUid", ownerUid);
  const ownerEmailNormalizado = normalizarEmail(ownerEmail);
  const dataReferencia = toDateInfo(agora).data || new Date();
  const inconsistencias = [];
  const registrosNormalizados = usuariosEmpresa.map((entrada, indice) => {
    const { id, dados } = documentoParaMembro(entrada, indice);
    const identidade = obterChavesIdentidadeMembro({
      id,
      dados,
      ownerUid: ownerUidNormalizado,
      ownerEmailNormalizado,
      indice,
    });
    const status = normalizarStatusMembro(dados.status);
    const reserva = classificarReservaPendente({ dados, agora: dataReferencia });

    inconsistencias.push(
      ...identidade.inconsistencias,
      ...reserva.inconsistencias.map((item) => ({
        ...item,
        usuarioEmpresaId: id || null,
      }))
    );

    return {
      id: id || null,
      indice,
      dados,
      status,
      chaves: identidade.chaves,
      uidAuth: identidade.uidAuth,
      emailNormalizado: identidade.emailNormalizado,
      owner: identidade.owner,
      tipoReserva: reserva.tipoReserva,
      conviteExpirado: reserva.expirado,
    };
  });

  const grupos = agruparMembrosPorIdentidade(registrosNormalizados);
  const membrosConsiderados = [{
    identidade: `owner:${ownerUidNormalizado}`,
    usuarioEmpresaId: ownerUidNormalizado,
    status: "ativo",
    consomeVaga: true,
    owner: true,
    origem: "owner_implicito",
  }];
  const registrosIgnorados = [];
  const duplicidadesDetectadas = [];

  grupos.forEach((grupo) => {
    const registro = escolherRegistroConservador(grupo.registros);
    const grupoEhOwner = grupo.chaves.has(`owner:${ownerUidNormalizado}`);

    if (grupo.registros.length > 1) {
      duplicidadesDetectadas.push({
        identidade: [...grupo.chaves].sort(),
        usuarioEmpresaIds: grupo.registros.map((item) => item.id).filter(Boolean),
        status: grupo.registros.map((item) => item.status),
        statusConsiderado: registro.status,
      });
    }

    if (grupoEhOwner) {
      registrosIgnorados.push({
        usuarioEmpresaId: registro.id,
        motivo: "owner_ja_contado",
        status: registro.status,
      });
      return;
    }

    const consomeVaga = membroConsomeVaga({
      status: registro.status,
      dados: registro.dados,
      owner: false,
      agora: dataReferencia,
    });

    if (!consomeVaga) {
      registrosIgnorados.push({
        usuarioEmpresaId: registro.id,
        motivo: registro.status === "pendente"
          ? "pendente_expirado"
          : `status_${registro.status}_nao_consumidor`,
        status: registro.status,
      });
    }

    membrosConsiderados.push({
      identidade: [...grupo.chaves].sort()[0],
      usuarioEmpresaId: registro.id,
      status: registro.status,
      consomeVaga,
      owner: false,
      uidAuth: registro.uidAuth || null,
      emailNormalizado: registro.emailNormalizado || null,
      tipoReserva: registro.tipoReserva,
    });
  });

  const quantidadeOcupada = membrosConsiderados.filter((membro) => membro.consomeVaga).length;

  return {
    quantidadeOcupada,
    membrosConsiderados,
    duplicidadesDetectadas,
    registrosIgnorados,
    inconsistencias,
  };
};

const normalizarLimiteManual = (limite, inconsistencias, fonte) => {
  if (limite === null || limite === undefined || limite === "") return null;
  if (!Number.isInteger(limite) || limite <= 0 || limite > LIMITE_MANUAL_MAXIMO) {
    inconsistencias.push({
      tipo: "limiteUsuariosManual_invalido_ignorado",
      fonte,
    });
    return null;
  }

  return limite;
};

const normalizarFontePlano = (dados, fonte, inconsistencias) => {
  const plano = normalizarTexto(dados?.plano);
  const status = normalizarTexto(dados?.status);
  const planoValido = Object.prototype.hasOwnProperty.call(PLANOS_USUARIOS, plano);
  const statusValido = STATUS_PLANO_VALIDOS.has(status);

  if (!planoValido || !statusValido) {
    inconsistencias.push({
      tipo: "fonte_plano_invalida",
      fonte,
      plano: plano || null,
      status: status || null,
    });
    return null;
  }

  const limiteManual = normalizarLimiteManual(
    dados?.limiteUsuariosManual,
    inconsistencias,
    fonte
  );
  const limitePlano = PLANOS_USUARIOS[plano].limiteUsuarios;
  const limiteAtivo = limiteManual === null
    ? limitePlano
    : Math.max(limitePlano, limiteManual);

  return {
    plano,
    statusPlano: status,
    limite: status === "active" ? limiteAtivo : PLANOS_USUARIOS.gratis.limiteUsuarios,
    limitePlano,
    limiteUsuariosManual: limiteManual,
    fonteLimite: fonte,
    nivel: PLANOS_USUARIOS[plano].nivel,
  };
};

const resolverLimiteUsuariosEmpresa = ({
  empresa = {},
  assinaturaOwner = {},
}) => {
  const inconsistencias = [];
  const planoEspelho = normalizarFontePlano(
    empresa?.planoEspelho,
    "planoEspelho",
    inconsistencias
  );

  if (planoEspelho) {
    if (planoEspelho.statusPlano !== "active") {
      inconsistencias.push({
        tipo: "status_plano_nao_ativo_limite_gratis",
        fonte: "planoEspelho",
      });
    }

    return {
      ...planoEspelho,
      inconsistencias,
    };
  }

  const assinatura = normalizarFontePlano(
    assinaturaOwner,
    "assinaturaOwner",
    inconsistencias
  );

  if (assinatura) {
    if (assinatura.statusPlano !== "active") {
      inconsistencias.push({
        tipo: "status_plano_nao_ativo_limite_gratis",
        fonte: "assinaturaOwner",
      });
    }

    return {
      ...assinatura,
      inconsistencias,
    };
  }

  return {
    plano: "gratis",
    statusPlano: "inactive",
    limite: PLANOS_USUARIOS.gratis.limiteUsuarios,
    limitePlano: PLANOS_USUARIOS.gratis.limiteUsuarios,
    limiteUsuariosManual: null,
    fonteLimite: "fallback",
    nivel: PLANOS_USUARIOS.gratis.nivel,
    inconsistencias,
  };
};

const obterControleUsuariosEmpresaRef = ({ db, ownerUid, empresaId }) => {
  if (!db || typeof db.collection !== "function") {
    throw new Error("db Firestore invalido.");
  }

  const ownerUidNormalizado = validarSegmentoFirestore("ownerUid", ownerUid);
  const empresaIdNormalizado = validarSegmentoFirestore("empresaId", empresaId);

  return db
    .collection("users")
    .doc(ownerUidNormalizado)
    .collection("empresas")
    .doc(empresaIdNormalizado)
    .collection("controles")
    .doc("usuarios");
};

const montarPayloadControleUsuarios = ({
  quantidadeVagasOcupadas,
  limiteAplicado,
  plano,
  statusPlano = null,
  fonteLimite,
  ultimaOperacao,
  ultimoAtorUid,
  atualizadoEm = FieldValue.serverTimestamp(),
  reconciliadoEm,
}) => {
  if (!Number.isInteger(quantidadeVagasOcupadas) || quantidadeVagasOcupadas < 0) {
    throw new Error("quantidadeVagasOcupadas invalida.");
  }

  if (!Number.isInteger(limiteAplicado) || limiteAplicado < 1) {
    throw new Error("limiteAplicado invalido.");
  }

  const payload = {
    quantidadeVagasOcupadas,
    limiteAplicado,
    plano,
    fonteLimite,
    atualizadoEm,
    versao: VERSAO_CONTROLE_USUARIOS,
    ultimaOperacao: String(ultimaOperacao || "").trim() || null,
    ultimoAtorUid: normalizarId(ultimoAtorUid) || null,
  };

  if (statusPlano) payload.statusPlano = statusPlano;
  if (reconciliadoEm) payload.reconciliadoEm = reconciliadoEm;

  return payload;
};

const validarOperacaoLimiteUsuarios = ({
  quantidadeAtual,
  limite,
  deltaVagas = 0,
}) => {
  if (!Number.isInteger(quantidadeAtual) || quantidadeAtual < 0) {
    throw new Error("quantidadeAtual invalida.");
  }

  if (!Number.isInteger(limite) || limite < 1) {
    throw new Error("limite invalido.");
  }

  if (!Number.isInteger(deltaVagas)) {
    throw new Error("deltaVagas invalido.");
  }

  const quantidadeProjetada = quantidadeAtual + deltaVagas;
  const permitido = deltaVagas <= 0 || quantidadeProjetada <= limite;

  return {
    permitido,
    quantidadeAtual,
    quantidadeProjetada,
    limite,
    deltaVagas,
    motivo: permitido ? null : "limite_usuarios_atingido",
  };
};

module.exports = {
  calcularVagasOcupadas,
  montarPayloadControleUsuarios,
  normalizarEmail,
  obterControleUsuariosEmpresaRef,
  resolverLimiteUsuariosEmpresa,
  validarOperacaoLimiteUsuarios,
  validarSegmentoFirestore,
};
