import { useCallback, useEffect, useMemo, useState } from "react";
import {
  collection,
  collectionGroup,
  getDocs,
  limit,
  orderBy,
  query,
} from "firebase/firestore";
import { AlertTriangle, CheckCircle2, Clock3, RefreshCw } from "lucide-react";
import { db } from "../firebase";
import { useToast } from "../context/useToast";
import { moedaBR } from "../utils/formatters";

const LIMITE_REGISTROS = 30;

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
  const [carregando, setCarregando] = useState(true);
  const [checkoutSessions, setCheckoutSessions] = useState([]);
  const [pagamentos, setPagamentos] = useState([]);
  const [webhooks, setWebhooks] = useState([]);
  const [usuarios, setUsuarios] = useState({});

  const carregarDiagnostico = useCallback(async () => {
    setCarregando(true);

    try {
      const checkoutQuery = query(
        collectionGroup(db, "checkoutSessions"),
        orderBy("atualizadoEm", "desc"),
        limit(LIMITE_REGISTROS)
      );
      const pagamentosQuery = query(
        collectionGroup(db, "pagamentos"),
        orderBy("atualizadoEm", "desc"),
        limit(LIMITE_REGISTROS)
      );
      const webhooksQuery = query(
        collection(db, "logs", "webhooksMercadoPago", "eventos"),
        orderBy("atualizadoEm", "desc"),
        limit(LIMITE_REGISTROS)
      );

      const [
        checkoutSnapshot,
        pagamentosSnapshot,
        webhooksSnapshot,
        usuariosSnapshot,
      ] = await Promise.all([
        getDocs(checkoutQuery),
        getDocs(pagamentosQuery),
        getDocs(webhooksQuery),
        getDocs(collection(db, "users")),
      ]);

      const mapaUsuarios = usuariosSnapshot.docs.reduce((acc, userDoc) => {
        acc[userDoc.id] = {
          uid: userDoc.id,
          ...userDoc.data(),
        };
        return acc;
      }, {});

      setUsuarios(mapaUsuarios);
      setCheckoutSessions(
        checkoutSnapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          uid: getUidFromDoc(docSnap),
          path: docSnap.ref.path,
          ...docSnap.data(),
        }))
      );
      setPagamentos(
        pagamentosSnapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          uid: getUidFromDoc(docSnap),
          path: docSnap.ref.path,
          ...docSnap.data(),
        }))
      );
      setWebhooks(
        webhooksSnapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }))
      );
    } catch (error) {
      console.error("Erro ao carregar diagnostico de pagamentos:", error);
      showToast("Erro ao carregar diagnostico de pagamentos.", "error");
    } finally {
      setCarregando(false);
    }
  }, [showToast]);

  useEffect(() => {
    // Tela administrativa de leitura carregada sob AdminRoute.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregarDiagnostico();
  }, [carregarDiagnostico]);

  const webhooksPorChave = useMemo(() => {
    return webhooks.reduce((acc, webhook) => {
      const chaves = [
        webhook.checkoutSessionId,
        webhook.mercadoPagoPreapprovalId,
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
            <AlertTriangle size={18} />
            Producao ainda bloqueada por token TEST-
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
                  <th>Preapproval ID</th>
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
                        {sessao.mercadoPagoPreapprovalId || "-"}
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
                    <td colSpan="8">Nenhuma checkoutSession encontrada.</td>
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
                  <th>Preapproval ID</th>
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
                    <td colSpan="7">Nenhum pagamento encontrado.</td>
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
                  <th>Preapproval ID</th>
                  <th>Erro</th>
                  <th>Recebido em</th>
                </tr>
              </thead>
              <tbody>
                {webhooks.map((webhook) => (
                  <tr key={webhook.id}>
                    <td>{renderStatus(webhook.statusProcessamento)}</td>
                    <td>{renderStatus(webhook.statusMercadoPago)}</td>
                    <td>{renderUsuario(webhook.userId)}</td>
                    <td>{webhook.planoSolicitado || "-"}</td>
                    <td className="admin-payment-code">
                      {webhook.mercadoPagoPreapprovalId || "-"}
                    </td>
                    <td className="admin-payment-error">{webhook.erroValidacao || "-"}</td>
                    <td>{formatarDataSistema(webhook.atualizadoEm || webhook.criadoEm)}</td>
                  </tr>
                ))}

                {webhooks.length === 0 && (
                  <tr>
                    <td colSpan="7">Nenhum webhook encontrado.</td>
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
