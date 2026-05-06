const admin = require("firebase-admin");
const cors = require("cors");
const { logger } = require("firebase-functions");
const { HttpsError, onCall, onRequest } = require("firebase-functions/v2/https");
const { FieldValue } = require("firebase-admin/firestore");
const { MercadoPagoConfig, PreApproval } = require("mercadopago");

admin.initializeApp();

const db = admin.firestore();
const corsHandler = cors({ origin: true });
const CHECKOUT_CORS_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

const PLANOS_PAGOS = {
  basico: {
    nome: "Basico",
    valor: 49,
  },
  profissional: {
    nome: "Profissional",
    valor: 99,
  },
  premium: {
    nome: "Premium",
    valor: 149,
  },
};

const getMercadoPagoToken = () => {
  return process.env.MERCADO_PAGO_ACCESS_TOKEN || "";
};

const getFrontendBaseUrl = () => {
  const configuredUrl = String(process.env.FRONTEND_BASE_URL || "").trim();
  const fallbackUrl = "http://localhost:5173";
  const baseUrl = configuredUrl || fallbackUrl;

  try {
    const url = new URL(baseUrl);

    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("FRONTEND_BASE_URL deve iniciar com http:// ou https://");
    }

    return url.origin;
  } catch (error) {
    logger.warn("FRONTEND_BASE_URL invalida, usando fallback local", {
      baseUrl,
      error: error.message,
    });
    return fallbackUrl;
  }
};

const getReturnUrls = () => {
  const baseUrl = getFrontendBaseUrl();

  return {
    sucesso: new URL("/pagamento/sucesso", baseUrl).toString(),
    pendente: new URL("/pagamento/pendente", baseUrl).toString(),
    erro: new URL("/pagamento/erro", baseUrl).toString(),
  };
};

const normalizarPlano = (plano) => {
  return String(plano || "").trim().toLowerCase();
};

const normalizarStatus = (status) => {
  return String(status || "").trim().toLowerCase();
};

const getPreapprovalIdFromWebhook = (req) => {
  const payload = req.body || {};
  const query = req.query || {};

  const id = (
    payload.data?.id ||
    payload.id ||
    payload.preapproval_id ||
    query["data.id"] ||
    query.id ||
    query.preapproval_id ||
    null
  );

  if (Array.isArray(id)) return id[0] ? String(id[0]) : null;
  return id ? String(id) : null;
};

const getDataInputValue = (value) => {
  const date = value ? new Date(value) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  if (Number.isNaN(date.getTime())) {
    return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }

  return date.toISOString().slice(0, 10);
};

const consultarPreapprovalMercadoPago = async ({ token, preapprovalId }) => {
  if (!token.startsWith("TEST-")) {
    throw new Error("mercado_pago_token_not_test");
  }

  const client = new MercadoPagoConfig({ accessToken: token });
  const preApproval = new PreApproval(client);

  return preApproval.get({ id: preapprovalId });
};

const getCheckoutSessionFromExternalReference = async (externalReference) => {
  const match = String(externalReference || "").match(
    /^users\/([^/]+)\/checkoutSessions\/([^/]+)$/
  );

  if (!match) return null;

  const [, uid, sessionId] = match;
  const ref = db
    .collection("users")
    .doc(uid)
    .collection("checkoutSessions")
    .doc(sessionId);
  const snapshot = await ref.get();

  return snapshot.exists ? snapshot : null;
};

const localizarCheckoutSession = async (preapproval) => {
  const mercadoPagoPreapprovalId = preapproval.id;

  if (preapproval.external_reference) {
    const snapshot = await getCheckoutSessionFromExternalReference(
      preapproval.external_reference
    );

    if (snapshot) return snapshot;
  }

  const sessionsSnapshot = await db
    .collectionGroup("checkoutSessions")
    .where("mercadoPagoPreapprovalId", "==", mercadoPagoPreapprovalId)
    .limit(1)
    .get();

  return sessionsSnapshot.empty ? null : sessionsSnapshot.docs[0];
};

const getUidFromCheckoutSnapshot = (checkoutSnapshot) => {
  return checkoutSnapshot.data()?.userId || checkoutSnapshot.ref.parent.parent?.id || null;
};

const getValorPreapproval = (preapproval, checkoutSession) => {
  const valorMercadoPago = Number(preapproval.auto_recurring?.transaction_amount);
  if (Number.isFinite(valorMercadoPago)) return valorMercadoPago;

  const valorCheckout = Number(checkoutSession.valor);
  if (Number.isFinite(valorCheckout)) return valorCheckout;

  const plano = PLANOS_PAGOS[checkoutSession.planoSolicitado];
  return plano?.valor || 0;
};

const getCheckoutUrlFromPreapproval = (preapproval = {}) => {
  const checkoutUrl =
    preapproval.init_point ||
    preapproval.sandbox_init_point ||
    preapproval.response?.init_point ||
    preapproval.response?.sandbox_init_point ||
    "";

  return typeof checkoutUrl === "string" ? checkoutUrl : "";
};

const getPreapprovalIdFromResponse = (preapproval = {}) => {
  const id = preapproval.id || preapproval.response?.id || "";
  return id ? String(id) : null;
};

const getPreapprovalStatusFromResponse = (preapproval = {}) => {
  return preapproval.status || preapproval.response?.status || "pending";
};

const getPreapprovalDateCreatedFromResponse = (preapproval = {}) => {
  return preapproval.date_created || preapproval.response?.date_created || null;
};

const criarPreapprovalMercadoPago = async ({
  token,
  uid,
  email,
  planoSolicitado,
  checkoutSessionId,
  returnUrls,
}) => {
  if (!token.startsWith("TEST-")) {
    throw new HttpsError(
      "failed-precondition",
      "Configure um access token de teste do Mercado Pago iniciado por TEST- para criar assinaturas em modo teste."
    );
  }

  const plano = PLANOS_PAGOS[planoSolicitado];
  const client = new MercadoPagoConfig({ accessToken: token });
  const preApproval = new PreApproval(client);

  return preApproval.create({
    body: {
      reason: `Renovar ERP - Plano ${plano.nome}`,
      external_reference: `users/${uid}/checkoutSessions/${checkoutSessionId}`,
      payer_email: email,
      
      back_url: returnUrls.sucesso,
      success_url: returnUrls.sucesso,
      pending_url: returnUrls.pendente,
      failure_url: returnUrls.erro,

      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: plano.valor,
        currency_id: "BRL",
      },
      status: "pending",
    },
  });
};

exports.criarCheckoutMercadoPago = onCall(
  {
    region: "southamerica-east1",
    cors: CHECKOUT_CORS_ORIGINS,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Faca login para iniciar uma assinatura."
      );
    }

    const uid = request.auth.uid;
    const email = request.auth.token?.email || request.auth.token?.firebase?.identities?.email?.[0];
    const planoSolicitado = normalizarPlano(
      request.data?.planoSolicitado || request.data?.plano
    );

    if (!PLANOS_PAGOS[planoSolicitado]) {
      throw new HttpsError(
        "invalid-argument",
        "Escolha um plano pago valido para assinar."
      );
    }

    const token = getMercadoPagoToken();
    const tokenConfigurado = Boolean(token);

    if (tokenConfigurado && !email) {
      throw new HttpsError(
        "failed-precondition",
        "O usuario autenticado precisa ter e-mail para criar a assinatura de teste no Mercado Pago."
      );
    }

    const checkoutRef = db
      .collection("users")
      .doc(uid)
      .collection("checkoutSessions")
      .doc();
    const pagamentoRef = db
      .collection("users")
      .doc(uid)
      .collection("pagamentos")
      .doc(checkoutRef.id);

    const agora = FieldValue.serverTimestamp();
    const returnUrls = getReturnUrls();
    let checkoutUrl = null;
    let mercadoPagoPreapprovalId = null;
    let mercadoPagoStatus = null;
    let mercadoPagoDateCreated = null;
    let modo = "mock_sem_token";

    if (tokenConfigurado) {
      try {
        const preapproval = await criarPreapprovalMercadoPago({
          token,
          uid,
          email,
          planoSolicitado,
          checkoutSessionId: checkoutRef.id,
          returnUrls,
        });

        checkoutUrl = getCheckoutUrlFromPreapproval(preapproval);
        mercadoPagoPreapprovalId = getPreapprovalIdFromResponse(preapproval);
        mercadoPagoStatus = getPreapprovalStatusFromResponse(preapproval);
        mercadoPagoDateCreated = getPreapprovalDateCreatedFromResponse(preapproval);
        modo = "teste_preapproval_real";

        if (!checkoutUrl) {
          throw new HttpsError(
            "internal",
            "Mercado Pago criou a assinatura de teste, mas nao retornou a URL do checkout."
          );
        }
      } catch (error) {
        logger.error("Erro ao criar preapproval Mercado Pago", {
          uid,
          planoSolicitado,
          checkoutSessionId: checkoutRef.id,
          error: error.message,
          cause: error.cause || null,
        });

        if (error instanceof HttpsError) {
          throw error;
        }

        throw new HttpsError(
          "internal",
          "Nao foi possivel criar a assinatura de teste no Mercado Pago agora."
        );
      }
    }

    const checkoutSession = {
      gateway: "mercado_pago",
      origem: "checkout",
      planoSolicitado,
      planoNome: PLANOS_PAGOS[planoSolicitado].nome,
      valor: PLANOS_PAGOS[planoSolicitado].valor,
      statusCheckout: "pending",
      checkoutUrl,
      mercadoPagoPreapprovalId,
      mercadoPagoStatus,
      mercadoPagoDateCreated,
      returnUrls,
      modo,
      userId: uid,
      criadoEm: agora,
      atualizadoEm: agora,
    };

    const pagamentoPendente = {
      gateway: "mercado_pago",
      origem: "checkout",
      planoSolicitado,
      checkoutSessionId: checkoutRef.id,
      paymentId: null,
      mercadoPagoPreapprovalId,
      mercadoPagoStatus,
      statusPagamento: "pending",
      valor: PLANOS_PAGOS[planoSolicitado].valor,
      userId: uid,
      criadoEm: agora,
      atualizadoEm: agora,
    };

    await db.runTransaction(async (transaction) => {
      transaction.set(checkoutRef, checkoutSession);
      transaction.set(pagamentoRef, pagamentoPendente);
    });

    logger.info("Sessao de checkout Mercado Pago preparada", {
      uid,
      planoSolicitado,
      checkoutSessionId: checkoutRef.id,
      modo,
    });

    const respostaCheckout = {
      sessionId: checkoutRef.id,
      checkoutUrl: checkoutUrl || "",
      mercadoPagoPreapprovalId,
      mock: !tokenConfigurado,
      checkoutPreparado: true,
      statusCheckout: "pending",
      mensagem: tokenConfigurado
        ? "Assinatura de teste criada no Mercado Pago. A ativacao do plano ainda depende de confirmacao segura."
        : "Checkout preparado em modo simulado. Configure o token do Mercado Pago nas Functions para ativar a etapa real futuramente.",
    };

    return respostaCheckout;
  }
);

exports.webhookMercadoPago = onRequest(
  {
    region: "southamerica-east1",
  },
  (req, res) => {
    corsHandler(req, res, async () => {
      if (!["POST", "GET"].includes(req.method)) {
        res.status(405).json({ ok: false, error: "Metodo nao permitido." });
        return;
      }

      try {
        const logRef = db
          .collection("logs")
          .doc("webhooksMercadoPago")
          .collection("eventos")
          .doc();
        const payload = req.body || {};
        const token = getMercadoPagoToken();
        const preapprovalId = getPreapprovalIdFromWebhook(req);

        await logRef.set({
          gateway: "mercado_pago",
          origem: "webhook",
          statusProcessamento: "received",
          method: req.method,
          query: req.query || {},
          payload,
          headers: {
            userAgent: req.get("user-agent") || null,
            xRequestId: req.get("x-request-id") || null,
            xSignature: req.get("x-signature") || null,
            xMeliSignature: req.get("x-meli-signature") || null,
          },
          criadoEm: FieldValue.serverTimestamp(),
        });

        if (!token) {
          await logRef.set({
            statusProcessamento: "ignored_missing_token",
            atualizadoEm: FieldValue.serverTimestamp(),
          }, { merge: true });

          res.status(200).json({
            ok: true,
            received: true,
            processed: false,
            reason: "missing_test_token",
            logId: logRef.id,
          });
          return;
        }

        if (!token.startsWith("TEST-")) {
          await logRef.set({
            statusProcessamento: "blocked_non_test_token",
            atualizadoEm: FieldValue.serverTimestamp(),
          }, { merge: true });

          res.status(403).json({
            ok: false,
            received: true,
            processed: false,
            reason: "only_test_token_allowed",
            logId: logRef.id,
          });
          return;
        }

        if (!preapprovalId) {
          await logRef.set({
            statusProcessamento: "ignored_missing_preapproval_id",
            atualizadoEm: FieldValue.serverTimestamp(),
          }, { merge: true });

          res.status(200).json({
            ok: true,
            received: true,
            processed: false,
            reason: "missing_preapproval_id",
            logId: logRef.id,
          });
          return;
        }

        let preapproval = null;

        try {
          preapproval = await consultarPreapprovalMercadoPago({
            token,
            preapprovalId,
          });
        } catch (error) {
          await logRef.set({
            statusProcessamento: "validation_failed",
            mercadoPagoPreapprovalId: preapprovalId,
            erroValidacao: error.message,
            atualizadoEm: FieldValue.serverTimestamp(),
          }, { merge: true });

          res.status(200).json({
            ok: true,
            received: true,
            processed: false,
            reason: "mercado_pago_validation_failed",
            logId: logRef.id,
          });
          return;
        }

        const statusMercadoPago = normalizarStatus(preapproval.status);
        const checkoutSnapshot = await localizarCheckoutSession(preapproval);

        if (!checkoutSnapshot) {
          await logRef.set({
            statusProcessamento: "validated_checkout_not_found",
            mercadoPagoPreapprovalId: preapproval.id || preapprovalId,
            statusMercadoPago,
            atualizadoEm: FieldValue.serverTimestamp(),
          }, { merge: true });

          res.status(200).json({
            ok: true,
            received: true,
            processed: false,
            reason: "checkout_session_not_found",
            logId: logRef.id,
          });
          return;
        }

        const checkoutSession = checkoutSnapshot.data();
        const uid = getUidFromCheckoutSnapshot(checkoutSnapshot);
        const planoSolicitado = normalizarPlano(checkoutSession.planoSolicitado);

        if (!uid || !PLANOS_PAGOS[planoSolicitado]) {
          await logRef.set({
            statusProcessamento: "validated_invalid_checkout_session",
            mercadoPagoPreapprovalId: preapproval.id || preapprovalId,
            statusMercadoPago,
            checkoutSessionId: checkoutSnapshot.id,
            userId: uid,
            planoSolicitado,
            atualizadoEm: FieldValue.serverTimestamp(),
          }, { merge: true });

          res.status(200).json({
            ok: true,
            received: true,
            processed: false,
            reason: "invalid_checkout_session",
            logId: logRef.id,
          });
          return;
        }

        const statusAtivaPlano = ["authorized", "active"].includes(statusMercadoPago);
        const statusCheckout = statusAtivaPlano ? "approved" : statusMercadoPago || "pending";
        const valorPago = getValorPreapproval(preapproval, checkoutSession);
        const assinaturaRef = db
          .collection("users")
          .doc(uid)
          .collection("assinatura")
          .doc("plano");
        const pagamentoRef = db
          .collection("users")
          .doc(uid)
          .collection("pagamentos")
          .doc(checkoutSnapshot.id);
        const agora = FieldValue.serverTimestamp();

        const checkoutUpdate = {
          statusCheckout,
          statusMercadoPago,
          mercadoPagoStatus: statusMercadoPago,
          mercadoPagoPreapprovalId: preapproval.id || preapprovalId,
          atualizadoEm: agora,
          ultimoWebhookLogId: logRef.id,
        };

        const pagamentoUpdate = {
          gateway: "mercado_pago",
          origem: "webhook",
          planoSolicitado,
          checkoutSessionId: checkoutSnapshot.id,
          mercadoPagoPreapprovalId: preapproval.id || preapprovalId,
          mercadoPagoStatus: statusMercadoPago,
          statusMercadoPago,
          statusPagamento: statusAtivaPlano ? "approved" : statusCheckout,
          valor: valorPago,
          paymentId: preapproval.id || preapprovalId,
          userId: uid,
          atualizadoEm: agora,
        };

        const batch = db.batch();
        batch.set(checkoutSnapshot.ref, checkoutUpdate, { merge: true });
        batch.set(pagamentoRef, pagamentoUpdate, { merge: true });

        if (statusAtivaPlano) {
          batch.set(assinaturaRef, {
            plano: planoSolicitado,
            status: "active",
            vencimento: getDataInputValue(preapproval.next_payment_date),
            formaPagamento: "mercado_pago",
            valorPago,
            ativadoManual: false,
            mercadoPagoPreapprovalId: preapproval.id || preapprovalId,
            gateway: "mercado_pago",
            atualizadoEm: agora,
          }, { merge: true });
        }

        batch.set(logRef, {
          statusProcessamento: statusAtivaPlano
            ? "validated_subscription_activated"
            : "validated_status_registered",
          mercadoPagoPreapprovalId: preapproval.id || preapprovalId,
          statusMercadoPago,
          checkoutSessionId: checkoutSnapshot.id,
          userId: uid,
          planoSolicitado,
          assinaturaAtualizada: statusAtivaPlano,
          atualizadoEm: agora,
        }, { merge: true });

        await batch.commit();

        logger.info("Webhook Mercado Pago validado em modo teste", {
          logId: logRef.id,
          method: req.method,
          statusMercadoPago,
          assinaturaAtualizada: statusAtivaPlano,
        });

        res.status(200).json({
          ok: true,
          received: true,
          processed: true,
          assinaturaAtualizada: statusAtivaPlano,
          statusMercadoPago,
          logId: logRef.id,
        });
      } catch (error) {
        logger.error("Erro ao registrar webhook Mercado Pago", error);
        res.status(500).json({
          ok: false,
          error: "Erro ao registrar webhook.",
        });
      }
    });
  }
);
