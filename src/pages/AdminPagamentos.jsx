import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  collectionGroup,
  getDocs,
  limit,
  orderBy,
  query,
} from "firebase/firestore";
import { AlertTriangle, CheckCircle2, Clock3, RefreshCw } from "lucide-react";
import { auth, db } from "../firebase";
import { useToast } from "../context/useToast";
import { useERP } from "../context/useERP";
import { moedaBR } from "../utils/formatters";

const LIMITE_REGISTROS = 30;
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:10000";
const AVISO_DIAGNOSTICO_PARCIAL =
  "Diagnóstico carregado parcialmente. Checkout sessions e pagamentos foram consultados por usuário. Logs técnicos de webhook não estão disponíveis nesta tela por segurança.";

const formatarDataSistema = (valor) => {
  if (!valor) return "-";

  if (valor?.toDate) {
    return valor.toDate().toLocaleString("pt-BR");
  }

  if (valor instanceof Date) {
    return valor.toLocaleString("pt-BR");
  }

  if (typeof valor === "string") {
    const data = new Date(valor);
    return Number.isNaN(data.getTime()) ? valor : data.toLocaleString("pt-BR");
  }

  return "-";
};

const obterTempoSistema = (valor) => {
  if (!valor) return 0;
  if (valor?.toDate) return valor.toDate().getTime();
  if (valor instanceof Date) return valor.getTime();

  if (typeof valor === "string") {
    const data = new Date(valor);
    return Number.isNaN(data.getTime()) ? 0 : data.getTime();
  }

  return 0;
};

const getUidFromDoc = (docSnap) => {
  return docSnap.ref.parent.parent?.id || "";
};

const isPermissionError = (error) => {
  return error?.code === "permission-denied" ||
    String(error?.message || "").toLowerCase().includes("permission");
};

const ordenarPorAtualizacao = (items) => {
  return [...items].sort((a, b) =>
    obterTempoSistema(b.atualizadoEm || b.criadoEm) -
    obterTempoSistema(a.atualizadoEm || a.criadoEm)
  );
};

const limitarRegistros = (items) => ordenarPorAtualizacao(items).slice(0, LIMITE_REGISTROS);

const normalizarStatus = (status) => {
  return String(status || "pendente").toLowerCase();
};

const getStatusClass = (status) => {
  const normalizado = normalizarStatus(status);

  if (["active", "authorized", "approved"].includes(normalizado)) {
    return "success";
  }

  if (["cancelled", "paused", "rejected", "error", "failed"].includes(normalizado)) {
    return "danger";
  }

  return "warning";
};

export default function AdminPagamentos() {
  const { showToast } = useToast();
  const { isAdminMaster } = useERP();
  const webhooksTecnicosIndisponiveisRef = useRef(false);
  const [carregando, setCarregando] = useState(true);
  const [checkoutSessions, setCheckoutSessions] = useState([]);
  const [pagamentos, setPagamentos] = useState([]);
  const [webhooks, setWebhooks] = useState([]);
  const [usuarios, setUsuarios] = useState({});
  const [erroPermissao, setErroPermissao] = useState("");
  const [ambienteMercadoPago, setAmbienteMercadoPago] = useState({
    tipo: "unknown",
    texto: "Verificando ambiente Mercado Pago",
  });

  const carregarUsuarios = useCallback(async () => {
    const usuariosSnapshot = await getDocs(collection(db, "users"));

    return usuariosSnapshot.docs.reduce((acc, userDoc) => {
      acc[userDoc.id] = {
        uid: userDoc.id,
        ...userDoc.data(),
      };
      return acc;
    }, {});
  }, []);

  const carregarSubcolecaoPorUsuarios = useCallback(async (mapaUsuarios, colecao) => {
    const leituras = await Promise.allSettled(
      Object.keys(mapaUsuarios).map(async (uid) => {
        const snapshot = await getDocs(collection(db, "users", uid, colecao));
        return snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          uid,
          path: docSnap.ref.path,
          ...docSnap.data(),
        }));
      })
    );

    return limitarRegistros(
      leituras.flatMap((resultado) =>
        resultado.status === "fulfilled" ? resultado.value : []
      )
    );
  }, []);

  const carregarCollectionGroupComFallback = useCallback(
    async (mapaUsuarios, colecao) => {
      try {
        const snapshot = await getDocs(
          query(
            collectionGroup(db, colecao),
            orderBy("atualizadoEm", "desc"),
            limit(LIMITE_REGISTROS)
          )
        );

        return {
          data: snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            uid: getUidFromDoc(docSnap),
            path: docSnap.ref.path,
            ...docSnap.data(),
          })),
          permissaoNegada: false,
        };
      } catch (error) {
        if (!isPermissionError(error)) throw error;

        const data = await carregarSubcolecaoPorUsuarios(mapaUsuarios, colecao);
        return {
          data,
          permissaoNegada: true,
        };
      }
    },
    [carregarSubcolecaoPorUsuarios]
  );

  const carregarWebhooksTecnicos = useCallback(async (mapaUsuarios) => {
    if (webhooksTecnicosIndisponiveisRef.current) {
      return {
        data: await carregarSubcolecaoPorUsuarios(mapaUsuarios, "webhooksMercadoPago"),
        permissaoNegada: true,
      };
    }

    try {
      const snapshot = await getDocs(
        query(
          collection(db, "logs", "webhooksMercadoPago", "eventos"),
          orderBy("atualizadoEm", "desc"),
          limit(LIMITE_REGISTROS)
        )
      );

      return {
        data: snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          path: docSnap.ref.path,
          ...docSnap.data(),
        })),
        permissaoNegada: false,
      };
    } catch (error) {
      if (!isPermissionError(error)) throw error;

      webhooksTecnicosIndisponiveisRef.current = true;
      return {
        data: await carregarSubcolecaoPorUsuarios(mapaUsuarios, "webhooksMercadoPago"),
        permissaoNegada: true,
      };
    }
  }, [carregarSubcolecaoPorUsuarios]);

  const carregarAmbienteMercadoPago = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/health`);
      const data = await response.json().catch(() => ({}));
      const mercadoPago = data?.mercadoPago || {};

      if (mercadoPago.producaoHabilitada) {
        return {
          tipo: "production",
          texto: "Produção Mercado Pago habilitada",
        };
      }

      if (mercadoPago.tokenTipo === "TEST") {
        return {
          tipo: "test",
          texto: "Ambiente de teste Mercado Pago",
        };
      }

      return {
        tipo: "blocked",
        texto: "Produção Mercado Pago aguardando configuração segura",
      };
    } catch (error) {
      console.warn("Nao foi possivel verificar ambiente Mercado Pago:", error);
      return {
        tipo: "unknown",
        texto: "Ambiente Mercado Pago não confirmado nesta tela",
      };
    }
  }, []);

  const carregarDiagnosticoBackend = useCallback(async () => {
    const token = await auth.currentUser?.getIdToken();

    if (!token) {
      throw new Error("Sessão expirada. Faça login novamente.");
    }

    const response = await fetch(`${API_URL}/api/admin/pagamentos/diagnostico`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data?.error || "Não foi possível carregar o diagnóstico administrativo.");
    }

    return data;
  }, []);

  const carregarDiagnostico = useCallback(async () => {
    setCarregando(true);
    setErroPermissao("");

    try {
      if (!isAdminMaster) {
        setCheckoutSessions([]);
        setPagamentos([]);
        setWebhooks([]);
        setUsuarios({});
        setErroPermissao("Apenas administradores master podem acessar o diagnostico de pagamentos.");
        return;
      }

      const [mapaUsuarios, ambienteAtual] = await Promise.all([
        carregarUsuarios(),
        carregarAmbienteMercadoPago(),
      ]);

      try {
        const diagnosticoBackend = await carregarDiagnosticoBackend();

        setAmbienteMercadoPago(ambienteAtual);
        setUsuarios(diagnosticoBackend.usuarios || mapaUsuarios);
        setCheckoutSessions(diagnosticoBackend.checkoutSessions || []);
        setPagamentos(diagnosticoBackend.pagamentos || []);
        setWebhooks(diagnosticoBackend.webhooks || []);
        setErroPermissao("");
        return;
      } catch (backendError) {
        console.warn("Diagnóstico via backend indisponível, usando leitura Firestore client:", backendError);
      }

      const [checkoutResult, pagamentosResult, webhooksResult] = await Promise.allSettled([
        carregarCollectionGroupComFallback(mapaUsuarios, "checkoutSessions"),
        carregarCollectionGroupComFallback(mapaUsuarios, "pagamentos"),
        carregarWebhooksTecnicos(mapaUsuarios),
      ]);

      let diagnosticoParcial = false;

      const checkoutData = checkoutResult.status === "fulfilled"
        ? checkoutResult.value.data
        : [];
      const pagamentosData = pagamentosResult.status === "fulfilled"
        ? pagamentosResult.value.data
        : [];
      const webhooksData = webhooksResult.status === "fulfilled"
        ? webhooksResult.value.data
        : [];

      if (checkoutResult.status === "fulfilled" && checkoutResult.value.permissaoNegada) {
        diagnosticoParcial = true;
      }

      if (pagamentosResult.status === "fulfilled" && pagamentosResult.value.permissaoNegada) {
        diagnosticoParcial = true;
      }

      if (webhooksResult.status === "fulfilled" && webhooksResult.value.permissaoNegada) {
        diagnosticoParcial = true;
      }

      if (webhooksResult.status === "rejected") throw webhooksResult.reason;

      if (checkoutResult.status === "rejected") throw checkoutResult.reason;
      if (pagamentosResult.status === "rejected") throw pagamentosResult.reason;

      setAmbienteMercadoPago(ambienteAtual);
      setUsuarios(mapaUsuarios);
      setCheckoutSessions(checkoutData);
      setPagamentos(pagamentosData);
      setWebhooks(webhooksData);
      setErroPermissao(diagnosticoParcial ? AVISO_DIAGNOSTICO_PARCIAL : "");
    } catch (error) {
      console.error("Erro ao carregar diagnostico de pagamentos:", error);
      if (isPermissionError(error)) {
        setErroPermissao(
          "Sem permissao para carregar todos os dados do diagnostico com as regras atuais do Firestore."
        );
      } else {
        showToast("Erro ao carregar diagnostico de pagamentos.", "error");
      }
    } finally {
      setCarregando(false);
    }
  }, [
    carregarAmbienteMercadoPago,
    carregarCollectionGroupComFallback,
    carregarDiagnosticoBackend,
    carregarUsuarios,
    carregarWebhooksTecnicos,
    isAdminMaster,
    showToast,
  ]);

  useEffect(() => {
    // Tela administrativa de leitura carregada sob AdminRoute.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregarDiagnostico();
  }, [carregarDiagnostico]);

  const webhooksPorChave = useMemo(() => {
    return webhooks.reduce((acc, webhook) => {
      const chaves = [
        webhook.checkoutSessionId,
        webhook.pagamentoId,
        webhook.mercadoPagoPreapprovalId,
        webhook.mercadoPagoPaymentId,
        webhook.paymentId,
      ].filter(Boolean);

      chaves.forEach((chave) => {
        const atual = acc[chave];
        const atualTempo = obterTempoSistema(atual?.atualizadoEm || atual?.criadoEm);
        const novoTempo = obterTempoSistema(webhook.atualizadoEm || webhook.criadoEm);

        if (!atual || novoTempo >= atualTempo) {
          acc[chave] = webhook;
        }
      });

      return acc;
    }, {});
  }, [webhooks]);

  const resumo = useMemo(() => {
    const sessoesPendentes = checkoutSessions.filter((sessao) =>
      ["pending", "pendente"].includes(normalizarStatus(sessao.statusCheckout))
    ).length;
    const sessoesAprovadas = checkoutSessions.filter((sessao) =>
      ["approved", "active", "authorized"].includes(
        normalizarStatus(sessao.statusCheckout || sessao.statusMercadoPago)
      )
    ).length;
    const errosWebhook = webhooks.filter((webhook) =>
      ["validation_failed", "blocked_non_test_token"].includes(
        normalizarStatus(webhook.statusProcessamento)
      ) || Boolean(webhook.erroValidacao)
    ).length;

    return {
      sessoes: checkoutSessions.length,
      pagamentos: pagamentos.length,
      sessoesPendentes,
      sessoesAprovadas,
      webhooks: webhooks.length,
      errosWebhook,
    };
  }, [checkoutSessions, pagamentos, webhooks]);

  const AmbienteMercadoPagoIcon = ambienteMercadoPago.tipo === "production"
    ? CheckCircle2
    : ambienteMercadoPago.tipo === "test"
      ? Clock3
      : AlertTriangle;

  const renderUsuario = (uid) => {
    const usuario = usuarios[uid];

    return (
      <div className="admin-payment-user">
        <strong>{usuario?.email || "Usuario nao encontrado"}</strong>
        <small>{uid || "-"}</small>
      </div>
    );
  };

  const renderStatus = (status) => (
    <span className={`admin-payment-status admin-payment-status-${getStatusClass(status)}`}>
      {status || "-"}
    </span>
  );

  return (
    <div className="admin-page admin-payments-page">
      <div className="admin-header page-header">
        <div>
          <h1 className="page-title">Diagnostico de Pagamentos</h1>
          <p className="page-subtitle">
            Audite sessoes de checkout, pagamentos e webhooks do Mercado Pago antes de liberar producao.
          </p>
        </div>

        <button onClick={carregarDiagnostico} disabled={carregando}>
          <RefreshCw size={17} />
          {carregando ? "Atualizando..." : "Atualizar diagnostico"}
        </button>
      </div>

      {erroPermissao && (
        <div className="admin-permission-alert">
          <AlertTriangle size={18} />
          <span>{erroPermissao}</span>
        </div>
      )}

      <div className="admin-summary-grid">
        <div className="card admin-metric admin-metric-blue">
          <p>Checkout sessions</p>
          <h2>{resumo.sessoes}</h2>
          <small>Ultimas sessoes criadas</small>
        </div>

        <div className="card admin-metric admin-metric-green">
          <p>Aprovadas</p>
          <h2>{resumo.sessoesAprovadas}</h2>
          <small>Status autorizado/ativo</small>
        </div>

        <div className="card admin-metric admin-metric-amber">
          <p>Pendentes</p>
          <h2>{resumo.sessoesPendentes}</h2>
          <small>Aguardando compensacao</small>
        </div>

        <div className="card admin-metric admin-metric-red">
          <p>Erros webhook</p>
          <h2>{resumo.errosWebhook}</h2>
          <small>Validacao ou token</small>
        </div>
      </div>

      <div className="card admin-payment-checklist">
        <h3>Checklist de auditoria</h3>
        <div className="admin-payment-checklist-grid">
          <span>
            <CheckCircle2 size={18} />
            Tela somente leitura
          </span>
          <span>
            <CheckCircle2 size={18} />
            Admin Master protegido por rota
          </span>
          <span>
            <Clock3 size={18} />
            Assinatura alterada apenas pelo webhook validado
          </span>
          <span>
            <AmbienteMercadoPagoIcon size={18} />
            {ambienteMercadoPago.texto}
          </span>
        </div>
      </div>

      <div className="card admin-table-card">
        <h3>CheckoutSessions recentes</h3>

        {carregando ? (
          <p className="admin-muted">Carregando sessoes...</p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Plano</th>
                  <th>Status checkout</th>
                  <th>Status Mercado Pago</th>
                  <th>ID Mercado Pago</th>
                  <th>Criado em</th>
                  <th>Atualizado em</th>
                  <th>Erro webhook</th>
                </tr>
              </thead>
              <tbody>
                {checkoutSessions.map((sessao) => {
                  const webhook =
                    webhooksPorChave[sessao.id] ||
                    webhooksPorChave[sessao.mercadoPagoPreapprovalId];

                  return (
                    <tr key={sessao.path}>
                      <td>{renderUsuario(sessao.uid || sessao.userId)}</td>
                      <td>{sessao.planoSolicitado || "-"}</td>
                      <td>{renderStatus(sessao.statusCheckout)}</td>
                      <td>{renderStatus(sessao.statusMercadoPago || sessao.mercadoPagoStatus)}</td>
                      <td className="admin-payment-code">
                      {sessao.mercadoPagoPreapprovalId ||
                        sessao.mercadoPagoPaymentId ||
                        sessao.paymentId ||
                        "-"}
                      </td>
                      <td>{formatarDataSistema(sessao.criadoEm)}</td>
                      <td>{formatarDataSistema(sessao.atualizadoEm)}</td>
                      <td className="admin-payment-error">
                        {webhook?.erroValidacao ||
                          webhook?.statusProcessamento ||
                          "-"}
                      </td>
                    </tr>
                  );
                })}

                {checkoutSessions.length === 0 && (
                  <tr>
                    <td colSpan="8">Nenhum registro encontrado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card admin-table-card">
        <h3>Pagamentos recentes</h3>

        {carregando ? (
          <p className="admin-muted">Carregando pagamentos...</p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Plano</th>
                  <th>Status pagamento</th>
                  <th>Status Mercado Pago</th>
                  <th>Valor</th>
                  <th>ID Mercado Pago</th>
                  <th>Atualizado em</th>
                </tr>
              </thead>
              <tbody>
                {pagamentos.map((pagamento) => (
                  <tr key={pagamento.path}>
                    <td>{renderUsuario(pagamento.uid || pagamento.userId)}</td>
                    <td>{pagamento.planoSolicitado || "-"}</td>
                    <td>{renderStatus(pagamento.statusPagamento)}</td>
                    <td>{renderStatus(pagamento.statusMercadoPago || pagamento.mercadoPagoStatus)}</td>
                    <td>{moedaBR(pagamento.valor || 0)}</td>
                    <td className="admin-payment-code">
                      {pagamento.mercadoPagoPreapprovalId || pagamento.paymentId || "-"}
                    </td>
                    <td>{formatarDataSistema(pagamento.atualizadoEm || pagamento.criadoEm)}</td>
                  </tr>
                ))}

                {pagamentos.length === 0 && (
                  <tr>
                    <td colSpan="7">Nenhum registro encontrado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card admin-table-card">
        <h3>Webhooks recentes</h3>

        {carregando ? (
          <p className="admin-muted">Carregando webhooks...</p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Status processamento</th>
                  <th>Status Mercado Pago</th>
                  <th>Usuario</th>
                  <th>Plano</th>
                  <th>ID Mercado Pago</th>
                  <th>Erro</th>
                  <th>Recebido em</th>
                </tr>
              </thead>
              <tbody>
                {webhooks.map((webhook) => (
                  <tr key={webhook.path || webhook.id}>
                    <td>{renderStatus(webhook.statusProcessamento)}</td>
                    <td>{renderStatus(webhook.statusMercadoPago)}</td>
                    <td>{renderUsuario(webhook.userId)}</td>
                    <td>{webhook.planoSolicitado || "-"}</td>
                    <td className="admin-payment-code">
                      {webhook.mercadoPagoPreapprovalId ||
                        webhook.mercadoPagoPaymentId ||
                        webhook.paymentId ||
                        "-"}
                    </td>
                    <td className="admin-payment-error">{webhook.erroValidacao || "-"}</td>
                    <td>{formatarDataSistema(webhook.atualizadoEm || webhook.criadoEm)}</td>
                  </tr>
                ))}

                {webhooks.length === 0 && (
                  <tr>
                    <td colSpan="7">Nenhum registro encontrado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
