const { FieldValue } = require("../firebaseAdmin");

const getDocPath = (ref) => {
  return ref?.path || "(caminho_indisponivel)";
};

const logAuditoriaInfo = (message, data = {}) => {
  console.log(`[AUDITORIA_FIRESTORE] ${message}`, data);
};

const logAuditoriaError = (message, error, data = {}) => {
  console.error(`[AUDITORIA_FIRESTORE] ${message}`, {
    ...data,
    errorMessage: error?.message || String(error),
    errorCode: error?.code || null,
    errorStack: error?.stack || null,
  });
};

const registrarErroAuditoria = async (db, contexto, error, extras = {}) => {
  try {
    await db
      .collection("logs")
      .doc("auditoriaPagamentos")
      .collection("erros")
      .add({
        contexto,
        ...extras,
        errorMessage: error?.message || String(error),
        errorCode: error?.code || null,
        errorStack: error?.stack || null,
        criadoEm: FieldValue.serverTimestamp(),
      });
  } catch (logError) {
    logAuditoriaError("Falha ao registrar erro de auditoria no Firestore", logError, {
      contexto,
      erroOriginal: error?.message || String(error),
    });
  }
};

const executarCommitAuditoria = async ({
  action,
  commit,
  db,
  uid,
  refs = {},
  extras = {},
}) => {
  const paths = Object.entries(refs).reduce((acc, [key, ref]) => {
    acc[key] = getDocPath(ref);
    return acc;
  }, {});

  logAuditoriaInfo(`${action}: iniciando`, {
    uid,
    paths,
    ...extras,
  });

  try {
    await commit();
    logAuditoriaInfo(`${action}: sucesso`, {
      uid,
      paths,
      ...extras,
    });
  } catch (error) {
    logAuditoriaError(`${action}: falha`, error, {
      uid,
      paths,
      ...extras,
    });

    if (db) {
      await registrarErroAuditoria(db, action, error, {
        uid,
        paths,
        ...extras,
      });
    }

    throw error;
  }
};

module.exports = {
  executarCommitAuditoria,
  getDocPath,
  logAuditoriaError,
  logAuditoriaInfo,
  registrarErroAuditoria,
};
