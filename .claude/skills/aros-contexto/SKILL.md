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
| Email | EmailJS (`service_exyoa4r` / `template_r0vjejs`) |
| Pagamentos | Hotmart (produto "+3 Simulados Extras Online AROS!") |
| Notificações | Slack Incoming Webhook (canal `#notificacao-simulado-extra`) |
| Webhook backend | Cloud Function Gen 2 — `cloud-function-hotmart/index.js` |
| Deploy frontend | GitHub Pages (repo público [Tiarlles/aros-simulados](https://github.com/Tiarlles/aros-simulados), branch `main`, com CNAME pra `aros.anestreview.com.br`) |

**Importante:** o diretório local NÃO é um repo git. O usuário faz upload manual do `index.html` no GitHub web (Add file → Upload files). **Nunca rodar `git push`.**

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
- Lista hardcoded em `ADMIN_ONLY_TABS = new Set(['usuarios','config','financeiro','features','recProvas','recFontes','recConfig','recMetricas'])`.
- `recGestao` é INTENCIONALMENTE não-admin-only — qualquer prof autenticado deve poder dar parecer em contestações.

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

### Slides de Projeção (bloco Criar)
Permite o prof aplicar o simulado oral de **um único dispositivo**: a janela do checklist controla, e uma janela separada exibe os slides pro aluno via tela compartilhada (Zoom). Disponível **apenas para casos do bloco Criar/Simulação**.

**Estrutura de slide** (em `caso.slides[]`):
- **Capa** (`capa: true`): campos `simNome` + `casoLabel` (rich text).
- **Pergunta**: `casoTitulo`, `enunciado` (HTML), `pergTitulo`, `pergTexto` (HTML), `imagem`, `imagemPos`.
- **Imagem pronta** (`imagemPura: true`): só a imagem ocupando o slide inteiro.

**Posicionamento da imagem** (`imagemPos`): `baixo` | `direita` | `grande`.

**Editor de slides** (modal "🎬 Slides"):
- Cards colapsáveis (dropdown) com badge SLIDE N, tipo colorido, snippet, botões de ação.
- Auto-geração na primeira abertura: capa + 1 slide por pergunta. `gerarSlidesPadrao(caso, casoIdx)`.
- `🔄 Regenerar padrão` recria do zero.
- `👁 Pré-visualizar` abre janela nova (`?modo=preview`).
- Mini editor rich text (`_rtEditor`): B / I / U / A+ / A- / ⌫. HTML sanitizado por `_sanitizeSlideHTML`.
- `_ensureHTML(s)` na renderização (compat texto puro).
- `_slideMigrar` migra slides legados `{titulo, texto}` ao abrir.

**Janela de projeção**:
- URL: `?modo=projecao&sim={simId}&caso={casoId}`. `_initProjecao(simId, casoId)` bypassa login.
- Layout: cronômetro fixo no topo (preto), slide centralizado (branco). Sem rodapé.
- Cronômetro progressivo, vermelho após `S.cfg.cronometroLimite` (default 07:30). Auto-start ao avançar da capa.
- Sempre abre no slide 1.
- Sincronia: `BroadcastChannel('aros-slides-{simId}-{casoId}')`. Mensagens `navigate/next/prev/first/last/timer/estado`.
- Atalhos: ←/→/Espaço/Home/End/P.

**Painel de controle** (no checklist):
- Botão `▶ Projetar caso (N slides)`.
- Painel inline com cronômetro + nav.
- **Barra fixa preta no topo** (`#proj-fixed-bar`) ancorada em `document.documentElement`, z-index 99999, !important pra contornar transform/filter ancestrais.

**Upload de imagens**: `simulados/{simId}/slides/{casoId}/{timestamp}_{filename}`. Limite 15MB.

**Fonte do slide**: Calibri preto/branco.

### Mentorias
- `mentorias/{id}`: grupos com mentor + alunos. Cadastro de alunos **opcional** (grupo pode ser salvo vazio).
- `blocosClinica/{id}`: bloco mensal de clínicas (tema único).
- `clinicas/{id}` + subcoleção `alunos`.
- **Tipos:** `'TEA'`, `'TSA'`, `'ME1'`, `'ME2'`, `'ME3'` (lista em `MENTORIA_TIPOS`).
- **Badge `_mentBadge(t)`**: pill em JetBrains Mono uppercase com cor por tipo (TEA=azul, TSA=laranja, ME1=roxo, ME2=ciano, ME3=rosa). Cores em `_MENTORIA_CORES`. NÃO usa mais a classe `.badge` legada (que tem `text-transform:lowercase`).
- **Período do grupo:** `inicio` e `fim` em `YYYY-MM-DD` (inputs `type=date`). `valorMensal` (default R$ 6000, editável por grupo).
- **Status visual do card:** badge mono "● MENTORIA ATIVA/INATIVA/AGENDADA/PERÍODO NÃO INFORMADO" + borda lateral colorida + gradient sutil. Calculado por `_mentStatus(g)` baseado em hoje vs período.
- **Não exibe** valor mensal no card (decisão UX) — só aparece no Financeiro.

### Sessão de clínica — envio manual do link
- Botão **📧 Enviar link agora** no `_renderSessao` quando `c.link` não vazio.
- `sendClinicaLinkNow(clinicaId, btnEl)` carrega alunos da subcoleção, filtra `status:'confirmed'` com email, dispara via EmailJS browser (`template_r0vjejs`), marca `c.emailLinkEnviadoEm` no doc.
- Botão muda pra "Enviar link novamente" + chip verde "✅ enviado em DD/MM HH:MM" depois do primeiro envio.

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

## Storage Rules

- `revisaoCasos/{revId}/{allPaths=**}`: read público; write até **15MB** imagens; delete livre.
- `checklists/{simId}/obs_imgs/{allPaths=**}`: idem.
- `simulados/{simId}/slides/{allPaths=**}`: idem (slides de projeção).
- `provas/{provaId}/{allPaths=**}`: idem (imagens de questão, contestação, parecer).
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

1. **Nunca rodar `git push`**. O usuário sobe `index.html` manualmente no GitHub web.
2. **Não criar arquivos `.md`** sem o usuário pedir explicitamente.
3. **Cloud Function: deploy SÓ quando autorizado**. Não fazer deploy preventivo.
4. **Migrações de dados / fixes pontuais** via scripts Node em `/tmp/xlsx-reader/` usando **Firebase JS SDK como cliente público** (não Admin SDK). Funciona porque as Rules permitem.
5. **Nunca coloque `</script>` literal dentro de template literals JS** no `index.html`. Splitar como `` `<scr` + `ipt>` `` ou parser HTML quebra.
6. **Backups em `Backup/index N.html`** — NÃO editar.
7. **Distinguir oficial vs extra** sempre que mexer em listagem de simulados.
8. **Sessão em localStorage** (`aros_session`). Não armazena senha, só username — re-resolvido em `S.usuarios` no boot.
9. **Estrutura do menu lateral é DATA-DRIVEN**: ao mexer em sidebar, modal de permissões, ou qualquer renderização que dependa de grupos/abas, use `_menuEffectiveGroups()` em vez de iterar `TAB_GROUPS` direto. `TAB_GROUPS` é só fonte das tabs built-in; a layout final pode estar customizada em `config/menu.structure`.

## Dívidas técnicas conhecidas (não corrigir sem pedirem)

- Senhas plaintext em `usuarios/{username}` (refactor pra Cloud Function de login resolveria).
- Slack webhook URL legível em `config/simExtra` (mover pra Cloud Function como proxy resolveria).
- Sem Firebase Auth → Rules tem proteção limitada (só shape + block deletes).
- Sem Firebase App Check → API key usável por qualquer um.
- Usuário precisa subir o `index.html` atual no GitHub Pages manualmente.

## Estilo do usuário (Tiarlles)

- Pragmático, anestesiologista (não dev profissional). Quer ação direta, sem explicação técnica longa.
- Mensagens curtas, frequentemente em PT-BR informal.
- "Foi" = funcionou/aprovado. "Pode" = autorizado a prosseguir.
- Prefere ver o resultado funcionando localmente antes de subir.
- Quando algo quebra, costuma colar a mensagem de erro direto.

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
- **Pendente**: Cloud Function `mentoriaEmailDiario` (Cloud Scheduler 08h BRT) — aguardando user assinar EmailJS pago + criar template novo pra disparar link automaticamente no dia da sessão.
