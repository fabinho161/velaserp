const nodemailer = require("nodemailer");

const getEmailFrom = () =>
  process.env.EMAIL_FROM || process.env.RESEND_FROM_EMAIL || process.env.SENDGRID_FROM_EMAIL ||
  "Renovar ERP <convites@renovarerp.com.br>";

const isSmtpConfigurado = () =>
  Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const parseSmtpSecure = () => {
  const valor = String(process.env.SMTP_SECURE || "").trim().toLowerCase();
  if (["true", "1", "yes", "sim"].includes(valor)) return true;
  if (["false", "0", "no", "nao", "não"].includes(valor)) return false;
  return Number(process.env.SMTP_PORT || 0) === 465;
};

const getSmtpPort = () => {
  const port = Number(process.env.SMTP_PORT || "");
  return Number.isFinite(port) && port > 0 ? port : (parseSmtpSecure() ? 465 : 587);
};

const enviarComResend = async ({ assunto, html, texto, para }) => {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: getEmailFrom(), to: [para], subject: assunto, html, text: texto }),
  });
  if (!response.ok) {
    const detalhe = await response.text();
    throw new Error(`Falha no Resend: ${response.status} ${detalhe}`);
  }
  return { provider: "resend", response: await response.json().catch(() => null) };
};

const enviarComSendGrid = async ({ assunto, html, texto, para }) => {
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: para }] }],
      from: { email: getEmailFrom().replace(/^.*<|>$/g, "") },
      subject: assunto,
      content: [{ type: "text/plain", value: texto }, { type: "text/html", value: html }],
    }),
  });
  if (!response.ok) {
    const detalhe = await response.text();
    throw new Error(`Falha no SendGrid: ${response.status} ${detalhe}`);
  }
  return { provider: "sendgrid", response: null };
};

const enviarComSmtp = async ({ assunto, html, texto, para }) => {
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: getSmtpPort(),
    secure: parseSmtpSecure(),
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  const response = await transport.sendMail({ from: getEmailFrom(), to: para, subject: assunto, text: texto, html });
  return {
    provider: "smtp",
    response: {
      messageId: response.messageId || null,
      accepted: response.accepted || [],
      rejected: response.rejected || [],
    },
  };
};

const enviarEmail = async (conteudo) => {
  if (isSmtpConfigurado()) return enviarComSmtp(conteudo);
  if (process.env.RESEND_API_KEY) return enviarComResend(conteudo);
  if (process.env.SENDGRID_API_KEY) return enviarComSendGrid(conteudo);
  const error = new Error(
    "Nenhum provedor de email configurado. Configure SMTP_HOST/SMTP_USER/SMTP_PASS, RESEND_API_KEY ou SENDGRID_API_KEY."
  );
  error.code = "EMAIL_PROVIDER_NOT_CONFIGURED";
  throw error;
};

module.exports = { enviarEmail };
