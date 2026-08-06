const { FieldValue } = require("../firebaseAdmin");

const PLANOS_CANONICOS = {
  gratis: {
    nivel: 0,
    limiteUsuarios: 1,
  },
  basico: {
    nivel: 1,
    limiteUsuarios: 3,
  },
  profissional: {
    nivel: 2,
    limiteUsuarios: 8,
  },
  premium: {
    nivel: 3,
    limiteUsuarios: 25,
  },
};

const STATUS_CANONICOS = new Set(["active", "inactive", "blocked"]);
const LIMITE_BATCH_FIRESTORE = 450;

const normalizarTexto = (valor) => String(valor || "").trim().toLowerCase();

const normalizarLimiteUsuariosManual = (limite) => {
  const numero = Number(limite);
  return Number.isInteger(numero) && numero > 0 ? numero : null;
};

const normalizarAssinatura = (assinatura = {}) => {
  const dados = assinatura &&
    typeof assinatura === "object" &&
    !Array.isArray(assinatura)
    ? assinatura
    : {};
  const planoInformado = normalizarTexto(dados.plano);
  const statusInformado = normalizarTexto(dados.status);
  const planoValido = Object.prototype.hasOwnProperty.call(PLANOS_CANONICOS, planoInformado);
  const statusValido = STATUS_CANONICOS.has(statusInformado);
  const assinaturaValida = planoValido && statusValido;
  const plano = assinaturaValida ? planoInformado : "gratis";
  const status = assinaturaValida ? statusInformado : "inactive";
  const configPlano = PLANOS_CANONICOS[plano];
  const limiteUsuariosManual = normalizarLimiteUsuariosManual(
    dados.limiteUsuariosManual
  );

  return {
    plano,
    status,
    nivel: configPlano.nivel,
    limiteUsuarios: configPlano.limiteUsuarios,
    limiteUsuariosManual,
  };
};

const validarParametros = ({ db, ownerUid }) => {
  if (!db || typeof db.collection !== "function" || typeof db.batch !== "function") {
    throw new Error("sincronizarPlanoEspelhoEmpresasOwner: db Firestore invalido.");
  }

  if (typeof ownerUid !== "string" || !ownerUid.trim()) {
    throw new Error("sincronizarPlanoEspelhoEmpresasOwner: ownerUid invalido.");
  }
};

const executarLote = async (batch, contexto) => {
  try {
    await batch.commit();
  } catch (error) {
    error.message = `sincronizarPlanoEspelhoEmpresasOwner: falha ao executar lote ${contexto.loteAtual} para owner ${contexto.ownerUid}: ${error.message}`;
    throw error;
  }
};

const sincronizarPlanoEspelhoEmpresasOwner = async ({
  db,
  ownerUid,
  assinatura = {},
  agora = FieldValue.serverTimestamp(),
}) => {
  validarParametros({ db, ownerUid });

  const ownerUidNormalizado = ownerUid.trim();
  const planoNormalizado = normalizarAssinatura(assinatura);
  const empresasSnapshot = await db
    .collection("users")
    .doc(ownerUidNormalizado)
    .collection("empresas")
    .get();
  const planoEspelho = {
    ...planoNormalizado,
    sincronizadoEm: agora,
  };

  if (empresasSnapshot.empty) {
    return {
      ownerUid: ownerUidNormalizado,
      empresasEncontradas: 0,
      empresasAtualizadas: 0,
      lotesExecutados: 0,
      planoNormalizado: planoNormalizado.plano,
      statusNormalizado: planoNormalizado.status,
    };
  }

  let batch = db.batch();
  let operacoesNoLote = 0;
  let empresasAtualizadas = 0;
  let lotesExecutados = 0;

  for (const empresaDoc of empresasSnapshot.docs) {
    batch.set(
      empresaDoc.ref,
      {
        planoEspelho,
      },
      { merge: true }
    );

    operacoesNoLote += 1;
    empresasAtualizadas += 1;

    if (operacoesNoLote >= LIMITE_BATCH_FIRESTORE) {
      lotesExecutados += 1;
      await executarLote(batch, {
        loteAtual: lotesExecutados,
        ownerUid: ownerUidNormalizado,
      });
      batch = db.batch();
      operacoesNoLote = 0;
    }
  }

  if (operacoesNoLote > 0) {
    lotesExecutados += 1;
    await executarLote(batch, {
      loteAtual: lotesExecutados,
      ownerUid: ownerUidNormalizado,
    });
  }

  return {
    ownerUid: ownerUidNormalizado,
    empresasEncontradas: empresasSnapshot.size,
    empresasAtualizadas,
    lotesExecutados,
    planoNormalizado: planoNormalizado.plano,
    statusNormalizado: planoNormalizado.status,
  };
};

module.exports = {
  normalizarAssinatura,
  sincronizarPlanoEspelhoEmpresasOwner,
};
