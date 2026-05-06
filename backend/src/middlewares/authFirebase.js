const { getAuthClient } = require("../firebaseAdmin");

const authFirebase = async (req, res, next) => {
  const authorization = req.get("authorization") || "";
  const [type, token] = authorization.split(" ");

  if (type !== "Bearer" || !token) {
    res.status(401).json({
      ok: false,
      error: "Token Firebase nao informado.",
    });
    return;
  }

  try {
    req.user = await getAuthClient().verifyIdToken(token);
    next();
  } catch (error) {
    console.error("Erro ao validar Firebase ID Token", error);
    res.status(401).json({
      ok: false,
      error: "Token Firebase invalido ou expirado.",
    });
  }
};

module.exports = authFirebase;
