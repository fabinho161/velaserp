const { normalizarRoleEmpresa } = require("../utils/perfisEmpresa");
const { empresaPertenceAoSegmento } = require("../utils/segmentosEmpresa");

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

const validarEmpresa = (empresaSnap, ownerUid, segmento = null) => {
  if (!existe(empresaSnap)) throw erro(404, "Empresa nao encontrada.");
  const empresa = empresaSnap.data();
  if ((segmento && !empresaPertenceAoSegmento(empresa.segmento, segmento)) ||
      (empresa.ownerUid && empresa.ownerUid !== ownerUid)) {
    throw erro(403, "Operacao indisponivel para esta empresa.");
  }
};

const verificarMembro = async (tx, { empresaRef, atorRef, uid, ownerUid, empresaId, permissao, vinculo }) => {
  if (!vinculo || vinculo.ownerUid !== ownerUid || vinculo.status !== "ativo" ||
      !idValido(vinculo.usuarioEmpresaId)) throw erro(403, "Vinculo ativo nao encontrado.");
  const membroSnap = await tx.get(empresaRef.collection("usuariosEmpresa").doc(vinculo.usuarioEmpresaId));
  const membro = membroSnap.data();
  if (!existe(membroSnap) || membro.uidAuth !== uid || membro.status !== "ativo") {
    throw erro(403, "Vinculo ativo nao encontrado.");
  }
  const roles = permissao === "agenda" ? ROLES_AGENDA : ROLES_FINANCEIRO;
  if (!roles.has(normalizarRoleEmpresa(membro))) throw erro(403, "Permissao insuficiente.");
  return empresaRef;
};

const verificarAcesso = async (db, tx, { uid, ownerUid, empresaId, permissao }) => {
  const empresaRef = db.collection("users").doc(ownerUid).collection("empresas").doc(empresaId);
  const atorRef = db.collection("users").doc(uid);
  const [empresaSnap, atorSnap] = await Promise.all([tx.get(empresaRef), tx.get(atorRef)]);
  validarEmpresa(empresaSnap, ownerUid, "clientes");
  if (uid === ownerUid || atorSnap.data()?.role === "admin_master") return empresaRef;

  const [authSnap, userSnap] = await Promise.all([
    tx.get(db.collection("usuariosPorAuth").doc(uid).collection("empresas").doc(empresaId)),
    tx.get(atorRef.collection("empresas").doc(empresaId)),
  ]);
  const vinculo = existe(authSnap) ? authSnap.data() : existe(userSnap) ? userSnap.data() : null;
  return verificarMembro(tx, { empresaRef, atorRef, uid, ownerUid, empresaId, permissao, vinculo });
};

const resolverAcessoEmpresa = async (db, tx, { uid, empresaId, permissao }) => {
  if (!idValido(empresaId)) throw erro(400, "Empresa invalida.");
  const atorRef = db.collection("users").doc(uid);
  const authRef = db.collection("usuariosPorAuth").doc(uid).collection("empresas").doc(empresaId);
  const userEmpresaRef = atorRef.collection("empresas").doc(empresaId);
  const [atorSnap, authSnap, userEmpresaSnap] = await Promise.all([
    tx.get(atorRef), tx.get(authRef), tx.get(userEmpresaRef),
  ]);
  const authData = existe(authSnap) ? authSnap.data() : null;
  const userData = existe(userEmpresaSnap) ? userEmpresaSnap.data() : null;
  const ownerUid = authData?.ownerUid || userData?.ownerUid ||
    (existe(userEmpresaSnap) ? uid : null);
  if (!idValido(ownerUid)) throw erro(403, "Vinculo ativo nao encontrado.");

  const empresaRef = db.collection("users").doc(ownerUid).collection("empresas").doc(empresaId);
  const empresaSnap = ownerUid === uid ? userEmpresaSnap : await tx.get(empresaRef);
  validarEmpresa(empresaSnap, ownerUid);
  if (uid === ownerUid || atorSnap.data()?.role === "admin_master") return empresaRef;

  const vinculo = authData || userData;
  return verificarMembro(tx, { empresaRef, atorRef, uid, ownerUid, empresaId, permissao, vinculo });
};

const executar = (handler, contexto = "financeiro") => async (req, res) => {
  try {
    if (!req.user?.uid) throw erro(401, "Autenticacao necessaria.");
    const resultado = await handler(req);
    res.status(200).json({ ok: true, ...resultado });
  } catch (error) {
    const status = error.status || 500;
    if (status === 500) console.error(`Erro no ${contexto}:`, error);
    res.status(status).json({
      ok: false,
      error: status === 500 ? "Nao foi possivel concluir a operacao." : error.message,
    });
  }
};

module.exports = {
  erro,
  executar,
  existe,
  idValido,
  resolverAcessoEmpresa,
  validarEscopo,
  verificarAcesso,
};
