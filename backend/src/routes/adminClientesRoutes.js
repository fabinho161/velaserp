const express = require("express");
const authFirebase = require("../middlewares/authFirebase");
const { getAuthClient, getDb } = require("../firebaseAdmin");
const {
  executarExclusaoCliente,
  obterPreviewExclusaoCliente,
} = require("../services/exclusaoClienteSaas");
const { logAuditoriaError, logAuditoriaInfo } = require("../utils/auditoriaFirestore");

const responderErro = (res, error) => {
  res.status(error.statusCode || 500).json({
    ok: false,
    parcial: error.parcial === true,
    faseAtual: error.faseAtual || null,
    codigo: error.codigo || error.code || null,
    error: error.message || "Erro ao excluir cliente.",
  });
};

const criarRouterAdminClientes = ({
  getDbDependencia = getDb,
  getAuthClientDependencia = getAuthClient,
  authMiddleware = authFirebase,
  obterPreviewDependencia = obterPreviewExclusaoCliente,
  executarExclusaoDependencia = executarExclusaoCliente,
} = {}) => {
  const router = express.Router();

  router.get("/clientes/:uid/exclusao-preview", authMiddleware, async (req, res) => {
    const actorUid = req.user?.uid || "";
    try {
      const preview = await obterPreviewDependencia({
        db: getDbDependencia(),
        actorUid,
        targetUid: req.params.uid,
      });
      res.json({ ok: true, preview });
    } catch (error) {
      logAuditoriaError("admin.clientes.exclusao.preview: falha", error, { actorUid, targetUid: req.params.uid });
      responderErro(res, error);
    }
  });

  router.delete("/clientes/:uid", authMiddleware, async (req, res) => {
    const actorUid = req.user?.uid || "";
    try {
      const resultado = await executarExclusaoDependencia({
        db: getDbDependencia(),
        authClient: getAuthClientDependencia(),
        actorUid,
        targetUid: req.params.uid,
        confirmacaoEmail: req.body?.confirmacaoEmail,
      });
      logAuditoriaInfo("admin.clientes.exclusao: concluida", { actorUid, targetUid: req.params.uid });
      res.json({ ok: true, ...resultado });
    } catch (error) {
      logAuditoriaError("admin.clientes.exclusao: falha", error, { actorUid, targetUid: req.params.uid });
      responderErro(res, error);
    }
  });

  return router;
};

module.exports = {
  criarRouterAdminClientes,
  router: criarRouterAdminClientes(),
};
