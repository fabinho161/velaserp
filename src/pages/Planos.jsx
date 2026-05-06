import { useState } from "react";
import { Barcode, Copy, CreditCard, ExternalLink, QrCode, X } from "lucide-react";
import { PLANOS, getPlanoNivel } from "../config/planos";
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

const DESCRICOES_PLANOS_COMERCIAL = {
  gratis: "Entrada leve para acompanhar a operacao essencial sem area comercial.",
  basico: "Primeiro degrau comercial: vendas, clientes e historico simples.",
  profissional: "Camada de gestao: DRE, PDF profissional, CRM inteligente e follow-up.",
  premium: "Operacao completa com multiempresas, identidade visual e recursos premium.",
};

const boletoFormInicial = {
  first_name: "",
  last_name: "",
  cpf: "",
  zip_code: "",
  street_name: "",
  street_number: "",
  neighborhood: "",
  city: "",
  federal_unit: "",
};

const formatarVencimento = (valor) => {
  if (!valor) return "-";

  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? valor : data.toLocaleDateString("pt-BR");
};

export default function Planos() {
  const { showToast } = useToast();
  const { planoAtual, planoNivel, status } = usePlano();
  const [planoProcessando, setPlanoProcessando] = useState(null);
  const [modalPagamento, setModalPagamento] = useState(null);
  const [pagamentoLoading, setPagamentoLoading] = useState(false);
  const [pagamentoErro, setPagamentoErro] = useState("");
  const [pagamentoResultado, setPagamentoResultado] = useState(null);
  const [boletoForm, setBoletoForm] = useState(boletoFormInicial);

  const solicitarAtivacaoCartao = async (planoSolicitado) => {
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

  const prepararModal = (tipo, planoSolicitado, plano) => {
    setModalPagamento({ tipo, planoSolicitado, plano });
    setPagamentoErro("");
    setPagamentoResultado(null);
  };

  const fecharModalPagamento = () => {
    if (pagamentoLoading) return;
    setModalPagamento(null);
    setPagamentoErro("");
    setPagamentoResultado(null);
    setBoletoForm(boletoFormInicial);
  };

  const criarPagamentoAvulso = async (tipo, planoSolicitado, payer) => {
    try {
      setPagamentoLoading(true);
      setPagamentoErro("");

      const token = await auth.currentUser?.getIdToken();

      if (!token) {
        throw new Error("Faca login novamente para pagar um plano.");
      }

      const response = await fetch(`${API_URL}/api/${tipo}/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ planoSolicitado, payer }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "Nao foi possivel preparar o pagamento agora.");
      }

      setPagamentoResultado(data);
    } catch (error) {
      console.error(`Erro ao preparar pagamento ${tipo}:`, error);
      setPagamentoErro(error?.message || "Nao foi possivel preparar o pagamento agora.");
    } finally {
      setPagamentoLoading(false);
    }
  };

  const abrirPix = (planoSolicitado, plano) => {
    prepararModal("pix", planoSolicitado, plano);
    criarPagamentoAvulso("pix", planoSolicitado);
  };

  const abrirBoleto = (planoSolicitado, plano) => {
    const nomes = String(auth.currentUser?.displayName || "").trim().split(" ");
    prepararModal("boleto", planoSolicitado, plano);
    setBoletoForm({
      ...boletoFormInicial,
      first_name: nomes[0] || "",
      last_name: nomes.slice(1).join(" "),
    });
  };

  const atualizarCampoBoleto = (campo, valor) => {
    setBoletoForm((atual) => ({
      ...atual,
      [campo]: valor,
    }));
  };

  const gerarBoleto = (event) => {
    event.preventDefault();

    if (!modalPagamento) return;

    criarPagamentoAvulso("boleto", modalPagamento.planoSolicitado, {
      first_name: boletoForm.first_name,
      last_name: boletoForm.last_name,
      cpf: boletoForm.cpf,
      address: {
        zip_code: boletoForm.zip_code,
        street_name: boletoForm.street_name,
        street_number: boletoForm.street_number,
        neighborhood: boletoForm.neighborhood,
        city: boletoForm.city,
        federal_unit: boletoForm.federal_unit,
      },
    });
  };

  const copiarCodigoPix = async () => {
    if (!pagamentoResultado?.copia_cola) return;

    try {
      await navigator.clipboard.writeText(pagamentoResultado.copia_cola);
      showToast("Codigo PIX copiado.", "success");
    } catch (error) {
      console.error("Erro ao copiar PIX:", error);
      showToast("Nao foi possivel copiar automaticamente.", "error");
    }
  };

  const renderModalPagamento = () => {
    if (!modalPagamento) return null;

    const isPix = modalPagamento.tipo === "pix";
    const titulo = isPix ? "Pagamento via PIX" : "Boleto bancario";

    return (
      <div className="modal-overlay payment-modal-overlay">
        <section className="payment-modal-card">
          <div className="payment-modal-header">
            <div>
              <span>{modalPagamento.plano.nome}</span>
              <h3>{titulo}</h3>
            </div>

            <button
              type="button"
              className="payment-modal-close"
              onClick={fecharModalPagamento}
              disabled={pagamentoLoading}
              aria-label="Fechar modal de pagamento"
            >
              <X size={18} />
            </button>
          </div>

          <div className="payment-modal-summary">
            <strong>{moedaBR(modalPagamento.plano.preco)}</strong>
            <small>Status: {pagamentoResultado?.status || "aguardando pagamento"}</small>
          </div>

          {pagamentoLoading && (
            <div className="payment-modal-loading">
              <span />
              Preparando pagamento seguro...
            </div>
          )}

          {pagamentoErro && (
            <div className="payment-modal-error">
              {pagamentoErro}
            </div>
          )}

          {isPix && pagamentoResultado && (
            <div className="payment-pix-content">
              {pagamentoResultado.qr_code_base64 ? (
                <img
                  src={`data:image/png;base64,${pagamentoResultado.qr_code_base64}`}
                  alt="QRCode PIX"
                  className="payment-pix-qrcode"
                />
              ) : (
                <div className="payment-pix-empty">
                  <QrCode size={42} />
                </div>
              )}

              <label className="payment-code-field">
                <span>Codigo copia e cola</span>
                <textarea value={pagamentoResultado.copia_cola || ""} readOnly />
              </label>

              <button type="button" onClick={copiarCodigoPix} className="payment-secondary-button">
                <Copy size={17} />
                Copiar codigo PIX
              </button>

              <div className="payment-waiting-status">
                Aguardando confirmacao do Mercado Pago
              </div>
            </div>
          )}

          {!isPix && !pagamentoResultado && (
            <form onSubmit={gerarBoleto} className="payment-boleto-form">
              <div className="payment-form-grid">
                <label>
                  Nome
                  <input
                    value={boletoForm.first_name}
                    onChange={(e) => atualizarCampoBoleto("first_name", e.target.value)}
                    required
                  />
                </label>
                <label>
                  Sobrenome
                  <input
                    value={boletoForm.last_name}
                    onChange={(e) => atualizarCampoBoleto("last_name", e.target.value)}
                    required
                  />
                </label>
                <label>
                  CPF
                  <input
                    value={boletoForm.cpf}
                    onChange={(e) => atualizarCampoBoleto("cpf", e.target.value)}
                    inputMode="numeric"
                    required
                  />
                </label>
                <label>
                  CEP
                  <input
                    value={boletoForm.zip_code}
                    onChange={(e) => atualizarCampoBoleto("zip_code", e.target.value)}
                    inputMode="numeric"
                    required
                  />
                </label>
                <label className="payment-form-wide">
                  Rua
                  <input
                    value={boletoForm.street_name}
                    onChange={(e) => atualizarCampoBoleto("street_name", e.target.value)}
                    required
                  />
                </label>
                <label>
                  Numero
                  <input
                    value={boletoForm.street_number}
                    onChange={(e) => atualizarCampoBoleto("street_number", e.target.value)}
                    required
                  />
                </label>
                <label>
                  Bairro
                  <input
                    value={boletoForm.neighborhood}
                    onChange={(e) => atualizarCampoBoleto("neighborhood", e.target.value)}
                    required
                  />
                </label>
                <label>
                  Cidade
                  <input
                    value={boletoForm.city}
                    onChange={(e) => atualizarCampoBoleto("city", e.target.value)}
                    required
                  />
                </label>
                <label>
                  UF
                  <input
                    value={boletoForm.federal_unit}
                    onChange={(e) => atualizarCampoBoleto("federal_unit", e.target.value)}
                    maxLength={2}
                    required
                  />
                </label>
              </div>

              <button type="submit" disabled={pagamentoLoading}>
                <Barcode size={17} />
                Gerar boleto
              </button>
            </form>
          )}

          {!isPix && pagamentoResultado && (
            <div className="payment-boleto-content">
              <a
                href={pagamentoResultado.boleto_url}
                target="_blank"
                rel="noreferrer"
                className="payment-boleto-link"
              >
                <ExternalLink size={17} />
                Abrir boleto
              </a>

              <label className="payment-code-field">
                <span>Codigo de barras</span>
                <textarea value={pagamentoResultado.barcode || ""} readOnly />
              </label>

              <div className="payment-boleto-meta">
                <span>Vencimento</span>
                <strong>{formatarVencimento(pagamentoResultado.vencimento)}</strong>
              </div>

              <div className="payment-waiting-status">
                Aguardando confirmacao do Mercado Pago
              </div>
            </div>
          )}
        </section>
      </div>
    );
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

      <div className="plans-evolution">
        <span>Gratis</span>
        <span>Basico</span>
        <span>Profissional</span>
        <span>Premium</span>
      </div>

      <div className="plans-grid">
        {Object.entries(PLANOS).map(([chave, plano]) => {
          const ativo = chave === planoAtual;
          const planoOfertaNivel = getPlanoNivel(chave);
          const planoInferior = planoOfertaNivel < planoNivel;
          const planoAcima = planoOfertaNivel > planoNivel;
          const recomendado = chave === "profissional";

          return (
            <div
              key={chave}
              className={[
                "card",
                "plan-card",
                ativo ? "plan-card-active" : "",
                planoInferior ? "plan-card-disabled" : "",
                recomendado && !planoInferior ? "plan-card-recommended" : "",
              ].filter(Boolean).join(" ")}
            >
              <div className="plan-card-header">
                <span>{plano.nome}</span>
                <div className="plan-badges">
                  {ativo && <strong>Plano atual</strong>}
                  {planoInferior && <strong className="plan-badge-muted">Plano inferior</strong>}
                  {recomendado && !ativo && !planoInferior && <strong>Recomendado</strong>}
                </div>
              </div>

              <div className="plan-price">
                <h2>{moedaBR(plano.preco)}</h2>
                <small>/ mês sugerido</small>
              </div>

              <p className="plan-conversion-text">
                {DESCRICOES_PLANOS_COMERCIAL[chave] || DESCRICOES_PLANOS[chave]}
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

              {chave === "gratis" || ativo || planoInferior ? (
                <button type="button" className="plan-current-button" disabled>
                  {ativo ? "Plano atual" : planoInferior ? "Plano inferior" : "Plano gratuito"}
                </button>
              ) : (
                <div className="plan-payment-actions">
                  <button
                    type="button"
                    onClick={() => solicitarAtivacaoCartao(chave)}
                    disabled={planoProcessando === chave}
                  >
                    <CreditCard size={17} />
                    {planoProcessando === chave
                      ? "Preparando..."
                      : planoAcima
                        ? "Fazer upgrade"
                        : "Assinar com cartao"}
                  </button>
                  <button
                    type="button"
                    className="plan-payment-pix"
                    onClick={() => abrirPix(chave, plano)}
                  >
                    <QrCode size={17} />
                    Pagar com PIX
                  </button>
                  <button
                    type="button"
                    className="plan-payment-boleto"
                    onClick={() => abrirBoleto(chave, plano)}
                  >
                    <Barcode size={17} />
                    Gerar boleto
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {renderModalPagamento()}
    </div>
  );
}
