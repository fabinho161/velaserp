import { useCallback, useEffect, useRef, useState } from "react";
import {
  Barcode,
  BarChart3,
  Building2,
  CheckCircle2,
  Copy,
  CreditCard,
  Crown,
  ExternalLink,
  Factory,
  Layers3,
  Package,
  QrCode,
  Rocket,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
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
const MENSAGEM_PAGAMENTO_CONFIRMADO =
  "Pagamento confirmado! Plano ativado com sucesso.";

const DESCRICOES_PLANOS_COMERCIAL = {
  gratis: "Entrada leve para acompanhar a operacao essencial sem area comercial.",
  basico: "Primeiro degrau comercial: vendas, clientes e historico simples.",
  profissional: "Camada de gestao: DRE, PDF profissional, CRM inteligente e follow-up.",
  premium: "Operacao completa com multiempresas, identidade visual e recursos premium.",
};

const PLANOS_VISUAIS = {
  gratis: {
    Icone: Package,
    selo: "Entrada operacional",
    titulo: "Comece com a base da operacao organizada.",
    descricao:
      "Para validar processos, cadastrar dados essenciais e entender o fluxo do ERP sem compromisso.",
    idealPara: ["Micro operacoes", "Testes iniciais", "Rotina de cadastro"],
    cta: "Comecar gratis",
    tom: "starter",
  },
  basico: {
    Icone: Rocket,
    selo: "Comercial ativo",
    titulo: "Venda com mais controle e acompanhe clientes.",
    descricao:
      "Para empresas pequenas que precisam tirar vendas do improviso e ganhar previsibilidade comercial.",
    idealPara: ["Pequenas empresas", "Operacao comercial", "Primeira equipe"],
    cta: "Evoluir operacao",
    tom: "growth",
  },
  profissional: {
    Icone: Factory,
    selo: "Mais popular",
    titulo: "Gestao industrial e comercial em uma rotina completa.",
    descricao:
      "Para fabricas e operacoes que precisam conectar producao, vendas, DRE, CRM e indicadores.",
    idealPara: ["Fabricas", "Producao recorrente", "Gestao completa"],
    cta: "Escalar empresa",
    tom: "popular",
  },
  premium: {
    Icone: Crown,
    selo: "Operacao completa",
    titulo: "Controle avancado para crescimento multiempresa.",
    descricao:
      "Para equipes em expansao que precisam de multiempresa, personalizacao e recursos premium.",
    idealPara: ["Multiempresa", "Equipes maiores", "Expansao"],
    cta: "Operacao completa",
    tom: "enterprise",
  },
};

const SECOES_RECURSOS_PLANOS = {
  gratis: {
    Operacao: ["Dashboard basico", "Producao basica", "Estoque integrado", "Financeiro simples"],
    Comercial: ["Preparado para vendas nos planos superiores"],
    Gestao: ["Cadastros essenciais", "Controle operacional inicial"],
    "Recursos Premium": ["CRM, DRE e PDF profissional nos planos superiores"],
  },
  basico: {
    Operacao: ["Estoque integrado", "Controle operacional", "Vendas ilimitadas"],
    Comercial: ["Cadastro de clientes", "CRM basico", "Historico por cliente"],
    Gestao: ["Ate 2 empresas", "Ate 3 usuarios"],
    "Recursos Premium": ["DRE e automacoes comerciais nos planos superiores"],
  },
  profissional: {
    Operacao: ["Producao", "Estoque integrado", "Perdas e doacoes", "Controle fiscal"],
    Comercial: ["CRM inteligente", "Recompra prevista", "Follow-up comercial"],
    Gestao: ["Dashboard executivo", "DRE completo", "PDF profissional", "Convites e equipe"],
    "Recursos Premium": ["Relatorios premium e WhatsApp nos planos superiores"],
  },
  premium: {
    Operacao: ["Multiempresa", "Producao", "Estoque integrado", "Rastreabilidade operacional"],
    Comercial: ["CRM completo", "WhatsApp para clientes", "Contatos de hoje"],
    Gestao: ["Dashboard executivo", "Relatorios avancados", "Controle fiscal", "Convites e equipe"],
    "Recursos Premium": ["Identidade visual completa", "Prioridade no suporte"],
  },
};

const ICONES_SECAO_PLANO = {
  Operacao: Layers3,
  Comercial: Users,
  Gestao: BarChart3,
  "Recursos Premium": Sparkles,
  Limites: ShieldCheck,
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

const formatarLimitePlano = (plano) => {
  const limites = [
    plano.empresas === 1 ? "1 empresa" : `Ate ${plano.empresas} empresas`,
    plano.usuarios === 1 ? "1 usuario" : `Ate ${plano.usuarios} usuarios`,
    plano.vendasMes === 0
      ? "Vendas disponiveis nos planos superiores"
      : plano.vendasMes
        ? `Ate ${plano.vendasMes} vendas por mes`
        : "Vendas ilimitadas",
  ];

  const recursosSuperiores = (plano.limitacoes || []).map((limitacao) => {
    const recurso = String(limitacao)
      .replace(/^Sem\s+/i, "")
      .replace(/\s+$/, "");

    return `${recurso} disponivel nos planos superiores`;
  });

  return [...limites, ...recursosSuperiores].slice(0, 6);
};

const getStatusAssinaturaLabel = (status) => {
  const labels = {
    active: "Ativa",
    inactive: "Inativa",
    blocked: "Bloqueada",
  };

  return labels[status] || status || "Nao informado";
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
  const fechamentoAutomaticoRef = useRef(null);
  const confirmacaoFrameRef = useRef(null);

  const limparFechamentoAutomatico = useCallback(() => {
    if (fechamentoAutomaticoRef.current) {
      clearTimeout(fechamentoAutomaticoRef.current);
      fechamentoAutomaticoRef.current = null;
    }
  }, []);

  const limparConfirmacaoFrame = useCallback(() => {
    if (confirmacaoFrameRef.current) {
      cancelAnimationFrame(confirmacaoFrameRef.current);
      confirmacaoFrameRef.current = null;
    }
  }, []);

  const limparEstadoModalPagamento = useCallback(() => {
    limparFechamentoAutomatico();
    limparConfirmacaoFrame();
    setModalPagamento(null);
    setPagamentoErro("");
    setPagamentoResultado(null);
    setBoletoForm(boletoFormInicial);
  }, [limparConfirmacaoFrame, limparFechamentoAutomatico]);

  useEffect(() => {
    if (!modalPagamento) {
      limparFechamentoAutomatico();
      limparConfirmacaoFrame();
      return undefined;
    }

    const pagamentoLocalAprovado = pagamentoResultado?.status === "approved";
    const planoPixAtivado =
      modalPagamento.tipo === "pix" &&
      modalPagamento.planoSolicitado === planoAtual;

    if (!pagamentoLocalAprovado && !planoPixAtivado) {
      return undefined;
    }

    if (
      pagamentoResultado?.status !== "approved" ||
      pagamentoResultado?.mensagem !== MENSAGEM_PAGAMENTO_CONFIRMADO
    ) {
      limparConfirmacaoFrame();
      confirmacaoFrameRef.current = requestAnimationFrame(() => {
        confirmacaoFrameRef.current = null;
        setPagamentoResultado((resultadoAtual) => ({
          ...(resultadoAtual || {}),
          status: "approved",
          mensagem: MENSAGEM_PAGAMENTO_CONFIRMADO,
        }));
      });
    }

    limparFechamentoAutomatico();
    fechamentoAutomaticoRef.current = setTimeout(() => {
      limparEstadoModalPagamento();
    }, 2000);

    return () => {
      limparFechamentoAutomatico();
      limparConfirmacaoFrame();
    };
  }, [
    limparConfirmacaoFrame,
    limparEstadoModalPagamento,
    limparFechamentoAutomatico,
    modalPagamento,
    pagamentoResultado?.mensagem,
    pagamentoResultado?.status,
    planoAtual,
  ]);

  useEffect(() => {
    return () => {
      limparFechamentoAutomatico();
      limparConfirmacaoFrame();
    };
  }, [limparConfirmacaoFrame, limparFechamentoAutomatico]);

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
    limparEstadoModalPagamento();
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
    const pagamentoAprovado = pagamentoResultado?.status === "approved";
    const mensagemStatus = pagamentoAprovado
      ? MENSAGEM_PAGAMENTO_CONFIRMADO
      : "Aguardando confirmacao do Mercado Pago";

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

              <div
                className={
                  pagamentoAprovado
                    ? "payment-success-status"
                    : "payment-waiting-status"
                }
              >
                {mensagemStatus}
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

              <div
                className={
                  pagamentoAprovado
                    ? "payment-success-status"
                    : "payment-waiting-status"
                }
              >
                {mensagemStatus}
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
        <div className="plans-header-copy">
          <span className="plans-kicker">
            <Sparkles size={16} />
            Planos Renovar ERP
          </span>
          <h1 className="page-title">Escolha o plano ideal para o crescimento da sua operacao</h1>
          <p className="plans-hero-subtitle">
            Escolha o pacote ideal para operar vendas, estoque, produção e
            financeiro com recursos que acompanham o crescimento da empresa.
          </p>

          <p className="plans-hero-subtitle plans-hero-subtitle-modern">
            Comece gratis e evolua conforme sua empresa cresce, mantendo vendas,
            estoque, producao e gestao no mesmo ambiente.
          </p>

          <div className="plans-header-highlights" aria-label="Destaques dos planos">
            <span>
              <CheckCircle2 size={16} />
              Upgrade sem perder dados
            </span>
            <span>
              <Building2 size={16} />
              Preparado para multiempresa
            </span>
            <span>
              <ShieldCheck size={16} />
              Permissoes preservadas
            </span>
          </div>
        </div>

        <aside className="plans-current-summary" aria-label="Assinatura atual">
          <span className={`plans-status plans-status-${status}`}>
            {getStatusAssinaturaLabel(status)}
          </span>
          <strong>{PLANOS[planoAtual]?.nome || "Plano atual"}</strong>
          <small>Assinatura atual da empresa</small>
        </aside>
      </div>

      <div className="plans-evolution">
        <div>
          <strong>Mensal</strong>
          <span>Cobranca atual</span>
        </div>
        <div>
          <strong>Anual</strong>
          <span>Preparado para economia futura</span>
        </div>
        <div>
          <strong>Upgrade</strong>
          <span>Cresca sem trocar de sistema</span>
        </div>
        <div>
          <strong>Equipe</strong>
          <span>Convites e limites por plano</span>
        </div>
      </div>

      <div className="plans-grid">
        {Object.entries(PLANOS).map(([chave, plano]) => {
          const ativo = chave === planoAtual;
          const planoOfertaNivel = getPlanoNivel(chave);
          const planoInferior = planoOfertaNivel < planoNivel;
          const planoAcima = planoOfertaNivel > planoNivel;
          const recomendado = chave === "profissional";
          const visual = PLANOS_VISUAIS[chave] || PLANOS_VISUAIS.gratis;
          const IconePlano = visual.Icone;
          const secoes = SECOES_RECURSOS_PLANOS[chave] || {};
          const limitesPlano = formatarLimitePlano(plano);

          return (
            <div
              key={chave}
              className={[
                "plan-card",
                `plan-card-${visual.tom}`,
                ativo ? "plan-card-active" : "",
                planoInferior ? "plan-card-disabled" : "",
                recomendado && !planoInferior ? "plan-card-recommended" : "",
              ].filter(Boolean).join(" ")}
            >
              {recomendado && (
                <div className="plan-popular-ribbon">
                  <Sparkles size={15} />
                  Mais popular
                </div>
              )}

              <div className="plan-card-header">
                <div className="plan-title-block">
                  <span className="plan-icon">
                    <IconePlano size={22} />
                  </span>
                  <div>
                    <small>{visual.selo}</small>
                    <h2>{plano.nome}</h2>
                  </div>
                </div>
                <div className="plan-badges">
                  {ativo && <strong>Plano atual</strong>}
                  {planoInferior && <strong className="plan-badge-muted">Plano inferior</strong>}
                </div>
              </div>

              <div className="plan-price">
                <strong>{moedaBR(plano.preco)}</strong>
                <span>/ mes sugerido</span>
              </div>

              <div className="plan-positioning">
                <h3>{visual.titulo}</h3>
                <p>{visual.descricao}</p>
              </div>

              <div className="plan-ideal">
                <span>Ideal para</span>
                <div>
                  {visual.idealPara.map((item) => (
                    <small key={item}>{item}</small>
                  ))}
                </div>
              </div>

              <p className="plan-conversion-text">
                {DESCRICOES_PLANOS_COMERCIAL[chave] || DESCRICOES_PLANOS[chave]}
              </p>

              <div className="plan-sections">
                {Object.entries(secoes).map(([titulo, recursos]) => {
                  const IconeSecao = ICONES_SECAO_PLANO[titulo] || CheckCircle2;

                  return (
                    <section className="plan-section" key={titulo}>
                      <h3>
                        <IconeSecao size={15} />
                        {titulo}
                      </h3>
                      <ul>
                        {recursos.map((recurso) => (
                          <li key={recurso}>
                            <CheckCircle2 size={14} />
                            <span>{recurso}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })}

              {limitesPlano.length > 0 && (
                <div className="plan-section plan-limitations">
                  <h3>
                    <ShieldCheck size={15} />
                    Limites
                  </h3>
                  <ul>
                    {limitesPlano.map((limite) => (
                      <li key={limite}>
                        <CheckCircle2 size={14} />
                        <span>{limite}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              </div>

              {chave === "gratis" || ativo || planoInferior ? (
                <button type="button" className="plan-current-button" disabled>
                  {ativo
                    ? "Plano atual"
                    : planoInferior
                      ? "Seu plano atual e superior"
                      : visual.cta}
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
                        ? visual.cta
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
