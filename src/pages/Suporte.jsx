import { Link } from "react-router-dom";
import {
  BookOpen,
  CheckCircle,
  ClipboardList,
  LifeBuoy,
  Mail,
  MessageCircle,
  Sparkles,
} from "lucide-react";

const WHATSAPP_URL = "https://wa.me/5564993286124";
const EMAIL_SUPORTE = "fabio.souza@renovarerp.com.br";
const EMAIL_URL = `mailto:${EMAIL_SUPORTE}`;

const checklistAntesSuporte = [
  "Verifique se os dados foram salvos corretamente.",
  "Consulte a Central de Aprendizagem.",
  "Informe o módulo onde ocorreu o problema.",
  "Envie print da tela, se possível.",
  "Informe seu e-mail de acesso e a empresa ativa.",
  "Descreva o passo a passo do que estava fazendo.",
];

const tiposAtendimento = [
  "Dúvidas de uso",
  "Erros ou bugs",
  "Dúvidas sobre planos",
  "Apoio em configuração inicial",
  "Orientação sobre produção, estoque, vendas e financeiro",
  "Melhorias e sugestões para o sistema",
];

const informacoesUteis = [
  "Nome da empresa",
  "E-mail de acesso",
  "Módulo onde ocorreu o problema",
  "Print da tela",
  "Descrição do que aconteceu",
  "Horário aproximado do erro, se houver",
];

export default function Suporte() {
  return (
    <div className="support-page">
      <header className="page-header support-hero">
        <div>
          <span className="support-eyebrow">
            <LifeBuoy size={16} />
            Ajuda oficial
          </span>
          <h1 className="page-title">Suporte Renovar ERP</h1>
          <p className="page-subtitle">
            Precisa de ajuda? Entre em contato com nosso suporte pelos canais oficiais.
          </p>
        </div>

        <div className="support-hero-contact">
          <span>WhatsApp / Telefone</span>
          <strong>(64) 9 99328-6124</strong>
          <small>{EMAIL_SUPORTE}</small>
        </div>
      </header>

      <section className="support-contact-grid">
        <article className="card support-contact-card support-whatsapp-card">
          <span className="support-card-icon">
            <MessageCircle size={24} />
          </span>
          <div>
            <h2>Atendimento pelo WhatsApp</h2>
            <p>
              Fale conosco pelo WhatsApp para dúvidas, suporte operacional,
              orientação de uso ou relato de problemas.
            </p>
          </div>
          <a
            className="support-card-button support-card-button-whatsapp"
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Chamar no WhatsApp
          </a>
        </article>

        <article className="card support-contact-card">
          <span className="support-card-icon support-card-icon-mail">
            <Mail size={24} />
          </span>
          <div>
            <h2>Atendimento por E-mail</h2>
            <p>
              Envie sua dúvida, solicitação ou relato de problema para nosso
              e-mail comercial.
            </p>
            <strong className="support-contact-value">{EMAIL_SUPORTE}</strong>
          </div>
          <a className="support-card-button" href={EMAIL_URL}>
            Enviar e-mail
          </a>
        </article>

        <article className="card support-contact-card">
          <span className="support-card-icon support-card-icon-learning">
            <BookOpen size={24} />
          </span>
          <div>
            <h2>Central de Aprendizagem</h2>
            <p>
              Consulte guias, tutoriais e perguntas frequentes para aprender a
              usar melhor o sistema.
            </p>
          </div>
          <Link className="support-card-button support-card-button-secondary" to="/central-aprendizagem">
            Acessar Central de Aprendizagem
          </Link>
        </article>
      </section>

      <section className="card section-card support-section-card">
        <div className="support-section-heading">
          <ClipboardList size={22} />
          <div>
            <h2>Antes de chamar o suporte</h2>
            <p>Essas informações ajudam a entender o caso com mais rapidez.</p>
          </div>
        </div>

        <div className="support-checklist-grid">
          {checklistAntesSuporte.map((item) => (
            <div className="support-checklist-item" key={item}>
              <CheckCircle size={18} />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card section-card support-section-card">
        <div className="support-section-heading">
          <LifeBuoy size={22} />
          <div>
            <h2>Tipos de atendimento</h2>
            <p>Canais oficiais para dúvidas, incidentes e orientação operacional.</p>
          </div>
        </div>

        <div className="support-service-grid">
          {tiposAtendimento.map((tipo) => (
            <span className="support-service-badge" key={tipo}>
              <Sparkles size={15} />
              {tipo}
            </span>
          ))}
        </div>
      </section>

      <section className="card section-card support-section-card support-info-card">
        <div className="support-section-heading">
          <CheckCircle size={22} />
          <div>
            <h2>Informações úteis para agilizar o atendimento</h2>
            <p>
              Para agilizar o suporte, envie o máximo de informações possível
              sobre o problema encontrado.
            </p>
          </div>
        </div>

        <div className="support-info-grid">
          {informacoesUteis.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </section>
    </div>
  );
}
