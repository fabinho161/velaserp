import { useState } from "react";
import { PLANOS } from "../config/planos";
import { usePlano } from "../hooks/usePlano";
import { useToast } from "../context/useToast";
import { moedaBR } from "../utils/formatters";
import { auth } from "../firebase";

const DESCRICOES_PLANOS = {
  gratis:
    "Ideal para começar, validar o fluxo e organizar os cadastros essenciais.",
  basico:
    "Para empresas que precisam vender sem limite mensal, controlar a operação e organizar sua carteira de clientes.",
  profissional:
    "A melhor escolha para operar com DRE, PDFs profissionais, identidade visual própria e CRM inteligente com recompra.",
  premium:
    "Para grupos, franquias ou operações com múltiplas empresas, CRM completo e prioridade de expansão.",
};

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:10000";

export default function Planos() {
  const { showToast } = useToast();
  const { planoAtual, status } = usePlano();
  const [planoProcessando, setPlanoProcessando] = useState(null);

  const solicitarAtivacao = async (planoSolicitado) => {
    if (planoSolicitado === "gratis") {
      showToast("O plano gratuito nao precisa de checkout.", "warning");
      return;
    }

    try {
      setPlanoProcessando(planoSolicitado);

      const token = await auth.currentUser?.getIdToken();

      if (!token) {
        throw new Error("Faça login novamente para assinar um plano.");
      }

      const response = await fetch(`${API_URL}/api/checkout/mercado-pago`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ planoSolicitado }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "Nao foi possivel preparar o checkout agora.");
      }

      if (data?.checkoutUrl) {
        window.location.assign(data.checkoutUrl);
        return;
      }

      showToast(
        data?.mensagem ||
          "Checkout preparado, mas ainda sem token real do Mercado Pago.",
        "success"
      );
    } catch (error) {
      console.error("Erro ao preparar checkout Mercado Pago:", error);
      showToast(
        error?.message || "Nao foi possivel preparar o checkout agora.",
        "error"
      );
    } finally {
      setPlanoProcessando(null);
    }
  };

  return (
    <div className="plans-page">
      <div className="plans-header">
        <div>
          <h1 className="page-title">Planos</h1>
          <p>
            Escolha o pacote ideal para operar vendas, estoque, produção e
            financeiro com recursos que acompanham o crescimento da empresa.
          </p>
        </div>

        <span className={`plans-status plans-status-${status}`}>
          Assinatura: {status}
        </span>
      </div>

      <div className="plans-grid">
        {Object.entries(PLANOS).map(([chave, plano]) => {
          const ativo = chave === planoAtual;
          const recomendado = chave === "profissional";

          return (
            <div
              key={chave}
              className={[
                "card",
                "plan-card",
                ativo ? "plan-card-active" : "",
                recomendado ? "plan-card-recommended" : "",
              ].filter(Boolean).join(" ")}
            >
              <div className="plan-card-header">
                <span>{plano.nome}</span>
                <div className="plan-badges">
                  {recomendado && <strong>Recomendado</strong>}
                  {ativo && <strong>Plano atual</strong>}
                </div>
              </div>

              <div className="plan-price">
                <h2>{moedaBR(plano.preco)}</h2>
                <small>/ mês sugerido</small>
              </div>

              <p className="plan-conversion-text">
                {DESCRICOES_PLANOS[chave]}
              </p>

              <div className="plan-section">
                <h3>Recursos</h3>
                <ul>
                  {plano.recursos.map((recurso) => (
                    <li key={recurso}>{recurso}</li>
                  ))}
                </ul>
              </div>

              {plano.limitacoes.length > 0 && (
                <div className="plan-section plan-limitations">
                  <h3>Limitações</h3>
                  <ul>
                    {plano.limitacoes.map((limitacao) => (
                      <li key={limitacao}>{limitacao}</li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                type="button"
                className={ativo ? "plan-current-button" : ""}
                onClick={ativo ? undefined : () => solicitarAtivacao(chave)}
                disabled={ativo || planoProcessando === chave}
              >
                {ativo
                  ? "Plano atual"
                  : planoProcessando === chave
                    ? "Preparando..."
                    : "Assinar agora"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
