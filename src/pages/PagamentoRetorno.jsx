import { Link } from "react-router-dom";
import { CheckCircle2, Clock3, CreditCard, LayoutDashboard, XCircle } from "lucide-react";

const STATUS_CONFIG = {
  sucesso: {
    icon: CheckCircle2,
    className: "success",
    badge: "Pagamento recebido",
    title: "Pagamento iniciado com sucesso",
    message:
      "Recebemos o retorno do checkout. A ativacao do plano sera confirmada apos compensacao e validacao do pagamento.",
    note:
      "Nenhum plano foi ativado automaticamente nesta etapa. A assinatura continua dependendo da confirmacao segura.",
  },
  pendente: {
    icon: Clock3,
    className: "pending",
    badge: "Aguardando compensacao",
    title: "Pagamento pendente",
    message:
      "Seu pagamento ainda esta em processamento. A ativacao sera confirmada assim que a compensacao for concluida.",
    note:
      "Enquanto isso, seu plano atual permanece ativo normalmente.",
  },
  erro: {
    icon: XCircle,
    className: "error",
    badge: "Pagamento nao concluido",
    title: "Nao foi possivel concluir o pagamento",
    message:
      "O checkout retornou uma falha ou foi interrompido. Nenhuma alteracao foi feita na sua assinatura.",
    note:
      "Voce pode voltar aos planos e tentar novamente quando quiser.",
  },
};

export default function PagamentoRetorno({ status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pendente;
  const Icon = config.icon;

  return (
    <div className="payment-return-page">
      <section className={`card payment-return-card payment-return-${config.className}`}>
        <div className="payment-return-icon">
          <Icon size={34} />
        </div>

        <span className="payment-return-badge">{config.badge}</span>

        <div>
          <h1 className="page-title">{config.title}</h1>
          <p className="payment-return-message">{config.message}</p>
        </div>

        <div className="payment-return-note">
          {config.note}
        </div>

        <div className="payment-return-actions">
          <Link to="/" className="payment-return-button payment-return-primary">
            <LayoutDashboard size={18} />
            Voltar ao Dashboard
          </Link>

          <Link to="/planos" className="payment-return-button payment-return-secondary">
            <CreditCard size={18} />
            Ver Planos
          </Link>
        </div>
      </section>
    </div>
  );
}
