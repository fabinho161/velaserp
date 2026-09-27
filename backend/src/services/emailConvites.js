const { enviarEmail } = require("./emailTransport");

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

const enviarEmailConvite = async ({ nome, nomeEmpresa, perfil, linkConvite, para }) => {
  const assunto = "Voce foi convidado para acessar o Renovar ERP";
  const { html, texto } = montarConteudoConvite({ nome, nomeEmpresa, perfil, linkConvite });
  return enviarEmail({ assunto, html, texto, para });
};

module.exports = { enviarEmailConvite };
