# Firebase Functions - Renovar ERP

Base segura para a futura integração recorrente com Mercado Pago.

## Variáveis de ambiente

Crie um arquivo `.env` dentro desta pasta em ambiente local:

```env
MERCADO_PAGO_ACCESS_TOKEN=TEST-seu-token-de-teste
FRONTEND_BASE_URL=http://localhost:5173
```

Em produção, configure `MERCADO_PAGO_ACCESS_TOKEN` no ambiente seguro das Firebase Functions. O token nunca deve ser usado no front-end React.

Nesta fase inicial, use apenas token de teste iniciado por `TEST-`. A Function bloqueia tokens que não sejam de teste para evitar criação de assinaturas em produção antes da validação final.

`FRONTEND_BASE_URL` define a origem completa usada nas URLs de retorno do checkout. Use sempre URL absoluta com `http://` ou `https://`, sem caminho no final.

- `/pagamento/sucesso`
- `/pagamento/pendente`
- `/pagamento/erro`

Em teste local, a Function `criarCheckoutMercadoPago` permite chamadas CORS vindas de:

- `http://localhost:5173`
- `http://127.0.0.1:5173`

## Estado atual

- `criarCheckoutMercadoPago`: cria uma sessão pendente em `users/{uid}/checkoutSessions`. Com token de teste configurado, cria um preapproval real no Mercado Pago em modo teste.
- `webhookMercadoPago`: registra payloads recebidos em `logs/webhooksMercadoPago/eventos`, consulta o preapproval pela API do Mercado Pago e só atualiza assinatura quando o status validado estiver `authorized` ou `active`.
- A assinatura automática continua bloqueada para tokens de produção. Apenas tokens de teste `TEST-` são aceitos.
- Status como `cancelled`, `paused` ou `rejected` são registrados na sessão/pagamento, sem ativar plano.
- A ativação manual pelo Admin Master continua funcionando e pode ajustar o plano quando necessário.

## Próxima etapa futura

Quando o checkout real for ativado, a criação de assinatura/preapproval do Mercado Pago deve acontecer apenas aqui nas Functions, e a confirmação de plano deve depender de webhook validado.
