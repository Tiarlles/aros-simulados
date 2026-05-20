---
name: aros-contexto
description: Contexto completo do projeto AROS (Anest-Review · TSA Oral) — sistema de coordenação de simulados orais de anestesiologia. Use sempre que precisar entender arquitetura, modelo de dados, fluxos, dívidas técnicas, convenções, ou qualquer nuance do projeto. Invoque no início de qualquer sessão nova ou quando o usuário pedir algo sobre AROS, simulados, revisão de casos, Hotmart, ou painel da coordenação.
---

# AROS — Anest-Review · TSA Oral

Sistema de coordenação de **simulados orais de anestesiologia** para a prova TSA (Título Superior em Anestesiologia). Em produção, usado por alunos e coordenação real. Mantenedor: Tiarlles (anestesiologista, dono do produto).

## O que é, em uma frase

SPA monolítico single-file (HTML+CSS+JS vanilla, ~7500+ linhas em `index.html`) que orquestra inscrição de alunos, escalas, trocas, notas, checklists, revisão peer-to-peer de casos clínicos, mentorias (TEA/TSA/ME1/ME2/ME3), financeiro e venda de simulados extras via Hotmart.

## Arquitetura

| Camada | Tecnologia |
|---|---|
| Frontend | HTML + CSS (variáveis dark/light) + JS vanilla. Sem framework. Sem build. Sem bundler. |
| Fontes web | Plus Jakarta Sans (corpo), Fraunces (legado, sendo removido), **Space Grotesk** (abas/títulos do painel), **JetBrains Mono** (badges, mono subtitles, group headers `//`), Permanent Marker. |
| CDN externos | EmailJS (envio de email), SheetJS (export/import xlsx), Firebase JS SDK |
| Banco | Firebase Firestore (projeto `simulados-confirmacao`) |
| Storage | Firebase Storage (imagens de revisão, checklists, slides) |
| Auth | **Sistema próprio** em `usuarios/{username}` com senhas plaintext. Não usa Firebase Auth. **Dívida técnica conhecida.** |
| Email | EmailJS (`service_exyoa4r`). **Templates:** `template_r0vjejs` (simulados TSA Oral — trocas/confirmação/presença) e `template_hb89fxv` (Mentoria — todos os 5 tipos + envio de link da reunião). Mentoria usa var `{{tipo_mentoria}}` (TEA/TSA/ME1/ME2/ME3) em vez de `{{simulado}}`. |
| Pagamentos | Hotmart (produto "+3 Simulados Extras Online AROS!") |
| Notificações | Slack Incoming Webhook (canal `#notificacao-simulado-extra`) |
| Webhook backend | Cloud Function Gen 2 — `cloud-function-hotmart/index.js` |
| Deploy frontend | GitHub Pages (repo público [Tiarlles/aros-simulados](https://github.com/Tiarlles/aros-simulados), branch `main`, com CNAME pra `aros.anestreview.com.br`) |

**Deploy (atualizado 2026-05-15):** o diretório local **agora é um repo git** conectado ao remote `https://github.com/Tiarlles/aros-simulados` (branch `main`). Token salvo no macOS Keychain. Quando o usuário fala "deploy"/"sobe pra produção", rodar `git add -A && git commit -m "..." && git push origin main`. GitHub Pages atualiza `aros.anestreview.com.br` em ~30s. **Não fazer push preventivo sem autorização explícita.**

**Testes locais (CRÍTICO — fluxo padrão do usuário):** o usuário **sempre testa localmente antes de autorizar deploy**, e usa o `iniciar-servidor-dev.command` (porta 8081). Esse script **auto-detecta a worktree com `index.html` de mtime mais recente** e serve dela; só cai pra raiz se nenhuma worktree tiver `index.html` mais novo que o main. Quando você editar o `index.html` numa worktree, o usuário relança o script (Cmd+W na janela velha + duplo-clique no .command) e o Terminal imprime `Servindo: worktree: <nome>` ou `Servindo: pasta principal (main)`. Existe também o `iniciar-servidor.command` (porta 8080) que sempre serve a raiz — usado pra comparar com produção. Live Server do VS Code NÃO recomendado (injeta script de auto-reload que quebra o `<script type="module">`).

**REGRA CRÍTICA — nunca copiar `index.html` da worktree pra raiz manualmente.** Incidente 2026-05-18: copiei pra "facilitar visualização" e clobberei trabalho não-commitado de outra sessão paralela que estava sendo servida via dev script. Quando o user diz "não vejo as mudanças localmente":
- **Primeiro**: `lsof -iTCP:8081 -sTCP:LISTEN` + `lsof -p <pid> | grep cwd` pra ver onde o servidor velho está apontando — geralmente é um processo antigo de antes das suas edits, servindo a raiz/worktree errada.
- **Solução**: `kill <pid>` e pedir pro user relançar o `iniciar-servidor-dev.command`. Cmd+Shift+R no Chrome pra burlar cache.
- **NUNCA** fazer `cp worktree/index.html raiz/` sem antes: (a) `cd raiz && git status` — se modificado, parar e checar com user, (b) listar outras worktrees (`ls .claude/worktrees/`) e checar mtimes/`git status` de cada uma.
- Deploy oficial é `git push origin main` da própria worktree (com autorização explícita), nunca cópia manual.

## URLs e endpoints

- **Site público:** `https://aros.anestreview.com.br` (GitHub Pages com CNAME) — repo [Tiarlles/aros-simulados](https://github.com/Tiarlles/aros-simulados)
- **Logo header:** `https://aros.anestreview.com.br/assets/assets/logo-anestreview.png` (PNG transparente, subido manualmente no repo em `assets/logo-anestreview.png` — caminho final tem `/assets/assets/` por causa da estrutura de pastas)
- **Cloud Function (webhook):**
  - alias: `https://us-central1-simulados-confirmacao.cloudfunctions.net/hotmartWebhook`
  - cloud run: `https://hotmartwebhook-57xrhneaga-uc.a.run.app`
- **Firebase Console:** `https://console.firebase.google.com/project/simulados-confirmacao`
- **Slack webhook:** configurado no painel da coord + na Cloud Function
- **HOTTOK Hotmart:** validado no header `X-HOTMART-HOTTOK` ou body

## Estrutura de arquivos

```
index.html                          — SPA inteiro (frontend + cliente Firestore)
404.html                            — SPA fallback do GitHub Pages (necessário pra rotas /pretty)
firestore.rules                     — regras do banco (pragmáticas, ver abaixo)
storage.rules                       — regras de Storage (imagens revisão/checklists/slides/recursos)
firebase.json                       — config do projeto Firebase
.firebaserc                         — alias do projeto (simulados-confirmacao)
PROJECT_STATE.md                    — fonte de verdade do estado do projeto
CLAUDE.md                           — instruções pro Claude Code
Backup/index N.html                 — backups antigos (NÃO editar)
cloud-function-hotmart/
  ├ index.js                        — webhook Hotmart
  ├ package.json
  └ .env                            — gitignored: HOTMART_TOKEN, SLACK_WEBHOOK
```

**Importante sobre `404.html`:** GitHub Pages não tem SPA routing nativo. O `404.html` salva o path original em `sessionStorage` e redireciona pra `/`; o `index.html` no boot lê o sessionStorage e restaura via `history.replaceState`. **Sem o 404.html, qualquer rota tipo `/recursos` quebra em produção.** Padrão "spa-github-pages".

## Modelo de dados (Firestore)

```
simulados/{simId}
  ├ alunos/{alunoId}                — subcoleção
  └ campos: nome, dataSab, dataDom, deadline, limite,
            rodadasSab[], rodadasDom[], posProfs{},
            isExtra?, presencial?, historico?

usuarios/{username}                 — painel da coord
  └ campos: username, senha (plaintext), nome, role, permissoes[]
  └ roles: 'admin' (acesso total) | 'user' (com permissoes[] granulares) | 'avaliador' (prof revisor)
  └ default admin: admin / aros2025

listas/{listaId}                    — listas de alunos (cadastros)
  └ campos: nome, alunos[{nome, email, matricula}]

solicitacoesExtra/{reqId}           — pedido de simulado extra (ID = xcod Hotmart)
  └ status: aguardando-pagamento | pago | efetivada | cancelada

trocasDiretas/{trocaId}             — propostas de troca entre alunos

notas/{simId}/alunos/{matricula}    — { criar, oral, notaFinal }

checklists/{simId}/
  ├ meta/templateCriar              — template do bloco Criar/Simulação (casos com slides)
  ├ meta/templateOral               — template do bloco Oral Online
  └ respostas/{studentId}           — respostas

disponibilidade/{simId}/profs/{key} — disponibilidade de profs
feedbackGeral/{simId}               — feedback geral do simulado

mentorias/{mentoriaId}              — grupos com mentor + alunos
  └ tipo: 'TEA' | 'TSA' | 'ME1' | 'ME2' | 'ME3'
  └ mentorNome, alunos[], inicio (YYYY-MM-DD), fim (YYYY-MM-DD), valorMensal (num)
  └ legado: inicio/fim podem vir como YYYY-MM (mês/ano); normalizados via _mentNormData
blocosClinica/{blocoId}             — bloco mensal de clínicas (tema único)
clinicas/{clinicaId}
  └ alunos/{alunoId}                — sessões dentro de um bloco

revisaoCasos/{revId}                — peer review dos casos antes de aplicar
  ├ comentarios/{cmtId}             — votos + comentários ancorados
  │  └ targetType: enunciado|pergunta|item|caso
  │  └ kind: voto|comentario|finalizado
  │  └ doc IDs especiais:
  │     - voto_{profSlug}_{type}_{id}
  │     - fin_{profSlug}            (marca prof finalizado)
  └ historico/{histId}              — edições do coord (antes/depois)

tarefas/{taskId}                    — kanban de features/ideias (admin-only)
  └ campos: titulo, descricao (HTML rico), status (ideia|fazendo|feito),
            prioridade (alta|media|baixa), checklist[{id,texto,done}],
            criadoEm, updatedAt

provas/{provaId}                    — Sistema de Recursos: prova cadastrada
  └ campos: nome, tipo (TSA|TEA|ME1|ME2|ME3), ano, dataLimite (ISO),
            mensagemInicial, status (ativa|encerrada), criadoEm, updatedAt
  ├ questoes/{qId}                  — questão da prova + parecer AnestReview
  │   campos comuns: numero, modo, imagemUrl, validada, validadaPor, validadaEm,
  │                  criadoEm, updatedAt
  │   modos: 'estruturado' (TEA/TSA 4 alts A-D) | 'bloco' (texto único) | 'vf' (ME 5 alts V/F)
  │   modo estruturado/bloco:
  │     enunciado, blocoTexto, alternativas:[{letra,texto}], gabaritoOficial ('A'|..|'E'),
  │     parecer (em-analise|cabe-recurso|nao-cabe-recurso),
  │     parecerArgumento (HTML rico), parecerImagemUrl, parecerPor, parecerEm,
  │     parecerAtribuidoA, parecerAtribuidoEm  (workflow Assumir/Análise),
  │     parecerRascunho {parecer,argumento,imagemUrl,salvoEm}  (parcial, não finalizado),
  │     parecerFinalizado: bool  (true só ao clicar "Finalizar parecer" — visível pro aluno só se true)
  │   modo vf (ME):
  │     enunciado, alternativas:[{letra,texto,gabaritoVF:'V'|'F'}], gabaritoOficial='',
  │     pareceresPorAlt: { 'A': {parecer,argumento,imagemUrl,profNome,respondidoEm,
  │                              finalizado:bool, atribuidoA, atribuidoEm,
  │                              rascunho:{parecer,argumento,imagemUrl,salvoEm}}, 'B': ..., ... }
  │   └ contestacoes/{cId}          — contestação enviada pelo aluno
  │       campos: emailAluno, nomeAluno, motivo, alternativaLetra (só em modo vf),
  │                fonte (id da bibliografia ou 'outro'), fonteCustom, pagina, imagemUrl,
  │                status (pendente|respondida), criadoEm, respondidoEm,
  │                respostaSnapshot {parecer, argumento, imagemUrl, profNome, alternativaLetra}

fontesRecurso/{fId}                 — bibliografia pré-cadastrada (UI: "Bibliografia")
  └ campos: nome, descricao,
            tipos: string[]  (subset de ['TEA','TSA','ME1','ME2','ME3']; vazio = "geral", vale pra todos)

recursosConfig/{cfgId}              — config global do sistema de recursos
  └ doc 'settings': { instrucoes (HTML), mensagemTopo (HTML), ... }

projecaoLive/{liveId}               — sessão de projeção remota AO VIVO (Fase 1+2, 2026-05-15)
  └ liveId = `${simId}__${alunoId}` (uma sessão por aluno por simulado)
  └ campos: simId, alunoId, alunoNome, simNome, ativo (bool),
            projecaoAberta (bool), casoId, casoIdx, idx, total,
            timerStartedAt (ISO|null), timerPausedMs (num), timerRunning (bool),
            habilitadoEm, encerradaEm, interrompidaEm, updatedAt
  └ Fluxo: prof clica "Habilitar" → cria doc com ativo:true. Aluno vê botão
           "Entrar na sala" na escala-view. Prof clica "Projetar caso" → grava
           casoId+idx+projecaoAberta:true. Aluno + preview do prof recebem
           via onSnapshot (substitui o BroadcastChannel antigo, agora funciona
           remoto entre máquinas/redes).
  └ Encerrar projeção (botão na preview): grava projecaoAberta:false mas
           mantém ativo:true → aluno vê "Caso finalizado pelo professor",
           sala fica aberta pra prof retomar com outro caso.
  └ Desabilitar (botão "✓ Habilitado" no checklist): deleta doc → aluno
           vê "Sessão encerrada".
  ├ strokes/{strokeId}                — traços do canvas de desenho (Fase 2)
  │   campos: points:[{x:0-1,y:0-1}] (normalizado), color (hex),
  │           thickness, slideIdx, casoId, by ('prof'|'aluno'), ts
  │   Filtragem: cada slide mostra só seus traços (por casoId+slideIdx).
  │   Botão "🗑 Limpar" deleta todos os strokes do casoId+slideIdx atuais.

config/{cfgId}
  ├ settings                        — config legacy + cronometroLimite ('mm:ss', default '07:30')
  ├ professores                     — { lista: ['Nome 1', ...] }
  ├ menu                            — NEW schema: estrutura completa do menu lateral
  │   {
  │     groups: { [gid]: 'Label custom' },         // override de label do grupo
  │     tabs:   { [tabId]: 'Label custom' },       // override de label da aba
  │     structure: [                                // layout completo persistido
  │       {
  │         id: 'simulados', label: 'Simulados',
  │         items: [
  │           { kind: 'tab', id: 'simulados' },
  │           { kind: 'subgroup', id: 'sg_xxx', label: 'Extras', tabs: ['simExtras','extra'] },
  │           ...
  │         ]
  │       }, ...
  │     ],
  │     tabOrder: {}                                // legado (compat retroativa)
  │   }
  │   Legado: se `structure` ausente, lê `g.tabs[]` por compat. Reconciliação automática
  │   coloca tabs novas (TAB_GROUPS adicionadas no código) no grupo original ou no último.
  └ simExtra                        — { linkPagoAluno, linkPagoExterno, linkGratuito,
                                         slackWebhook, listaVigenteId, alunosGratuitos[] }
```

## Distinção crítica: simulados oficiais vs extras

- **Oficial:** `isExtra` ausente ou `false`. Aparece na home dos alunos. Conta pra Garantia de Aprovação.
- **Extra:** `isExtra: true`. Simulado privado pago via Hotmart. NÃO aparece na home dos alunos. Aparece no Desempenho como coluna mas NÃO conta pra Garantia.

Filtros aplicados em: `renderSimCards`, `popCoSel`, `simsAplicados` (Garantia), seletor da aba Trocas. **Sempre verificar esse filtro ao mexer com listagem de simulados.**

## Design system (atualizado)

**Paleta:** mantida (GitHub-style dark/light, accent azul `#2f81f7`). Sombras em camadas, `accent-dim` pra glows internos, `accent-glow` pra halos externos.

**Tipografia por contexto:**
- Corpo geral: **Plus Jakarta Sans** (15px).
- Abas da sidebar de Coordenação (`.co-tab`): **Space Grotesk** 13.5px peso 500.
- Headers de grupo na sidebar (`.co-group-header`): **JetBrains Mono** 12px peso 700 uppercase com prefixo `//` accent.
- Subgrupos na sidebar (`.co-subgroup-header`): Space Grotesk 13.5px peso 500 (mesmo tamanho dos itens).
- Títulos de página no painel (Painel da Coordenação / Simulados TSA Oral / Mentorias): **Space Grotesk** 22-26px peso 700 letter-spacing -.3px + subtítulo accent em **JetBrains Mono** 10.5-11px uppercase letter-spacing 2px.
- Títulos de cards de simulado (`.sim-card-title`): **JetBrains Mono** 15px peso 700.
- Labels mono accent (date chips, status badges, ADM badge): **JetBrains Mono** 8.5-10px peso 700 uppercase.

**Sidebar de Coordenação ("command center"):**
- Painel sticky `top:78px`, gradient bg azulado no topo + linha accent neon no topo + barra accent vertical à esquerda.
- Grupos com prefixo `//` e header em mono.
- Aba ativa: gradient horizontal accent translúcido + barra accent vertical com glow neon + dot accent à direita com glow.
- Subgrupos: borda tracejada vertical à esquerda, corpo indentado, abas internas levemente menores.
- Footer com avatar mono (iniciais em gradient accent + sombra glow) + nome + role mono accent + botão Sair.
- Body com **dot grid sutil** (52px) mascarado no topo.

**Cards de simulado:**
- Borda + sombra em camadas + accent-dim inset.
- **Dot grid** no fundo mascarado no topo (some na metade).
- **Linha accent neon** no topo (cresce no hover).
- Título com **barra accent vertical glow** à esquerda.
- Chips de data: gradient bg + indicador accent vertical + label JetBrains Mono uppercase + valor `font-variant-numeric: tabular-nums`.

**Padrão "ADM badge":**
- Abas marcadas como admin-only ganham um pill mono "ADM" discreto à direita na sidebar.
- Lista hardcoded em `ADMIN_ONLY_TABS = new Set(['usuarios','config','financeiro','features','recProvas','recFontes','recConfig','recMetricas','comunicacao'])`.
- `recGestao` é INTENCIONALMENTE não-admin-only — qualquer prof autenticado deve poder dar parecer em contestações.

## Estilo "Apple-like" (referência reutilizável)

**Quando o usuário pedir pra deixar algo "estilo Apple", "Apple-like", "imersivo e tecnológico", "premium", "estilo iOS/macOS" — aplicar este padrão.** Foi estabelecido nas telas Home, Mural, Header, Simulados TSA Oral (aluno) e aba de Comunicação (admin) em 2026-05-20. **NÃO re-perguntar especificações** — usar o padrão abaixo direto.

### Tokens canônicos (já existem em `<style id="home-styles">` no `index.html`)
```css
:root{
  --ease-out-soft: cubic-bezier(0.16, 1, 0.3, 1);     /* easing default — transitions de hover/state */
  --ease-out-fast: cubic-bezier(0.22, 1, 0.36, 1);    /* easing pra sliding indicators / movimentação direta */
  --ease-in-out:   cubic-bezier(0.65, 0, 0.35, 1);    /* easing pra animações infinitas (mesh, pulse) */
}
```

### Liquid Glass (containers, pills, modais)
- `backdrop-filter: blur(12-22px) saturate(140-180%)` + `-webkit-` prefix.
- Background: `linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.015))` (dark) / `rgba(15,23,42,.04→.01)` (light).
- Border: `1px solid color-mix(in srgb, var(--border) 80%, transparent)`.
- Sombras em camadas: `0 1px 0 rgba(255,255,255,.06) inset, 0 1px 2px rgba(0,0,0,.15), 0 8px 24px rgba(0,0,0,.22)`.
- **Mobile**: media query `(max-width:820px)` reduz/desliga `backdrop-filter` pra economizar GPU.

### Pill capsule (containers, botões, tabs)
- `border-radius: 999px`.
- Padding generoso: containers `5px`, botões `9px 18-22px`.
- Tipografia: **Space Grotesk** 12.5-13px peso 600, letter-spacing `.2px`.

### Sliding indicator (segmented controls estilo macOS Sequoia)
- `<span class="*-indicator" aria-hidden="true">` dentro do container pill.
- CSS: `position:absolute; top:5px; bottom:5px; transition: transform .55s var(--ease-out-fast), width .55s var(--ease-out-fast)`.
- JS mede `getBoundingClientRect()` da `.tab.on` e seta `transform: translateX(Xpx); width: Wpx`.
- Cor do indicador varia por categoria via `data-active-cat` attribute (laranja TSA, azul TEA, roxo MEs).
- Exemplos no código: `_arosUpdateNavIndicator()` (header), `_arosUpdateDayTabsIndicator()` (genérico), `_comUpdateSubnavIndicator()` (aba Comunicação).

### Tipografia tecnológica
- **Títulos hero (h1)**: Space Grotesk 700, `clamp(38px, 6vw, 72px)`, `letter-spacing:-2.2px`, `line-height:1.02`.
- **Títulos de seção (h2/h3)**: Space Grotesk 700, 22-28px, `letter-spacing:-.6px`.
- **Acentos em itálico/destaque**: gradient text `linear-gradient(135deg, #fb923c 0%, #a855f7 55%, #3b82f6 100%)` com `-webkit-background-clip:text; color:transparent`.
- **Labels mono uppercase**: JetBrains Mono 10.5px peso 700, letter-spacing `1.6-3px`, `text-transform:uppercase`. Cor `var(--t2)`.

### Cards / botões de card
- Border-radius: 18-24px.
- Padding: 22-30px.
- Hover lift: `transform: translateY(-3 a -6px)`.
- **Tilt 3D** opcional: `data-tilt` no elemento, `_arosBindTilt()` aplica `rotateX/Y` até 6° seguindo mouse (desligado em touch e em reduced-motion).
- **Glow follow-cursor**: `::after` com `background: radial-gradient(circle at var(--mx) var(--my), ...)`, `_arosBindTilt` atualiza `--mx/--my`.
- **Shine sweep**: `::before` com gradient diagonal translúcido, transitions de transform no hover (passa da esquerda pra direita).
- **Borda gradient sutil**: técnica `padding:1.5px; -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor`.

### Reveal-on-scroll
- Adicionar `class="reveal"` em elementos. Por padrão: `opacity:0; transform:translateY(28px)`.
- `_arosObserveReveal()` usa IntersectionObserver pra adicionar `.in` quando entram no viewport.
- **Fail-safe de 1200ms** garante que tudo aparece mesmo se observer não disparar.
- Stagger: `style="transition-delay: ${i*80}ms"` em listas.

### Hero com mesh-gradient animado
- `::before` com múltiplas `radial-gradient(...)` em posições/cores diferentes, `filter: blur(60px) saturate(120%)`.
- `animation: heroMesh 18s var(--ease-in-out) infinite alternate` movendo `transform: translate3d` sutil.
- Grade pontilhada sobreposta com máscara radial: `background-image: linear-gradient(grid 1px, transparent 1px), linear-gradient(90deg, grid 1px, transparent 1px); mask-image: radial-gradient(ellipse, #000 35%, transparent 80%)`.

### Header sticky com fade-on-scroll
- Default: `background: rgba(13,17,23,.58)` + blur 22px.
- Estado `.scrolled` (window.scrollY>8): `background: rgba(8,10,14,.82)` + sombra sutil.
- Listener: `window.addEventListener('scroll', ...)` passive.

### Modais Apple-like
- Backdrop com blur via `.mo` (já existe).
- Container `.md` com `border-radius:18-20px`, padding 0, overflow hidden.
- Botão close circular flutuante (`width:36px; border-radius:999px; background:rgba(0,0,0,.4)` + blur) que **gira 90° no hover**.

### Cores temáticas por contexto
- TSA: laranja `#fb923c` / `#fbbf24`
- TEA: azul `#3b82f6` / `#60a5fa`
- MEs: roxo `#a855f7` / `#c084fc`
- Aplicar via `--c: cor` em escopo `[data-cat="X"]` no container, e `var(--c)` em filhos.

### Drag-and-drop (HTML5 nativo, sem libs)
- Padrão visual: handle `⋮⋮` à esquerda da row, `cursor:grab/grabbing`.
- Drop indicator: classe `.drop-target-before` / `.drop-target-after` adiciona `box-shadow: 0 ±3px 0 0 var(--accent)` + border accent.
- Persistência: array `order` em config doc (não posição numérica em cada item — array de IDs é atômico e simples).
- Exemplo de referência: `_comBindDragDrop()` na aba Comunicação.

### Sanitização HTML em editores rich-text
- Função `_comSanitizePostHTML(html)` em `index.html` — remove `script/style/iframe/object/embed/link/meta`, atributos `on*`, `href:javascript:`, e filtra `style` permitindo só `color | background-color | font-size | font-weight | font-style | text-decoration | text-align`.
- Adiciona `target="_blank" rel="noopener"` automático em `<a>` externos.
- Padrão de toolbar: prefix `cp/mpr/mft + Exec/Color/InsertCode/InsertLink/InsertImage`. Reuso da classe `.ftb` (botão) e `.ftb-sep` (separador) e `.ftb-c` (swatch de cor).

### Performance / acessibilidade
- **`@media (prefers-reduced-motion: reduce)`**: desliga animações infinitas, tilt, reveal, transições longas.
- **`@media (max-width: 820px)`**: reduz/desliga `backdrop-filter` pra Android antigo. Grids passam pra coluna única.
- **`@media (pointer:coarse)`**: tilt 3D fica desligado em touch (`_arosBindTilt` checa).
- Audiência majoritária do AROS é iPhone → custo de blur é zero perceptível (decisão 2026-05-20).

### Padrão Mobile (estabelecido em 2026-05-20)
**Breakpoints canônicos:**
- `< 900px`: tablet (reduz padding, fonts ligeiros menores).
- `< 720px`: phone (mudanças estruturais: hamburger menu, cards horizontais, hero compacto).
- `< 380px`: phone pequeno tipo iPhone SE (aperta mais).

**Header no mobile (< 720px):**
- Pill de tabs + botões 🔐/🌙 escondidos via `display:none !important`.
- Hambúrguer 42×42px (`.hamburger-btn`) aparece no header-right.
- Slide-in panel `.mobile-menu` da direita com backdrop blur, animação `mmSlide .45s var(--ease-out-soft)`.
- Items 48px+ touch-friendly. Item ativo com gradient laranja. Body trava overflow enquanto aberto.

**Cards no mobile (< 720px): layout horizontal**
- `flex-direction:row !important` no card.
- Cover virou painel lateral fixo: `flex:0 0 132px; width:132px` (110px em <380px).
- Body: `flex:1 1 auto; min-width:0` (importante pra texto poder truncar).
- `transform:none !important` no card (desliga tilt residual).
- Shine sweep e perspective desligados no mobile.
- Title clamped em 2 linhas, sub em 2 linhas (1 em <380px).
- **Use `!important` agressivamente** nos overrides — flex layout tem muitas batalhas de specificity com width:100%/aspect-ratio do desktop.

**Hero no mobile:**
- Padding reduzido: `padding: 20px 12px 24px` (era 48px 16px 56px).
- H1: `clamp(28px, 8vw, 40px)` (era 38-72px).
- **Importante**: o `::before` do hero tem `inset: -40px -10% -10%` (gradient mesh extending 10% pros lados). Pra evitar **horizontal overflow no mobile**, o `.home-hero` precisa de `overflow:hidden; border-radius:24px`. Bug 2026-05-20: usuário viu cards "perdidos" deslocados pra esquerda — era esse overflow horizontal criando scroll.

**Teste local em iPhone real (recomendado pelo usuário):**
1. No Mac terminal: `cd <path>` → `python3 -m http.server 8080` (8000 pode estar ocupada).
2. Pegar IP: `ipconfig getifaddr en0`.
3. iPhone no mesmo Wi-Fi: `http://<ip>:8080`.
- Mudanças no `index.html` aparecem com pull-to-refresh — sem precisar reiniciar servidor.
- Firebase funciona normal (conecta da internet independente da origem).

### Boas práticas de escopo (pra não vazar em admin)
- **NÃO** mexer em estilos globais (`.btn`, `.fc`, `.card`) sem necessidade.
- Override escopado: `#view-al .sim-card`, `#tab-comunicacao .com-row`, etc.
- Específico vence específico — não usar `!important` exceto em casos cirúrgicos pra override de inline styles.

### Componentes reutilizáveis (já existem)
- `_arosBindTilt()` — aplica tilt 3D + glow em `[data-tilt]`.
- `_arosObserveReveal()` — IntersectionObserver pra `.reveal`.
- `_arosUpdateNavIndicator()` — sliding indicator do header.
- `_arosUpdateDayTabsIndicator(wrapId, indId)` — sliding indicator genérico.
- `_comUpdateSubnavIndicator()` — sliding indicator da aba Comunicação.
- Função `_comAdminToggleCard(id, ev)` — toggle de collapsible com chevron rotacionando.

**Quando aplicar em uma área nova:** seguir a ordem:
1. CSS escopado por `#id-da-area` (cuidado pra não vazar).
2. Pill containers + Space Grotesk + tokens.
3. Liquid glass nos cards/containers.
4. Hover states (lift + glow + shine).
5. Reveal-on-scroll nos itens.
6. Media queries pra mobile e reduced-motion.
7. Sliding indicators se houver tabs/segmented controls.

## Features principais

### Visão Aluno
- Cards de simulados futuros com barra de progresso (confirmados / swap / ausentes / pendentes).
- Resposta: confirmar / não irei / solicitar troca (validação por email mascarado).
- **Auto-troca FIFO** ao solicitar (vaga direta + match casado).
- Box "Solicitar Simulado Extra" **abaixo** dos cards, alinhado à grid (single-cell `.sim-cards`), com glow accent pulsante. Texto curto em Space Grotesk + tag mono accent. Fluxo multi-step abre num modal.

### Visão Coordenação (sidebar agrupada e customizável)
Grupos default (em `TAB_GROUPS`):
- **Simulados:** Simulados TSA Oral, Trocas, Solicitação Sim Extra, Simulados Extras, Desempenho, Checklist, Revisão de Casos
- **Cadastros:** Professores, Listas de Alunos
- **Mentorias:** Mentorias
- **Recursos:** 📚 Provas, 🛡️ Gestão de Recursos, 📖 Bibliografia, ⚙️ Instruções & Config, 📊 Métricas
- **Administração:** 📌 Features, Financeiro, Usuários, Configurações

**Reconciliação inteligente em `_menuEffectiveGroups()`:** quando um grupo NOVO é adicionado em `TAB_GROUPS` (e o usuário já tem `config/menu.structure` customizado), o grupo é automaticamente criado no final da estrutura salva (não fica órfão jogando as abas no último grupo existente).

Admin pode **customizar a estrutura** em Configurações → Personalizar menu lateral:
- Renomear grupos e abas.
- **Criar grupos custom** (`＋ Novo grupo`).
- **Mover abas entre grupos** via drag-and-drop pelo handle `⠿`.
- **Criar subgrupos** dentro de um grupo (`＋ Subgrupo`).
- Mover abas entre grupos e subgrupos (drag cross-container suportado).
- Apagar grupo/subgrupo só quando vazio (delete habilita quando última aba sair).
- Reordenar é persistido em `config/menu.structure[].items[]`.

Renderização da sidebar usa `_menuEffectiveGroups()` que:
- Lê `structure` se persistido.
- Fallback pra `TAB_GROUPS` + `tabOrder` legado.
- Reconcilia tabs órfãs (que existem em TAB_GROUPS mas não no structure salvo) — coloca no grupo original ou no último.

**Modal de edição de usuário** também consome `_menuEffectiveGroups()` — checkboxes de permissão respeitam grupos/subgrupos/ordem custom.

A aba Coordenação fica **oculta na visão inicial** (`tab-co` com `display:none`). Acesso via hash `#admin` ou `#coord` na URL.

### Sistema de auth
- Login usuário/senha custom (não usa Firebase Auth).
- Roles: `admin`, `user` (permissões granulares), `avaliador` (prof que faz revisão de casos).
- **Sessão persistida em localStorage** (`aros_session` = username). Refresh mantém login. Logout limpa.

### Auto-seleção de simulado por aba
Várias abas que dependem de "qual sim?" usam helpers comuns:
- `_closestSim(list)`: retorna o sim de data mais próxima de hoje (prioriza futuro; cai pro passado mais recente se não houver futuro).
- `_closestOfficialSim()`: variante que filtra `!isExtra`.

Abas que auto-selecionam o próximo sim ao entrar (sem precisar de clique):
- **Gerenciamento (Simulados TSA Oral)**: `popCoSel` faz auto-select + `selectSim()`.
- **Trocas**: tem **selector próprio** (`#trocas-sim-sel`) + auto-select via `_restoreSimForTab('trocas')`.
- **Disponibilidade (Cobertura de Professores)**: `_initProfTab` auto-seleciona e dispara `onProfSimChange()`.
- **Checklist**: `initChecklistTab` auto-seleciona e chama `loadCkSim()`.

### Independência Gerenciamento × Trocas
Memória por aba (`_tabSimMemory`) torna as duas abas independentes mesmo compartilhando `S.curSim`:
- Ao sair de uma aba sim-aware, salva o sim atual sob aquela aba.
- Ao entrar em outra sim-aware, restaura o sim memorizado (ou pega o mais próximo).
- Tabs sim-aware: `_SIM_AWARE_TABS = new Set(['simulados','trocas'])`.
- Side effect aceito: `S.curSim` "flipa" entre tabs, mas a UX é de duas escolhas independentes.

### Garantia de Aprovação
- "Elegível" se `notaFinal >= 60` em TODOS os simulados oficiais já aplicados (data passada, `isExtra=false`).
- "Não elegível" se algum < 60 (incluindo 0 ou ausência).
- "—" se não tem nenhuma nota.

### Solicitação Sim Extra (fluxo Hotmart)
1. Aluno solicita → cria `solicitacoesExtra/{xcod}` com status `aguardando-pagamento`. Link Hotmart recebe `?xcod={id}` via `appendTrackingToLink`.
2. Hotmart processa pagamento → POST no webhook → Cloud Function valida HOTTOK, lê `purchase.origin.xcod`, atualiza pra `pago` + `paidVia:'hotmart'` + dispara Slack.
3. Coord adiciona o aluno a um Simulado Extra (`isExtra:true`) → status vira `efetivada` + linka `simExtraId`.

### Revisão de Casos (peer review)
Fluxo: coord cria revisão → libera pra profs → cada prof loga com seu nome → marca concordo/discordo em enunciados, perguntas e itens do checklist → comenta o que precisa de ajuste → finaliza → coord vê consolidado → ajusta casos → fecha → exporta pra simulado real.

Detalhes técnicos:
- **Doc IDs determinísticos** pra votos: `voto_{profSlug}_{type}_{id}` (slug = nome normalizado: NFKD, sem diacríticos, lowercase, non-alphanum→`_`).
- **Finalização** persistida como `fin_{profSlug}` doc com `kind:'finalizado'`.
- **IDs de caso/pergunta/item** gerados de forma determinística em `_revNormalize` por posição: `c{ci}`, `c{ci}_p{pi}`, `c{ci}_p{pi}_i{ii}`.
- **Auto-concordo** ao clicar "Próximo": marca `concordo` em enunciado + perguntas + itens não votados.
- **Botão por estado** na lista: "Iniciar revisão" / "Continuar revisão" / "Visualizar revisão".
- **Reset** do prof: duplo confirm, deleta docs onde `profNome === meuNome`.
- **Reabrir pra profs** disponível quando `status === 'fechada'`.
- **Apagar comentário/resposta próprios**: botão 🗑 só pra autor (`profNome === S._revProfNome`) e não-readonly. Top-level apaga também as respostas filhas (`parentId`). Rules `comentarios` permitem `delete: true`.
- **Imagens em observações** uploadadas pra `revisaoCasos/{revId}/{casoId}/obs_{itemId}/{filename}` (Storage).
- **Importação em massa** via textarea (parser `_parseImportCasos`).

### Slides de Projeção (bloco Criar) — refatorado em 2026-05-15 pra modo remoto
Sistema agora sincroniza prof + aluno(s) via **Firestore** (substitui o BroadcastChannel antigo, que era local-only). Funciona com prof e alunos em máquinas/redes diferentes. Disponível **apenas para casos do bloco Criar/Simulação**.

**Estrutura de slide** (em `caso.slides[]`):
- **Capa** (`capa: true`): campos `simNome` + `casoLabel` (rich text).
- **Pergunta**: `casoTitulo`, `enunciado` (HTML), `enunciadoImagem`, `pergTitulo`, `pergTexto` (HTML), `imagem`, `imagemPos`.
  - `enunciadoImagem`: imagem do contexto (do `caso.enunciadoImagens[0]`), renderiza inline entre o texto do enunciado e o título da pergunta.
  - `imagem`: imagem da própria pergunta (do `perg.perguntaImagens[0]`), renderiza no `imagemPos`.
  - Ambas podem coexistir no mesmo slide.
- **Imagem pronta** (`imagemPura: true`): só a imagem ocupando o slide inteiro.

**Posicionamento da imagem** (`imagemPos`): `baixo` | `direita` | `grande`. Container limitado a `max-height:50vh` com `overflow:hidden` pra evitar overlap com texto.

**Auto-sincronia de slides com o caso (`_autoSyncAllSlidesCriar`)**:
- Sempre que caso é criado, importado em bloco, recebe pergunta nova/removida ou imagem anexada, os slides são regenerados via `gerarSlidesPadrao(caso, ci)`.
- Flag `caso.slidesManual = true` é setada quando o usuário **customiza** slides no modal (salva edições que diferem do padrão). Quando true, auto-sync pula esse caso.
- Botão "🔄 Regenerar padrão" reseta slidesManual via `_slidesIguaisAoPadrao()`.
- Upload/remove de imagem **força** `slidesManual = false` pra refletir imediato (anexar imagem é mudança de conteúdo).

**Editor de slides** (modal "🎬 Slides"):
- Cards colapsáveis com badge SLIDE N, tipo colorido, snippet, botões de ação.
- Mini editor rich text (`_rtEditor`): B / I / U / A+ / A- / ⌫. HTML sanitizado por `_sanitizeSlideHTML`. Sem `max-height` interno (deixa crescer e modal scrolla).
- Modal `#msl-list` sem `max-height` próprio — modal `.md` (max-height:92vh) scrolla tudo.
- Preview da `enunciadoImagem` aparece read-only no card do slide ("Gerencie na galeria do caso").

**Modo `?modo=projecao-live&sim={simId}&aluno={alunoId}&role=prof|aluno`** (NOVO, substitui modo `projecao` legado):
- `_initProjecaoLive(simId, alunoId, role)` no boot.
- Escuta `projecaoLive/{simId}__{alunoId}` via `onSnapshot`.
- Carrega slides do caso atual via `checklists/{simId}/meta/templateCriar`.
- Render unificado pra prof e aluno; prof tem controles na topbar (◀ ▶ ⛔ Encerrar) — sem cronômetro (esse fica no `proj-fixed-bar` do painel da coord).
- Cronômetro renderizado localmente baseado em `timerStartedAt + timerPausedMs` (não floods de writes).
- Auto-start do cronômetro ao sair do slide 0 (capa).
- Atalhos: ←/→/Espaço (sem mais `P` — cronômetro só no proj-fixed-bar).

**Estilo do slide**:
- Texto justificado (`text-align: justify; hyphens: auto`).
- Imagens (`.pimg-col img`, `.penun-img img`): `max-height: 100%` do container, container limitado a 50vh.
- Fonte: Calibri preto/branco.
- "CASO N" (`.pcaso`): clamp(20px, 2.25vw, 36px) — reduzido em 50% pra dar mais espaço ao texto.

**Painel de controle** (no checklist do prof):
- Botão `▶ Projetar caso (N slides)`.
- Botão `▶️ Habilitar`/`✓ Habilitado` por aluno (libera o link da sala).
- Botão `📋 Link` (quando habilitado) — copia URL `?modo=projecao-live&sim=X&aluno=Y&role=aluno` pro clipboard. Triplo fallback: navigator.clipboard → execCommand → modal com URL pra cópia manual.
- **Barra fixa preta no topo** (`#proj-fixed-bar`) — refatorada pra criar DOM uma vez e atualizar só atributos (corrige bug "precisa clicar 2x" que existia no innerHTML replace anterior). Tem timer + play/pause/reset + nav + encerrar.

**Aluno entra na sala**:
- Botão `🎬 Entrar na sala` aparece na linha do aluno na escala-view (`alunoRowHTML` e `presAlunoRow`) quando `projecaoLive.ativo:true`.
- Cor: gradient accent azul com `animation: btn-pulse` pra chamar atenção.
- Clique abre popup `?modo=projecao-live&...&role=aluno`.
- Pra Simulado Extra (que não tem card na home): prof envia o link copiado por WhatsApp/email.

**Canvas de desenho sincronizado** (Fase 2):
- Sobreposto à projeção (`#proj-canvas`, position:fixed, z-index:5).
- `pointer-events:none` por padrão; `pointer-events:auto` quando caneta ativa.
- Toolbar no canto inferior direito com:
  - Botão `✏️ Caneta` (toggle) — quando ativo, fica destacado com a cor selecionada e revela a paleta.
  - Paleta de 6 cores: vermelho, azul, verde, amarelo, preto, branco. Cor selecionada com borda branca + halo. Lembra em `localStorage.aros_pen_cor`.
  - Botão `🗑 Limpar` — apaga todos os traços do slide atual (com confirm).
- Cor inicial por papel: aluno=vermelho, prof=azul.
- Espessura fixa: 4px.
- Eventos: `pointerdown`/`move`/`up`. Coordenadas normalizadas (0-1) pra funcionar em qualquer resolução.
- Traço fica visível localmente em tempo real (zero latência); ao soltar, é gravado em `projecaoLive/{liveId}/strokes/{strokeId}` (1 write por traço completo).
- Outros viewers recebem via `onSnapshot` na subcoleção `strokes` (~500ms latência).
- Quando slide muda (idx ou casoId), `renderCanvas` filtra automaticamente.
- Trocas de caso esvaziam visualmente o canvas (traços daquele caso só voltam se voltar pro caso).

**Upload de imagens (slides)**: `simulados/{simId}/slides/{casoId}/{timestamp}_{filename}`. Limite 15MB.

### Mentorias
- `mentorias/{id}`: grupos com mentor + alunos. Cadastro de alunos **opcional** (grupo pode ser salvo vazio).
- `blocosClinica/{id}`: bloco mensal de clínicas (tema único).
- `clinicas/{id}` + subcoleção `alunos`.
- **Tipos:** `'TEA'`, `'TSA'`, `'ME1'`, `'ME2'`, `'ME3'` (lista em `MENTORIA_TIPOS`).
- **Badge `_mentBadge(t)`**: pill em JetBrains Mono uppercase com cor por tipo (TEA=azul, TSA=laranja, ME1=roxo, ME2=ciano, ME3=rosa). Cores em `_MENTORIA_CORES`. NÃO usa mais a classe `.badge` legada (que tem `text-transform:lowercase`).
- **Período do grupo:** `inicio` e `fim` em `YYYY-MM-DD` (inputs `type=date`). `valorMensal` (default R$ 6000, editável por grupo).
- **Status visual do card:** badge mono "● MENTORIA ATIVA/INATIVA/AGENDADA/PERÍODO NÃO INFORMADO" + borda lateral colorida + gradient sutil. Calculado por `_mentStatus(g)` baseado em hoje vs período.
- **Não exibe** valor mensal no card (decisão UX) — só aparece no Financeiro.

### Sessão de clínica — link da reunião + envio manual
- **Botão "🔗 Link Reunião"** no card de cada clínica (entre Editar e Enviar link). Abre modal dedicado `modal-clinica-link` com URL field + botão "🗑️ Remover link" (só aparece se já tiver link salvo). Valida `http://` ou `https://`. Botão fica azul (`btn-p`) se há link, cinza (`btn-s`) se não.
  - `openClinicaLink(id)` / `saveClinicaLink()` / `clearClinicaLink()` em ~9678–9710.
  - **O modal de Editar Clínica não tem mais o campo de link** — `saveClinica` preserva `c.link` do doc existente via `cExist = S.clinicas.find(x => x.id === editId)`.
- Botão **📧 Enviar link agora** aparece SÓ quando `c.link` está preenchido.
- `sendClinicaLinkNow(clinicaId, btnEl)` carrega alunos da subcoleção, filtra `status:'confirmed'` com email, dispara via EmailJS browser (**`template_hb89fxv`**, var `tipo_mentoria`), marca `c.emailLinkEnviadoEm` no doc.
- Botão muda pra "Enviar link novamente" + chip verde "✅ enviado em DD/MM HH:MM" depois do primeiro envio.

### Sessão de clínica — emails de confirmação/troca (visão aluno)
- `sendEmailMentoria(type, aluno, clinicaOrigem, clinicaDest)` em ~9736. **Template:** `template_hb89fxv`. 5 tipos: `confirmed`, `absent`, `swap`, `trocaConfirmada`, `match`.
- **Vars enviadas:** `to_email`, `nome`, `assunto`, `mensagem`, `tipo_mentoria` (TEA/TSA/ME1/ME2/ME3 — da clínica destino quando é troca/match, da origem nos demais), `dia`, `horario`.
- **Construção lazy das mensagens** (`msgBuilders[type]()`). Os msgs ficavam num objeto literal avaliado eagerly e quebravam com `Cannot read properties of undefined (reading 'mentorNome')` quando `clinicaDest` era undefined em `confirmed`/`absent`. **Não voltar pra `const msgs = {...}` em assignment direto** — usar funções por tipo.
- **`fmt(c)` é tolerante a `undefined`** — retorna `''` se `c` for falsy; usa `c.mentorNome||'(sem mentor)'`.
- **Order of operations crítica em `_mtaAplicarResp`:** updateDoc → render → (se absent: tentarPuxarSwapVaga → render) → sendEmailMentoria → alert. **Render acontece ANTES do envio de email** (que é assíncrono e demora 2-5s). Inverter essa ordem causa o bug "status só atualiza após F5".

### Coordenação — visualização de alunos por clínica
- `_renderClinicaAlunos(c, alunos)` em ~9447 renderiza a lista expandida ao clicar "👥 Ver alunos".
- **Badge "Aluno de: [mentor]"** (amarelo, `var(--yellow)`) aparece ao lado do nome quando o aluno tem `originalClinicaId` setado. Indica que ele veio por troca/swap da clínica de outro mentor. Tooltip mostra o tema da clínica de origem. Lookup: `S.clinicas.find(x => x.id === a.originalClinicaId)`.
- **`originalClinicaId` é setado em 5 fluxos:** `tentarPuxarSwapVaga` (4262), `mtaSubmitTroca` quando há vaga livre (4319), `tentarMatchTrocaMentoria` (9691, 9697), `forcarTrocaMentoria` da coord (9717).
- **Data/hora de resposta foi removida da linha do aluno** (decisão UX 2026-05-20: poluía a UI).
- **Stats da clínica reorganizadas** (canto direito do card do mentor): `14/20` em destaque, depois linha verde "✅ N confirmado(s)" + linha `🔄 N | ⏳ N | ❌ N` com separadores discretos.

### Features (kanban interno da coordenação)
Aba `📌 Features` no grupo **Administração** (admin-only). Roadmap de ideias do produto que o user usa pra organizar o que mandar pro Claude implementar.

- **3 colunas (status):** 💡 Ideia · 🔧 Em andamento · ✅ Feito.
- **Card mostra:** título, badge de prioridade (🔴 Alta · 🟡 Média · ⚪ Baixa, ordena dentro da coluna), barra de progresso do checklist se houver subtarefas, data de cadastro (`criadoEm`).
- **Modal de edição:** título, descrição em **editor visual contenteditable** com toolbar (B/I/U/S, listas, código inline, alinhamento, cores de texto e fundo). HTML sanitizado por `_featSanitize()` (permite `color`, `background-color`, `font-weight`, `font-style`, `text-decoration`, `text-align`).
- **Compat retroativa:** descrições antigas em markdown são convertidas via `_featToHTML()` ao abrir.
- **Checklist colapsável (dropdown)** acima da descrição: cada item tem checkbox + input editável + ✕ pra remover. Header mostra "N/M ✓ · X%" + mini-barra de progresso. Dropdown abre default quando há itens, fecha quando vazio. Adicionar item ou colar lista re-abre o dropdown.
- **Botão "📋 Colar lista":** parser `_featCkParse(raw)` aceita `- [ ] item`, `- [x] feito`, `- item`, `* item`, `1. item`, ou texto puro (uma linha = um item). Checkbox "Substituir lista atual" opcional.
- **Drag & drop entre colunas:** move o status do card. Salva imediato no Firestore.
- **Botão "📋 Copiar pro Claude":** monta payload markdown com título, prioridade, descrição (HTML→md via `_featHtmlToMd()`), checklist atual, **e adiciona instrução**: se sem checklist pede pro Claude quebrar em subtarefas ANTES de codar e devolver num bloco markdown pronto pra colar; se com checklist pede pra seguir a ordem mas validar se cabe quebrar mais.
- **Salvar não fecha o modal:** botão vira "⏳ Salvando", depois chip verde "✅ salvo às HH:MM:SS" no rodapé. Botão "Cancelar" vira "Fechar" após primeiro save.
- **Apagar com confirm padrão** (sem "EXCLUIR" — é admin-only e barato refazer).

### Sistema de Recursos (entregue completo — 25 subtarefas, 2026-05-13/14)
Sistema de contestação de gabarito de provas TSA/TEA/ME1/ME2/ME3. Aluno público (qualquer email) contesta uma questão (ou alternativa em modo VF); qualquer prof autenticado assume análise e dá parecer; aluno recebe resposta por email. Painel de métricas, importação por PDF (dual em TEA/TSA), mapa de navegação, contador regressivo, busca, etc.

**Dois formatos de prova (helpers em `_formatoPorTipoProva`, `_isProvaVF`, `_modoDefaultPorTipo`, `_letrasPorTipo`):**
- **TEA/TSA** → modo `estruturado` (ou `bloco`): 4 alternativas A-D, **1 correta** (gabarito único). `gabaritoOficial: 'A'|'B'|'C'|'D'`.
- **ME1/ME2/ME3** → modo `vf`: 5 alternativas A-E, **cada uma é V ou F** (gabarito por alt). `alternativas[i].gabaritoVF: 'V'|'F'`.
- Modo é forçado conforme tipo da prova ao criar questão. Modal de questão mostra inputs adequados (4 alts + select de gabarito, ou 5 alts + toggle V/F por alt).

**Lista de Questões (coord, aba 📚 Provas):**
- Cards mostram número, gabarito compacto (`A` em TEA/TSA, `A=V · B=F · C=V · D=F · E=V` em VF).
- Botões por card: **✓ Validar** (concordo com gabarito oficial — bool global `validada`), **💡 Sugerir recurso** (parecer proativo sem precisar de contestação), **✏️ Editar**, **🗑️ Apagar**.
- Status derivado (`_recStatusQuestao`): "EM ANÁLISE PELO TIME" → "GABARITO VALIDADO" (verde claro) ou "CABE RECURSO" / "NÃO CABE" — **só conta parecer finalizado** (rascunho não muda o status visual).

**Visão aluno (`/recursos`):**
- Identificação por email no primeiro acesso (`localStorage[aros_recursos_email_{provaId}]`).
- Lista de questões em boxes coloridos por status (5 cores em VF agregando por alts; 4 cores em TEA/TSA).
- Em **modo VF**: cada alternativa aparece com seu badge V/F + botão **📨 Contestar** individual + parecer da alt (se finalizado).
- Em **TEA/TSA**: gabarito único destacado + botão "Contestar Gabarito" único.
- **Aluno só vê parecer FINALIZADO** — rascunhos da coord ficam invisíveis (`_parecerPublicadoGeral`, `_parecerPublicadoVF`).
- Contador regressivo até `dataLimite` (verde → amarelo → laranja → vermelho conforme aproxima, com `setInterval` por segundo).
- Mapa de questões (grid colorido por status, aparece com 10+ questões).
- Busca por número ou termo no enunciado/alts.
- Tempo médio de resposta calculado das contestações já respondidas.

**Workflow de parecer (refatorado em 2026-05-14):**
1. Lista FIFO em Gestão de Recursos tem **3 seções**: ⏳ Pendentes (sem atribuição) · 🛠️ Em análise (agrupado por prof) · ✅ Respondidas.
2. Botão **👁 Visualizar solicitação** (pendentes) ou **🛠️ Continuar análise** (em análise) abre modal `modal-parecer`.
3. Modal abre **read-only** com card laranja **⏳ AGUARDANDO ANÁLISE** + botão destacado **🛡️ Assumir análise**.
4. "Assumir análise" abre `modal-assumir` com select de profs (lista `S.profs`), lembra último escolhido via `localStorage.aros_rec_ult_prof`. Re-checagem anti-race antes do setDoc.
5. Após assumir: campos liberados, botões: **💾 Salvar rascunho** (`parecerRascunho` ou `pareceresPorAlt[L].rascunho`) · **✓ Finalizar parecer** (marca `parecerFinalizado:true` / `finalizado:true`, limpa rascunho, marca contestações como respondidas, dispara email). Botão **↩️ Desvincular** libera pra outro prof assumir.
6. Argumento do parecer é **contenteditable com toolbar** (B/I/U/S, listas, alinhamento, 7 cores texto + 5 cores fundo, código inline, limpar) — mesmas funções de sanitização que features (`_featSanitize`).
7. Modal **bloqueia close ao clicar fora** via atributo `data-no-backdrop-close` (handler global no `.mo` respeita esse atributo).
8. Em modo VF, todo workflow é **por alternativa** — `pareceresPorAlt[letra]` tem seus próprios `atribuidoA`, `rascunho`, `finalizado`, etc.

**Botão "💡 Sugerir recurso" (parecer proativo):**
- Bypassa o fluxo de assumir/rascunho — abre modal direto editável.
- Em modo VF, abre `prompt()` pedindo qual alternativa (A-E).
- Dropdown de parecer pré-selecionado em **"Cabe Recurso"** automaticamente.
- Botão final é **"✓ Salvar sugestão"** (cabe recurso direto), não "Finalizar".

**Importação por PDF (dual em TEA/TSA, single em ME):**
- Modal tem 2 uploads: PDF da prova + PDF do gabarito (opcional, só TEA/TSA).
- **Detecção automática de formato** (`_detectarFormatoPdf`): se 3+ linhas têm padrão `A) ... Verdadeiro/Falso` → ME; senão TEA/TSA.
- Parser ME (`_parseImportPdfME`): captura `gabaritoVF` direto da linha de cada alt.
- Parser de gabarito separado (`_parseGabaritoPdf`): regex `(\d+) [-.):\s]+ ([A-D])` captura pares.
- Em modo ME, gabarito vem embutido na prova (campo "Verdadeiro"/"Falso" no fim de cada linha de alt).
- Em TEA/TSA, gabarito vem em PDF separado com pares "1-A", "2)B", "Questão 3: C", etc.
- **PDF.js via CDN v3.11.174** (`https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js`). v4 só publica `.mjs` ES-module, que NÃO carrega via `<script>` regular — manter v3 ou trocar pra `legacy/build/pdf.min.js`.

**Pipeline de extração robusta (2026-05-14):**
- `_extrairTextoPdf(pdf)`: bucket por Y com tolerância de 2px + items ordenados por X dentro de cada linha. Cobre PDFs com chars de Y ligeiramente diferentes (acentos, subscripts).
- `_limparBoilerplatePdf(texto)`: detecta linhas repetidas (≥3 ocorrências = header/footer) + blacklist regex pra padrões conhecidos (`Documento gerado em`, `Sociedade Brasileira de Anestesiologia`, `Página X de Y`, `Nome:`, `Data:`, etc).
- `_removerOrfaosSubSup(texto)`: filtra linhas ≤4 chars compostas só de `[-+0-9.,°º²³¹⁰⁻⁺µμ]` (subscripts/superscripts órfãos como `2` de O₂, `-1` de mg.dL⁻¹).
- `_formatarSeparacaoQuestoes(texto)`: insere linha em branco antes de cada `N)`/`N.`/`N -` pra leitura/edição manual mais fácil.
- Parsers `_parseImportBloco` (TEA/TSA, 4 alts A-D) e `_parseImportPdfME` (ME, 5 alts A-E com V/F) têm:
  - **Buffer pré-questão**: linhas órfãs antes de `N)` viram início do enunciado da próxima questão (PDFs em 2 colunas frequentemente colocam o número numa linha isolada).
  - **Buffer sticky**: uma vez ativo, continua acumulando linhas (mesmo as que começam com minúscula — continuações de frase) até a próxima `N)`.
  - **Heurística "alts saturadas"**: quando já temos o número máximo de alts (4 ou 5), a última terminou com pontuação final, e a nova linha começa com maiúscula → é início de enunciado da próxima questão, não continuação da última alt.
- `_reemitirQuestoes(questoes)`: após parse, **re-emite o texto em formato canônico** (N) enun completo → A) alt → B) alt → ... → Gabarito: X). A textarea passa a mostrar essa versão limpa, que o user pode editar livremente. Esse pipeline roda tanto no upload do PDF da prova quanto quando o PDF do gabarito separado chega.

**Bibliografia (renomeada de "Fontes" em 2026-05-14, coleção mantida `fontesRecurso`):**
- Cada bibliografia tem `tipos: string[]` (subset de TEA/TSA/ME1/ME2/ME3); vazio = "geral", vale pra todos os tipos.
- Editor com **checkboxes coloridos por tipo** (pills clicáveis).
- Aba 📖 Bibliografia tem **barra de filtros**: TODOS / 📚 GERAL / TEA / TSA / ME1 / ME2 / ME3, com contadores em cada botão.
- Dropdown no modal de contestação filtra automaticamente pela prova: pega o tipo, mostra só bibliografias "geral" + as vinculadas àquele tipo.
- Helper: `_bibliografiasParaProva(provaId)`.

**Roteamento de view aluno:**
- View tem 4 estados: `aluno` (home), `coord`, `mentoria`, `recursos`.
- `_processRoute()` centraliza: lê `sessionStorage.aros_spa_redirect` (do 404.html), restaura via `history.replaceState`, depois checa pathname/hash.
  - `/recursos` ou path terminando em `/recursos` → `goRecursosAluno()`.
  - `#recursos` (fallback hash, usado quando file:// onde history.replaceState falha pra paths) → idem.
  - `#mentorias` → `goMentoriaAluno()`.
  - `#admin` ou `#coord` → `_revealCoordTab()`.
- `switchView(v)` detecta `file://` e usa hash em vez de path. Auto-dispara `renderRecAluno()` quando `v === 'recursos'`.
- Boot Promise.all inclui `loadRecProvas()` pra dados disponíveis em memória desde o load.
- Listeners `visibilitychange` e `focus` re-disparam `renderRecAluno()` se a aba do navegador voltar a ficar visível.

**Convenções importantes do módulo:**
- Estado `S.recursos = { provas, fontes, config, curProvaId, viewMode, questoesCache, contestacoesPendentes, alunoState, fonteTipoFilter, _pdfGabaritoMap, _contadorTimer }`.
- Cores de tipo de prova **reusam** `_MENTORIA_CORES` (TEA azul, TSA laranja, ME1 roxo, ME2 ciano, ME3 rosa).
- IDs prefixados: prova `prv_*`, questão `q_*`, contestação `c_*`, bibliografia `fnt_*`.
- Storage path: `provas/{provaId}/questoes/{qId}/{filename}` (imagem da questão) | `.../contestacoes/{cId}/{filename}` (anexo do aluno) | `.../parecer/{filename}` (anexo do prof). 15MB, image/* only.
- Email: `sendParecerEmail` usa `template_r0vjejs` reciclado por enquanto. **Pendente**: template dedicado no EmailJS quando user criar.
- Modal genérico tem handler que fecha ao clicar no overlay; opt-out via atributo `data-no-backdrop-close` no `.mo`. Modais com input crítico que não devem fechar acidentalmente: `modal-parecer`, `modal-import-pdf`, `modal-import-bloco`, `modal-questao`. Esse opt-out preserva conteúdo digitado contra cliques fora.

### Financeiro
- Salário fixo + atividades (revisão, mentoria, clínica) + fechamento mensal por prof.
- **Mentoria como lançamento automático:** `calcFinanceiroMes(anoMes)` percorre `S.mentorias`, calcula sobreposição com o mês via `_mentSobreposicaoMes(g, anoMes)` e soma `valorProporcional` ao `mentorNome`.
- **Pro-rata por dias reais** (Opção A): `valorMensal × diasNoMes / diasDoMes`. Meses cheios pagam integral; primeiro e último mês podem ser parciais (28/29/30/31 dias).
- `mentoriasDet[]` por prof: `{grupoId, tipo, inicio, fim, valorCheio, valor, dias, diasMes, parcial, alunosQtd}`.
- Tabela do financeiro: coluna "Mentoria" mostra "N grupos · R$ X"; badge **PARCIAL** (amarelo) quando algum mês parcial.
- Relatório individual: seção Mentoria com tabela `Tipo · Período · Alunos · Dias trabalhados no mês · Valor`.
- Excel: aba **Mentoria** com colunas `Professor, Tipo, Início, Fim, Alunos, Dias no mês, Dias do mês, Tipo de mês (Parcial/Mês cheio), Valor cheio, Valor pago`.
- Card resumo do topo: 4 cards agora (Total geral, Salários fixos, **Mentoria**, Variáveis).
- `FIN_DEFAULT_TIPOS` ainda tem `'mentoria'` como tipo de lançamento livre (legado), mas mentoria automática NÃO usa esse tipo — ela é gerada via cálculo de sobreposição direto, não fica gravada como lançamento.

**Cadastros do Financeiro** (modal **⚙️ Cadastro / Configurações**, admin-de-financeiro-only — renomeado de "Cadastros" em 2026-05-19) com 3 abas:
- **👨‍⚕️ Professores**: tabela com **busca por nome** (filtra em tempo real via `_finCadFilterProfs`) + 4 colunas: Professor / Email (somente leitura — fonte: `S.profsEmail[nome]`) / Salário fixo / Início / Fim. Início/Fim são `<input type="month">` (YYYY-MM) opcionais; se vazios o salário aplica em todos os meses; se preenchidos restringe ao intervalo.
- **📌 Tipos de atividade**: editor de tipos personalizados (atividades extras).
- **📧 Configurar e-Mail** (renomeado de "Solicitar Nota" em 2026-05-19): config do envio automático de email. Campos: `emailCoord` (CC), `templateId`, `serviceId`. Salvo em `S.financeiro.notaFiscalCfg = {emailCoord, templateId, serviceId}`.

**Setup atual do EmailJS (deploy 2026-05-19):**
- Service: `service_aros_nf` (Gmail OAuth com conta de usuário real do Workspace; "From" é determinado por OAuth)
- Strategy "send-as alias": OAuth com conta pessoal do user (ex: `tiarlles.miller@grupomedreview.com.br`) que tem alias configurado pra enviar como `controladoria@grupomedreview.com.br` (grupo distribuído pros 4 membros da controladoria). Template seta `From Email: controladoria@grupomedreview.com.br` + `Reply To: controladoria@grupomedreview.com.br` — assim o destinatário vê controladoria como remetente, respostas voltam pro grupo todo.
- Template `tmpl_aros_nf` (renomear conforme configurado): aceita variáveis `{{nome}}`, `{{mes}}`, `{{valor_total}}`, `{{detalhamento}}`, `{{assunto}}`, `{{to_email}}`, `{{cc_email}}`. HTML do template em `/tmp/aros-nf-template.html` (versionado fora do repo). Texto menciona prazo de **3 dias úteis**.

**Painel de pagamentos do mês** (`renderFinanceiro` — refatoração massiva em 2026-05-19):
- **🔍 Busca** por nome no topo + **filtro de status na coluna Controle** (pills "Todos · Aguardando · Solicitada · Emitida · Não emitida") via `_finFilterProfs()` cruzando ambos os critérios. Estado do filtro em `window._finFilterCtrl`.
- **Ordem alfabética**.
- **Coluna Professor FIXA** (sticky horizontal) + `min-width:240px` + background sólido pra não vazar conteúdo das colunas que rolam por trás.
- **Fontes dos números reduzidas 20%** em toda a tabela: 13px → 10.5px (células), 15px → 12px (total), 11px → 9px (subtexto). Coluna Professor mantém tamanho normal.
- **Cards de resumo em 1 linha só** (`grid-template-columns:repeat(4,1fr)`, padding e fontes compactos).
- Coluna **Rodadas Sim Oficial** (renomeada de "Rodadas").
- Coluna **Solicitar Nota** (admin-de-financeiro-only) com `_finSolicitarNota(profNome, anoMes)`:
  - 1ª solicitação: botão azul `📨 Solicitar Nota` → confirm → dispara email via `_finEnviarNotaInterno` (helper extraído pra reuso entre individual e bulk) → registra timestamp em `mes.notasSolicitadas[profNome]` + **auto-muda controleStatus pra 'nf-solicitada'** no mesmo save.
  - Já solicitado: mostra `✓ DD/MM HH:MM` em verde + botão `🔁 Reenviar`.
  - **Chip vermelho `⚠️ VENCIDO · N DIAS ÚTEIS`** quando passou >3 dias úteis sem o admin marcar 'nf-emitida' ou 'nf-nao-emitida' (helper `_diasUteisDesde`).
- Coluna **Controle** (após Solicitar Nota): dropdown com 4 status — `aguardando-fechamento` (default) · `nf-solicitada` · `nf-emitida` · `nf-nao-emitida`. Cores: cinza · azul · verde · vermelho. Não-admin vê pill colorida read-only. Status salvo em `mes.controleStatus[profNome]`. Handler `_finSetControle`.
- Coluna **Ações** redesenhada (2026-05-19): botão **📄 Detalhar** com texto visível + botão `🗑️` vermelho ao lado pra excluir o prof do mês.
- **Exclusão de prof do mês** (`_finExcluirProf`) com **dupla confirmação**: `confirm()` + `prompt("digite EXCLUIR")`. Marca em `mes.profsExcluidos[]` (reversível, não destrutivo). Rodapé da tabela mostra "🗑️ N excluídos: [Nome ↩]" com botão de restaurar (`_finRestaurarProf`).
- **Botão "📨 SOLICITAR TODAS AS NOTAS"** no header quando mês fechado: dispara em loop sequencial pra todos os profs com email cadastrado e total > 0. Confirma uma vez com lista (com email vs sem email). Status do badge mostra progresso `"📨 Enviando 3/12: Prof X…"`. Save único no final. Alert final com sumário. Função `_finSolicitarTodasNotas`.

**Sistema de Pendências (rollover de NF não emitida — entregue 2026-05-19):**
- **Trigger manual com confirmação**: admin muda dropdown Controle pra "NF não emitida" → popup `confirm` "Mover R$ X pro mês [M+1]? Sim/Cancelar".
- **Modelo de dados**: `S.financeiro.meses[anoMes].pendencias[] = [{id, profNome, valor, origemMes, descricaoSnapshot, criadoEm, profSnapshot, controleStatus, notaSolicitadaEm}]`. `profSnapshot` é o objeto `p` completo (com `rodadasDet`, `simExtrasDet`, `mentoriasDet`, `manuaisDet`) congelado no momento do rollover — usado pra reconstruir o detalhamento exato no email da pendência. Flag `mes.rolloverPara[profNome] = 'YYYY-MM'` no mês ORIGEM marca o rollover pra render mostrar badge.
- **Próximo mês = M+1 sempre** (helper `_proximoMes(anoMes)`). Cria mês destino se não existir.
- **Render no mês origem**: linha do prof com rollover fica `opacity:.78` (suave), total **riscado** + badge laranja `🔄 [MES/ANO]`.
- **Render no mês destino**: seção nova **"💸 Pendências de meses anteriores"** logo abaixo da tabela principal — borda laranja, header com total grande, tabela `Professor · Descrição · Origem · Valor · Solicitar Nota · Controle · 🗑️ Remover`. Cards do resumo do topo incluem pendências no Total Geral (com nota "inclui R$ X em pendências") e no card Variáveis (sublabel "+R$ X pendência(s)" em laranja).
- **Email separado da pendência** (`_finSolicitarNotaPendencia`): assunto `Solicitação de NF — Pendência de [Mai/2026]`, corpo deixa explícito no topo "📌 Esta é uma PENDÊNCIA referente ao mês de X. Pagamento sendo regularizado em Y.", detalhamento line-by-line do mês original (reconstruído do `profSnapshot`). Auto-marca `pendencia.controleStatus = 'nf-solicitada'` ao enviar.
- **Pendência tem própria coluna Controle** (`_finSetControlePendencia`) — independente do controle do mês de origem. NÃO faz rollover automático ao marcar 'nf-nao-emitida' (evita recursão infinita) — admin decide manualmente.
- **Reversão automática**: se admin mudar Controle do mês origem de 'nf-nao-emitida' pra outro status, popup pergunta se quer remover a pendência do mês destino.
- **Reversão manual**: botão 🗑️ na linha da pendência (`_finRemoverPendencia`) remove a pendência E limpa o flag `rolloverPara` no mês origem.
- **Resultado pro prof**: recebe **email 1** com salário normal do mês corrente (R$ 6k de Jun) + **email 2** separado com a pendência (R$ 6k de Mai) → emite **2 NFs separadas** (1 pra cada origem).

**Detalhamento do email** (`_finEnviarNotaInterno` — refatorado em 2026-05-19, reutilizado por individual + bulk):
- Formato line-by-line: cada categoria tem linha de resumo + sub-bullets dos itens. Ex: Rodadas mostra cada `simNome · Sábado rodada 1 · 11/05/2026`; Sim Extras mostra cada aluno; Mentorias mostra cada grupo com período e dias; Atividades extras mostra cada item.
- Indentação dos sub-bullets preservada via `white-space: pre-line` no HTML do template.

**Suporte a múltiplos emails por prof** (deploy 2026-05-19):
- `S.profsEmail[nome]` agora aceita 1 ou mais emails separados por `;` (ou `,` fallback). Persistido como string única em `config/professores.emails[nome]`.
- Helper `_profEmails(nome)` retorna `string[]` (split + trim + dedupe). Helper `_normalizeEmailsStr(raw)` normaliza ao salvar (padroniza separador pra `; `).
- `_finSolicitarNota` e `_finSolicitarNotaPendencia` fazem loop sequencial enviando 1 email por destinatário (não usa BCC/CC do mesmo template). Cada envio do prof = N emails separados.
- Input na UI de Configurações → Lista de Professores: `type="text"` (não `email`) com placeholder `email1@dom.com; email2@dom.com (opcional · até 3 emails separados por ;)`. Display read-only no modal Cadastros do Financeiro mostra 1 email por linha quando há múltiplos.

**Detalhamento individual** (`openFinRelatorio`):
- Resumo só lista categorias com valor > 0 (esconde zerados).
- Seções (Rodadas Sim Oficial, Simulados extras, Mentoria, Atividades extras) só renderizam se houver registros.

**Email do professor** vive em `config/professores.emails = {[nome]: 'email1; email2'}` (fonte única). Carregado em `S.profsEmail`. Editado **apenas** na aba Lista de Professores (Configurações) via `saveProfEmail(nome, email)` no blur do input. O modal Cadastros do Financeiro mostra como **somente leitura**.

**Salário fixo com período opcional**: `S.financeiro.profsFin[nome] = {salarioFixo, inicio, fim, ...}`. No cálculo, `fixo=0` se `anoMes < inicio` ou `anoMes > fim`. Comparação lexicográfica funciona pra YYYY-MM.

**Filtro de profs com atividade**: `calcFinanceiroMes` retorna só profs com `fixo>0 || totalRodadas>0 || ...`. Profs zerados não aparecem (decisão UX — mantém tabela enxuta).

**Selector de mês** (2026-05-19): piso fixo em Maio/2026 (anterior não existia o sistema) + 12 meses futuros do mês atual (pra planejamento de pendências/rollovers). Ordem: mais recente primeiro.

**Bug fix 2026-05-19**: `loadFinanceiro` agora carrega `notaFiscalCfg` no estado em memória (estava sendo dropado no reload — save ia pro Firestore mas no boot perdia).

### Sistema de auth: permissões granulares e admin por aba (2026-05-19)

**Modelo de dados** em `usuarios/{username}`:
- `role`: `'admin'` (acesso total a tudo) | `'user'` (granular)
- `permissoes[]`: lista de IDs de abas que o usuário VÊ (ex: `['financeiro']`)
- `permissoesAdmin[]` (NOVO): lista de abas em que o usuário tem **poderes de admin** sem ser admin geral. Ex: `['financeiro']` faz o user agir como admin DENTRO do financeiro mas não ver outras abas
- `inativo: bool` (NOVO): se `true`, usuário é filtrado do login + da listagem (usado pra "soft-delete" em renomeação, já que rules bloqueiam delete em `/usuarios`)
- `renomeadoPara: 'novoUsername'` + `renomeadoEm: ISO` (NOVO): preenchidos quando admin renomeia um usuário

**Helper `_isAdminEm(tab)`**: retorna `true` se `role==='admin'` OU se `permissoesAdmin.includes(tab)`. Substituiu **todos os 13 checks** de `S.currentUser?.role==='admin'` que existiam dentro do escopo do financeiro (linhas 12200-13400 do index.html). Pra outras features, novos checks devem usar esse helper se for feature-específica, ou continuar com `role==='admin'` se for admin global.

**Renomear usuário** (UI nova em 2026-05-19): docs do Firestore têm ID imutável e rules bloqueiam delete em `/usuarios`. Estratégia: ao renomear, cria novo doc com novo ID + marca o velho com `inativo: true` + `renomeadoPara: novo`. Login (`tryLogin`) e restore session filtram inativos via `!x.inativo`. Listagem `renderUsuarios` também filtra.

**Validador de username relaxado** (2026-05-19): de `/^[a-z0-9._-]+$/` pra `/^[a-z0-9._@+-]+$/` — aceita email como username (necessário pra `controladoria@grupomedreview.com.br`).

**Modal de edição de usuário** (`openUserModal` / `saveUser`):
- Campo "Nome de usuário" agora editável mesmo em edit mode (era `disabled`).
- Novo grid **"Admin de abas específicas"** abaixo do grid de permissões. Sincronizado via `_muSyncAdminGrid()`: só habilita checkbox de admin pra abas onde o user já tem permissão de acesso.
- Quando "Administrador geral" está marcado, ambos os grids (permissões + admin-por-aba) ficam desabilitados.
- Badge na listagem mostra `admin: financeiro` em destaque pros users com `permissoesAdmin` setado.

**Caso de uso típico (controladoria)**: usuário `controladoria@grupomedreview.com.br` com `permissoes: ['financeiro']` + `permissoesAdmin: ['financeiro']` → vê SÓ a aba Financeiro, mas com poderes totais lá dentro (pode fechar mês, solicitar NF, editar cadastros, excluir profs, etc).

## Firestore Rules (resumo)

Pragmáticas, não restritivas, porque o app **não usa Firebase Auth**:
- Default deny pra coleções desconhecidas.
- Validação de **shape** em creates (tipos, tamanho de strings, enums).
- **Block delete** em `simulados/{simId}`, `config/{cfgId}`, `usuarios/{u}`, `solicitacoesExtra/{r}`, `notas/...`, `checklists/...meta`, `feedbackGeral/{simId}`, `revisaoCasos/.../historico/...`.
- **Read aberto** em quase tudo.
- `revisaoCasos/.../comentarios/{cmtId}`: `targetType` deve ser `'enunciado' | 'pergunta' | 'item' | 'caso'`; `delete: true` (necessário pro prof apagar próprio comentário).
- `mentorias`, `blocosClinica`, `clinicas`: `tipo in ['TEA','TSA','ME1','ME2','ME3']` (atualizado em 2026-05-13).
- `tarefas/{taskId}`: `titulo` string não vazia + `status in ['ideia','fazendo','feito']` + `prioridade in ['alta','media','baixa']`.
- `provas/{provaId}`: `nome` string não vazia + `tipo in ['TSA','TEA','ME1','ME2','ME3']` + `status in ['ativa','encerrada']`.
- `provas/{provaId}/questoes/{qId}`: `numero` number + `modo in ['estruturado','bloco','vf']` (deploy 2026-05-14).
- `provas/{provaId}/questoes/{qId}/contestacoes/{cId}`: `emailAluno` matches `.+@.+` + `motivo` string não vazia. Aluno público pode criar (sem auth).
- `fontesRecurso/{fId}`: `nome` string não vazia.
- `recursosConfig/{cfgId}`: open create/update (single doc 'settings'), block delete.
- `projecaoLive/{liveId}` (deploy 2026-05-15): `simId` + `alunoId` strings; delete livre (limpa após encerrar). Subcoleção `strokes/{strokeId}`: open create/update/delete.

## Storage Rules

- `revisaoCasos/{revId}/{allPaths=**}`: read público; write até **15MB** imagens; delete livre.
- `checklists/{simId}/obs_imgs/{allPaths=**}`: idem.
- `simulados/{simId}/slides/{allPaths=**}`: idem (slides de projeção).
- `provas/{provaId}/{allPaths=**}`: idem (imagens de questão, contestação, parecer).
- `checklists/{simId}/tpl_imgs/{allPaths=**}` (2026-05-14): imagens do enunciado/pergunta/gabarito no template do checklist. Paths usados: `tpl_imgs/{bloco}/enun_{ci}/{file}`, `tpl_imgs/{bloco}/perg_{ci}_{pi}/{file}`, `tpl_imgs/{bloco}/gab_{ci}_{pi}/{file}`.
- Default deny.

Deploy: `npx -y firebase-tools deploy --only storage` (precisa autorização do usuário).

## Cloud Function (Hotmart)

Pasta: `cloud-function-hotmart/`
- Gen 2, Node 20, region `us-central1`, invoker `public`.
- Env vars em `.env` (gitignored): `HOTMART_TOKEN`, `SLACK_WEBHOOK`.
- Valida HOTTOK no header `X-HOTMART-HOTTOK` ou body.
- Extrai `xcod` de `purchase.origin.xcod` (formato Hotmart 2.0.0).
- Atualiza `solicitacoesExtra/{xcod}` → status `pago` + `paidVia: 'hotmart'`.
- Notifica Slack se `SLACK_WEBHOOK` configurado.

Deploy: `npx -y firebase-tools deploy --only functions --force` (**SÓ quando o usuário autorizar**).

## Comandos úteis

```bash
# Logs da Cloud Function
npx -y firebase-tools functions:log --only hotmartWebhook --lines 50 2>&1 | grep -v "AuditLog"

# Deploy Cloud Function (apenas com autorização)
npx -y firebase-tools deploy --only functions --force

# Deploy de regras
npx -y firebase-tools deploy --only firestore:rules
npx -y firebase-tools deploy --only storage

# Dependências
cd cloud-function-hotmart && npm install

# Scripts ad-hoc de migração / fix de dados
cd /tmp/xlsx-reader && node SCRIPT.js
# Pacote firebase JS SDK costuma estar instalado; rodar `npm init -y && npm install firebase` se faltar.
```

Não há build, lint, nem suíte de testes. Validação = abrir `index.html` no navegador.

## Convenções e restrições (CRÍTICAS)

1. **Deploy via git push (atualizado 2026-05-15)**. Diretório local agora é repo git conectado ao GitHub. Quando user autorizar explicitamente ("deploy"/"sobe pra produção"), rodar `git add -A && git commit -m "..." && git push origin main`. GitHub Pages atualiza em ~30s. **NÃO fazer push preventivo após edits** — sempre esperar autorização. **Usuário SEMPRE testa localmente no `iniciar-servidor-dev.command` antes de autorizar o push** — nunca pular essa etapa.
2. **NUNCA copiar `index.html` de worktree pra raiz** (incidente 2026-05-18). Múltiplas worktrees rodam em paralelo com trabalho não-commitado de sessões diferentes; o `iniciar-servidor-dev.command` auto-detecta a worktree de mtime mais recente. Cópia manual pra raiz clobbera trabalho de outras sessões E muda o mtime da raiz, desviando o auto-detect. Se o user diz "não vejo as mudanças": (a) checar processo do servidor com `lsof -iTCP:8081 -sTCP:LISTEN` + `lsof -p <pid> | grep cwd`, (b) se for processo antigo apontando pro lugar errado, matar (`kill <pid>`) e pedir pro user relançar o script, (c) Cmd+Shift+R no navegador pra burlar cache. Nunca `cp` pra raiz sem `git status` na raiz + listagem de worktrees + checagem de mtime/status de cada uma primeiro.
3. **Não criar arquivos `.md`** sem o usuário pedir explicitamente.
4. **Cloud Function: deploy SÓ quando autorizado**. Não fazer deploy preventivo.
5. **Migrações de dados / fixes pontuais** via scripts Node em `/tmp/xlsx-reader/` usando **Firebase JS SDK como cliente público** (não Admin SDK). Funciona porque as Rules permitem.
6. **Nunca coloque `</script>` literal dentro de template literals JS** no `index.html`. Splitar como `` `<scr` + `ipt>` `` ou parser HTML quebra.
7. **Backups em `Backup/index N.html`** — NÃO editar.
8. **Distinguir oficial vs extra** sempre que mexer em listagem de simulados.
9. **Sessão em localStorage** (`aros_session`). Não armazena senha, só username — re-resolvido em `S.usuarios` no boot.
10. **Estrutura do menu lateral é DATA-DRIVEN**: ao mexer em sidebar, modal de permissões, ou qualquer renderização que dependa de grupos/abas, use `_menuEffectiveGroups()` em vez de iterar `TAB_GROUPS` direto. `TAB_GROUPS` é só fonte das tabs built-in; a layout final pode estar customizada em `config/menu.structure`.

## Dívidas técnicas conhecidas (não corrigir sem pedirem)

- Senhas plaintext em `usuarios/{username}` (refactor pra Cloud Function de login resolveria).
- Slack webhook URL legível em `config/simExtra` (mover pra Cloud Function como proxy resolveria).
- Sem Firebase Auth → Rules tem proteção limitada (só shape + block deletes).
- Sem Firebase App Check → API key usável por qualquer um.

## Estilo do usuário (Tiarlles)

- Pragmático, anestesiologista (não dev profissional). Quer ação direta, sem explicação técnica longa.
- Mensagens curtas, frequentemente em PT-BR informal.
- "Foi" = funcionou/aprovado. "Pode" = autorizado a prosseguir.
- Prefere ver o resultado funcionando localmente antes de subir.
- Quando algo quebra, costuma colar a mensagem de erro direto.

### Editor de Template do Checklist (refatorado 2026-05-14/15)

**Layout empilhado estilo Revisão de Casos** (substituiu o switcher de aba antigo):
- Dois cards coloridos um abaixo do outro: 🩺 Criar / Simulação (azul) e 🎙️ Oral Online (laranja).
- Cada card tem header com contador de casos + dois botões: **+ Adicionar Manualmente** (cheio, cor do bloco) e **+ Adicionar em Bloco** (outline).
- Casos de cada bloco ficam dentro do seu card, com `border-left` colorido.

**Bloco-aware refactor**:
- IDs prefixados por bloco: `tpl-criar-hdr-caso-0`, `ck-oral-obs-1-0-2`, etc. — sem colisões de índice.
- `_tplOpen = {criar: {casos: Set, perguntas: Set}, oral: {...}}` — estado de abertura por bloco.
- Funções mutadoras (`addCkCaso`, `rmCkCaso`, `addCkPergunta`, `rmCkPergunta`, `addCkItem`, `rmCkItem`, `parsePastedItens`, `toggleCkObs`, `salvarCkObs`, `uploadImgObsCk`, `removeImgObsCk`, `tplToggleCaso`, `tplTogglePerg`, `saveCkPergunta`) aceitam `bloco` como primeiro param.
- Handlers `oninput` no DOM usam refs diretos (`_ckTemplateEditCriar` / `_ckTemplateEditOral`) em vez de `_ckTemplateEdit` (que ficou só pro slides modal e legacy).
- `syncTplFromDOM` sincroniza **ambos** os blocos.
- `_persistBlocoTemplate(bloco)` é helper único pra salvar um bloco específico.

**Bug crítico de "items sumindo" corrigido** (2026-05-13):
- `syncTplFromDOM` usava seletor `input` genérico que pegava também o `<input type="file">` do upload de obs imagem. Resultado: cada `setDoc` por blur clobberava `descricao` do próximo item (file input retorna vazio).
- Fix: filtro `input:not([type="file"])`.

**Importação em bloco no template** (2026-05-14):
- Botão "+ Adicionar em Bloco" abre `modal-import-ck-tpl` com textarea + checkbox "Substituir todos os casos existentes do bloco".
- Usa `_parseImportCasos` (reusa parser da Revisão de Casos).
- Detecção anti-double-click: button disable + nullify de `_ickTplParsed` antes do await.
- Preserva enunciado + perguntas + itens + gabarito.

**Campo Gabarito comentado** (exclusivo Simulado Extra, 2026-05-15):
- Cada pergunta tem campo `gabarito` (string) + `gabaritoImagens[]` (URLs).
- Parser `_parseImportCasos` detecta marker `Comentário:`, `Comentario:`, `Anotação:`, `Comentário da pergunta N:`. Modo `mode='comentario'` acumula linhas seguintes.
- UI no editor: textarea verde "💬 Gabarito comentado" + galeria de imagens, **só visível pra `_ckSimEhExtra()`**.
- Gabarito NÃO vai pra slides (não aparece na projeção).
- Aparece no feedback final do aluno (popup `gerarFeedbackAluno`) na seção "📚 Casos, checklist e gabarito" entre habilidades e rodapé.
- PDF gerado (`montarHTMLRelatorio`) também inclui via helper `_montarHTMLExtraCasesPDF` quando `d.isExtra`.

**Galeria de imagens em enunciado/pergunta/gabarito** (2026-05-14):
- `_renderTplImagensCk(arr, bloco, ci, pi, alvo)` — alvo `enun`/`perg`/`gab`. Inputs file individuais com IDs únicos.
- Upload com **feedback visual**: placeholder com spinner + nome do arquivo, substituído pela thumbnail quando completa.
- Storage path: `checklists/{simId}/tpl_imgs/{bloco}/{enun_ci|perg_ci_pi|gab_ci_pi}/{ts}_{file}`.
- Limite 15MB, image/* only.
- Imagem da pergunta vence sobre imagem do enunciado quando o slide é gerado (precedência fixada).

**Enunciado do caso editável** (2026-05-14):
- Textarea `📝 Enunciado do caso (opcional)` no topo do body do caso (quando expandido).
- `_renderTplCaso` inclui o textarea + galeria de imagens do enunciado.
- Salvo em `caso.enunciado` (string) e `caso.enunciadoImagens[]`.
- Render no checklist do prof (visualização do simulado) e nos slides como `enunciadoImagem` separado.

**Botão "▶️ Habilitar / ✓ Habilitado" por aluno**:
- Renderizado em `renderCkStudents` ao lado do badge de status.
- Cria/deleta `projecaoLive/{simId}__{alunoId}` doc com `ativo:true/false`.
- Quando habilitado, mostra também botão "📋 Link" (laranja) que copia URL pra clipboard.
- `_ckSubscribeLiveStatus()` assina cada possível doc dos alunos do sim via onSnapshot, atualiza estado `_ckLiveStatus[alunoId]` e re-renderiza a lista.

**Botão "🔄 Resetar" por aluno**:
- Renderizado quando aluno está "em andamento" ou "finalizado".
- Dupla confirmação (confirm + digitar "RESETAR").
- Deleta `checklists/{simId}/respostas/{studentId}` (com fallback `setDoc merge:false` zerando se rule bloquear delete).
- Zera notas em `notas/{simId}/alunos/{key}` (`criar:null, oral:null, notaFinal:null`).
- Re-renderiza lista + chama `renderDesempenho`.

**Cálculo automático de notaFinal**:
- Em `lancarNotaBloco`, após gravar `criar` OU `oral`, lê o doc atual e checa se o OUTRO bloco já tem nota. Se sim, calcula `notaFinal = (criar + oral) / 2` e grava no mesmo setDoc.
- Antes a nota final só era preenchida pelo "✏️ Editar" manual no Desempenho.

**Slides auto-gerados na criação/import** (Criar):
- `addCkCaso('criar')` → cria caso com `slides: gerarSlidesPadrao(...)` (só capa por enquanto, perguntas vazias).
- `addCkPergunta('criar', ci)` → após push, chama `_autoSyncAllSlidesCriar()` pra atualizar slides incluindo a nova pergunta.
- `rmCkPergunta` idem.
- `confirmImportCkTpl` (bloco criar) → idem após push dos casos parseados.
- `autoSaveCkTemplate` (on blur de qualquer input) → idem.
- Persistência imediata em todos os triggers.

**Voltar do editor de template = save automático**:
- Botão `← Voltar` chama `voltarTemplateEditor()` que faz syncTplFromDOM + setDoc dos dois templates + toast verde "✓ Template salvo" + backToCkHome.
- Antes era manual ("💾 Salvar Template" obrigatório).

### Feedback do aluno + PDF Final (atualizado pra Simulado Extra)

**Popup `gerarFeedbackAluno(studentId)`** (na aba Checklist, botão "🔖 Gerar Feedback"):
- Carrega checklist do aluno, templates, histórico, médias, feedback geral.
- Aplica IA (Gemini 2.5 Flash) em cada feedback de caso via `applyAIPrompt` (silent fallback se sem API key).
- Abre view `ck-preview` populando dados via `abrirPreviewV2(data)`.

**Seção Extra na preview (`prev-extra-cases`)**:
- Aparece SÓ pra `data.isExtra === true`.
- Render via `_renderExtraCasesPreview(data)`: por bloco (Criar azul, Oral laranja), mostra cada caso com enunciado + imagens + perguntas (título + imagens + checklist `A) B) C)` + box verde "💬 Gabarito comentado" com texto + imagens).

**PDF final (`montarHTMLRelatorio`)**:
- Ordem das seções: Histórico → Feedback por Caso → Feedback Geral → Avaliação de Habilidades → **📚 Casos, checklist e gabarito** (só Extra) → Rodapé.
- Helper `_montarHTMLExtraCasesPDF(d)` renderiza a seção Extra com `page-break-inside:avoid` por caso pra não cortar no meio.

### Sistema de Recursos — detecção de imagens em PDF (2026-05-14)

**Extração de imagens durante import PDF** (`_extrairTextoPdf`):
- Além de extrair texto, percorre `page.getOperatorList()` rastreando CTM (matriz de transformação) e detecta TODAS as paint ops de imagem.
- Coleta dinâmica de ops via regex: `^paint(Image|Jpeg|Inline)` em `pdfjsLib.OPS` (cobre variantes de versão).
- Filtros: mínimo 30pt em qualquer dimensão, banidas imagens que repetem em ≥5 páginas mesma posição (logos/headers).
- Mapeamento imagem→questão: imagem é assignada à questão cujo Y é maior que `im.y` (o fundo da imagem) na mesma página, ordenado por proximidade.

**Flag `imagemPendente`**:
- Set em `S.recursos._pdfImagensSet` durante import, depois persistido em `questoes/{qId}.imagemPendente = true` se a questão tem imagem detectada e nenhum `imagemUrl` ainda.
- Badge "📷 IMG PENDENTE" no card da questão (na aba 📚 Provas).
- Filtro "📷 IMG PENDENTE (N)" na barra de filtros se houver alguma.
- `saveQuestao` zera o flag quando `imagemUrl` é populada.

**Modal de import limpo**:
- Removido box de pré-visualização e box de "Dicas".
- Só status do PDF + textarea editável + count de questões detectadas.

## Pendências em aberto (configuração externa)

Funcionalidades que estão **prontas no código** mas dependem de uma config externa pra rodar de verdade. Quando o usuário pedir pra "configurar X" ou retomar uma dessas, verifique aqui primeiro.

### 📧 Solicitação de Nota Fiscal via EmailJS (criada 2026-05-18)

**Status do código**: ✅ pronto. Botão `📨 Solicitar Nota` no painel de pagamentos do mês dispara `emailjs.send(serviceId, templateId, {to_email, cc_email, nome, mes, valor_total, detalhamento, assunto})` em `_finSolicitarNota`.

**Pendente do usuário (Tiarlles)**:
- Já contratou plano **paid do EmailJS** pra poder ter `From Email` personalizado.
- Quer que o email saia do remetente **`controladoria@grupomedreview.com.br`** (caixa do GrupoMedReview).
- Precisa fazer no dashboard do EmailJS:
  1. **Email Services → Add New Service**: conectar a caixa `controladoria@grupomedreview.com.br` (Gmail/Microsoft365/SMTP — depende do provider, ainda não confirmado). Gera um `service_id` (ex: `service_controladoria`).
  2. **Account → Domains**: verificar o domínio `grupomedreview.com.br` (SPF + DKIM no DNS) — necessário pra "From Email" customizado funcionar no paid.
  3. **Email Templates → Create New Template** com nome "Solicitar Nota Fiscal":
     - **Settings**: vincular ao service novo, anotar template ID.
     - **Email Configuration**: `To: {{to_email}}`, `Cc: {{cc_email}}`, `From Name: Controladoria · AnestReview`, `From Email: controladoria@grupomedreview.com.br`, `Reply To: controladoria@grupomedreview.com.br`, `Subject: {{assunto}}`.
     - **Content** (HTML, modelo já pronto pra colar no walkthrough da conversa de 2026-05-18): usa `{{nome}}`, `{{mes}}`, `{{valor_total}}`, `{{detalhamento}}`.
  4. Testar pelo botão "Test It" do EmailJS antes de salvar.
- Depois colar no AROS: **Financeiro → ⚙️ Cadastros → 📧 Solicitar Nota**:
  - `Email da coordenação (CC)`: `controladoria@grupomedreview.com.br` (ou outra caixa)
  - `Template ID`: o gerado
  - `Service ID`: o gerado

**Quando retomar**: ofereça refazer o walkthrough completo (já existe no chat de 2026-05-18) ou apenas validar o passo específico que travou. Antes, pergunte se ele já fez algum dos passos.

### 📧 Cloud Function de email diário pra Mentorias (08h BRT)

**Status**: pendente. Template dedicado **JÁ EXISTE** (`template_hb89fxv` — criado 2026-05-20). Falta só implementar a Cloud Function com Cloud Scheduler 08h BRT que lê clínicas do dia, dispara `sendClinicaLinkNow` equivalente backend, marca `emailLinkEnviadoEm`. Hoje o envio é manual via botão "📧 Enviar link agora" (também usando `template_hb89fxv`).

### 📧 Template dedicado de parecer (Sistema de Recursos)

**Status**: pendente. `sendParecerEmail` usa `template_r0vjejs` reciclado. Aguarda usuário criar template dedicado pra notificações de parecer finalizado.

## Histórico recente (resumo cronológico)

Camada de produto:
- Solicitação de Simulado Extra com integração Hotmart (Cloud Function ativa).
- Aba "Simulados Extras" pra gerenciar simulados privados pagos.
- Firestore Rules pragmáticas aplicadas.
- Garantia de Aprovação por simulado aplicado (não por média).
- Export PDF do Desempenho com seleção de colunas.
- Sistema de usuários com permissões granulares por aba.
- Revisão de Casos: importação em massa, imagens em obs, auto-concordo, reset, finalizar, reabrir, deadline editável, botão por estado, persistência de sessão, **apagar próprio comentário/resposta**.
- Slides de Projeção (bloco Criar): editor, janela dedicada, cronômetro, 3 layouts de imagem, "imagem pronta", rich text sanitizado, preview em janela nova, barra fixa no controle.

Repaginação visual (pegada tech moderna):
- **Sidebar de Coordenação repaginada**: gradiente azulado no topo, linha accent neon, barra accent vertical, group headers em JetBrains Mono com prefixo `//`, aba ativa com gradient horizontal + barra accent glow + dot neon, footer com avatar mono iniciais e role mono accent, dot grid no body.
- **Tipografia**: adicionada Space Grotesk pras abas e títulos do painel, JetBrains Mono pros subtítulos accent e badges.
- **Headers de página padronizados**: Painel da Coordenação, Simulados TSA Oral, Mentorias — Space Grotesk H2 + subtitle accent em mono uppercase. Subtitle do painel virou "AnestReview".
- **Cards de simulado** redesenhados: dot grid, linha accent neon, barra glow no título, chips de data em gradiente com mono + tabular-nums.
- **Logo** trocada de base64 inline pra URL em `aros.anestreview.com.br/assets/assets/logo-anestreview.png`.
- **Box "Precisa de um simulado extra?"** movido pra baixo dos cards (visão aluno), em single-cell `.sim-cards` (alinhado à grid), com glow accent pulsante.

Personalização do menu lateral (Configurações):
- Editor dropdown com cards colapsáveis por grupo, drag-and-drop com handle `⠿`, indicadores neon de drop, contador de abas em pill, botões mono.
- Criar grupos custom (`＋ Novo grupo`).
- **Subgrupos**: criar (`＋ Subgrupo`), renomear, mover abas entre grupos e subgrupos (drag cross-container), apagar quando vazio.
- Persistência em `config/menu.structure` com items mistos `{kind:'tab'|'subgroup'}`.
- Reconciliação automática pra tabs novas que sejam adicionadas no código depois.
- **Modal de permissões de usuário** sincronizado com a estrutura efetiva.

Auto-seleção & memória por aba:
- `_closestSim` / `_closestOfficialSim`: prioriza futuro próximo.
- Gerenciamento, Trocas, Disponibilidade, Checklist abrem direto no próximo simulado.
- **Trocas** tem selector próprio + memória independente da Gerenciamento (`_tabSimMemory` + `_SIM_AWARE_TABS`).

Detalhes do shell:
- **ADM badge** nas abas admin-only da sidebar (`usuarios`, `config`, `financeiro`).
- Aba Coordenação oculta na home, acesso via `#admin`.
- Renomeada aba "Alunos" → "Simulados TSA Oral".
- "OBSERVAÇÃO" mais destacada com badge "CONFIRA!".
- Removido título "Simulados Disponíveis" do topo da visão aluno (cards aparecem direto).

Sistema de Recursos — refinamentos pós-entrega (2026-05-14):
- **PDF.js downgrade v4→v3**: a v4 não publica mais `build/pdf.min.js` (só `.mjs` ES-module). Mantém v3.11.174 pra compatibilidade com `<script>` regular.
- **Extração de PDF mais robusta**: Y-bucket com tolerância de 2px, ordenação por X. Pipeline `_limparBoilerplatePdf` → `_removerOrfaosSubSup` → `_formatarSeparacaoQuestoes` filtra cabeçalhos repetidos, subscripts/superscripts órfãos (`-1`, `2`) e separa visualmente as questões.
- **Parsers com buffer sticky + heurística de "alts saturadas"**: texto pré-`N)` vira início do enunciado da próxima questão; após detectar nova questão, todas as linhas (mesmo as começando com minúscula) acumulam até o próximo `N)`.
- **Re-emit canônico** (`_reemitirQuestoes`): após upload e parse, a textarea é reescrita em formato limpo (`N) enunciado → A) alt → ... → Gabarito: X`). Aplicado também quando o PDF do gabarito separado chega.
- **Botões dos modais de input bloqueiam close ao clicar fora**: `modal-import-pdf`, `modal-import-bloco`, `modal-questao` ganharam `data-no-backdrop-close`. Antes só `modal-parecer` tinha.
- **Botão "👁 Visualizar questão"** nos cards da listagem de questões (coord, aba 📚 Provas). Abre modal read-only mostrando enunciado, imagem, alternativas (com gabarito destacado), e pareceres finalizados. Tem botão **💡 Sugerir recurso** embutido no rodapé.
- **Sugerir recurso pede identificação do prof** via modal reusável `pedirIdentidadeProf({titulo, sub, explicacao, btnLabel, onConfirm})` — mesma UI do "Assumir análise". Lembra último prof escolhido em `localStorage.aros_rec_ult_prof`. Helper `_confirmarAssumirAnalise(profNome)` encapsula a lógica de gravar atribuição.
- **Métricas: pareceres proativos contabilizados** — `Pareceres dados` agora itera questões com `parecerFinalizado:true` (ou `pareceresPorAlt[L].finalizado:true`), em vez de só contestações respondidas. Profs que só fizeram sugestões aparecem no ranking.
- **Bloqueio de nova contestação enquanto sob análise**: helpers `_emAnaliseGeral(q)` e `_emAnaliseAlt(q, letra)` detectam quando há atribuição ativa (`parecerAtribuidoA` setado e `parecerFinalizado` falso). Aluno vê status "🛠️ CONTESTAÇÃO EM ANÁLISE" (roxo) em vez do amarelo "CONTESTAÇÃO RECEBIDA" + mensagem amigável no lugar do botão Contestar Gabarito. Defesa em profundidade também no `alunoAbrirContestar` que faz alert antes de abrir modal. Estado anterior "EM ANÁLISE" renomeado pra "CONTESTAÇÃO RECEBIDA" pra desambiguar.
- **Finalizar parecer obriga escolha de Cabe/Não Cabe**: bloqueio explícito quando `parecer === 'em-analise'` ao clicar Finalizar (mensagem orientando a usar Salvar rascunho se ainda em análise).
- **Lista FIFO move card automaticamente entre Pendentes ↔ Em análise** ao assumir/desvincular — `renderRecGestao()` é chamado em paralelo a `abrirParecer`. `salvarParecer` também chama `renderRecProvas()` no fim pra atualizar status na aba 📚 Provas após sugestões.
- **Reset explícito de estado dos botões** no `abrirParecer`: `mpr-save-btn` e `mpr-rascunho-btn` recebem `disabled=false` + textContent canônico ao abrir, evitando estado residual (`⏳ Salvando...`) de sessões anteriores interrompidas.
- **"Visualizar solicitação" não cria estado de análise** — só quem clica Assumir análise é registrado em `parecerAtribuidoA`. Outros profs que abrem pra visualizar veem read-only sem afetar a fila FIFO.

Sistema de Recursos — entregue completo em 2026-05-13/14 (25 subtarefas + extras posteriores):
- **Alicerce**: coleções `provas/{provaId}` + subcoleções `questoes/{qId}` e `contestacoes/{cId}`, `fontesRecurso/{fId}`, `recursosConfig/{settings}`. Firestore Rules e Storage Rules deployadas.
- **Sidebar**: grupo novo **Recursos** com 5 abas (📚 Provas, 🛡️ Gestão de Recursos, 📖 Bibliografia, ⚙️ Instruções & Config, 📊 Métricas). 4 são admin-only; Gestão de Recursos fica aberta pra qualquer prof.
- **Roteamento**: rota dedicada `/recursos` (pretty URL) com `404.html` SPA fallback. View `view-rec`. `_processRoute()` centraliza path + hash. `switchView` detecta `file://` e usa hash. Boot Promise.all inclui `loadRecProvas()`. Listeners `visibilitychange`/`focus` re-renderizam quando aba volta a ficar visível.
- **CRUD de Prova**: modal completo + cards + cascata de exclusão (`_deleteProvaCascade` apaga subcoleções em batch).
- **CRUD de Questão**: 3 modos (estruturado, bloco, vf). Modo é forçado pelo tipo da prova. VF tem toggle V/F por alternativa (A-E).
- **Bibliografia**: vinculada a tipos (TEA/TSA/ME1/ME2/ME3); barra de filtros na aba; dropdown na contestação filtra automaticamente.
- **Visão aluno**: identificação por email; boxes coloridos com 5 cores de status; mapa de questões; busca; contador regressivo dinâmico; tempo médio. Em modo VF, alternativas têm botão "contestar" individual e parecer próprio.
- **Workflow de parecer (refatorado 2026-05-14)**: 3 seções FIFO (Pendentes / Em análise / Respondidas). Botão "👁 Visualizar solicitação" abre modal read-only com **"🛡️ Assumir análise"** destacado. Após assumir (escolhe prof da lista S.profs, lembra último em localStorage), libera editar com **rascunho** (parecerRascunho/pareceresPorAlt[L].rascunho — invisível pro aluno) e **finalizar parecer** (marca parecerFinalizado:true, dispara email). Botão "↩️ Desvincular" libera pra outro prof assumir. Modal **bloqueia close ao clicar fora** via `data-no-backdrop-close`.
- **Argumento do parecer**: contenteditable com toolbar completa (B/I/U/S, listas, alinhamento SVG, 7 cores texto + 5 fundo, código inline). Sanitização HTML com `_featSanitize` reaproveitado.
- **Botão "💡 Sugerir recurso"**: parecer proativo bypassa fluxo de assumir; dropdown pré-marcado em "Cabe Recurso"; em modo VF, prompt pede qual alternativa.
- **Importação PDF dual**: detecção automática TEA/TSA vs ME (`_detectarFormatoPdf`). ME tem gabarito embutido; TEA/TSA aceita PDF de gabarito separado com parser `_parseGabaritoPdf`. PDF.js via CDN.
- **Métricas**: 4 cards de stats, distribuição de pareceres, top profs, tabela por prova.
- **Pendente**: Cloud Function de email diário em 08h (sub 16 stub usando `template_r0vjejs` reciclado — aguarda user criar template dedicado no EmailJS).
- **Reconciliação inteligente do menu**: `_menuEffectiveGroups()` agora cria automaticamente grupos novos do `TAB_GROUPS` que não existem em `config/menu.structure`.

Features kanban (2026-05-13):
- Aba `📌 Features` no grupo Administração — roadmap de ideias do produto.
- 3 colunas (💡 Ideia, 🔧 Em andamento, ✅ Feito). Drag & drop entre colunas salva imediato.
- Card: título + badge prioridade (alta/média/baixa) + progresso checklist + data cadastro.
- Modal: título, descrição em editor contenteditable com toolbar (B/I/U/S, listas, código, alinhamento, cores texto/fundo), HTML sanitizado por `_featSanitize()`.
- Checklist colapsável (dropdown acima da descrição) com botão "📋 Colar lista" (parser flexível: `- [ ]`, `- [x]`, `-`, `*`, `1.`, texto puro).
- "📋 Copiar pro Claude" gera markdown estruturado com instrução automática pro Claude quebrar em subtarefas (se necessário) antes de codar.
- Salvar não fecha o modal — chip "✅ salvo às HH:MM:SS" no rodapé.

Mentorias (2026-05-13):
- **Tipos expandidos**: TEA, TSA, ME1, ME2, ME3 (constante `MENTORIA_TIPOS`). Rules deployadas em prod aceitando os 5.
- **Cores por tipo** (`_MENTORIA_CORES`): TEA azul, TSA laranja, ME1 roxo, ME2 ciano, ME3 rosa. Badge em JetBrains Mono uppercase com bg/border tintados (não usa mais `.badge` legada que era lowercase).
- **Período do grupo com pro-rata**: campos `inicio` e `fim` em `type=date` (YYYY-MM-DD). Compat retroativa pra grupos legados em `YYYY-MM` via `_mentNormData(s, kind)`.
- **Status visual no card**: `_mentStatus(g)` → badge mono "● MENTORIA ATIVA/INATIVA/AGENDADA/SEM PERÍODO" com borda lateral + gradient. Card NÃO exibe valor mensal (decisão UX).
- **Cadastro de alunos opcional**: grupo pode ser salvo com lista vazia.
- **Financeiro automático**: `_mentSobreposicaoMes(g, anoMes)` calcula dias trabalhados × dias do mês. Mês cheio = `valorMensal`; mês parcial = proporcional. Aparece como coluna "Mentoria" na tabela + card de resumo + aba "Mentoria" no Excel.
- **Botão "📧 Enviar link agora"** em sessões com `c.link`: dispara EmailJS pra alunos `confirmed`, marca `emailLinkEnviadoEm`, vira "Enviar novamente" + chip de timestamp.

Mentorias — refinamentos (2026-05-20):
- **Template EmailJS dedicado** (`template_hb89fxv`): saiu de cima do `template_r0vjejs` (compartilhado com TSA Oral). Var nova `{{tipo_mentoria}}` puxa TEA/TSA/ME1/ME2/ME3 da clínica destino (em trocas/match) ou origem (em confirmação/ausência/swap). Aplicado em `sendEmailMentoria` (5 tipos) + `sendClinicaLinkNow`.
- **Bug fix — mensagens lazy**: `sendEmailMentoria` antes usava `const msgs = {...}` (literal eager), e as entries `trocaConfirmada`/`match` chamavam `fmt(clinicaDest)` mesmo quando `clinicaDest` era undefined (em `confirmed`/`absent`). Quebrava com TypeError no `c.mentorNome` ANTES do `emailjs.send`, sem nenhum email sair. Agora cada entry é `() => "..."` em `msgBuilders[type]` e só a do tipo correto roda. `fmt(c)` virou tolerante a undefined.
- **Bug fix — render bloqueante**: `_mtaAplicarResp` chamava `await sendEmailMentoria(...)` ANTES de `mtaRenderClinicas()`. EmailJS demora 2-5s, então a UI parecia "travada" e status só atualizava após F5. Reordenado: write → render → (swap+render se absent) → sendEmail → alert.
- **"Link Reunião" virou botão+modal próprio** no card de cada clínica (entre Editar e Enviar link). Campo de link saiu do modal de Editar Clínica. Modal `modal-clinica-link` com validação de URL + botão "🗑️ Remover link". Botão fica azul quando há link salvo, cinza quando vazio.
- **Coord — badge "Aluno de: [mentor]"** ao lado do nome dos alunos que vieram via troca (qualquer um dos 5 fluxos que setam `originalClinicaId`). Tooltip = tema da clínica de origem.
- **Coord — UI da lista de alunos limpa**: removida data/hora de `respondedAt` (poluía a linha). Manteve só status + ações.
- **Coord — stats da clínica reorganizados**: `14/20` em destaque, depois "✅ N confirmados" em verde, depois `🔄 N | ⏳ N | ❌ N` com separador discreto.

Home + Mural de Comunicação + estilo Apple-like (2026-05-20):
- **Home institucional virou landing default** (`view-home`). Hero "Seu parceiro na jornada pela Anestesiologia." com gradient text na palavra Anestesiologia + 3 cards de categoria (🟠 TSA · 🔵 TEA · 🟣 MEs) em grid responsivo (3 col desktop, 1 col mobile). Cards têm tilt 3D, glow follow-cursor, shine sweep, capa 16:10 editável.
- **Mural por categoria** (`view-mural`): feed em **grid de cards compactos** (3 col desktop / 2 tablet / 1 mobile). Cada card: capa 16:9 + badge "📌 Fixado" se aplicável + título + snippet (3 linhas) + CTA "Ler aviso →". Clica abre **modal full content** com imagem proporcional, título, corpo HTML rico e botão de link.
- **Coleções novas no Firestore**:
  - `config/comunicacao` → `{cards:{tsa,tea,mes:{titulo,subtitulo,imagem}}, order:{tsa:[ids],tea:[ids],mes:[ids]}}`. Read aberto, write/delete protegido (rule de `/config/`).
  - `comunicacao/{cat}/posts/{postId}` → `{titulo, corpo (HTML), imagem, linkUrl, linkLabel, pinned, published, createdAt, updatedAt}`. Rule deployada em 2026-05-20.
- **Sort de posts** (`_comSortPosts`): pinned ASC primeiro, depois pelo índice em `config/comunicacao.order[cat]` (manual via drag), fallback createdAt DESC.
- **Aba admin "📢 Comunicação"** (grupo Administração, admin-only): subnav TSA/TEA/MEs com sliding indicator colorido + 3 dropdowns collapsíveis:
  1. **🖼️ Capa do card na Home** (começa fechado) — título/subtítulo/imagem da categoria. Hint dimensão 1600×1000 (16:10).
  2. **📝 Avisos publicados** (começa aberto) — rows arrastáveis pelo handle `⋮⋮`. Botão "+ Novo aviso" no header.
  3. **🚫 Avisos despublicados** (começa fechado) — avisos com `published:false`.
- **Ações inline na row**: 🚫 Despublicar / ✅ Publicar (toggle, move entre boxes) → ✏️ (editar) → 🗑️ (excluir com confirm). Sync do array `order` em criar/deletar/despublicar.
- **Editor de aviso**: contenteditable com toolbar completa (B/I/U/S, listas, código, link, **📷 imagem inline** com upload pro Storage `comunicacao/posts/{cat}/inline/`, alinhamento, 7 cores texto + 5 fundo). Hint de dimensão da imagem de capa: 1600×900 (16:9). Compat com posts antigos (markdown leve preservado).
- **Header refeito Apple-like**: pill glass + sliding indicator colorido por categoria. Botão **🔐 cadeado** ao lado do toggle de tema abre o painel da Coordenação (substitui o antigo botão "🛠️ Coordenação" que aparecia com `#admin` — tab-co fica permanentemente oculto).
- **Simulados TSA Oral (aluno) refeito Apple-like**: cards com top accent gradient (laranja→amarelo→roxo→azul), tilt 3D, glow, title em Space Grotesk 19px, chips de data como pill glass com glow lateral, search input pill com focus ring colorido, day-tabs com sliding indicator.
- **Estilo Apple-like estabelecido como padrão reutilizável** — ver seção "Estilo Apple-like (referência reutilizável)" nesta skill. Quando user pedir "estilo Apple" em outra área, aplicar o padrão direto sem re-perguntar especificações.

Polimento mobile (2026-05-20, mesmo dia):
- **Hambúrguer no mobile** (`< 720px`): pill de tabs + botões 🔐/🌙 escondem; aparece `.hamburger-btn` 42px à direita do header. Clica → slide-in panel da direita (86% width, max 360px) com backdrop blur. Items grandes touch-friendly, item ativo destacado conforme `S.view`. Funções: `openMobileMenu()` / `closeMobileMenu()`.
- **Cards da Home horizontais no mobile**: thumbnail 132px fixo à esquerda, título+sub+CTA à direita (estilo lista iOS). Cabem 3 cards na tela inteira. Padrão guardado na seção "Padrão Mobile" desta skill.
- **Bug fix — overflow horizontal**: `.home-hero::before` com `inset:-40px -10% -10%` (gradient mesh) criava scroll horizontal na página, fazendo cards aparecerem deslocados pra esquerda. Fix: `overflow:hidden; border-radius:24px` no `.home-hero`.
- **Cards mobile com `!important`**: o `width:100%` original do `.home-card-cover` (desktop) ganhava do `flex-basis` no override mobile, fazendo cover ocupar 100% e body sumir. Solução: usar `!important` em todas as propriedades de flex do override mobile.
- **Fonte dos card titles** trocada de Fraunces (serif) pra Space Grotesk (consistente com o hero).
- **Servidor local pra testar mobile**: `python3 -m http.server 8080` + IP via `ipconfig getifaddr en0` + iPhone no mesmo Wi-Fi acessa `http://<ip>:8080`. Iteração ao vivo com pull-to-refresh.
