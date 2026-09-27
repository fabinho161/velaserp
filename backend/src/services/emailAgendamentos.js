const { normalizarServicosAgendamento } = require("../shared/agendaOperacional.cjs");
const { enviarEmail } = require("./emailTransport");

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const formatarDataCivil = (data) => {
  const partes = String(data || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : String(data || "");
};

const formatarDuracao = (minutos) => {
  const total = Number(minutos);
  if (!Number.isInteger(total) || total < 0) return "Não informada";
  const horas = Math.floor(total / 60);
  const restantes = total % 60;
  if (!horas) return `${restantes}min`;
  return restantes ? `${horas}h${String(restantes).padStart(2, "0")}` : `${horas}h`;
};

const formatarCep = (valor) => {
  const cep = String(valor || "").replace(/\D/g, "").slice(0, 8);
  return cep.length === 8 ? `${cep.slice(0, 5)}-${cep.slice(5)}` : String(valor || "").trim();
};

const montarLinhasEnderecoEmpresa = (configuracaoEmpresa = {}) => {
  const endereco = configuracaoEmpresa?.endereco;
  if (!endereco || typeof endereco !== "object" || Array.isArray(endereco)) {
    const cidadeLegado = String(configuracaoEmpresa?.cidade || "").trim();
    return cidadeLegado ? [cidadeLegado] : [];
  }

  const logradouro = String(endereco.logradouro || "").trim();
  const numero = String(endereco.numero || "").trim();
  const bairro = String(endereco.bairro || "").trim();
  const complemento = String(endereco.complemento || "").trim();
  const cidade = String(endereco.cidade || "").trim();
  const uf = String(endereco.uf || "").trim().toUpperCase();
  const cep = formatarCep(endereco.cep);
  const linhaPrincipal = [logradouro, numero].filter(Boolean).join(", ");
  const localidade = cidade && uf ? `${cidade}/${uf}` : cidade || uf;
  const linhaLocalidade = [localidade, cep ? `CEP ${cep}` : ""].filter(Boolean).join(" — ");

  return [
    [linhaPrincipal, bairro].filter(Boolean).join(" — "),
    complemento ? `Complemento: ${complemento}` : "",
    linhaLocalidade,
  ].filter(Boolean);
};

const montarConteudoConfirmacaoAgendamento = ({ agendamento = {}, nomeEmpresa, configuracaoEmpresa }) => {
  const nomesServicos = normalizarServicosAgendamento(agendamento).map((item) => item.servicoNome);
  if (nomesServicos.length === 0 && agendamento.servicoNome) {
    nomesServicos.push(String(agendamento.servicoNome).trim());
  }
  const empresa = String(nomeEmpresa || "Renovar ERP").trim();
  const cliente = String(agendamento.clienteNome || "cliente").trim();
  const listaTexto = nomesServicos.length ? nomesServicos.map((nome) => `- ${nome}`).join("\n") : "Não informado";
  const listaHtml = nomesServicos.length
    ? `<ul>${nomesServicos.map((nome) => `<li>${escapeHtml(nome)}</li>`).join("")}</ul>`
    : "<p>Não informado</p>";
  const data = formatarDataCivil(agendamento.data);
  const duracao = formatarDuracao(agendamento.duracaoMinutos);
  const horario = `${agendamento.horaInicio || ""} às ${agendamento.horaFim || ""}`;
  const assunto = `Agendamento confirmado — ${empresa}`;
  const linhasEndereco = montarLinhasEnderecoEmpresa(configuracaoEmpresa);
  const enderecoTexto = linhasEndereco.length ? ["Endereço:", ...linhasEndereco, ""] : [];
  const enderecoHtml = linhasEndereco.length
    ? `<p><strong>Endereço:</strong><br />${linhasEndereco.map(escapeHtml).join("<br />")}</p>`
    : "";
  const texto = [
    `Olá, ${cliente}!`, "", "Seu agendamento foi confirmado.", "",
    "Empresa:", empresa, "", ...enderecoTexto, "Serviço(s):", listaTexto, "",
    "Data:", data, "", "Horário:", horario, "", "Duração:", duracao, "",
    "Caso precise alterar ou cancelar o agendamento, entre em contato com a empresa.",
  ].join("\n");
  const html = `
    <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.5;">
      <p>Olá, <strong>${escapeHtml(cliente)}</strong>!</p>
      <p>Seu agendamento foi confirmado.</p>
      <p><strong>Empresa:</strong><br />${escapeHtml(empresa)}</p>
      ${enderecoHtml}
      <p><strong>Serviço(s):</strong></p>${listaHtml}
      <p><strong>Data:</strong><br />${escapeHtml(data)}</p>
      <p><strong>Horário:</strong><br />${escapeHtml(horario)}</p>
      <p><strong>Duração:</strong><br />${escapeHtml(duracao)}</p>
      <p>Caso precise alterar ou cancelar o agendamento, entre em contato com a empresa.</p>
    </div>
  `;
  return { assunto, html, texto };
};

const enviarEmailConfirmacaoAgendamento = async ({ agendamento, nomeEmpresa, configuracaoEmpresa, para }) =>
  enviarEmail({
    ...montarConteudoConfirmacaoAgendamento({ agendamento, nomeEmpresa, configuracaoEmpresa }),
    para,
  });

module.exports = {
  enviarEmailConfirmacaoAgendamento,
  formatarDataCivil,
  formatarDuracao,
  montarLinhasEnderecoEmpresa,
  montarConteudoConfirmacaoAgendamento,
};
