const express = require("express");
const authFirebase = require("../middlewares/authFirebase");
const { FieldValue, getDb } = require("../firebaseAdmin");
const {
  normalizarAssinatura,
} = require("../services/sincronizarPlanoEspelhoEmpresasOwner");
const { ROLE_ADMIN_EMPRESA } = require("../utils/perfisEmpresa");
const {
  logAuditoriaError,
  logAuditoriaInfo,
  registrarErroAuditoria,
} = require("../utils/auditoriaFirestore");

const router = express.Router();

const LIMITE_NOME_EMPRESA = 120;
const SEGMENTO_EMPRESA_PADRAO = "industria";
const SEGMENTOS_EMPRESA_VALIDOS = new Set([
  "comercio",
  "industria",
  "oficina",
  "clientes",
]);
const LIMITES_EMPRESAS_POR_PLANO = {
  gratis: 1,
  basico: 2,
  profissional: 5,
  premium: 10,
};

const criarErroHttp = (statusCode, message, extras = {}) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.extras = extras;
  return error;
};

const normalizarSegmentoEmpresa = (segmento) => {
  if (segmento === undefined) return SEGMENTO_EMPRESA_PADRAO;
  if (typeof segmento !== "string") {
    throw criarErroHttp(400, "Segmento da empresa invalido.");
  }

  const segmentoTratado = segmento.trim().toLowerCase();

  if (!SEGMENTOS_EMPRESA_VALIDOS.has(segmentoTratado)) {
    throw criarErroHttp(400, "Segmento da empresa invalido.");
  }

  return segmentoTratado;
};

const validarPayloadCriacaoEmpresa = (body) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw criarErroHttp(400, "Requisicao invalida.");
  }

  const camposPermitidos = new Set(["nome", "segmento"]);
  const camposInvalidos = Object.keys(body).filter(
    (campo) => !camposPermitidos.has(campo)
  );

  if (camposInvalidos.length > 0) {
    throw criarErroHttp(400, "Campos nao permitidos na requisicao.");
  }

  if (typeof body.nome !== "string") {
    throw criarErroHttp(400, "Nome da empresa invalido.");
  }

  const nome = body.nome.trim();

  if (!nome) {
    throw criarErroHttp(400, "Informe o nome da empresa.");
  }

  if (nome.length > LIMITE_NOME_EMPRESA) {
    throw criarErroHttp(
      400,
      `Nome da empresa deve ter no maximo ${LIMITE_NOME_EMPRESA} caracteres.`
    );
  }

  return {
    nome,
    segmento: normalizarSegmentoEmpresa(body.segmento),
  };
};

const getLimiteEmpresas = ({ plano, status, isAdminMaster }) => {
  if (isAdminMaster) return null;
  if (status !== "active") return LIMITES_EMPRESAS_POR_PLANO.gratis;

  return LIMITES_EMPRESAS_POR_PLANO[plano] || LIMITES_EMPRESAS_POR_PLANO.gratis;
};

const getQuantidadeControleValida = (controleData = {}) => {
  const quantidade = controleData.quantidadeEmpresas;

  return Number.isInteger(quantidade) && quantidade >= 0 ? quantidade : null;
};

const montarPlanoEspelho = (assinaturaNormalizada) => ({
  ...assinaturaNormalizada,
  sincronizadoEm: FieldValue.serverTimestamp(),
});

const montarEmpresa = ({ nome, ownerUid, assinaturaNormalizada, criadoEm, segmento }) => ({
  nome,
  ownerUid,
  criadoEm,
  planoEspelho: montarPlanoEspelho(assinaturaNormalizada),
  segmento,
});

const montarUsuarioDonoEmpresa = ({ ownerUid, usuarioData, criadoEm }) => ({
  nome: usuarioData?.nome || usuarioData?.displayName || usuarioData?.email || "Dono da conta",
  email: usuarioData?.email || "",
  role: ROLE_ADMIN_EMPRESA,
  status: "ativo",
  uidAuth: ownerUid,
  criadoEm,
  atualizadoEm: criadoEm,
  criadoPor: ownerUid,
  convitePendente: false,
  dono: true,
});

router.post("/", authFirebase, async (req, res) => {
  const db = getDb();
  const ownerUid = req.user.uid;

  try {
    const { nome, segmento } = validarPayloadCriacaoEmpresa(req.body);
    const ownerRef = db.collection("users").doc(ownerUid);
    const assinaturaRef = ownerRef.collection("assinatura").doc("plano");
    const empresasRef = ownerRef.collection("empresas");
    const controleEmpresasRef = ownerRef.collection("controles").doc("empresas");
    const empresaRef = empresasRef.doc();
    const usuarioDonoRef = empresaRef.collection("usuariosEmpresa").doc(ownerUid);
    const criadoEm = new Date();

    const resultado = await db.runTransaction(async (transaction) => {
      const controleSnapshot = await transaction.get(controleEmpresasRef);
      const [ownerSnapshot, assinaturaSnapshot, empresasSnapshot] = await Promise.all([
        transaction.get(ownerRef),
        transaction.get(assinaturaRef),
        transaction.get(empresasRef),
      ]);
      const quantidadeControle = controleSnapshot.exists
        ? getQuantidadeControleValida(controleSnapshot.data())
        : null;
      const quantidadeReal = empresasSnapshot.size;

      if (!ownerSnapshot.exists) {
        throw criarErroHttp(404, "Usuario owner nao encontrado.");
      }

      const ownerData = ownerSnapshot.data() || {};
      const isAdminMaster = ownerData.role === "admin_master";
      const assinaturaNormalizada = normalizarAssinatura(
        assinaturaSnapshot.exists ? assinaturaSnapshot.data() : {}
      );
      const limiteEmpresas = getLimiteEmpresas({
        plano: assinaturaNormalizada.plano,
        status: assinaturaNormalizada.status,
        isAdminMaster,
      });
      const quantidadeAtual = Math.max(
        quantidadeControle === null ? quantidadeReal : quantidadeControle,
        quantidadeReal
      );
      const quantidadeAposCriacao = quantidadeAtual + 1;

      if (limiteEmpresas !== null && quantidadeAtual >= limiteEmpresas) {
        return {
          permitido: false,
          plano: assinaturaNormalizada.plano,
          limiteEmpresas,
          quantidadeAtual,
          quantidadeAposCriacao: quantidadeAtual,
          statusCode: 409,
          error: "Limite de empresas atingido para o plano atual.",
          motivo: "limite_empresas_atingido",
        };
      }

      const empresa = montarEmpresa({
        nome,
        ownerUid,
        assinaturaNormalizada,
        criadoEm,
        segmento,
      });
      const usuarioDono = montarUsuarioDonoEmpresa({
        ownerUid,
        usuarioData: ownerData,
        criadoEm,
      });

      transaction.set(empresaRef, empresa);
      transaction.set(usuarioDonoRef, usuarioDono);
      transaction.set(
        controleEmpresasRef,
        {
          quantidadeEmpresas: quantidadeAposCriacao,
          atualizadoEm: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return {
        permitido: true,
        empresaId: empresaRef.id,
        nome,
        ownerUid,
        criadoEm,
        segmento,
        plano: assinaturaNormalizada.plano,
        limiteEmpresas,
        quantidadeAtual,
        quantidadeAposCriacao,
        isAdminMaster,
      };
    });

    if (!resultado.permitido) {
      res.status(resultado.statusCode).json({
        ok: false,
        success: false,
        error: resultado.error,
        limiteEmpresas: resultado.limiteEmpresas,
        quantidadeAtual: resultado.quantidadeAtual,
        plano: resultado.plano,
        motivo: resultado.motivo,
      });
      return;
    }

    logAuditoriaInfo("empresas.criar: sucesso", {
      ownerUid,
      empresaId: resultado.empresaId,
      plano: resultado.plano,
      limiteEmpresas: resultado.limiteEmpresas,
      quantidadeAposCriacao: resultado.quantidadeAposCriacao,
      adminMaster: resultado.isAdminMaster,
    });

    res.status(201).json({
      ok: true,
      success: true,
      empresa: {
        id: resultado.empresaId,
        nome: resultado.nome,
        ownerUid: resultado.ownerUid,
        criadoEm: resultado.criadoEm.toISOString(),
        segmento: resultado.segmento,
      },
      plano: resultado.plano,
      limiteEmpresas: resultado.limiteEmpresas,
      quantidadeAposCriacao: resultado.quantidadeAposCriacao,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;

    logAuditoriaError("empresas.criar: falha", error, {
      ownerUid,
      statusCode,
      ...(error.extras || {}),
    });

    if (statusCode >= 500) {
      await registrarErroAuditoria(db, "empresas.criar", error, {
        ownerUid,
        ...(error.extras || {}),
      });
    }

    res.status(statusCode).json({
      ok: false,
      success: false,
      error: error.message || "Erro ao criar empresa.",
      ...(error.extras || {}),
    });
  }
});

module.exports = router;
