# Webhook Hotmart → AROS · Passo a passo

## O que isso faz

Quando um aluno faz uma solicitação de simulado extra no AROS, o sistema gera um identificador (`xcod`) e anexa no link de pagamento da Hotmart. Quando o aluno paga, a Hotmart dispara um webhook nesta Cloud Function, que encontra a solicitação no Firestore e muda o status pra `pago` automaticamente.

## Pré-requisitos

- Já ter o projeto Firebase `simulados-confirmacao` (você já tem — é o mesmo que o AROS usa)
- Node.js 20+ instalado na sua máquina
- Conta Hotmart com produto cadastrado e acesso a "Webhooks" no painel

## Passo 1 · Instalar Firebase CLI

```bash
npm install -g firebase-tools
firebase login
```

## Passo 2 · Inicializar Functions no projeto

Abre um terminal na pasta do AROS:

```bash
cd "Sistema coordenação AROS"
firebase init functions
```

Quando perguntar:
- **Use existing project** → `simulados-confirmacao`
- **Language** → JavaScript
- **ESLint** → No (só pra simplificar)
- **Install dependencies now** → Yes

Isso cria uma pasta `functions/` no projeto.

## Passo 3 · Substituir o código

Copie o conteúdo de `cloud-function-hotmart/index.js` (deste repo) pra `functions/index.js`.

Copie também o `package.json` daqui pra `functions/package.json` (ou só ajusta as dependências pra bater).

## Passo 4 · (Opcional, mas recomendado) Configurar segurança

Crie um token aleatório longo e configure:

```bash
firebase functions:config:set hotmart.token="UM_TOKEN_LONGO_E_ALEATORIO_AQUI"
```

E o webhook do Slack se quiser que a function notifique direto:

```bash
firebase functions:config:set slack.webhook="https://hooks.slack.com/services/XXX/YYY/ZZZ"
```

## Passo 5 · Deploy

```bash
firebase deploy --only functions
```

No final do deploy, o terminal mostra a URL da função, algo assim:

```
hotmartWebhook(us-central1): https://us-central1-simulados-confirmacao.cloudfunctions.net/hotmartWebhook
```

**Copia essa URL.**

## Passo 6 · Configurar a Hotmart

1. Entre no painel Hotmart → **Ferramentas → Webhooks** (ou "Postback URL")
2. Cole a URL da função em **URL para envio**
3. Marque os eventos:
   - `PURCHASE_APPROVED` (compra aprovada — essencial)
   - `PURCHASE_REFUNDED` (estorno — opcional, marca como cancelada)
   - `PURCHASE_CHARGEBACK` (chargeback — opcional, marca como cancelada)
4. Se você configurou o token no Passo 4, cole o mesmo token no campo **HOTTOK** da Hotmart
5. **Salvar**

## Passo 7 · Testar

A Hotmart tem um botão "Disparar webhook de teste". Clique pra mandar um evento de teste. Veja o log no Firebase:

```bash
firebase functions:log
```

Você deve ver "Webhook recebido" e "Solicitação atualizada" (ou um aviso de "sem xcod" se for um teste sem produto real).

## Como o xcod é passado

No AROS, a função `appendTrackingToLink` adiciona `?xcod={id}` ao link de compra automaticamente. A Hotmart suporta esse parâmetro nativamente pra rastreamento e ele volta no payload do webhook nos campos:

- `tracking.source` (formato v2)
- `tracking_source` ou `SCK` (formato legacy)
- `source` ou `xcod` (variantes)

A função tenta todos.

## Troubleshooting

**"Sem xcod no payload"**: o link de compra que você colocou no AROS não foi gerado pelo sistema. Verifique se o link salvo em Configurações tem `?xcod=` — não deveria, porque o sistema adiciona automaticamente. Se tiver, remove e mantém só a URL base.

**"Solicitação não encontrada"**: o xcod chegou mas não bate com nenhum doc em `solicitacoesExtra`. Pode ser que o aluno tenha pago de um link antigo (antes da solicitação ser criada). Não é erro — apenas ignora.

**"Token inválido"**: o token configurado no Firebase não bate com o HOTTOK na Hotmart. Verifica os dois.

## Custo

A Cloud Function só roda quando há pagamento. No plano gratuito do Firebase (Spark), você tem 2 milhões de invocações grátis por mês — mais que suficiente.

Em alguns projetos, pra usar Cloud Functions é exigido o plano Blaze (pay-as-you-go). Se cair nessa exigência, ative — vai cobrar centavos só se ultrapassar o limite gratuito.
