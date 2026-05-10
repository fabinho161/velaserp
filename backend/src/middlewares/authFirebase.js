const { getAuthClient, getFirebaseProjectId } = require("../firebaseAdmin");

const authFirebase = async (req, res, next) => {
  const authorization = req.get("authorization") || "";
  const [type, token] = authorization.trim().split(/\s+/);

  console.info("Firebase Auth header recebido", {
    hasAuthorization: Boolean(authorization),
    type: type || null,
    hasBearer: type === "Bearer",
    tokenLength: token?.length || 0,
  });

  if (type !== "Bearer" || !token) {
    console.warn("Firebase Auth Bearer ausente ou malformado", {
      hasAuthorization: Boolean(authorization),
      type: type || null,
    });

    res.status(401).json({
      ok: false,
      error: "Token Firebase nao informado.",
    });
    return;
  }

  try {
    req.user = await getAuthClient().verifyIdToken(token);
    console.info("Firebase ID Token validado", {
      uid: req.user.uid,
      projectId: getFirebaseProjectId(),
      issuer: req.user.iss,
      audience: req.user.aud,
    });
    next();
  } catch (error) {
    console.error("Erro ao validar Firebase ID Token", {
      code: error.code,
      message: error.message,
      projectId: getFirebaseProjectId(),
      tokenLength: token.length,
    });
    res.status(401).json({
      ok: false,
      error: "Token Firebase invalido ou expirado.",
    });
  }
};

module.exports = authFirebase;
