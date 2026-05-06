import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  collectionGroup,
  getDocs,
  limit,
  orderBy,
  query,
} from "firebase/firestore";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Copy,
  CreditCard,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Webhook,
} from "lucide-react";
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

  if (["cancelled", "canceled", "paused"].includes(normalizado)) {
    return "neutral";
  }

  if (["rejected", "error", "failed"].includes(normalizado)) {
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
  const [limpezaCarregando, setLimpezaCarregando] = useState(false);
  const [limpezaExecutando, setLimpezaExecutando] = useState(false);
  const [previewLimpeza, setPreviewLimpeza] = useState(null);
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

  const chamarAdminBackend = useCallback(async (path, options = {}) => {
    const token = await auth.currentUser?.getIdToken();

    if (!token) {
      throw new Error("Sessão expirada. Faça login novamente.");
    }

    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data?.error || "Não foi possível executar a operação administrativa.");
    }

    return data;
  }, []);

  const carregarDiagnosticoBackend = useCallback(() => {
    return chamarAdminBackend("/api/admin/pagamentos/diagnostico");
  }, [chamarAdminBackend]);

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
        setErroPermissao(
          diagnosticoBackend.parcial
            ? "Diagnóstico carregado com avisos. Alguns registros técnicos não puderam ser lidos, mas os dados disponíveis foram exibidos."
            : ""
        );
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

  const abrirModalLimpezaTeste = useCallback(async () => {
    try {
      setLimpezaCarregando(true);

      const preview = await chamarAdminBackend("/api/admin/pagamentos/limpeza-testes/preview");
      const resumoPreview = preview.resumo || {};
      const total = Number(resumoPreview.total || 0);

      if (total === 0) {
        showToast("Nenhum registro de teste elegível para limpeza.", "success");
        return;
      }

      setPreviewLimpeza(preview);
    } catch (error) {
      console.error("Erro ao preparar limpeza de teste:", error);
      showToast(error?.message || "Erro ao preparar limpeza de testes.", "error");
    } finally {
      setLimpezaCarregando(false);
    }
  }, [chamarAdminBackend, showToast]);

  const fecharModalLimpeza = () => {
    if (limpezaExecutando) return;
    setPreviewLimpeza(null);
  };

  const confirmarLimpezaTeste = useCallback(async () => {
    try {
      setLimpezaExecutando(true);

      await chamarAdminBackend("/api/admin/pagamentos/limpeza-testes", {
        method: "POST",
        body: JSON.stringify({ confirmar: true }),
      });

      showToast("Registros de teste removidos com sucesso.", "success");
      setPreviewLimpeza(null);
      await carregarDiagnostico();
    } catch (error) {
      console.error("Erro ao limpar registros de teste:", error);
      showToast(error?.message || "Erro ao limpar registros de teste.", "error");
    } finally {
      setLimpezaExecutando(false);
    }
  }, [carregarDiagnostico, chamarAdminBackend, showToast]);

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

  const ultimaAtualizacao = useMemo(() => {
    const registros = [...checkoutSessions, ...pagamentos, ...webhooks];
    const ultimoTempo = registros.reduce((maior, registro) => {
      return Math.max(
        maior,
        obterTempoSistema(registro.atualizadoEm || registro.criadoEm)
      );
    }, 0);

    return ultimoTempo ? new Date(ultimoTempo).toLocaleString("pt-BR") : "Sem registros";
  }, [checkoutSessions, pagamentos, webhooks]);

  const metricCards = [
    {
      label: "Checkout sessions",
      value: resumo.sessoes,
      helper: "Ultimas sessoes criadas",
      className: "admin-metric-blue",
      icon: CreditCard,
    },
    {
      label: "Aprovadas",
      value: resumo.sessoesAprovadas,
      helper: "Status autorizado/ativo",
      className: "admin-metric-green",
      icon: CheckCircle2,
    },
    {
      label: "Pendentes",
      value: resumo.sessoesPendentes,
      helper: "Aguardando compensacao",
      className: "admin-metric-amber",
      icon: Clock3,
    },
    {
      label: "Erros webhook",
      value: resumo.errosWebhook,
      helper: "Validacao ou token",
      className: "admin-metric-red",
      icon: AlertTriangle,
    },
  ];

  const checklistItems = [
    {
      label: "Tela somente leitura",
      badge: "Ativo",
      icon: ShieldCheck,
      tone: "success",
    },
    {
      label: "Admin Master protegido por rota",
      badge: "Ativo",
      icon: CheckCircle2,
      tone: "success",
    },
    {
      label: "Assinatura alterada apenas pelo webhook validado",
      badge: "Monitorado",
      icon: Webhook,
      tone: "warning",
    },
    {
      label: ambienteMercadoPago.texto,
      badge: ambienteMercadoPago.tipo === "production" ? "Producao" : "Ambiente",
      icon: AmbienteMercadoPagoIcon,
      tone: ambienteMercadoPago.tipo === "production" ? "success" : "warning",
    },
  ];

  const copiarId = async (valor) => {
    if (!valor || valor === "-") return;

    try {
      await navigator.clipboard.writeText(valor);
      showToast("ID Mercado Pago copiado.", "success");
    } catch (error) {
      console.error("Erro ao copiar ID Mercado Pago:", error);
      showToast("Nao foi possivel copiar o ID.", "error");
    }
  };

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

  const renderMercadoPagoId = (valor) => {
    const id = valor || "-";

    return (
      <div className="admin-payment-id">
        <span title={id}>{id}</span>
        {valor && (
          <button
            type="button"
            className="admin-copy-button"
            onClick={() => copiarId(valor)}
            aria-label="Copiar ID Mercado Pago"
          >
            <Copy size={14} />
          </button>
        )}
      </div>
    );
  };

  const resumoLimpeza = previewLimpeza?.resumo || {};

  return (
    <div className="admin-page admin-payments-page">
      <div className="admin-header page-header admin-payments-hero">
        <div>
          <span className="admin-payments-eyebrow">
            <Activity size={15} />
            Mercado Pago Monitor
          </span>
          <h1 className="page-title">Diagnostico de Pagamentos</h1>
          <p className="page-subtitle">
            Central de monitoramento financeiro integrada ao Mercado Pago.
          </p>
          <small className="admin-payments-last-update">
            Ultima atualizacao: {ultimaAtualizacao}
          </small>
        </div>

        <div className="admin-payments-actions">
          <button
            type="button"
            className="admin-cleanup-button"
            onClick={abrirModalLimpezaTeste}
            disabled={carregando || limpezaCarregando || limpezaExecutando}
          >
            <Trash2 size={17} />
            {limpezaCarregando ? "Verificando..." : "Limpar testes"}
          </button>

          <button onClick={carregarDiagnostico} disabled={carregando}>
            <RefreshCw size={17} />
            {carregando ? "Atualizando..." : "Atualizar diagnostico"}
          </button>
        </div>
      </div>

      {erroPermissao && (
        <div className="admin-permission-alert">
          <AlertTriangle size={18} />
          <span>{erroPermissao}</span>
        </div>
      )}

      <div className="admin-summary-grid">
        {metricCards.map((metric) => {
          const Icon = metric.icon;

          return (
            <div className={`card admin-metric ${metric.className}`} key={metric.label}>
              <div className="admin-metric-topline">
                <p>{metric.label}</p>
                <span>
                  <Icon size={19} />
                </span>
              </div>
              <h2>{metric.value}</h2>
              <small>{metric.helper}</small>
            </div>
          );
        })}
      </div>

      <div className="card admin-payment-checklist">
        <div className="admin-table-card-header">
          <div>
            <h3>Checklist de auditoria</h3>
            <p>Controles principais para acompanhar a saude do fluxo financeiro.</p>
          </div>
        </div>
        <div className="admin-payment-checklist-grid">
          {checklistItems.map((item) => {
            const Icon = item.icon;

            return (
              <div className={`admin-audit-status admin-audit-status-${item.tone}`} key={item.label}>
                <span className="admin-audit-icon">
                  <Icon size={18} />
                </span>
                <div>
                  <strong>{item.label}</strong>
                  <small>{item.badge}</small>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card admin-table-card">
        <div className="admin-table-card-header">
          <div>
            <h3>CheckoutSessions recentes</h3>
            <p>Eventos de checkout gerados por cartao, PIX e boleto.</p>
          </div>
          <span>{checkoutSessions.length} registros</span>
        </div>

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
                        {renderMercadoPagoId(
                          sessao.mercadoPagoPreapprovalId ||
                            sessao.mercadoPagoPaymentId ||
                            sessao.paymentId
                        )}
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
        <div className="admin-table-card-header">
          <div>
            <h3>Pagamentos recentes</h3>
            <p>Transacoes registradas com valor, status e origem financeira.</p>
          </div>
          <span>{pagamentos.length} registros</span>
        </div>

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
                      {renderMercadoPagoId(
                        pagamento.mercadoPagoPreapprovalId ||
                          pagamento.mercadoPagoPaymentId ||
                          pagamento.paymentId
                      )}
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
        <div className="admin-table-card-header">
          <div>
            <h3>Webhooks recentes</h3>
            <p>Eventos recebidos e processados pelo backend de pagamentos.</p>
          </div>
          <span>{webhooks.length} registros</span>
        </div>

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
                      {renderMercadoPagoId(
                        webhook.mercadoPagoPreapprovalId ||
                          webhook.mercadoPagoPaymentId ||
                          webhook.paymentId
                      )}
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

      {previewLimpeza && (
        <div className="admin-cleanup-modal-overlay" role="dialog" aria-modal="true">
          <section className="admin-cleanup-modal-card">
            <div className="admin-cleanup-modal-icon">
              <AlertTriangle size={24} />
            </div>

            <div className="admin-cleanup-modal-header">
              <span>Limpeza administrativa</span>
              <h3>Remover registros de teste?</h3>
              <p>
                Esta acao remove somente registros com valor R$ 1,00 e status
                pending, cancelled ou expired.
              </p>
            </div>

            <div className="admin-cleanup-summary-grid">
              <div>
                <span>CheckoutSessions</span>
                <strong>{resumoLimpeza.checkoutSessions || 0}</strong>
              </div>
              <div>
                <span>Pagamentos</span>
                <strong>{resumoLimpeza.pagamentos || 0}</strong>
              </div>
              <div>
                <span>Total</span>
                <strong>{resumoLimpeza.total || 0}</strong>
              </div>
            </div>

            <div className="admin-cleanup-safety">
              <div>
                <CheckCircle2 size={17} />
                Registros approved nao serao apagados.
              </div>
              <div>
                <CheckCircle2 size={17} />
                Registros acima de R$ 1,00 nao serao apagados.
              </div>
            </div>

            <div className="admin-cleanup-modal-actions">
              <button
                type="button"
                className="admin-cleanup-cancel"
                onClick={fecharModalLimpeza}
                disabled={limpezaExecutando}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="admin-cleanup-confirm"
                onClick={confirmarLimpezaTeste}
                disabled={limpezaExecutando}
              >
                {limpezaExecutando && <span className="admin-cleanup-spinner" />}
                {limpezaExecutando ? "Limpando..." : "Limpar testes"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
