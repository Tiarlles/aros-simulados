# AROS — Estado do Projeto

> Documento mantido pelo Claude. Última atualização: 06/05/2026.
> Use este arquivo pra retomar o contexto em uma nova sessão.

## Visão geral

**AROS** (Anest-Review · TSA Oral) — sistema de coordenação de simulados orais de anestesiologia.

- **Em produção:** GitHub Pages no repo público [`Tiarlles/aros-simulados`](https://github.com/Tiarlles/aros-simulados) (branch `main`, com CNAME pra domínio customizado).
- **Tipo:** SPA monolítico single-file (HTML+CSS+JS vanilla, ~7000 linhas em `index.html`).
- **Backend:** Firebase Firestore + 1 Cloud Function (webhook Hotmart).

## Arquitetura

| Camada | Tecnologia |
|---|---|
| Frontend | HTML + CSS (variáveis tema dark/light) + JS vanilla (sem framework) |
| Banco | Firebase Firestore (projeto `simulados-confirmacao`) |
| Auth | Sistema próprio (usuários custom em `usuarios/{id}`, senhas em plaintext — **dívida técnica conhecida**) |
| Email | EmailJS (`service_exyoa4r` / `template_r0vjejs`) |
| Pagamentos | Hotmart (produto "+3 Simulados Extras Online AROS!") |
| Notificações | Slack Incoming Webhook (canal `#notificacao-simulado-extra`) |
| Webhook backend | Cloud Function Gen 2 — `cloud-function-hotmart/index.js` |

## URLs e endpoints

- **Site público:** GitHub Pages (CNAME custom) — `https://github.com/Tiarlles/aros-simulados`
- **Cloud Function (webhook Hotmart):** `https://us-central1-simulados-confirmacao.cloudfunctions.net/hotmartWebhook` (alias) / `https://hotmartwebhook-57xrhneaga-uc.a.run.app` (Cloud Run)
- **Firebase Console:** `https://console.firebase.google.com/project/simulados-confirmacao`
- **Slack webhook:** `https://hooks.slack.com/services/T031WEPJTP1/B0B14STCHJB/...` (configurado no painel da coord + na Cloud Function)
- **HOTTOK Hotmart:** `OsFF2bcIisV1CutpLXkM5oMKQoXPSvce3d78aa-9a74-4911-b097-ee48eef8deae`

## Modelo de dados (Firestore)

```
simulados/{simId}                       — simulado (oficial OU extra com flag isExtra:true)
  ├ alunos/{alunoId}                    — aluno escalado (subcoleção)
  └ (campos: nome, dataSab, dataDom, deadline, limite, rodadasSab[], rodadasDom[], posProfs{}, isExtra?, historico?)

usuarios/{username}                     — usuários do painel da coord
  └ (campos: username, senha, nome, role, permissoes[])

listas/{listaId}                        — listas de alunos (cadastros)
  └ (campos: nome, alunos[{nome, email, matricula}])

solicitacoesExtra/{reqId}               — pedido de simulado extra
  └ (status: aguardando-pagamento | pago | efetivada | cancelada)

trocasDiretas/{trocaId}                 — propostas de troca direta entre alunos

notas/{simId}/alunos/{matricula}        — notas (criar, oral, notaFinal)
checklists/{simId}/meta/...             — template do checklist
checklists/{simId}/respostas/{aluno}    — respostas do checklist
disponibilidade/{simId}/profs/{key}     — disponibilidade de profs
feedbackGeral/{simId}                   — feedback geral

config/settings                         — config legacy (sendo migrado pra docs específicos)
config/professores                      — { lista: ['Nome 1', 'Nome 2', ...] }
config/menu                             — labels customizados do menu lateral
config/simExtra                         — { linkPagoAluno, linkPagoExterno, linkGratuito, slackWebhook, listaVigenteId, alunosGratuitos[] }
```

## Features principais

### Visão Aluno
- Cards de simulados futuros com barra de progresso por status (confirmados/swap/ausentes/pendentes)
- Resposta: confirmar / não irei / solicitar troca (com validação por email mascarado)
- Auto-troca FIFO ao solicitar (vaga direta + match casado)
- Box "Solicitar Simulado Extra" com fluxo multi-step (identificação → data/turno → confirmação)

### Visão Coordenação (sidebar agrupada)
- **Grupo Simulados:** Simulados, Trocas, Solicitação Sim Extra, Simulados Extras, Desempenho, Checklist
- **Grupo Cadastros:** Professores, Listas de Alunos
- **Grupo Administração:** Usuários, Configurações

### Sistema de auth
- Login usuário/senha custom (não usa Firebase Auth)
- Roles: `admin` (acesso total) ou `user` com `permissoes[]` granulares por aba
- Default admin criado no primeiro boot: `admin` / `aros2025`

### Solicitação Sim Extra (fluxo)
1. Aluno solicita → status `aguardando-pagamento`, link Hotmart com `?xcod={id}` anexado
2. Hotmart processa pagamento → webhook → Cloud Function lê `purchase.origin.xcod` → atualiza pra `pago` + dispara Slack
3. Coord adiciona aluno a um Simulado Extra → status vira `efetivada` + linka `simExtraId`

### Simulados Extras
- Aba separada na sidebar (grupo Simulados)
- Mesma coleção `simulados` mas com flag `isExtra:true`
- Não aparecem na home dos alunos
- Aparecem como coluna no Desempenho mas **NÃO contam pra Garantia de Aprovação**

### Garantia de Aprovação
- Aluno é "Elegível" se tem `notaFinal >= 60` em TODOS os simulados oficiais já aplicados (data passada, isExtra=false)
- "Não elegível" se algum < 60 (incluindo 0 ou ausência)
- "—" se não tem nenhuma nota

## Cloud Function (Hotmart)

Pasta: `cloud-function-hotmart/`

- Gen 2, Node 20, region `us-central1`, invoker `public`
- Lê env vars do `.env` (gitignored): `HOTMART_TOKEN`, `SLACK_WEBHOOK`
- Valida HOTTOK no header `X-HOTMART-HOTTOK` ou body
- Extrai `xcod` de `purchase.origin.xcod` (formato Hotmart 2.0.0)
- Atualiza `solicitacoesExtra/{xcod}` → status `pago` + `paidVia: 'hotmart'`
- Notifica Slack se `SLACK_WEBHOOK` configurado

**Deploy:** `cd "Sistema coordenação AROS" && npx -y firebase-tools deploy --only functions --force`

## Firestore Rules

Em `firestore.rules`. Pragmáticas (não restritivas):
- Default deny pra coleções desconhecidas
- Validação de shape (nome, email) em creates
- Block delete em `simulados/{simId}`, `config/{cfgId}`, `usuarios/{u}`, `solicitacoesExtra/{r}` (proteção contra catástrofe)
- Read aberto em quase tudo (porque o app não usa Firebase Auth)

**Pendência conhecida:** senhas plaintext em `usuarios` continuam legíveis. Solução real exige refactor pra Cloud Function de login.

## Dados históricos importados

- **Simulado 1 - Fevereiro** (`sim-1-fevereiro`, dataSab `2026-02-21`, `historico: true`)
- **Simulado 2 - Março** (`sim-2-marco`, dataSab `2026-03-21`, `historico: true`)
- **Simulado 3 - Abril** (`sim-3-abril`, dataSab `2026-04-25`, `historico: true`)

Importados via scripts em `/tmp/xlsx-reader/import.js` e `import-sim3.js`. Scripts usam Firebase JS SDK como cliente público.

## Comandos úteis

```bash
# Cloud Function — ver logs
cd "Sistema coordenação AROS"
npx -y firebase-tools functions:log --only hotmartWebhook --lines 50 2>&1 | grep -v "AuditLog"

# Cloud Function — redeploy após edit
npx -y firebase-tools deploy --only functions --force

# Configurar/atualizar env vars da Cloud Function
# Editar cloud-function-hotmart/.env, depois redeploy

# Dependências da Cloud Function
cd cloud-function-hotmart && npm install

# Scripts ad-hoc de dados (Node + Firebase JS SDK)
cd /tmp/xlsx-reader && node SCRIPT.js
```

## Convenções importantes

1. **Não rodar `git push`**: o usuário sobe o `index.html` manualmente pelo GitHub web (Add file → Upload files → substituir).
2. **Não criar arquivos .md** sem ele pedir (preferência declarada).
3. **Cloud Function = só ele faz deploy quando autoriza**. Não fazer deploy preventivo.
4. **Migrações no Firestore** são feitas via scripts Node em `/tmp/xlsx-reader/`. Não usamos Firebase Admin SDK (sem service account); usamos o Firebase JS SDK como cliente público — funciona porque as Rules permitem writes nos paths necessários.
5. **Nenhum `</script>` literal dentro de template literals JS** — splitar como `<scr` + `ipt>` pra não quebrar parser HTML.
6. **Quando referenciar simulados:** distinguir oficiais (`isExtra` ausente ou false) dos extras (`isExtra: true`). Filtros aplicados em: `renderSimCards`, `popCoSel`, `simsAplicados` (Garantia), seletor da aba Trocas.

## Pendências e dívidas técnicas

- [ ] Usuário precisa subir o `index.html` atual no GitHub Pages
- [ ] Senhas dos usuários estão em plaintext no Firestore (refactor pra Cloud Function de login resolveria)
- [ ] Slack webhook URL fica em `config/simExtra` (legível por quem ler o banco). Mover pra Cloud Function como proxy resolveria.
- [ ] Sem Firebase Auth → Rules tem proteção limitada (só shape validation + block deletes)
- [ ] Sem Firebase App Check → API key é usável por qualquer um com a URL

## Histórico recente (resumido)

- ✨ Solicitação de Simulado Extra com integração Hotmart (Cloud Function ativa)
- ⭐ Aba "Simulados Extras" pra gerenciar simulados privados pagos
- 🛡️ Firestore Rules pragmáticas aplicadas
- 🎯 Garantia de Aprovação por simulado aplicado (não por média)
- 📄 Export PDF do Desempenho com seleção de colunas
- 📊 Histórico Sim 1, 2, 3 importado via script
- 🔔 Slack notifica nova solicitação gratuita + pagamento confirmado
- 👥 Sistema de usuários com permissões granulares por aba
