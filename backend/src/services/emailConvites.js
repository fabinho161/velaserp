const getEmailFrom = () =>
  process.env.EMAIL_FROM ||
  process.env.RESEND_FROM_EMAIL ||
  process.env.SENDGRID_FROM_EMAIL ||
  "Renovar ERP <convites@renovarerp.com.br>";

const escapeHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const montarConteudoConvite = ({ nome, nomeEmpresa, perfil, linkConvite }) => {
  const nomeSeguro = nome || "usuario";
  const texto = [
    `Ola, ${nomeSeguro}`,
    "",
    `Voce foi convidado para acessar a empresa ${nomeEmpresa} no Renovar ERP.`,
    "",
    `Perfil de acesso: ${perfil}`,
    "",
    "Clique no link abaixo para aceitar o convite:",
    linkConvite,
    "",
    "Se voce nao reconhece este convite, ignore este email.",
    "",
    "Atenciosamente,",
    "Equipe Renovar ERP",
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.5;">
      <p>Ola, ${escapeHtml(nomeSeguro)}</p>
      <p>Voce foi convidado para acessar a empresa <strong>${escapeHtml(nomeEmpresa)}</strong> no Renovar ERP.</p>
      <p><strong>Perfil de acesso:</strong> ${escapeHtml(perfil)}</p>
      <p>Clique no link abaixo para aceitar o convite:</p>
      <p>
        <a href="${escapeHtml(linkConvite)}" style="display:inline-block;padding:12px 16px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;">
          Aceitar convite
        </a>
      </p>
      <p style="word-break: break-all;">${escapeHtml(linkConvite)}</p>
      <p>Se voce nao reconhece este convite, ignore este email.</p>
      <p>Atenciosamente,<br />Equipe Renovar ERP</p>
    </div>
  `;

  return { html, texto };
};

const enviarComResend = async ({ assunto, html, texto, para }) => {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: getEmailFrom(),
      to: [para],
      subject: assunto,
      html,
      text: texto,
    }),
  });

  if (!response.ok) {
    const detalhe = await response.text();
    throw new Error(`Falha no Resend: ${response.status} ${detalhe}`);
  }

  return {
    provider: "resend",
    response: await response.json().catch(() => null),
  };
};

const enviarComSendGrid = async ({ assunto, html, texto, para }) => {
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: para }] }],
      from: { email: getEmailFrom().replace(/^.*<|>$/g, "") },
      subject: assunto,
      content: [
        { type: "text/plain", value: texto },
        { type: "text/html", value: html },
      ],
    }),
  });

  if (!response.ok) {
    const detalhe = await response.text();
    throw new Error(`Falha no SendGrid: ${response.status} ${detalhe}`);
  }

  return {
    provider: "sendgrid",
    response: null,
  };
};

const enviarEmailConvite = async ({ nome, nomeEmpresa, perfil, linkConvite, para }) => {
  const assunto = "Voce foi convidado para acessar o Renovar ERP";
  const { html, texto } = montarConteudoConvite({
    nome,
    nomeEmpresa,
    perfil,
    linkConvite,
  });

  if (process.env.RESEND_API_KEY) {
    return enviarComResend({ assunto, html, texto, para });
  }

  if (process.env.SENDGRID_API_KEY) {
    return enviarComSendGrid({ assunto, html, texto, para });
  }

  const error = new Error(
    "Nenhum provedor de email configurado. Configure RESEND_API_KEY ou SENDGRID_API_KEY."
  );
  error.code = "EMAIL_PROVIDER_NOT_CONFIGURED";
  throw error;
};

module.exports = {
  enviarEmailConvite,
};
