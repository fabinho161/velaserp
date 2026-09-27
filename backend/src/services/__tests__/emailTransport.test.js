const test = require("node:test");
const assert = require("node:assert/strict");
const { enviarEmailConvite } = require("../emailConvites");
const { enviarEmail } = require("../emailTransport");

const comAmbienteEmail = async (callback) => {
  const anterior = {
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
    fetch: global.fetch,
  };
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  try {
    await callback();
  } finally {
    for (const [chave, valor] of Object.entries(anterior)) {
      if (chave === "fetch") global.fetch = valor;
      else if (valor === undefined) delete process.env[chave];
      else process.env[chave] = valor;
    }
  }
};

test("transporte generico preserva precedencia Resend sobre SendGrid", { concurrency: false }, async () => {
  await comAmbienteEmail(async () => {
    process.env.RESEND_API_KEY = "resend-test";
    process.env.SENDGRID_API_KEY = "sendgrid-test";
    const chamadas = [];
    global.fetch = async (url) => {
      chamadas.push(url);
      return { ok: true, json: async () => ({ id: "email-1" }) };
    };

    const resultado = await enviarEmail({
      assunto: "Assunto", html: "<p>Teste</p>", texto: "Teste", para: "cliente@exemplo.com",
    });

    assert.equal(resultado.provider, "resend");
    assert.deepEqual(chamadas, ["https://api.resend.com/emails"]);
  });
});

test("convites continuam utilizando o transporte compartilhado", { concurrency: false }, async () => {
  await comAmbienteEmail(async () => {
    process.env.RESEND_API_KEY = "resend-test";
    let payload;
    global.fetch = async (_url, options) => {
      payload = JSON.parse(options.body);
      return { ok: true, json: async () => ({ id: "convite-1" }) };
    };

    const resultado = await enviarEmailConvite({
      nome: "Convidado",
      nomeEmpresa: "Empresa",
      perfil: "Comercial",
      linkConvite: "https://app.exemplo/convite",
      para: "convite@exemplo.com",
    });

    assert.equal(resultado.provider, "resend");
    assert.equal(payload.to[0], "convite@exemplo.com");
    assert.match(payload.html, /Aceitar convite/);
  });
});
