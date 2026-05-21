# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Onde está o contexto

**IMPORTANTE — invoque `/aros-contexto` ANTES da primeira ação técnica em qualquer sessão deste projeto.** A skill `.claude/skills/aros-contexto/SKILL.md` é a fonte de verdade do estado do projeto: arquitetura completa, modelo de dados Firestore, todas as features (Solicitar NF, Pendências, admin granular, Revisão de Casos, Mentorias, Recursos, etc), URLs, dívidas técnicas, decisões de design e convenções de fluxo.

Esta CLAUDE.md tem só o **mínimo** pra você não fazer besteira antes de carregar o contexto completo. A skill atualiza automaticamente conforme features mudam — confie nela, não nesta CLAUDE.

`PROJECT_STATE.md` legado foi esvaziado (vira só redirecionador). Não tente lê-lo.

## Arquitetura

**AROS** (Anest-Review · TSA Oral) — sistema de coordenação de simulados orais. SPA monolítico single-file:

- `index.html` (~7000+ linhas) — frontend inteiro: HTML + CSS (vars dark/light) + JS vanilla, sem framework, sem build step. Carrega EmailJS e SheetJS via CDN. Persistência via Firebase JS SDK direto no cliente.
- `cloud-function-hotmart/index.js` — única Cloud Function (Gen 2, Node 20). Recebe webhook da Hotmart, valida HOTTOK, extrai `xcod` de `purchase.origin.xcod`, atualiza `solicitacoesExtra/{xcod}` no Firestore e notifica Slack.
- `firestore.rules` — regras pragmáticas: default deny, reads abertos (alunos navegam sem login), writes em coleções coord/prof exigem `request.auth.uid` (Firebase Auth) após apertamento de 2026-05-21. Fluxos anônimos de aluno preservados via exceções por coleção (solicitacoesExtra create, trocasDiretas, checklists/respostas, clinicas/alunos, provas/contestacoes, simulados/alunos update parcial, config/simExtra update parcial).
- `storage.rules`, `firebase.json`, `.firebaserc` (projeto `simulados-confirmacao`).

**Auth:** Firebase Auth (Google + Email/Password) habilitado e ativo. Login custom legado em `usuarios/{slug}` (senhas plaintext) coexiste como fallback — alvo de aposentadoria gradual via flag `legacyLoginEnabled` (planejada). Modelo novo: campo `tipo: adm|prof|coord|suporte|financeiro|<custom>` com permissões por preset em `config/settings.tiposPresets`. Audit log automático em `auditLog/{auto}` pra ações coord/prof. **Senha admin atual mudou** — pergunte ao Tiarlles quando precisar (a antiga `aros2025` está desatualizada).

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

1. **Deploy pelo git (NOVO fluxo).** O diretório local é um repo git conectado a `https://github.com/Tiarlles/aros-simulados` (branch `main`). Quando o usuário autorizar explicitamente ("deploy", "sobe pra produção", etc.), faz `git add -A && git commit -m "..." && git push origin main`. GitHub Pages atualiza `aros.anestreview.com.br` em ~30s. **Não faça push preventivo após edits sem autorização explícita.** Token de autenticação salvo no macOS Keychain (gerado em 2026-05-15).
2. **Não crie arquivos `.md`** sem o usuário pedir.
3. **Cloud Function: só deploy quando o usuário autorizar explicitamente.** Não faça deploy preventivo após edits.
4. **Migrações de dados** são feitas via scripts Node ad-hoc em `/tmp/xlsx-reader/` usando o **Firebase JS SDK como cliente público** (não Admin SDK — sem service account). **Após o apertamento das rules em 2026-05-21**, writes em coleções coord/prof exigem auth — scripts precisam fazer `signInWithEmailAndPassword` antes ou usar coleções com exceções de aluno anônimo. Reads continuam abertos.
5. **Nunca coloque `</script>` literal dentro de template literals JS** no `index.html` — splitar como `` `<scr` + `ipt>` `` pra não quebrar o parser HTML.
6. Backups do `index.html` ficam em `Backup/index N.html`. Não editar.

## Modelo de dados resumido

Ver SKILL.md de `/aros-contexto` pro detalhe completo. Coleções principais:
- `simulados/{simId}` + subcoleção `alunos/{alunoId}` (oficial ou extra via flag `isExtra`)
- `usuarios/{slug}`, `listas/{listaId}` — usuario tem campos `tipo` + `permissoes[]` (e `role` por compat)
- `solicitacoesExtra/{reqId}` (status: `aguardando-pagamento` → `pago` → `efetivada` | `cancelada`)
- `trocasDiretas/{trocaId}`, `notas/{simId}/alunos/{matricula}`, `checklists/{simId}/...`
- `config/{settings|professores|menu|simExtra}` — `config/settings` tem `tiposPresets` + `tiposMeta` pra tipos de usuário
- `auditLog/{auto}` — log imutável de ações coord/prof (LOGIN, NOTA_LANCADA, USUARIO_EDITADO, etc)

## Fluxo Hotmart → Simulado Extra

1. Aluno solicita → cria `solicitacoesExtra/{xcod}` com status `aguardando-pagamento`. Link Hotmart recebe `?xcod={id}` via `appendTrackingToLink`.
2. Hotmart processa pagamento → POST no webhook → Cloud Function valida HOTTOK, lê `purchase.origin.xcod`, atualiza pra `pago` + `paidVia:'hotmart'` + dispara Slack.
3. Coord adiciona o aluno a um Simulado Extra (`isExtra:true`) → status vira `efetivada` + linka `simExtraId`.
