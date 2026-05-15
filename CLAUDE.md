# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Onde está o contexto

`PROJECT_STATE.md` é a fonte de verdade do estado do projeto (modelo de dados Firestore, URLs, endpoints, features, dívidas técnicas, histórico). **Leia primeiro ao iniciar uma sessão.** Mantenha esse arquivo atualizado quando mudanças relevantes acontecerem.

## Arquitetura

**AROS** (Anest-Review · TSA Oral) — sistema de coordenação de simulados orais. SPA monolítico single-file:

- `index.html` (~7000+ linhas) — frontend inteiro: HTML + CSS (vars dark/light) + JS vanilla, sem framework, sem build step. Carrega EmailJS e SheetJS via CDN. Persistência via Firebase JS SDK direto no cliente.
- `cloud-function-hotmart/index.js` — única Cloud Function (Gen 2, Node 20). Recebe webhook da Hotmart, valida HOTTOK, extrai `xcod` de `purchase.origin.xcod`, atualiza `solicitacoesExtra/{xcod}` no Firestore e notifica Slack.
- `firestore.rules` — regras pragmáticas: default deny, validação de shape em creates, block deletes em coleções críticas (`simulados`, `config`, `usuarios`, `solicitacoesExtra`), reads abertos (o app não usa Firebase Auth).
- `storage.rules`, `firebase.json`, `.firebaserc` (projeto `simulados-confirmacao`).

**Auth:** sistema próprio em `usuarios/{username}` (senhas plaintext — dívida conhecida). Roles `admin` ou `user` com `permissoes[]` granulares por aba. Default admin: `admin` / `aros2025`.

**Distinção crítica:** simulados **oficiais** (sem `isExtra` ou `isExtra:false`) vs **extras** (`isExtra:true`). Filtros aplicados em `renderSimCards`, `popCoSel`, `simsAplicados` (Garantia), seletor da aba Trocas. Extras não contam pra Garantia de Aprovação nem aparecem na home dos alunos.

## Comandos

```bash
# Cloud Function — logs
npx -y firebase-tools functions:log --only hotmartWebhook --lines 50 2>&1 | grep -v "AuditLog"

# Cloud Function — deploy (só quando o usuário autorizar)
npx -y firebase-tools deploy --only functions --force

# Deploy de regras Firestore
npx -y firebase-tools deploy --only firestore:rules

# Dependências da function
cd cloud-function-hotmart && npm install
```

Env vars da Cloud Function ficam em `cloud-function-hotmart/.env` (gitignored): `HOTMART_TOKEN`, `SLACK_WEBHOOK`. Editar e redeployar.

Não há build, lint, nem suíte de testes. Mudanças no `index.html` são validadas abrindo o arquivo no navegador.

## Convenções e restrições (importantes)

1. **Nunca rode `git push`.** O usuário sobe o `index.html` manualmente pelo GitHub web (Add file → Upload files → substituir) no repo público `Tiarlles/aros-simulados`. O diretório local não é um repo git.
2. **Não crie arquivos `.md`** sem o usuário pedir.
3. **Cloud Function: só deploy quando o usuário autorizar explicitamente.** Não faça deploy preventivo após edits.
4. **Migrações de dados** são feitas via scripts Node ad-hoc em `/tmp/xlsx-reader/` usando o **Firebase JS SDK como cliente público** (não Admin SDK — sem service account). Funciona porque as Rules permitem os writes necessários.
5. **Nunca coloque `</script>` literal dentro de template literals JS** no `index.html` — splitar como `` `<scr` + `ipt>` `` pra não quebrar o parser HTML.
6. Backups do `index.html` ficam em `Backup/index N.html`. Não editar.

## Modelo de dados resumido

Ver `PROJECT_STATE.md` pro detalhe. Coleções principais:
- `simulados/{simId}` + subcoleção `alunos/{alunoId}` (oficial ou extra via flag `isExtra`)
- `usuarios/{username}`, `listas/{listaId}`
- `solicitacoesExtra/{reqId}` (status: `aguardando-pagamento` → `pago` → `efetivada` | `cancelada`)
- `trocasDiretas/{trocaId}`, `notas/{simId}/alunos/{matricula}`, `checklists/{simId}/...`
- `config/{settings|professores|menu|simExtra}`

## Fluxo Hotmart → Simulado Extra

1. Aluno solicita → cria `solicitacoesExtra/{xcod}` com status `aguardando-pagamento`. Link Hotmart recebe `?xcod={id}` via `appendTrackingToLink`.
2. Hotmart processa pagamento → POST no webhook → Cloud Function valida HOTTOK, lê `purchase.origin.xcod`, atualiza pra `pago` + `paidVia:'hotmart'` + dispara Slack.
3. Coord adiciona o aluno a um Simulado Extra (`isExtra:true`) → status vira `efetivada` + linka `simExtraId`.
