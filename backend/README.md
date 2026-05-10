# Backend de Pagamentos - Renovar ERP

Backend Node/Express para Mercado Pago hospedado no Render.

Este backend cuida apenas de pagamentos:

- criar checkout/preapproval do Mercado Pago;
- receber webhook do Mercado Pago;
- validar o evento consultando a API do Mercado Pago;
- atualizar `users/{uid}/assinatura/plano` no Firestore somente quando o status validado for `authorized` ou `active`.
- enviar emails de convite de usuarios da empresa sem expor chaves no front-end.

Firebase Auth e Firestore continuam sendo usados. O token do Mercado Pago nunca deve ir para o front-end React.

## Rodar local

```bash
cd backend
npm install
npm run dev
```

Health check:

```txt
GET http://localhost:10000/health
```

## Variáveis de ambiente

Crie um `.env` dentro de `backend/` com:

```env
PORT=10000
NODE_ENV=production
FRONTEND_BASE_URL=https://renovarerp.com.br
MERCADO_PAGO_ACCESS_TOKEN=TEST-seu-token
FIREBASE_SERVICE_ACCOUNT_JSON={}
CORS_ORIGINS=https://renovarerp.com.br,http://localhost:5173,http://127.0.0.1:5173
ALLOW_PRODUCTION_PAYMENTS=false
EMAIL_FROM="Renovar ERP <convites@renovarerp.com.br>"
SMTP_HOST=
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=
SMTP_PASS=
RESEND_API_KEY=
SENDGRID_API_KEY=
```

`FIREBASE_SERVICE_ACCOUNT_JSON` deve receber o JSON completo da service account do Firebase. Não versione esse conteúdo.

Para envio real de convites, configure um provedor de email:

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`: credenciais SMTP, por exemplo Hostinger.
- `RESEND_API_KEY`: chave da Resend.
- `SENDGRID_API_KEY`: chave da SendGrid, usada se Resend nao estiver configurada.
- `EMAIL_FROM`: remetente validado no provedor, por exemplo `Renovar ERP <convites@seudominio.com>`.

Quando SMTP estiver configurado, ele sera usado primeiro. Se SMTP nao estiver configurado, o backend tenta Resend e depois SendGrid.

Nao coloque chaves reais no React ou no repositorio.

## Render

Configuração sugerida:

- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/health`
- Root Directory: `backend`

Configure as variáveis no painel do Render, não no código.

## Endpoints

Checkout:

```txt
POST /api/checkout/mercado-pago
Authorization: Bearer <firebase_id_token>
Content-Type: application/json
```

Body:

```json
{
  "planoSolicitado": "profissional"
}
```

Webhook:

```txt
POST /api/webhooks/mercado-pago
```

Configure essa URL no Mercado Pago usando a URL pública do Render.

Convites:

```txt
POST /api/convites/enviar
Authorization: Bearer <firebase_id_token>
Content-Type: application/json
```

Body:

```json
{
  "token": "token-do-convite"
}
```

O endpoint valida se o usuario autenticado e Admin Master ou Administrador da Empresa antes de enviar. O log do envio fica no convite, no usuario convidado e em `logs/convitesEmail/envios`.

## Segurança

- Não commitar `.env`.
- Não expor `MERCADO_PAGO_ACCESS_TOKEN` no React.
- Não expor `SMTP_PASS`, `RESEND_API_KEY` ou `SENDGRID_API_KEY` no React.
- Não ativar plano no clique do botão.
- O webhook sempre consulta o Mercado Pago antes de atualizar assinatura.
- Por enquanto `ALLOW_PRODUCTION_PAYMENTS=false` mantém o fluxo preso a token `TEST-`.
