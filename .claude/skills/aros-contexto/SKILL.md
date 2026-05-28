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
| Auth | **Firebase Auth** (Email/Password + Google) coexistindo com **login custom legado** em `usuarios/{username}` (senhas plaintext). Custom login virou read-only após apertarem as Rules (2026-05-21) — sobrevive como fallback até migração completa. **Senha admin atual mudou** (perguntar ao Tiarlles; `aros2025` é DESATUALIZADA). |
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

usuarios/{slug}                     — painel da coord (slug = ID do doc, lowercase, sem espaço)
  └ campos: username (slug), nome (display name), email (OBRIGATÓRIO desde 2026-05-21),
            senha (plaintext — legacy), tipo, role, permissoes[], inativo,
            onboardingCriadoEm?, onboardingEnviadoEm?,
            renomeadoPara?, renomeadoEm?
  └ tipo (NOVO modelo, 2026-05-21):
      'adm'        — acesso total (ignora permissoes[])
      'prof'       — preset default em config/settings.tiposPresets.prof
      'coord'      — preset default
      'suporte'    — preset default
      'financeiro' — preset default
      <custom>     — tipos custom criados pelo admin
  └ role (BACKWARD COMPAT): 'admin' (= tipo:'adm') | 'user' (demais). Auto-derivado de tipo.
  └ permissoes[]: IDs de abas que o user vê (ex: ['simulados','checklist']). adm ignora.
  └ inativo: bool. Soft delete (Rules bloqueiam deleteDoc).
  └ ELIMINADO em 2026-05-21: permissoesAdmin[] (admin granular por aba). Acesso à aba = controle total dentro.
  └ Senha admin atual: PERGUNTAR ao Tiarlles (mudou; `aros2025` é DESATUALIZADA).

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

auditLog/{auto}                     — trilha de auditoria (NOVO, 2026-05-21)
  └ campos: ts (serverTimestamp), action (string canonical de AUDIT_ACTIONS),
            target {collection, ...refs}, actor {uid, nome, email, role}|null,
            before {...}|null, after {...}|null, meta {...}|null, userAgent
  └ Helper window: window._audit(action, target, payload) fire-and-forget.
  └ Read aberto (qualquer com projectId vê tudo) — refatorar quando aposentar custom login.

config/{cfgId}
  ├ settings                        — config legacy + cronometroLimite ('mm:ss', default '07:30')
  │                                   + tiposPresets {adm,prof,coord,suporte,financeiro,<custom>}
  │                                   + tiposMeta {<tipo>: {label, icon}}  (override de TIPO_META)
  │                                   Migração: professorPreset → tiposPresets.prof no boot.
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
  ├ simExtra                        — { linkPagoAluno, linkPagoExterno, linkGratuito,
  │                                      slackWebhook, listaVigenteId, alunosGratuitos[] }
  ├ catalogoConfig                  — listas mestre do Catálogo de Produtos (multi-select)
  │                                    { publicosAlvo:[str], provasAlvo:[str] }
  │                                    Seed automático na primeira abertura da aba (presets).
  ├ datasImportantes[_{vertical}]   — Calendário de eventos da vertical (ver §"Datas Importantes")
  │                                    { lista:[{id,tipo,titulo,modo,dataISO,horario,dataInicioISO,
  │                                              dataFimISO,descricao,link,escopoId,updatedAt,updatedBy}],
  │                                      escopos:[{id,nome,criadoEm,criadoPor}],
  │                                      updatedAt, updatedBy }
  │                                    AnestReview sem sufixo (legacy); demais com `_oftreview` etc.
  └ datasImportantesTipos           — Tipos de evento das Datas Importantes (GLOBAL, sem sufixo vertical)
                                       { lista:[{id,nome,icone,cor,system,criadoEm,criadoPor}],
                                         deletedSystemIds:[str],
                                         updatedAt, updatedBy }
                                       4 tipos system (prova,revisao,liberacao,inscricao) editáveis
                                       via override; deletáveis via deletedSystemIds tombstone.

adminUids/{firebaseAuthUid}        — Lista de UIDs com privilégio admin (gate isAdmin nas rules).
  { email, addedAt, addedBy }       Bootstrap hardcoded em rules pro 1º admin
                                    (Tiarlles, UID `nF4lKfJXOyPyx6btGkV7Lj0DkQr1`).
                                    Auto-criado no login Google se UID bate com bootstrap.

alunosAprovados/{chaveAluno}        — Base de alunos comprados via Hotmart (migrada do MED-Review).
  { chaveAluno (= cpf || email || nomeNorm),     ADMIN ONLY (PII: CPF, email, telefone).
    nome, nomeNorm, cpf, email, telefone,        15.540 docs em prod.
    produtos:[{produtoId, produtoNome, vertical, Usada por Cruzar Lista (Administração).
               transacao, status, dataCompra}],
    primeiraCompra, ultimaCompra,
    criadoEm, atualizadoEm }

provasAprovados/{provaId}           — Provas das bancas (TEA, TSA, R1, etc).
  { vertical, modalidade, ativa,    Read isAuth (catálogo lê pra mostrar Aprovações);
    criadoEm, atualizadoEm }        Write isAdmin (cadastro em Cruzar Lista).

resultadosAprovados/{resultadoId}   — Resultado de aprovação de uma prova num ano específico.
  { provaId, ano, totalLista,       Read isAuth; Write isAdmin.
    totalNossos, percentual,        listaSnapshot só existe quando gravado via cruzamento
    vertical, fonte, observacao,    (não nos legados da migração nem nos criados manualmente).
    listaSnapshot?:{
      aprovados:[{nomeLista,nomeAluno,score,vinculacaoManual,confirmadoManual}],
      semCorrespondencia:[{nomeLista,score}],
      totalLista, totalAprovadosEfetivo, capturadoEm
    },
    criadoEm, atualizadoEm }

produtos/{produtoId}                — Catálogo Interno de Produtos (descritivo p/ marketing/vendas/suporte)
  {
    nome, breveDescricao,           // sem limite de chars (legado: pitchCurto)
    capa,                           // URL Storage (1:1, só thumb na listagem; NÃO no detalhe)
    publicoAlvo:[str],              // multi-select de config/catalogoConfig.publicosAlvo (dedup auto)
    provasAlvo:[str],               // multi-select de config/catalogoConfig.provasAlvo (dedup auto)
    responsaveis:[str],             // tags livres multi (dedup auto)
    status:'rascunho'|'ativo'|'em-breve'|'descontinuado',
    features:[Feature],             // shape detalhada abaixo
    temMentoria:'sim'|'opcional'|'nao',   // string 3-estados (compat: bool true→sim, false→nao)
    mentoriaDescricao:'',           // breve descrição da mentoria (textarea no editor, parágrafo no detalhe quando temMentoria != 'nao')
    mentoriaFeatures:[Feature],     // mesma shape de features
    bonusProdutoIds:[str],          // IDs de outros produtos vinculados como bônus (catalogo cruzado)
    bonusFeatures:[Feature],        // features bônus livres (mesma shape)
    argumentosVenda:[str],          // bullets
    objecoes:[{id, pergunta, resposta}],   // perguntas de vendas (rebater objeções)
    duvidas:[{id, pergunta, resposta}],    // FAQ de suporte (separada de objeções)
    links:[{id, label, url}],
    anexos:[{id, label, path, url, sizeBytes, mime}],
    ordem, createdAt, createdBy, updatedAt, updatedBy
  }

// Shape de Feature (usada em features, mentoriaFeatures, bonusFeatures)
Feature = {
  id,                              // UID estável (gerado por _proUid no add — usado pra lookup em _proRtCommit)
  icone,                           // emoji (catálogo curado + custom)
  titulo,
  disponivel:'sim'|'nao'|'construcao',  // string 3-estados (compat: bool true→sim, false→nao)
  numeroChave,                     // texto livre (renomeado de "número-chave" → label "Quantidade")
  diferenciais,                    // HTML rico (toolbar B/I/U/S, listas, código, link, 7 cores texto + 6 fundo, 🧹 limpar formatação externa)
  linkUrl, linkLabel,              // botão de link nomeável (gradient azul→roxo no detalhe)
  pdfUrl, pdfLabel, pdfPath, pdfSize, pdfName,  // anexo PDF nomeável (gradient âmbar/vermelho)
                                   // Storage: produtos/{pid}/features/{fid}/pdf-{ts}.pdf, limite 20MB
  updatedAt                        // Timestamp.now() — NÃO serverTimestamp (proibido dentro de array)
}
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

**Padrão "ADM badge"** (dinâmico desde 2026-05-21):
- Abas que SÓ tipo `adm` acessa ganham pill mono "ADM" à direita na sidebar.
- Helper `isAdmExclusiveTab(tabId)`: `true` se a aba é STRICT_ADMIN OU se nenhum tipo não-adm tem essa aba no preset.
- `STRICT_ADMIN_TABS` (hardcoded, núcleo absoluto): inclui aba `auditoria` (Audit Log).
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
- **Administração:** 📌 Features, Financeiro, Usuários, 📢 Comunicação, 🔍 Auditoria, Configurações

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

### Sistema de auth (refeito em 2026-05-21)
**Coexistência de 2 sistemas** na tela `co-login`:
1. **Firebase Auth** (novo): Google sign-in (`loginGoogle`) + Email/Password (`loginEmailFirebase`). Email/senha pode usar `sendPasswordResetEmail`.
2. **Login custom legado** (`checkPass`): fallback para users sem email no Firebase. Aceita slug, display name ou email — case-insensitive.

**Fluxo do `checkPass`**: se input contém `@` → tenta Firebase Auth primeiro, com fallback pro custom em `auth/invalid-credential` / `auth/user-not-found` / `auth/wrong-password`. Senão, vai direto pro custom.

**Listener `onAuthStateChanged`** popula `S.currentUser` após sign-in Firebase: busca user doc por `email` em `S.usuarios`. Se não acha → erro + `signOut()`. Guard pra `?modo=projecao|projecao-live|preview` (não manipula DOM destruído). Flag `window._freshFirebaseLogin` evita auditar `LOGIN_*` em cada reload.

**`esqueceuSenha`**: se input tem `@` → `sendPasswordResetEmail`; senão → mensagem orientando contatar coord.

**Tipo + permissões** (modelo novo):
- Helper `getTipo(u)`: retorna `u.tipo` com fallback pro `role` legado (`role:'admin'` → `'adm'`, demais → `'coord'`).
- Helper `userTabs(u)`: tipo `adm` → `ALL_TABS`; senão → `u.permissoes`.
- Helper `_isAdminEm(tabId)`: `tipo==='adm'` OU `permissoes.includes(tabId)`. **Acesso à aba = controle total dentro dela** (eliminou admin granular).
- Campo `permissoesAdmin[]` **eliminado** em 2026-05-21 (órfão em docs antigos, ignorado pelo código).

**Tipos de usuário configuráveis** (em `config/settings.tiposPresets`):
- Defaults: `adm` (acesso total, preset ignorado), `prof`, `coord`, `suporte`, `financeiro`.
- Custom: admin pode criar/editar/excluir em **Configurações → "⚙️ Presets de Tipo de Usuário"** (accordion com sub-accordion por tipo + checkboxes de tabs).
- `TIPO_META` hardcoded define label+icon default por tipo; `config/settings.tiposMeta` permite override (incl. tipos custom).
- Migração: campo antigo `professorPreset` é auto-migrado pra `tiposPresets.prof` no boot.

**Identidade implícita de prof** (Fase 2, 2026-05-21):
- Helper `getProfLogadoNome()` retorna nome do prof logado se aplicável (não-admin com `nome` que casa com `S.profs`), senão `null`.
- Helper `aplicarProfLogadoEmSelect(sel, opts)` esconde o select e mostra badge "Você: {nome}".
- **5 selects abolidos** quando prof logado: Disponibilidade (`disp-prof-sel`), Checklist Casos (`prof-caso-sel` — pula direto pro modal), Feedback Geral (`fg-prof-sel`), Parecer/Recurso (`masm-prof`).
- **3 selects mantidos editáveis** (decisão UX): Mentorias grupo (`mmg-mentor`), Mentorias classe (`mcl-mentor`), Financeiro lançamento (`fl-prof`) — coord faz no nome de outros profs.

**Audit Log** (NOVO, 2026-05-21):
- Helper `audit(action, target, payload)` fire-and-forget. Window-exposed como `window._audit`.
- Lista canônica em `AUDIT_ACTIONS` (linha ~4833): `LOGIN_CUSTOM`, `LOGIN_FIREBASE`, `LOGIN_GOOGLE`, `LOGOUT`, `SIMULADO_CRIADO`, `SIMULADO_EDITADO`, `NOTA_LANCADA`, `NOTA_RESETADA`, `ALUNO_ADICIONADO`, `ALUNO_REMOVIDO`, `ALUNO_STATUS_ALTERADO`, `ALUNO_MOVIDO`, `ALUNO_SWAP`, `PRESENCA_TOGGLE`, `MENTORIA_CRIADA`, `MENTORIA_EDITADA`, `MENTORIA_REMOVIDA`, `SOLICITACAO_EXTRA_EFETIVADA`, `SOLICITACAO_EXTRA_EDITADA`, `USUARIO_CRIADO`, `USUARIO_EDITADO`, `USUARIO_DESATIVADO`, `COMUNICACAO_POST_CRIADO`, `COMUNICACAO_POST_EDITADO`, `COMUNICACAO_POST_DELETADO`, `CONFIG_ALTERADA`.
- ~30 pontos instrumentados no `index.html`.
- **Aba "🔍 Auditoria"** em Admin (STRICT_ADMIN_TABS — só tipo `adm`): filtros (usuário, ação, data), paginação 50 por vez, modal com diff `before`/`after`, exportar CSV.

**Badge "ADM" dinâmico** (2026-05-21):
- Helper `isAdmExclusiveTab(tabId)`: `true` se a aba é STRICT_ADMIN OU se nenhum tipo não-adm tem essa aba no preset. Substituiu `ADMIN_ONLY_TABS.has(tabId)` hardcoded.
- Badge no menu lateral reflete dinamicamente as decisões de preset.

**Sessão persistida em localStorage** (`aros_session` = username). Refresh mantém login. Logout limpa. Em Firebase Auth, `onAuthStateChanged` restaura `S.currentUser` independente do localStorage.

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

### Orçamento (2026-05-22)

Aba `tab-orcamento` em Admin → Orçamento (ADMIN_ONLY_TABS). Controle de despesas por evento.

**Modelo de dados:** `orcamentos/{eventoId}` no Firestore:
```
{nome, descricao, valorTotal, dataInicio, dataFim,
 status: 'ativo'|'arquivado',
 gastos: [
   {id, descricao, fornecedor, categoria,
    valorPrevisto, valorPago,
    status: 'previsto'|'pago-parcial'|'pago-total',
    dataPrevista, dataPagamento,
    anexos: [{url, nome, tipo, tamanho, path}],
    observacoes, criadoEm, atualizadoEm}
 ],
 criadoEm, atualizadoEm}
```

**Anexos no Firebase Storage:** `orcamentos/{eventoId}/gastos/{gastoId}/{timestamp}_{filename}`. PDFs e imagens, limite 20MB. Storage rule específica adicionada.

**Funções principais:**
- `renderOrcamento()` — dispatcher (dashboard ou detalhe baseado em `window._curOrcEventoId`)
- `_orcRenderDashboard()` — grid de cards de eventos com barra de progresso semáforo (verde<80%, amarelo 80-100%, vermelho >100%)
- `_orcRenderDetalhe(eventoId)` — header com 4 stats grandes (Orçamento, Compromisso, Pago efetivo, Restante) + tabela de gastos
- `openOrcamentoEvento(id?)` / `saveOrcamentoEvento()` / `deleteOrcamentoEvento()` (soft, status='arquivado')
- `openOrcamentoGasto(id?)` / `saveOrcamentoGasto()` / `deleteOrcamentoGasto()`
- `_orcUploadAnexos(event)` — multi-upload pro Storage, popula `window._curOrcAnexosPend`
- `_orcRemoverAnexo(idx)` — delete do Storage + remove do array pendente
- Helpers: `_orcBRL`, `_orcDataFmt`, `_orcTotalGasto` (compromisso), `_orcTotalPagoEfetivo` (saiu do caixa), `_orcProgColor`, `_orcStatusLabel/Bg/Fg`

**UX Apple-like:** cards com hover transform/border, barra de progresso 8-10px com transição, stats em Space Grotesk, mono captions, cores semáforo, empty states com ícone grande, datalist autocompletado pra categorias.

**Permissão:** tipo='adm' via `_isAdminEm('orcamento')`. Firestore rule: read aberto (sem dados sensíveis), write exige isAuth. Delete bloqueado (só soft via status='arquivado').

**Ajustes pós-lançamento (2026-05-22):**
- `valorPrevisto` aceita 0 (só bloqueia negativo) — útil pra registrar gastos com valor a definir ou zerados por contexto. A regra "pago parcial < previsto" só aplica quando previsto > 0.
- Datas vazias na tabela exibem `-` simples (cinza claro) em vez do bug anterior que mostrava "undefined/undefined/—" causado por `_orcDataFmt('—')`. Label "prevista"/"pago" só aparece quando há data preenchida.

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
- **📧 Configurar e-Mail** (renomeado de "Solicitar Nota" em 2026-05-19, ampliado pra RPA em 2026-05-22): config do envio automático de email. Campos: `emailCoord` (CC), `templateId` (PJ/NF), `templateIdRpa` (RPA), `serviceId`. Salvo em `S.financeiro.notaFiscalCfg = {emailCoord, templateId, templateIdRpa, serviceId}`. Cada regime do prof usa seu template próprio.

**Setup atual do EmailJS (deploy 2026-05-19):**
- Service: `service_aros_nf` (Gmail OAuth com conta de usuário real do Workspace; "From" é determinado por OAuth)
- Strategy "send-as alias": OAuth com conta pessoal do user (ex: `tiarlles.miller@grupomedreview.com.br`) que tem alias configurado pra enviar como `controladoria@grupomedreview.com.br` (grupo distribuído pros 4 membros da controladoria). Template seta `From Email: controladoria@grupomedreview.com.br` + `Reply To: controladoria@grupomedreview.com.br` — assim o destinatário vê controladoria como remetente, respostas voltam pro grupo todo.
- Template `tmpl_aros_nf` (renomear conforme configurado): aceita variáveis `{{nome}}`, `{{mes}}`, `{{valor_total}}`, `{{detalhamento}}`, `{{assunto}}`, `{{to_email}}`, `{{cc_email}}`. HTML do template em `/tmp/aros-nf-template.html` (versionado fora do repo). Texto menciona prazo de **3 dias úteis**.

**Painel de pagamentos do mês** (`renderFinanceiro` — refatoração massiva em 2026-05-19):
- **🔍 Busca** por nome no topo + **filtro de status na coluna Controle** (pills "Todos · Aguardando · NF solic. · RPA solic. · Emitida · Não emitida") via `_finFilterProfs()` cruzando ambos os critérios. Estado do filtro em `window._finFilterCtrl`. RPA solic. adicionado em 2026-05-22.
- **Ordem alfabética**.
- **Coluna Professor FIXA** (sticky horizontal) + `min-width:240px` + background sólido pra não vazar conteúdo das colunas que rolam por trás.
- **Fontes dos números reduzidas 20%** em toda a tabela: 13px → 10.5px (células), 15px → 12px (total), 11px → 9px (subtexto). Coluna Professor mantém tamanho normal.
- **Cards de resumo em 1 linha só** (`grid-template-columns:repeat(4,1fr)`, padding e fontes compactos).
- Coluna **Rodadas Sim Oficial** (renomeada de "Rodadas").
- Coluna **Solicitar Nota** (admin-de-financeiro-only) com `_finSolicitarNota(profNome, anoMes, regime?)`:
  - 1ª solicitação PJ: botão azul `📨 Solicitar Nota` → confirm → dispara email via `_finEnviarNotaInterno` (helper extraído pra reuso entre individual e bulk) → registra timestamp em `mes.notasSolicitadas[profNome]` + regime em `mes.notasSolicitadasRegime[profNome]` + **auto-muda controleStatus pra 'nf-solicitada'** no mesmo save.
  - 1ª solicitação RPA: botão laranja `📋 Solicitar RPA` → chama `_finSolicitarRPA` que delega pra `_finSolicitarNota(..., 'rpa')` → usa `templateIdRpa` → assunto vira "Solicitação de RPA — [mês]" → seta `controleStatus='rpa-solicitada'`.
  - Já solicitado: mostra `✓ DD/MM HH:MM` em verde + **badge [NF] ou [RPA]** indicando o regime do último envio + botão `🔁 Reenviar`.
  - **Reenviar respeita regime atual** (passa `regimeAtual` como 3º arg). Se regime mudou desde o último envio (ex: prof era PJ → virou RPA), botão fica laranja com label `⚠️ Reenviar como RPA` e dispara aviso explícito antes de enviar.
  - **Chip vermelho `⚠️ VENCIDO · N DIAS ÚTEIS`** quando passou >3 dias úteis sem o admin marcar 'nf-emitida' ou 'nf-nao-emitida' (helper `_diasUteisDesde`).
- Coluna **Controle** (após Solicitar Nota): dropdown com 5 status — `aguardando-fechamento` (default) · `nf-solicitada` · `rpa-solicitada` (2026-05-22) · `nf-emitida` · `nf-nao-emitida`. Cores: cinza · azul · laranja · verde · vermelho. Não-admin vê pill colorida read-only. Status salvo em `mes.controleStatus[profNome]`. Handler `_finSetControle`. Não há `rpa-emitida`/`rpa-nao-emitida` separadas — admin usa NF emitida/não emitida semanticamente pra fechar o ciclo RPA (decisão de 2026-05-22, pode evoluir).
- Coluna **Ações** redesenhada (2026-05-19): botão **📄 Detalhar** com texto visível + botão `🗑️` vermelho ao lado pra excluir o prof do mês.
- **Exclusão de prof do mês** (`_finExcluirProf`) com **dupla confirmação**: `confirm()` + `prompt("digite EXCLUIR")`. Marca em `mes.profsExcluidos[]` (reversível, não destrutivo). Rodapé da tabela mostra "🗑️ N excluídos: [Nome ↩]" com botão de restaurar (`_finRestaurarProf`).
- **Botão "📨 SOLICITAR TODAS (NF + RPA)"** no header quando mês fechado: dispara em loop sequencial pra todos os profs com email cadastrado e total > 0. **Combina PJ e RPA numa fila única** (`_finSolicitarTodasNotas`, atualizado 2026-05-22) — cada prof recebe o template do seu regime. Se um dos templates não estiver configurado, profs daquele regime são pulados com aviso. Confirma uma vez com lista separada (NF · RPA · pulados sem email). Status do badge mostra progresso `"📨 Enviando 3/12 (RPA): Prof X…"`. Save único no final. Alert final com sumário.

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

### Tela de Usuários reformulada (2026-05-21)

**Aba Admin → Usuários** (`tab-usuarios`, STRICT_ADMIN):
- Barra de busca por nome OU email (case-insensitive, sem acentos).
- Select dinâmico de filtro por tipo (populado com tipos em uso + contagem cada).
- Lista alfabética, linhas enxutas: nome + pill do tipo + chevron `›`. Linha inteira clicável.
- Empty state contextualizado por filtro.
- Removidas badges de "X abas" / "admin de Y" (admin granular foi eliminado).
- `deleteUser` faz **soft delete** (`inativo:true`) — Rules bloqueiam `deleteDoc` em `usuarios/`.

**Modal de criar/editar usuário** (mudou em 2026-05-21):
- **Removido** campo "Nome completo" (display = username/slug).
- **Removido** checkbox "Administrador geral" + grid de admin granular por aba.
- **Adicionado** select "Tipo de usuário" com 5 defaults + customs. `onTipoChange` aplica preset automaticamente (só em criação; em edição preserva permissões salvas).
- Campo "Nome de usuário" editável mesmo em edit mode.
- Validador relaxado (`/^[a-z0-9._@+-]+$/`): aceita email como username.
- **Email é OBRIGATÓRIO** (decisão de 2026-05-21 — todo usuário precisa ter email pra eventualmente migrar pro Firebase Auth + receber convite/reset por email). Validador em `saveUser` bloqueia salvar sem email.

**Renomear usuário**: docs do Firestore têm ID imutável e rules bloqueiam delete em `/usuarios`. Estratégia: cria novo doc com novo ID + marca o velho com `inativo:true` + `renomeadoPara: novo`. Login (`tryLogin`) e restore session filtram inativos via `!x.inativo`.

### Onboarding de Professores — fundido com Cadastro de Professores (2026-05-21)

**Local único**: Admin → Configurações → 👨‍🏫 Cadastro de Professores (não há mais accordion separado de "Onboarding"). Header do accordion mostra contagem por status: `42 profs · 🟢 12 convidados · 🟡 8 a convidar · 🔴 22 sem email`. Botão bulk "📧 Convidar todos" no header.

**Cada linha de prof** mostra:
- Nome (ellipsis).
- Input de email principal (edição rápida).
- Indicador `+N` se múltiplos emails (clicável → modal multi-email).
- Botão `✏️` (modal multi-email).
- Badge de status: 🔴 sem email / 🟡 a convidar / 🟢 convidado · DD/MM.
- Botão "📧 Convidar" (cria user doc + envia email) ou "↻ Reenviar".
- Botão ✕ remover.

**Modal de envio do convite** (`modal-convite-edit`): permite editar email destino antes de enviar (default: 1º email do prof). Chips clicáveis pros outros emails do prof.

**Modal multi-email** (`modal-prof-emails`): gerencia múltiplos emails por prof — 1 marcado como ⭐ principal (recebe convite + NF). Add/remove rows. Salvar valida formato + dedupe + junta com `;`.

**Modal de dupla checagem de exclusão de prof** (`modal-rm-prof`): exige digitar o nome do prof. Mostra aviso se houver usuário linkado.

**EmailJS template `template_rruper4`** (dedicado pra convite):
- Variáveis: `to_email`, `prof_nome`, `prof_email`.
- Conteúdo HTML: "Olá {nome}, Cadastre seu acesso no sistema..." + link `aros.anestreview.com.br` + sugestão Google login + esqueci a senha.
- Footer "At.te / Equipe AnestReview".

### Catálogo Interno de Produtos (2026-05-22)

**Aba "Produtos"** no painel coord — catálogo descritivo dos produtos da AnestReview pra equipes internas (marketing/vendas/suporte) consultarem. NÃO é catálogo de vendas pra alunos; é base de conhecimento interna.

**Acesso:**
- **Ver**: qualquer usuário com login interno (todos os tipos). Rascunhos só aparecem pra quem pode editar.
- **Editar**: permissão granular `gerenciarCatalogo` (registry `EXTRA_PERMS`) — admin tem implicitamente. Liga via checkbox "Permissões extras" no modal de usuário.

**Coleções:**
- `produtos/{produtoId}` — produtos cadastrados (shape acima em Modelo de Dados).
- `config/catalogoConfig` — listas mestre compartilhadas (`publicosAlvo`, `provasAlvo`). Seed automático na primeira abertura por quem tem `gerenciarCatalogo`/adm.

**Presets seed `publicosAlvo`** (9 opções iniciais):
"Residentes e Anestesiologistas em geral", "ME1/ME2/ME3", "Anestesiologistas que farão TEA 1ª/2ª Fase", "Anestesiologistas que farão TSA 1ª/2ª Fase", "Anestesiologistas que buscam atualização".

**Presets seed `provasAlvo`** (7 opções iniciais):
"TEA 1ª Fase", "TEA 2ª Fase", "TSA 1ª Fase", "TSA 2ª Fase", "Quadrimestrais / Anuais SBA", "Concurso", "Atualização".

**Views (estado `S.produtosView`):**
- `list` — listagem compacta com mini-capa 1:1, busca por texto livre, filtro por prova-alvo (chips multi-select). Botão "Novo produto" só pra quem edita.
- `detail` — página dedicada (substitui a lista, com botão "← Voltar"). Sem capa grande. Header: nome + breve descrição + chips de status/público/provas/responsáveis. Seções: "// Sobre", "// O que está incluído" (features), "// Mentoria" (se temMentoria=true, com separador roxo), "// Argumentos de venda", "// Objeções frequentes", "// Links úteis", "// Anexos".
- `edit` / `new` — accordion: Básico (nome, breve descrição sem limite, capa, público-alvo multi, provas-alvo multi, status, responsáveis tag livre) + Features + Mentoria (toggle + features) + Argumentos + Objeções + Links + Anexos.

**Features (modelo único — sem tipos pré-definidos):**
```
{ id, icone, titulo, disponivel (S/N), numeroChave, descricao, updatedAt }
```
- Ícone: catálogo curado de 25 emojis + opção de emoji custom (clamp via grapheme cluster, max 2).
- `disponivel=false` renderiza card atenuado (opacity reduzida) + flag "✗ Não incluído".
- `updatedAt` por feature: atualizado automaticamente ao salvar quando algum campo dela mudou (compara antes/depois via `_proFeatEqual`). Mostrado no detalhe como smallprint "Atualizado em DD/MM/AAAA".
- Drag-to-reorder via handle `⠿`.
- "Adicionar feature" anexa direto um cartão em branco (sem picker de tipo) com autofocus no título. Mesmo handler `_proFeatAdd(source)` pra features principais e features da mentoria.

**Multi-select com presets + cadastrar/remover:**
- Picker `#pro-picker-pop` (genérico) lista opções do `config/catalogoConfig` + botão "+ Cadastrar novo" no rodapé.
- Cada item tem botão `×` (só pra quem edita) que remove do catálogo global via `arrayRemove`. Se a opção está em uso em N produtos, confirm avisa "Está em uso em N produto(s)" — os produtos mantêm a tag órfã.
- Audit: `CATALOGO_OPCAO_ADICIONADA` / `CATALOGO_OPCAO_REMOVIDA`.

**Anexos:**
- Capa: `produtos/{produtoId}/capa.{ext}` (img). Anexos: `produtos/{produtoId}/anexos/{anexoId}.{ext}` (PDF ou img).
- **PDF por feature** (2026-05-23): `produtos/{produtoId}/features/{featId}/pdf-{ts}.pdf`.
- Limite **20MB** (subido de 5MB em 2026-05-23), image/* OR application/pdf. Rules exigem auth (alunos não acessam).

**Audit log:** `PRODUTO_CRIADO`, `PRODUTO_EDITADO`, `PRODUTO_EXCLUIDO`, `PRODUTO_STATUS_ALTERADO`, `CATALOGO_OPCAO_ADICIONADA`, `CATALOGO_OPCAO_REMOVIDA`.

### Catálogo de Produtos — refinos UX (2026-05-23)

Sessão grande de polimento em cima da v1 do catálogo (mantida estrutura, mudou UX/modelo de features e detalhes).

**Detalhe do produto — disclosure groups Apple-like:**
- Status badge + responsáveis ficam SEMPRE visíveis (linha inline acima dos disclosures).
- **Público-alvo** e **Provas-alvo** viram dois disclosure groups colapsáveis (header com `// LABEL · N` + chevron rotacionando 180° quando aberto). Ambos começam **fechados ao abrir o produto**.
- Chips dentro de cada disclosure ficam em **coluna única** (não wrap), com bolinha colorida indicando categoria, hover sutil, texto Plus Jakarta Sans (não mais mono apertado).
- Dedupe centralizado em `_proDedupe(arr)` (case-insensitive, preserva primeira ocorrência): aplicado em `_proGetPublicoAlvo`, `_proGetResponsaveis`, no save e na renderização de `provasAlvo`.
- Helper `proToggleDisc(id)` alterna disclosure sem re-render completo (preserva scroll).
- **Estado `S._proDisc`** preserva entre re-renders, mas é **resetado a `null` ao abrir um novo produto** (proAbrir/proNovo/proEditar).

**Card de feature compactado (detalhe — view leitura):**
- Ícone: 48px → **26px**. Padding do head reduzido pra 7px vertical.
- Quantidade ("462 aulas"): de display 22px gigante pra **pill compacto inline 11px ao lado do título**.
- Status: pill grande "✓ Incluído" virou **mono pequeno 9.5px com dot colorido** (verde/vermelho/amarelo). Sem bordas adicionais no card (decisão UX 2026-05-23: status `construcao` não muda borda do card, só o chip do canto).
- **Features em coluna única** no detalhe (`pro-feat-grid` virou `flex-direction:column` em todos os tamanhos).
- **Cada feature vira dropdown** no detalhe: head sempre visível, body colapsável (descrição + diferenciais + link + PDF + updatedAt). Toggle via `proToggleFeatDet(featId)`. Click no head OU no chevron abre/fecha. Começa **fechado**.
- Botões/links dentro do drawer usam `event.stopPropagation()` pra não fechar o dropdown ao clicar.

**Editor de feature — accordion com micro-resumo + drag-and-drop:**
- Cada feature vira accordion (`_proFeatToggle(featId)`): head sempre visível (handle + ícone + título + micro-pills de status/quantidade + ↑↓🗑 + chevron ▾), body colapsa.
- Estado `S._proFeatOpen[featId]` controla qual está aberta (preserva entre re-renders via featId, **resetado em proAbrir/proEditar/proNovo**).
- Feature nova criada via `_proFeatAdd` abre automaticamente (foco no título).
- **Click no head do editor abre/fecha** (helper `_proFeatHeadClick`). Botões internos têm `event.stopPropagation()`.
- **Drag-and-drop funcional** (HTML5 nativo) pelo handle ⠿:
  - Handle é o único `draggable=true`. Card todo aceita drop.
  - Funciona só dentro do mesmo source (não move feature principal pra mentoria).
  - Indicadores `drop-before`/`drop-after` (linha accent no topo ou base).
  - Estado `_proFeatDragState` global. Limpo no dragend.

**Confirm ao remover feature:** `_proFeatRm` exige `confirm()` mostrando o nome da feature.

**Campo Quantidade** (renomeado de "Número-chave (opcional)" pra `Quantidade`, placeholder mantido).

**Campo Diferenciais (rich-text) — substituiu Descrição:**
- Mini editor rich-text reutilizável `_proRtFieldHTML({id, value, placeholder, label, featI, featSource, featField, featId})`.
- Toolbar completa: B/I/U/S, listas (• e numerada), código inline `</>`, link 🔗, 🧹 limpar formatação externa, 7 cores texto + 6 cores fundo.
- HTML cru é gravado no estado via `_proRtCommit(id)` (busca feature pelo **ID estável** via `data-feat-id`, com fallback pro índice). **Bug histórico**: usar índice no lookup quebrava ao adicionar/reordenar features — solução foi `data-feat-id` + `arr.findIndex(f=>f.id===fid)`.
- Sanitização via `_comSanitizePostHTML` só no save (`_proPrepareFeatures`) — não a cada keystroke.
- 🧹 limpar formatação: `_proRtClean(id)` → `removeFormat` nativo + `_proRtStripStyle(html)` que mantém só `p,br,ul,ol,li,strong,b,em,i,u,s,code,a[href]`, desempacota o resto, remove todos os atributos exceto href/target/rel em `<a>`. Resolve cola do Word/Docs/web.
- **Detalhe** renderiza diferenciais com `<div class="pro-feat-dif">⭐ DIFERENCIAIS<br>{html sanitizado}</div>` (caixa amarela discreta).
- Compat retroativa: feature antiga com `descricao`/`observacao` migra automaticamente pra `diferenciais` em `_proNormFeature`.

**Campo Link (botão nomeável):**
- 2 inputs lado a lado: label do botão (max 60) + URL (type=url).
- `_proNormalizeUrl` aceita `https://...`, `http://...`, ou adiciona `https://` se for tipo "site.com/foo" sem scheme. URLs inválidas viram `''`.
- Detalhe: botão gradient azul→roxo com label customizado (ou domínio limpo via `_proLinkLabel` como fallback). Click NÃO fecha o dropdown (`event.stopPropagation`).

**Campo PDF anexável (botão nomeável):**
- 1 PDF por feature. Campos: `pdfUrl, pdfLabel, pdfPath, pdfSize, pdfName`.
- Editor: label customizável + botão "📎 Anexar PDF (máx 20MB)". Após upload mostra caixa âmbar com nome + tamanho + 🗑 remover + Trocar.
- Storage: `produtos/{pid}/features/{fid}/pdf-{ts}.pdf`. Apaga PDF antigo do Storage ao trocar/remover.
- Detalhe: botão **gradient âmbar/vermelho** "📄 {label}" — visualmente diferente do link azul/roxo. Abre em nova aba com `download` attr.
- Limite 20MB enforced em 2 lugares: JS (`_proFeatPdfUpload`) + Storage Rules (`produtos/{produtoId}/{allPaths=**}`).

**Status da feature — 3-way (2026-05-23):**
- `disponivel` deixa de ser boolean → string `'sim'|'nao'|'construcao'`.
- Helper `_proFeatDisp(f)` normaliza (compat: bool true→sim, false→nao).
- `PRO_FEAT_DISP_META` define label/color/icon de cada estado: sim (verde ✓), nao (vermelho ✗), construcao (laranja 🛠).
- Editor: 3 botões segmented (`.pro-toggle.pro-toggle-3`) com botão "Em construção" em laranja quando ativo.
- Detalhe: status no canto direito como dot+label. Card **NÃO muda borda** pra status `construcao` — decisão UX explícita (era poluído demais).
- Dex prompt distingue os 3: ` (NÃO incluído)` ou ` (EM CONSTRUÇÃO — ainda não disponível)` ou normal.

**Mentoria — 3 estados (2026-05-23):**
- `temMentoria` deixa de ser boolean → string `'sim'|'opcional'|'nao'`.
- 'opcional' = mentoria existe mas é compra à parte.
- Helper `_proMentStatus(p)` normaliza (compat: bool true→sim, false→nao).
- Editor: 3 botões segmented (Sim / Opcional / Não). Botão "Opcional" usa class `wip` (laranja). Body do accordion fica visível pra sim/opcional, escondido só pra 'nao'.
- Detalhe: bloco Mentoria aparece pra sim/opcional, com pill laranja `OPCIONAL` ao lado do título quando opcional.
- **Campo `mentoriaDescricao`** (2026-05-23): textarea no editor (3 linhas) + parágrafo destacado com borda lateral roxa no detalhe (`.pro-ment-desc`). Visível por inteiro quando temMentoria != 'nao'. Inclui no prompt do Dex.
- Dex prompt: '**Mentoria inclusa:**' pra sim, '**Mentoria (opcional — compra à parte):**' pra opcional + descrição se houver.

**Seção Bônus (2026-05-23):**
- Novo accordion **🎁 Bônus** abaixo de Mentoria. Modelo: `bonusProdutoIds:[str]` (referências a outros produtos do catálogo) + `bonusFeatures:[Feature]` (features livres mesma shape).
- Vincular produto: picker `_proBonusOpenProdPicker` lista todos os outros produtos do catálogo (exceto o próprio e os já vinculados), com mini-capa+nome+status. Click adiciona como chip.
- Features bônus livres: mesma interface das features principais (drag, dropdown, etc), source='bonusFeatures'. `_proFeatWrapId` aceita os 3: 'features', 'mentoriaFeatures', 'bonusFeatures'.
- Detalhe: seção **`// 🎁 BÔNUS`** (amarelo dourado #fbbf24) com cards horizontais clicáveis dos produtos vinculados (cada um abre `proAbrir(id)`) + features bônus em lista.
- Dex prompt: resolve nomes dos produtos vinculados a partir da lista de produtos passada (`formatarProduto(p, todosProdutos)`).
- Bloqueia auto-referência e duplicatas. Produto deletado vira chip "⚠️ Produto removido" (mantém ID, permite desvincular).

**Seção Dúvidas frequentes / FAQ (2026-05-23):**
- Novo accordion **❓ Dúvidas frequentes** entre Objeções e Links. Modelo: `duvidas:[{id, pergunta, resposta}]`.
- Distinção semântica vs Objeções: Objeções = vendas (rebater "tá caro"), Dúvidas = suporte (FAQ tipo "tem certificado?").
- Funções `_proDuv*` clonadas do padrão `_proObj*`. Editor: input pergunta + textarea resposta 3 linhas, com ↑↓🗑.
- Detalhe: bloco `// ❓ DÚVIDAS FREQUENTES` reusando `.pro-obj` (mesma caixa de objeções), pergunta prefixada com ❓.
- Dex prompt: '**Dúvidas frequentes (FAQ):**'.

**Salvar produto — permanece na edição (2026-05-23):**
- `_proSalvar` antes voltava pra view 'detail' após save. Agora **mantém em 'edit'** (se era 'new', vira 'edit').
- Captura accordions abertos antes do re-render e re-aplica `.open` após.
- Feedback visual no rodapé: chip verde `✓ SALVO ÀS HH:MM:SS` (some após 6s) ou chip vermelho `⚠️ erro` (fica até salvar de novo).
- Botão Salvar ganha id `pro-save-btn` + span `pro-save-feedback`.

**Todos os accordions começam fechados ao entrar em edit/new (2026-05-23):**
- Accordion "Básico" era hardcoded com `class="pro-edit-accordion open"`. Removido. Agora todos começam fechados.
- Reset de `S._proDisc`, `S._proFeatOpen`, `S._proFeatDetOpen` em `proAbrir`/`proEditar`/`proNovo`.

**Bug crítico do Firestore — `serverTimestamp` em array (2026-05-23):**
- Cada feature tem `updatedAt`. Antes usava `serverTimestamp()`, que NÃO é aceito pelo Firestore dentro de arrays.
- Fix: usar `Timestamp.now()` (client-side) — válido em arrays. O `updatedAt` top-level do produto continua usando `serverTimestamp`.
- Helper de comparação `_proFeatEqual` ignora `updatedAt` no diff (compara só campos editáveis), e só atualiza quando há mudança real.

### Pergunte ao Dex — assistente IA do Catálogo MedReview (2026-05-23)

Feature de busca conversacional com Claude API integrada à aba Produtos.

**Arquitetura:**
- **Cloud Function nova** `perguntarDex` exportada em `cloud-function-hotmart/index.js` → código em `cloud-function-hotmart/dex.js`.
- HTTP endpoint público (CORS limitado): `https://us-central1-simulados-confirmacao.cloudfunctions.net/perguntarDex`
- Recebe POST `{pergunta:string}` + header `Authorization: Bearer <Firebase ID token>`.
- Valida Firebase Auth via `admin.auth().verifyIdToken` — **login custom legado NÃO funciona** (precisa Firebase Auth real).
- Lê coleção `produtos` do Firestore via Admin SDK (filtra `descontinuado`).
- Chama **Claude Haiku 4.5** (`claude-haiku-4-5-20251001`) com **prompt caching** ephemeral (system cacheado por 5min — primeira pergunta paga o catálogo, próximas pagam 10%).
- Retorna `{resposta, usage}` (in/out/cache_read/cache_write tokens).
- Estimativa de custo: ~$1-3/mês com uso moderado (200 perguntas/dia).

**API Key:** `ANTHROPIC_API_KEY` no `cloud-function-hotmart/.env` (gitignored). Gerada no console.anthropic.com da org corporativa MedReview.

**Prompt restrito ao catálogo:**
- Instrução rígida: "Use APENAS as informações do catálogo abaixo. Se não souber, responda exatamente: 'Não tenho essa informação no catálogo.'"
- Formato de link: `[Nome do Produto](produto:ID_DO_PRODUTO)` — frontend converte em chip clicável que abre `proAbrir(id)`.
- Bloqueia respostas fora de escopo (dúvidas clínicas, comparação com concorrentes, etc).
- Inclui todas as seções do produto: nome, descrição, público-alvo, provas-alvo, responsáveis, status, features (com diferenciais HTML→texto via `stripHtml`, link, PDF), mentoria (com descrição), bônus (resolve IDs pra nomes), argumentos, objeções, dúvidas, links.

**UI (aba Produtos):**
- Botão **🤖 Pergunte ao Dex** na toolbar (gradient azul/roxo/laranja, pill capsule Apple-like).
- Click abre painel inline `pro-dex-panel` acima da lista de produtos (liquid glass, animação `dexSlideIn`).
- Textarea pra pergunta (Enter envia, Shift+Enter quebra linha).
- Loading state com spinner. Erro state vermelho. Resposta em card com markdown leve parseado por `_proDexFormatAnswer(text)`.
- Parser de markdown seguro: escapa HTML primeiro, depois substitui `[txt](url)` (links produto: e https: only — bloqueia `javascript:`), `**bold**`, `` `code` ``, `*italic*`, listas `- item`, parágrafos.
- Links de produto: `<a class="pro-dex-prod-link" data-pid="..."` ligados via `_proDexBindLinks` (delegation com `proAbrir`).
- Estado `S.dexAberto/dexPergunta/dexLoading/dexResposta/dexErro/dexUsage/_dexFocusNext` (todos com fallback `||`).
- Foco no input só quando o painel acabou de abrir (flag `_dexFocusNext`), não em todo re-render.
- Ao fechar o painel: limpa erro/resposta/pergunta/usage (próxima abertura começa limpa).

**Permissão:** qualquer usuário logado via Firebase Auth com acesso à aba Produtos. Backend não checa permissão granular extra (intencional — quem vê o catálogo pode perguntar).

**Riscos mitigados:**
- API key nunca exposta no frontend (sempre via Cloud Function).
- CORS restrito a `aros.anestreview.com.br` + `localhost:8080/8081/127.0.0.1`.
- Validação de tamanho da pergunta (max 2000 chars).
- Erro 401 se sem token. Erro 500 com detail se sem API key configurada.

**Endpoint de monitoramento:**
```bash
npx -y firebase-tools functions:log --only perguntarDex --lines 50
```

**Compat retroativa (read tolerante):**
- `pitchCurto` → lido como `breveDescricao` via `_proGetBreveDescricao`.
- `publicoAlvo:string` → `[string]` via `_proGetPublicoAlvo`.
- `responsavel:string` → `[string]` via `_proGetResponsaveis`.
- Features com `tipo` (v2) → ignora o campo, lê os demais. `quantidade` antigo herda como `numeroChave`. `temVideoComentario` / `bonusProdutoId` ignorados silenciosamente.
- Ao salvar, normaliza: grava `breveDescricao` + `deleteField(pitchCurto)`, `responsaveis` array + `deleteField(responsavel)`. Campos antigos de features não são removidos com `deleteField` (apenas ignorados na UI).

### Pergunte ao Dex — evolução (2026-05-25)

**Jornada do Cliente integrada ao contexto:**
- Cloud Function lê `config/jornadaCliente` em paralelo com produtos (Promise.all).
- HTML do texto é strippado via `stripHtml`, depois injetado como bloco `=== JORNADA DO CLIENTE ===` ANTES do catálogo no system prompt.
- Sempre anexada — não é mais opcional, não usa placeholders.

**Editor de prompt personalizável (UI admin):**
- Botão **⚙️** no head do painel do Dex (só `_proCanEdit()`).
- Painel inline `pro-dex-cfg-panel` com:
  - Dropdown de **modelo** (Haiku 4.5 / Sonnet 4.6 / Opus 4.7) — alias curto resolvido pra ID via `MODEL_MAP` no backend.
  - Slider de **max_tokens** (256–4096, default 1024).
  - **Abas de perfil**: Geral · Suporte · Vendas · Marketing.
  - Textarea por perfil (instruções/personalidade/regras — Jornada e Catálogo são SEMPRE injetados automaticamente, sem placeholders).
  - Botão **📋 Carregar exemplo** preenche com o template padrão do perfil (espelhado entre frontend `_proDexExemplos` e backend `DEFAULT_INSTRUCTIONS`).
  - Botão **↶ Usar padrão** limpa o campo (vazio = backend cai pro `DEFAULT_INSTRUCTIONS[perfil]`).
  - Salvar/Cancelar usam draft em `S._dexConfigDraft` (preserva edição contra snapshot listener).
- Doc Firestore: `config/dexPrompt` com campos `templateGeral`, `templateSuporte`, `templateVendas`, `templateMarketing`, `modelo`, `maxTokens`, `pdfsGeral[]`, `pdfsSuporte[]`, `pdfsVendas[]`, `pdfsMarketing[]`, `updatedAt`, `updatedBy`. Campo legado `template` ainda aceito como fallback inicial nos 4 perfis (compat).
- Audit log: `DEX_PROMPT_SALVO` (com flags `custom.{perfil}: boolean`), `DEX_PDF_ANEXADO`, `DEX_PDF_REMOVIDO`.

**Chips de perfil no painel do Dex (todos os users):**
- 4 chips acima do input: **🧭 Geral** (default), **💁 Suporte**, **💰 Vendas**, **📢 Marketing**.
- Escolha persiste em `localStorage` chave `aros.dex.perfil`.
- Cada pergunta envia `perfil` no body — backend usa template e PDFs correspondentes.
- Constante frontend `_DEX_PERFIS = ['geral','suporte','vendas','marketing']` (mantém em sync com `PERFIS` do backend).
- Backend default `DEFAULT_PERFIL = 'geral'` (também usado quando perfil inválido).

**PDFs anexados por perfil (referência adicional pra IA):**
- Limite: **5 PDFs por perfil · 32MB cada · só `application/pdf`**.
- Storage path: `dex/pdfs/{perfil}/{Date.now()}-{nome_sanitizado}`.
- Storage rule nova `match /dex/pdfs/{perfil}/{allPaths=**}` (read auth, write auth+pdf+32MB, delete auth).
- Upload IMEDIATO no Firestore (não usa draft) via `setDoc(...,{merge:true})` — independente do save do textarea.
- Botão 🗑 remove de Firestore + Storage (best-effort, ignora falha de delete do Storage).
- Backend monta `user message content` com array `[doc1, doc2, ..., text]`:
  - Cada PDF como bloco `type:'document', source:{type:'url', url:p.url}, title:p.label`.
  - **Cache_control no ÚLTIMO documento** → cacheia todo o prefixo (system + PDFs) por 5min.
  - Order matters pra prompt caching: PDFs primeiro (estáveis), texto da pergunta depois (variável).
- Custo aproximado: PDF de 20 páginas ≈ 40k tokens input/pergunta. Primeira chamada paga full (cache write); seguidas pagam ~10% (cache read).

**Backend (`dex.js`) refatorado:**
- `PERFIS = ['geral','suporte','vendas','marketing']`, `DEFAULT_PERFIL = 'geral'`.
- `perfilToField(perfil)` → `'template' + Capitalized`.
- `DEFAULT_INSTRUCTIONS` é objeto `{geral, suporte, vendas, marketing}` — cada um com prompt completo.
- `buildSystemPromptFromInstructions(instructions, catalogoFmt, jornadaTxt)` — append automático de jornada + catálogo. Função antiga `buildSystemPrompt` removida (era dead code).
- `MODEL_MAP = {haiku, sonnet, opus}` resolve aliases curtos pra IDs completos. Aceita também ID completo `claude-*` direto.
- `max_tokens` validado entre 256 e 4096 (default 1024).
- Logs incluem `perfil`, `modelo`, `max_tokens`, `pdfs_count`, `prompt_custom`.

**Origens CORS atualizadas em `dex.js`:**
- Aceita `localhost:8080`, `localhost:8081`, `localhost:8765`, `127.0.0.1:8080`, `127.0.0.1:8081`, `127.0.0.1:8765`, `aros.anestreview.com.br`.

**Gotchas:**
- **`@anthropic-ai/sdk` precisa estar instalado em `cloud-function-hotmart/node_modules/`** antes do deploy. Firebase analisa o source localmente durante o deploy — se o `require()` falha, o export é silenciosamente ignorado e a função some do deploy. Rodar `npm install` em `cloud-function-hotmart/` antes de deployar.
- **Login custom legado NÃO funciona com Dex** — exige Firebase Auth (Google ou Email/Password).
- `S._dexConfigDirty` impede o snapshot listener de sobrescrever edições em andamento.
- Save dos PDFs é independente do save do textarea (PDFs commitam imediatamente; textarea via Salvar/Cancelar).

### Jornada do Cliente — auto-save em rascunho (2026-05-25)

**Sobrevivência a reload/crash do navegador:**
- Toda edição em `_proJornadaSetTexto` / `_proJornadaSetVideo` chama `_proJornadaDraftScheduleSave()` com debounce 600ms.
- Snapshot é serializado em `localStorage` chave `aros.jornadaCliente.draft.v1`: `{texto, videoUrl, imagemUrl, imagemPath, savedAt}`.
- Ao recarregar: snapshot listener carrega Firestore primeiro, depois `_proJornadaDraftCheck()` compara com o rascunho local.
- Se rascunho difere E é recente (≤30 dias): seta `S._jornadaDraft` e mostra banner laranja `pro-jornada-draft-banner` com botões **↩ Restaurar** e **🗑 Descartar**.
- Após salvar com sucesso no Firestore: `_proJornadaDraftClear()` apaga o rascunho local.
- `beforeunload` global também checa `S._jornadaDirty` (não só `_proDirty` do editor de produto).

### Editor rich-text de Produtos — melhorias (2026-05-25)

**Paste sanitizer (`_proRtPaste`):**
- Bound via `onpaste` attribute em `_proRtHTML`.
- Captura `clipboardData.getData('text/html')` ou `text/plain`.
- Remove `script/style/meta/link/iframe/object/embed/o:p/xml`, comentários HTML, e roda `_proRtStripInline` (limpa cor/fundo/fonte/font-family/font-size/font-weight + desempacota `<font>` e spans vazios).
- Inserção via `execCommand('insertHTML')` com fallback manual.

**Botão ⌫ Limpar reescrito (`_proRtClear`):**
- Roda `removeFormat` nativo + `unlink`.
- Se há seleção: expande `commonAncestorContainer` pra cobrir wrappers ancestrais com style/span/font, extrai → limpa → re-insere.
- Se não há seleção: limpa o editor inteiro.
- `_proRtStripInlineDeep` roda strip em loop até estabilizar (até 8 iterações) — resolve spans aninhados profundos em uma chamada só (antes precisava clicar 3x).

**Toggle de dropdown em contenteditable (`<details>`):**
- Bug Chrome: click em summary dentro de `contenteditable` às vezes só posiciona cursor, não toggla.
- Fix: handler global no `document` (delegação, capture phase) — detecta click em summary dentro de `.pro-rt-ed[contenteditable]`, chama `preventDefault()` e toggla `[open]` manualmente.
- Ignora cliques no `.pro-collapsible-del` (botão ✕).

**Auto-reparo de `<details>` quebrados (`_proRtRepairDetails`):**
- Quando user cola conteúdo de fora (ex: Claude.ai com classe `font-claude-response-body`), às vezes o `<details>` perde o wrapper `.pro-collapsible-body`.
- Função roda em `_proRtHTML` (render do editor) E em `_proRtRepairDetails(_renderRichText(j.texto))` (visualização readonly).
- Garante classe `pro-collapsible` em todo `<details>`, e envolve filhos não-summary/não-button em `.pro-collapsible-body`.

### Catálogo de Produtos — Verticais (2026-05-26)

**Separação completa por vertical do grupo MedReview.** O catálogo agora é o portal de entrada pra 4 verticais independentes, cada uma com produtos/jornada/editais/IA próprios.

**4 verticais cadastradas:**
| id | Nome | Cor | Avatar IA | Artigo |
|---|---|---|---|---|
| `anestreview` | AnestReview | `#2563eb` (azul) | **Dex** | ao |
| `oftreview` | OftReview | `#eab308` (amarelo) | **Íris** | à |
| `ortopreview` | OrtopReview | `#92400e` (marrom) | **Thor** | ao |
| `medreview` | MedReview | `#a855f7` (roxo) | **Lux** | ao |

Const `VERTICAIS` em `index.html` é fonte única de verdade — `{id,nome,ico,cor,cor2,avatar,artigo,tag,subtitulo}`. Helpers: `_verticalById/Avatar/Artigo/Cor/Nome`.

**Tela inicial do catálogo:**
- `S.produtosView==='verticals'` → renderiza `_proRenderVerticals(root)` com 4 cards estilo **home-card** (mesma engine de tilt 3D + glow follow-cursor + shine sweep + reveal staggered da Home).
- Cada card tem capa 16:10 com gradient da cor + ícone gigante (96px), corpo com nome + subtítulo + CTA "Abrir catálogo →".
- `_arosBindTilt()` é chamado após render — handlers de mouse aplicam `--tilt-x/y` e `--mx/my` via CSS vars.
- Click no card → `proSelectVertical(id)` seta `S.verticalAtual`, persiste em `localStorage` (`aros.catalogo.vertical`), chama `_proRebindVerticalListeners()`, troca pra `S.produtosView='list'`.
- Botão `proVoltarVerticais()` no breadcrumb da listagem volta pra seleção.

**Modelo de dados:**
- **Produtos**: campo `vertical` no doc (`'anestreview'|'oftreview'|'ortopreview'|'medreview'`). Produtos sem o campo são tratados como `'anestreview'` por compat. Save sempre força `vertical: S.verticalAtual`.
- **Configs por vertical** com sufixo: `config/jornadaCliente_${vertical}`, `config/editais_${vertical}`, `config/catalogoConfig_${vertical}`, `config/dexPrompt_${vertical}`.
- **AnestReview usa docs SEM sufixo (legado preservado)** — `_verticalDocId('jornadaCliente') === 'jornadaCliente'` quando vertical é anestreview, senão `'jornadaCliente_${vertical}'`.
- **slackTime continua GLOBAL** (mesma equipe atende todas as verticais).

**Listeners dinâmicos:**
- `_proRebindVerticalListeners()` cancela os 4 listeners antigos e cria novos apontando pros docs da vertical atual.
- Reseta state local (catalogoConfig/jornadaCliente/editais/dexConfig) antes pra evitar flash de dados da vertical anterior.
- Chamado em `proSelectVertical` e em `initProdutos` se já tem vertical persistida.

**Backend `dex.js`:**
- Aceita `vertical` no body. Valida contra `VERTICAIS_VALIDAS=['anestreview','oftreview','ortopreview','medreview']`. Default `'anestreview'`.
- `verticalDoc(baseDoc)` helper resolve sufixo (mesma regra do frontend).
- Filtra produtos: `if (data.vertical||'anestreview') !== vertical) return;`
- Lê `config/{jornadaCliente|dexPrompt|editais}_${vertical}` (ou sem sufixo pra anestreview).
- `VERTICAL_AVATAR` e `VERTICAL_NOME` map IDs → labels (Dex/Íris/Thor/Lux + nomes oficiais).
- `buildSystemPromptFromInstructions` recebe `{avatarNome, verticalNome}` em `ctx` — gera bloco `## IDENTIDADE\nVocê é ${avatar}, assistente do catálogo da vertical **${vertical}**...` no topo do prompt.
- Logs incluem `vertical, avatar`.

**Frontend Dex UI:**
- Título do painel: `${avatar} · Assistente do Catálogo ${nome}` (muda por vertical).
- Botão: "Pergunte ${artigo} ${avatar}" — usa o artigo correto ("ao Dex", "à Íris", "ao Thor", "ao Lux").
- `proDexAsk` envia `vertical: S.verticalAtual||'anestreview'` no body.

**Migração:** zero impacto pra AnestReview (usa docs originais). Outras verticais começam vazias — admin cadastra do zero ao entrar nelas.

### Catálogo de Produtos — Editais (2026-05-26)

Nova seção colapsável "📋 Editais" entre Jornada do Cliente e a lista de produtos.

**UI:**
- Box principal com toggle (mesmo padrão visual do `pro-jornada-disc`).
- Botão "+ Cadastrar edital" abre modal com:
  - Input nome da prova
  - Input ano
  - Editor rich-text completo (toolbar com cores, listas, alinhamento, dropdowns colapsáveis).
- Modal **não fecha ao clicar fora** — só via ✕ ou Cancelar (pra evitar perda acidental de dados durante edição).
- Cada edital salvo vira card colapsável com: ícone 📄, nome do edital, badge azul do ano (colado ao nome), botões ✏️ e 🗑.
- Lista ordenada por ano descendente, depois alfabético.
- Texto da info no read-mode: width:100%, sem hifenização, respeita alinhamento escolhido no editor.

**Persistência:**
- `config/editais_${vertical}` → `{lista:[{id,nomeProva,ano,info,updatedAt,updatedBy}], updatedAt, updatedBy}`.
- `_proSanitizeResp` aplicado em `info` no save (mesma sanitização de obj/dúvidas).
- Audit log: `EDITAL_CRIADO/EDITAL_EDITADO/EDITAL_REMOVIDO`.

**Contexto pro Dex:**
- `formatarEditais()` em `dex.js` exporta cada edital como `### {Nome} — Ano: {ano}\n{info strippado}`.
- Bloco `=== EDITAIS CADASTRADOS (${verticalNome}) ===` injetado no system prompt, com **ano atual** (`new Date().getFullYear()`) explícito.
- Regra de estilo no `ESTILO_UNIVERSAL`: se a resposta usar info de edital de ano anterior ao atual, começa avisando ("Com base no edital de XXXX...").

### Catálogo de Produtos — Datas Importantes (2026-05-26)

Nova seção colapsável "📆 Datas importantes" logo abaixo de Editais. Calendário de eventos da vertical (provas, revisões, liberações, prazos) com link/descrição. Dex/Íris/Thor/Lux lêem essas datas pra responder perguntas tipo "qual o link da revisão extrema TEA?", "quando é a próxima prova?".

**UI:**
- Caixa estilo `pro-jornada-disc` com toggle.
- Toolbar: `＋ Cadastrar evento` · `📅 Ver calendário` · `⚙ Gerenciar tipos` (modais).
- **Barra de filtro de escopo** acima dos cards: `[Todos] [TEA] [TSA] [MEs] [Outros] [Sem escopo] ⚙` — afeta lista E calendário ao mesmo tempo. Esconde a barra se não há escopos cadastrados (deixa só o ⚙).
- Cards colapsáveis: header com ícone do tipo + título + data formatada + horário + badge do tipo + badge do escopo (roxo) + ações; body com descrição (pre-wrap) + link clicável.
- Card sem descrição/link fica não-clicável (caret cinza desabilitado).
- Eventos passados ocultos por padrão; botão "Ver passados (N)" no rodapé expande.
- Calendário tela cheia (modal `pro-dimp-cal-*`): grid 7 colunas, navegação `←/→/Hoje`, chips dos eventos por dia (até 3 + "+N eventos" com popover). Período aparece SÓ no dia de início.
- Popup do evento sobre o calendário (sem fechar o grid): backdrop translúcido + card com ícone/badge/data/horário/escopo/descrição/link + botões Editar/Remover/Fechar. Esc inteligente: fecha popup primeiro; se já fechado, fecha calendário.

**Modal de cadastro/edição:**
- Tipo (chips com ícone+cor) → botão "+ Novo tipo" (subform inline com input nome, grid compacta de ícones curados + **input livre de emoji personalizado**, paleta de 8 cores) → botão "⚙ Gerenciar tipos".
- **Escopo** (chips single-select roxos, incluindo "Sem escopo") → botão "+ Novo" inline → "⚙ Gerenciar".
- Título obrigatório.
- Modo **pontual** (data + horário opcional) ou **período** (data início + fim, fim ≥ início).
- Descrição (textarea, não rich-text, max no servidor).
- Link (URL, validado pra começar com `http://` ou `https://`).

**Tipos de evento (system + custom + override + tombstone):**
- 4 system fixos hardcoded em `PRO_DIMP_TIPOS_SYSTEM`: `prova` 📅 #ef4444, `revisao` 📚 #2563eb, `liberacao` 🎁 #16a34a, `inscricao` 📝 #e46d0a.
- Persiste em `config/datasImportantesTipos` (GLOBAL, sem sufixo de vertical) com shape `{lista:[{id,nome,icone,cor,system,criadoEm,criadoPor}], deletedSystemIds:[], updatedAt, updatedBy}`.
- `_proDimpTiposAll()`: começa com defaults → remove `deletedSystemIds` → aplica overrides de `lista` (se id bate com system, substitui nome/icone/cor mantendo `system:true`) → appenda custom.
- **TUDO renomeável/removível** (system inclusive). Renomear "prova": cria entry em `lista` com `id:'prova'` e novos campos. Remover "prova": adiciona `'prova'` em `deletedSystemIds`.
- Eventos cujo tipo foi deletado: render mostra "❓ (tipo removido)" — não quebra.
- Painel "Gerenciar tipos": lista TODOS (system + custom + overrides), botões ✏️ Editar (subform pré-preenchido) + 🗑 Remover (confirm com count de eventos afetados).
- Ícone personalizado: input de emoji (max 8 chars — cobre compostos tipo 👨‍⚕️). Limpa highlight da grade ao usar campo livre. Grade reduzida pra 8 cols x 16px (`.pro-icon-grid-sm`).

**Escopos (por vertical, 1 por evento):**
- Persiste no MESMO doc `config/datasImportantes_{vertical}` campo `escopos:[{id,nome,criadoEm,criadoPor}]`.
- Eventos têm `escopoId: string|null`. Vazio = "Sem escopo".
- Painel "Gerenciar escopos": lista com count de eventos por escopo, renomear inline + remover (confirm com count). Remover zera `escopoId` em eventos afetados no MESMO write; se filtro vigente apontava pro removido, reseta pra "todos".
- Filtro NÃO persiste entre sessões (reset em page load + `proSelectVertical` + `proVoltarVerticais`).
- Cor visual dos escopos: roxo `#a855f7` (distinção do tipo que tem cor variável).
- Nome duplicado (case-insensitive) bloqueado.

**Persistência principal (eventos):**
- `config/datasImportantes_{vertical}` via `_verticalDocId('datasImportantes')` (sem sufixo pra AnestReview, com sufixo pra outras).
- Shape: `{lista:[{id,tipo,titulo,modo,dataISO?,horario?,dataInicioISO?,dataFimISO?,descricao,link,escopoId,updatedAt,updatedBy}], escopos:[...], updatedAt, updatedBy}`.
- Listener `onSnapshot` em `_proRebindVerticalListeners` re-pinta lista e calendário (se abertos) respeitando filtro.
- Estados de modal/filtro resetados em troca de vertical pra evitar contaminação cruzada.
- Audit: `DATA_IMP_CRIADA/EDITADA/REMOVIDA`, `DATA_IMP_TIPO_CRIADO/EDITADO/REMOVIDO`, `DATA_IMP_ESCOPO_CRIADO/EDITADO/REMOVIDO`.

**Contexto pro Dex (Cloud Function `dex.js`):**
- Lê 3 docs novos por vertical no Promise.all junto com produtos/jornada/editais: `datasImportantes_{vertical}`, `datasImportantesTipos` (global), e dentro do primeiro vem `escopos`.
- `formatarDatasImportantes(lista, tipos, deletedSystemIds, escopos)`:
  - Aplica tombstones + overrides na resolução de tipo (mesma lógica do front).
  - Separa eventos em **FUTUROS** e **JÁ PASSARAM** (comparação por string ISO `YYYY-MM-DD`).
  - Cada evento: `### {ícone} {título} [{nome do tipo}]` + linhas `- **Data:** DD/MM/YYYY [a DD/MM/YYYY] [_(já passou)_]` · `- **Horário:** HH:MM` · `- **Escopo:** Nome` · `- **Descrição:** ...` · `- **Link:** ...`.
- Bloco `=== DATAS IMPORTANTES ({verticalNome}) ===` injetado no system prompt com **hoje em pt-BR** explícito (`new Date().toLocaleDateString('pt-BR')`). Header instrui IA a citar link quando houver e diferenciar futuros vs passados.
- Mantém otimização de prompt caching (instruções estáticas vêm primeiro).

### Cruzar Lista — aba nova em Administração + Aprovações no Catálogo (2026-05-26)

Aba **🎯 Cruzar Lista** (`tab-cruzarLista`, grupo Administração, `ADMIN_ONLY_TABS`). Substitui o projeto MED-Review externo (Python/FastAPI/Postgres no Render+Neon) que está sendo aposentado. Dados migrados: 15.540 alunos + 4 provas + 4 resultados Postgres→Firestore.

**Auth model:** coleção `adminUids/{uid}` cadastra UIDs com privilégio admin. Rule `isAdmin()` = `isAuth() && exists(/adminUids/$(uid))`. Bootstrap único hardcoded em rules pro 1º admin (UID `nF4lKfJXOyPyx6btGkV7Lj0DkQr1` = Tiarlles). Listener `onAuthStateChanged` auto-cria o doc se UID bate e doc não existe.

**Fluxo principal:**
1. Cola lista de aprovados (texto OU upload PDF — pdf.js Mozilla lazy-loaded via CDN)
2. Filtro só por vertical (não por produto — simplificado)
3. Click "🎯 Cruzar (N nomes)"
4. **Web Worker** roda fuzzy match em background (não trava UI):
   - Normalização: NFD + remove diacrits + lowercase + replace `(XX)` → ` ` (sufixo de estado) + replace não-alfanumérico → ` ` + collapse spaces + remove stopwords `[de,da,do,dos,das,e,del]`
   - `token_set_ratio` (rapidfuzz/fuzzywuzzy adaptado) com Levenshtein 2-row
   - **CRÍTICO:** base recalcula `nomeNorm` em runtime via `_czNorm(a.nome)` em vez de usar o `nomeNorm` salvo. Por quê: a migração gravou nomeNorm sem remover stopwords (assimetria). Recalcular garante simetria de normalização entre lista e base.
   - Score ≥92 = aprovado, 82-91 = duvidoso, <82 = sem correspondência
5. Tela de resultado em 3 seções colapsáveis + métrica gigante de %:
   - **% efetivo** = (aprovados não-descartados + duvidosos confirmados + sem-corresp confirmados/vinculados) / totalLista × 100

**Ações por categoria de match:**
- **Aprovados:** 🗑 Descartar / ↩ Restaurar / 🛍️ Produtos / 🔍 Diagnosticar
- **Duvidosos:** ✓ Confirmar / 🗑 Descartar / 🛍️ Produtos / 🔍 Diagnosticar
- **Sem correspondência:** ✅ Confirmar como aprovado / 🔍 Buscar aluno na base (vincula manual) / ❌ Descartar / 🔍 Diagnosticar

**🔍 Modo Diagnóstico:** painel com nome original, normalização, tokens, top 10 candidatos com score + tokens + sets `inter`/`diffA`/`diffB` + botão "🔗 Vincular este". Essencial pra debugar.

**🛍️ Produtos do aluno:** painel com nome/email/CPF (formatado XXX.XXX.XXX-XX) + lista de compras com badge da vertical, nome produto, data, status.

**🔍 Consultar aluno (lupa global):** botão no topo da aba, abre busca livre (nome/email/CPF) — até 30 resultados, click abre painel de Produtos do aluno. Consulta passiva (sem audit).

**Histórico de aprovações** (segunda view da aba, antes "Histórico de provas"):
- Filtro por vertical
- Provas agrupadas por vertical (na ordem de `VERTICAIS`)
- Tabela `Ano | Nossos | Lista | % | ações` (campo `Edição` removido a pedido)
- Último ano de cada prova destacado com badge "📌 Mais recente"
- Botões ✏️ Editar prova/resultado + 🗑 Remover + 📋 Ver lista (só se `listaSnapshot` existir)
- ➕ Nova prova (inline) e + Novo resultado

**Snapshot da lista** (`resultadosAprovados.listaSnapshot`):
- Gravado SEMPRE quando salva resultado via fluxo de cruzamento (em qualquer ano, coexistem).
- NÃO existe nos resultados legados da migração (Postgres não tinha) nem nos criados manualmente via "+ Novo resultado".
- Conteúdo: `{aprovados:[{nomeLista,nomeAluno,score,vinculacaoManual,confirmadoManual}], semCorrespondencia:[{nomeLista,score}], totalLista, totalAprovadosEfetivo, capturadoEm}`.
- Modal "📋 Ver lista" no histórico mostra read-only.

**Fix crítico de matching (caso "Arthur de Paula Melgaço (MG)"):**
- Listas de bancas trazem sufixo de estado `(MG)`, `(ES)`. Sem o fix, vira token "mg" que reduz score (~91 em vez de 100).
- Combinado com a assimetria nomeNorm (com vs sem stopwords) → falso "duvidoso" em match perfeito.
- Solução: remover `(...)` antes da normalização + recalcular nomeNorm da base em runtime. Score volta a 100 em casos idênticos.

**Audit actions:**
- `CRUZAR_LISTA_EXECUTADO`, `CRUZAR_DESCARTOU_APROVADO`, `CRUZAR_CONFIRMOU_MANUAL`, `CRUZAR_VINCULOU_MANUAL`, `CRUZAR_LISTA_SNAPSHOT_GRAVADO`
- `PROVA_APROVADOS_CRIADA/EDITADA/REMOVIDA`
- `RESULTADO_APROVADOS_CRIADO/EDITADO/REMOVIDO`

### Webhook Hotmart unificado — aposentadoria do MED-Review (2026-05-26)

A Cloud Function `hotmartWebhook` (`cloud-function-hotmart/index.js`) agora processa **ambos** os fluxos no mesmo POST: o legado de `solicitacoesExtra` (xcod, Simulado Extra) E o novo de `alunosAprovados` (base completa pra Cruzar Lista). O projeto MED-Review externo (Python/FastAPI no Render + Postgres no Neon) foi **aposentado** — webhook do Render removido na Hotmart, serviço Render deletado, Neon mantido por ~30 dias como backup.

**Módulo `cloud-function-hotmart/hotmart-alunos.js`:**
- `extractAlunoData(body)` — extrai nome/email/CPF/telefone/produto/transação/data do payload Hotmart (cobre v1.x e v2.0.0, múltiplos fallbacks de path: `data.buyer`, `body.buyer`, `purchase.buyer.*`, etc).
- `deriveVertical(produtoNome)` — keyword match: `medreview` (med-review-r1, `\br1\b`), `anestreview` (anest), `ortopreview` (ortop), `oftreview` (oft).
- `calcChaveAluno({cpf,email,nome})` — precedência `cpf > email > nomeNorm`. Mesma chave usada na migração inicial.
- `upsertAluno(body, eventName)` — `db.runTransaction` pra UPSERT atômico em `alunosAprovados/{chaveAluno}`:
  - Doc inexistente → `tx.set` com produto novo no array
  - Doc existente → identifica produto pelo `transacao` (preferencial) ou `produtoId+dataCompra`. Se já existe, **só atualiza o status do produto** (ex: REFUNDED chegando após APPROVED). Se inédito, **adiciona ao array**.
  - Campos pessoais (nome, cpf, email, telefone) só preenchidos se estavam vazios — preserva o que já tinha.
  - `ultimaCompra`/`primeiraCompra` atualizados por `Math.max`/`min` ISO string.
- Mapa de status: `APPROVED/COMPLETE → 'Completo'`, `REFUNDED → 'reembolsado'`, `CHARGEBACK → 'chargeback'`, `CANCEL → 'cancelado'`.

**Plug no handler `hotmartWebhook` (`index.js`):**
- Bloco try/catch que chama `upsertAluno(body, event)` rodando em **paralelo** ao fluxo de xcod. Falhas no upsert NÃO bloqueiam o 200 OK pro Hotmart (evita perder webhooks).
- Mantém intacta a lógica anterior de `solicitacoesExtra` (mesma function, mesma URL `https://hotmartwebhook-57xrhneaga-uc.a.run.app`).

**Migração delta:** depois da migração inicial (15.540 alunos), rodou-se uma sincronização adicional dos últimos 7 dias do Postgres pra cobrir o gap entre snapshot inicial e configuração do webhook AROS. UPSERT idempotente (helper temporário removido após uso).

**Pra retomar acesso ao Neon** caso precise: `DATABASE_URL` foi `postgresql://neondb_owner:***@ep-plain-king-am0nefe0-pooler.c-5.us-east-1.aws.neon.tech/neondb` — senha deve ser rotacionada se o usuário não tiver feito antes de apagar.

### Catálogo de Produtos — Aprovações (2026-05-26)

Nova seção colapsável **"🎯 Aprovações"** logo abaixo de Datas Importantes na aba Produtos. Read-only — cadastro fica em Administração > Cruzar Lista.

- Listener `onSnapshot` filtra `provasAprovados` + `resultadosAprovados` por `vertical == S.verticalAtual` (em `_proRebindVerticalListeners`)
- Render por prova: nome (modalidade) + lista de resultados ordenados por ano desc no formato `Prova — Ano — N%`
- Último ano destacado igual ao Histórico de aprovações
- Visível pra qualquer auth (coord/marketing/vendas) — não só admin
- State: `S.aprovacoes={provas:[],resultados:[],loaded:false}` + `S._aprovacoesOpen`
- Unsubs: `_proAprovacoesProvasUnsub` e `_proAprovacoesResultadosUnsub` (cancelados em rebind/voltar)

**Cloud Function `perguntarDex` lê aprovações:**
- No `Promise.all` (~linha 200 de `dex.js`): `db.collection('provasAprovados').where('vertical','==',vertical).get()` + loop chunked de 30 `provaId` em `db.collection('resultadosAprovados').where('provaId','in',chunk).get()`
- `formatarAprovacoes(provas, resultados)` (~linha 483) monta markdown agrupado: `### {modalidade}\n- {ano}: {percentual}% ({totalNossos} dos nossos em {totalLista} aprovados)`
- Bloco `=== HISTÓRICO DE APROVAÇÕES (${verticalNome}) ===` injetado no system prompt
- IA pode responder "qual % de aprovação no TSA 2025?" diretamente

### Catálogo de Produtos — Concorrentes (2026-05-26)

Nova seção `concorrentes` no produto (entre Argumentos de venda e Objeções).

**Estrutura:**
```
concorrentes: [
  { id, nome,
    features: [{ id, titulo, nossoDiferencial: '<HTML rich-text>' }]
  }
]
```

**UI editor (accordion no produto):**
- "🥊 Concorrentes — quem são? · N" — accordion colapsável.
- Cada concorrente é um card colapsável (`.pro-conc-edit`, reusa `.pro-qa-edit`) com: handle ⠿, input nome, botões ↑↓🗑, body com features.
- Cada feature do concorrente: input título + rich-text editor pro nosso diferencial + ↑↓🗑.
- Handlers: `_proConcAdd/Set/Rm/Up/Down`, `_proConcFeatAdd/Set/Rm/Up/Down`, `_proConcToggle`, `_proRefreshConcs`.

**UI detalhe (read mode):**
- Section colapsável `_proSecDiscHTML('concorrentes',...)` ícone 🥊.
- Dentro: cada concorrente vira `<details class="pro-conc-detail-card">` (colapsável nativo) com summary "🥊 Nome · N features".
- Cada feature renderizada com título + badge verde "Nosso diferencial" + body HTML do diferencial (justify, sem hifenização).

**Save:** sanitização filtra concorrentes vazios e features vazias; `nossoDiferencial` passa por `_proSanitizeResp`.

**Busca:** haystack inclui nome do concorrente + título + diferencial (HTML strippado) + palavra "concorrente".

**Dex:** `formatarProduto` em `dex.js` adiciona bloco `**Concorrentes diretos:**` com nome + features deles + nosso diferencial (HTML strippado).

### Catálogo de Produtos — Tempo de teste recomendado (2026-05-26)

Novo campo `p.tempoTesteRecomendado` (string).
- Editor: textarea abaixo do Tempo de acesso na seção Básico.
- Detalhe: disclosure 🧪 logo após o ⏱️ Tempo de acesso. Header mostra preview da 1ª linha; body com texto completo.
- Save normaliza com `String(v).trim()`.
- Incluído no `_proBuscaHaystack` e no `formatarProduto` do Dex (`**Tempo de teste recomendado:** ...`).

### Catálogo de Produtos — Detalhes do produto (2026-05-26)

**Mentoria e Bônus como dropdowns colapsáveis (fechados por default):**
- Mentoria usa `_proSecDiscHTML('mentoria', mentTitle, ...)` com `titleIsHtml=true` (pra renderizar a tag inline).
- Tag visual ao lado do nome:
  - `mentStatus='sim'` → badge verde **INCLUÍDA** (`.pro-ment-tag-sim`)
  - `mentStatus='opcional'` → badge laranja **OPCIONAL** (`.pro-ment-tag-opcional`)
- Bônus segue mesmo padrão (`_proSecDiscHTML('bonus','Bônus',...)`).
- Cor temática preservada no header (roxo pra mentoria, amarelo pro bônus) via classes `.pro-sec-mentoria` / `.pro-sec-bonus`.

**Obj/Dúv/Concorrentes — layout flex:**
- Cada par Q/R agora é renderizado como `.pro-obj-row` com `[.pro-obj-prefix Q:/R:/❓] [.pro-obj-text conteúdo]` em flex.
- Texto **sempre cola** no prefixo (não mais "R:" sozinho em uma linha, depois resposta na próxima).
- `.pro-obj-text` com `text-align:justify`, `hyphens:none`, `overflow-wrap:break-word`, `word-break:normal`.
- Substitui o antigo `::before "R: "` que tinha falhas de unwrap intermitentes.

**Alinhamento do ✏️ nos disclosures:**
- Removido `justify-content:space-between` do `.pro-sec-disc-head`.
- Adicionado `margin-left:auto` no `.pro-sec-disc-caret`.
- `.pro-sec-disc-count + .pro-sec-disc-caret{margin-left:0}` pra colar o caret quando há count.
- Fix do bug onde ✏️ ficava no meio do header em seções sem count (caso da Mentoria com 0 features).

### Catálogo de Produtos — Jornada do Cliente: auto-save ao fechar (2026-05-26)

`proToggleJornada()` detecta se a box está sendo FECHADA (de aberta pra fechada) e dispara `_proJornadaSalvar()` em background se `S._jornadaDirty && _proCanEdit()`. Save acontece em paralelo (não bloqueia o toggle). Botão 💾 Salvar continua funcionando manualmente.

### Catálogo de Produtos — Picker de público-alvo (2026-05-26)

Substitui o dropdown nativo `<select>` antigo de público-alvo pelo mesmo picker `_proMultiSelectHTML('publicoAlvo',...)` usado em provas-alvo. Botão "+ Cadastrar novo público-alvo" sempre disponível, mesmo quando todas as opções já foram selecionadas. Remove código morto: `_proPublicoDropdownHTML`, `_proPublicoAdd`, `_proRefreshPublicoDd`, CSS `.pro-pub-*`.

### Catálogo de Produtos — Responsáveis com link Slack (2026-05-26)

Cadastro de **Membros do Time** em Configurações (`config/slackTime` = `{teamId, membros:[{nome,slackId}]}`). Chips de responsável em produtos viram `<a>` clicável (link `slack://user?team=T...&id=U...`) quando nome bate (case+acento insensível) com membro cadastrado. Ícone 💬 substitui 👤. Cor mantida (lilás original, boa em dark+light) — só hover e cursor mudam pra indicar clicabilidade.

Listener `_ensureSlackTimeListener()` carrega sob demanda (chamado por `initProdutos` E `renderSlackTimeForm`) — funciona mesmo abrindo Configurações direto sem passar por Produtos. Form só renderiza após dados carregarem (evita sobrescrever com vazio).

### Catálogo de Produtos — Conversa multi-turn no Dex (2026-05-26)

**Frontend:**
- `S.dexHistorico[]` mantém histórico de até 10 turnos (20 mensagens user+assistant).
- Render como balões empilhados (`.pro-dex-bubble.user/.assistant`) — user à direita gradient azul/roxo, Dex à esquerda border.
- Typing indicator (3 bolinhas animadas) durante loading.
- Box colapsável `.pro-dex-history-wrap` com header "Conversa atual · N turnos" + caret — clica pra ocultar/mostrar quando conversa fica longa.
- Botão "🔄 Resetar conversa" (laranja, com texto visível) aparece quando há histórico.
- Trocar perfil mid-conversa: confirm explicando que IA mantém histórico anterior.
- Fechar painel preserva histórico (intencional). Reset limpa.

**Backend:**
- Aceita `historico:[{role,content}]` no body, validado e limitado a 20 mensagens.
- PDFs do perfil são injetados no PRIMEIRO user message do histórico (preserva cache).
- Logs incluem `historico_msgs`.

### Catálogo de Produtos — Campos enviados pro Dex (atualizado 2026-05-26)

`formatarProduto` em `dex.js` agora envia (resumo):
- nome, id, status, breveDescricao
- publicoAlvo, provasAlvo, responsaveis
- **tempoTesteRecomendado** (2026-05-26)
- **temposAcesso + temposAcessoObs** (2026-05-26)
- **sazonal + sazonalidadeDescricao + janelaVendasInicio/Fim** (2026-05-26)
- **vagasLimitadas + vagasLimitacaoDescricao** (2026-05-26)
- temMentoria, mentoriaDescricao, **mentoriaResponsaveis** (2026-05-26), **mentoriaSazonal + mentoriaSazonalidadeDescricao** (2026-05-26), mentoriaFeatures
- bonusProdutoIds (resolve pra nomes via `todosProdutos`), bonusFeatures
- argumentosVenda, concorrentes (nome + features + diferenciais), objecoes, duvidas, links

`formatarFeature` agora envia (resumo):
- titulo, numeroChave, disponivel, **descricao** (2026-05-26), diferenciais (HTML strippado), linkUrl/Label, pdfUrl/Label

### Busca do Catálogo de Produtos — melhorias (2026-05-25)

- **Debounce 220ms** em `proSearchInput` antes do `_proRender()` — evita perder foco do input a cada tecla.
- Refoca + restaura cursor (`selectionStart/End`) em `#pro-search` após re-render.
- Normalização **case + acento insensível**: `_proNormBusca` usa `.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')`.
- Busca por **múltiplos termos com AND**: query é split em palavras, todas devem aparecer no haystack do produto.
- Haystack ampliado via `_proBuscaHaystack(p)` cobrindo: nome, id, status, breve descrição, pitch curto/longo, público-alvo, provas-alvo, responsáveis, features (título/descrição/numeroChave/labels/diferenciais), mentoria (descrição + features + palavra "mentoria" se ativa), bônus (features + nomes de produtos vinculados + palavra "bônus"), argumentos de venda, objeções (pergunta+resposta), dúvidas (pergunta+resposta), links (label+url).
- `_proBuscaStripHtml` strippa tags pra busca em campos rich-text (diferenciais, mentoriaDescricao, respostas).

**Polimento UX (Apple-like) aplicado em 2026-05-22:**
- Emoji de feature reduzido (32→20px no detalhe, 26→20px na edição) + número-chave (28→22px).
- Popover de ícone fecha com clique fora **e** Esc — handler global único em capture phase (`_proEnsureGlobalDismiss`, flag `window._proGlobalDismissBound`).
- Accordion animado via `max-height` + `opacity` transition (0.2s).
- Toolbar da listagem sem background/border (mais leve).
- Listagem em viewport 900-1200px: `pro-row-tags` max-width 160px + badge `flex-shrink:0`. Mobile <480px: tags somem.
- Mentoria no detalhe: `border-top` + título roxo `#a855f7` pra separar de "O que está incluído".

### Escala (Gerenciamento online) — Controle, dropdowns colapsáveis, filtros, PDF, stats bar (2026-05-26)

Refinamento UX completo da aba Gerenciamento (visão coord do simulado **online**, função `renderCoSched`). Tudo entregue na mesma sessão. Pacote:

- **Coluna CONTROLE nova** entre PRESENÇA e AÇÕES: header "CONTROLE" com 3 sub-labels (Triagem · Áudio · Vídeo) e 3 checkboxes por linha. Persistência em `simulados/{simId}/alunos/{studentId}.controle.{triagem|audio|video}` (boolean). Audit log `CONTROLE_TOGGLE`. Função `window.toggleCtrl(simId, studentId, key, checked)` perto de `togglePresBtn` (linha ~23791). `S.students` carrega via spread, então `a.controle` aparece naturalmente no objeto do aluno.
- **Scroll horizontal com colunas fixas**: grid do `.pos-hdr`/`.pos-row` migrou de `32px 130px 1fr 100px 110px 160px` (4 cols+aluno flex) para `32px 130px 240px 160px 110px 220px 160px` (7 cols com larguras explícitas + CONTROLE). Wrapper novo `.pos-tbl{overflow-x:auto;overflow-y:visible}` envolve `.pos-hdr` e o `<div>` das rows. **#, PROF e ALUNO** são `position:sticky;left:0|32px|162px;z-index:2-3`. Headers ficam acima (`z-index:3`) das body cells fixas.
- **Sobreposição resolvida via `linear-gradient + bg opaco`**: as cores de status `--gl/--yl/--rl` são `rgba(...,.12)` (translúcidas por design). Cells sticky usavam `background:var(--row-bg, var(--bg2))` direto e mostravam conteúdo passando por baixo. Fix: `background-color:var(--bg2); background-image:linear-gradient(var(--row-bg,transparent),var(--row-bg,transparent))` — `bg2` opaco como base + overlay translúcido do status por cima. Mesmo visual, sem vazamento.
- **Status colors via CSS var**: a inline style das `.pos-row` migrou de `style="background:var(--gl)"` para `style="--row-bg:var(--gl)"`. Cells filhos herdam via cascade do custom property. Hover faz `--row-bg:var(--bg3)`. `.pos-row.drag-target` também usa `--row-bg`. CSS base: `.pos-row{background:var(--row-bg,transparent)}`.
- **Overflow:hidden nas células sticky** (`.pos-prof`, `.pos-aluno-sticky`, `.pos-hdr>div`): nome de aluno longo trunca com `text-overflow:ellipsis` em vez de vazar pro lado.

**Rodadas colapsáveis (dropdown):**
- `.rc` ganha classe `collapsed` que esconde `.pos-tbl`/`.cb` via `.rc.collapsed .pos-tbl,.rc.collapsed .cb{display:none}`. Default: **todas colapsadas** ao render.
- Chevron `▾` no header (`.rh-toggle`) gira -90° via `transform` quando collapsed.
- `.rh` ganha `onclick` que chama `toggleRoundCard(this.parentElement)`. Guard `if(event.target.closest('button'))return;` permite que botões dentro do header (presencial: "🎯 Configurar Estações", "+ Aluno") continuem funcionando sem disparar o collapse.
- **Estado persistido em `S.coRoundsExpanded` (Set)** para sobreviver a re-renders do `onSnapshot` (que dispara em qualquer mudança de aluno). Cards têm `id` (`rc-{dia}-{rn}` online, `rc-pres-{dia}` presencial); render checa se o id está no Set pra decidir se aplica `collapsed`.
- Botão **⊞ Expandir todos / ⊟ Recolher todos** na barra de filtros (id `btn-toggle-all-rounds`). Texto muda dinamicamente via `updateAllRoundsBtn()` baseado em quantos cards estão colapsados.
- **Auto-expand quando filtra**: `applyCoFilters` automaticamente desmarca `collapsed` (e adiciona ao Set) em qualquer card que tenha pelo menos uma row visível após o filtro.
- **Header limpo**: removido o display antigo `7/7 ✅5 🔄0` e `2 confirmados · 1 pendente` (online + presencial respectivamente — pedido do user pra ficar mais elegante).

**Filtros redesenhados:**
- Layout vertical: **Linha 1** = campo de busca por nome (full width). **Linha 2** = dois `<select>` lado a lado + botões à direita.
- **Status dropdown** (`#co-status-filter`): Todos / Confirmado / Pendente / Aguardando troca / Ausente. Substituiu os 5 botões pill que tinham `class="status-filter"`. Mudança no comportamento: o filtro antigo apenas **dimming** (classe `dimmed` com opacity:.22+grayscale) as linhas que não batiam — agora **esconde** (`style.display='none'`).
- **Presença dropdown** (`#co-presenca-filter`) **novo**: Todos / Presente / Ausente / Não marcado. Filtra por `aluno.presenca` (valor 'presente'/'ausente'/null). Combina AND com status + busca.
- Helpers novos: `S.coPresencaFilter='all'`, `window.setCoStatusFilterSel(value)`, `window.setCoPresencaFilter(value)`. `setCoStatusFilter(filter,btn)` mantido pra compat mas sincroniza o select.
- **Combinação AND** entre os 3 filtros (busca + status + presença). Linhas vagas (sem aluno) escondem quando qualquer filtro está ativo. Cards sem matches escondem.
- **Botões à direita** na mesma linha dos dropdowns: **📄 Baixar PDF** + **⊞ Expandir todos / ⊟ Recolher todos**. `margin-left:auto` no wrapper joga ambos pra borda direita. PDF saiu do toolbar superior (que tinha `+ Aluno`, `⏰ Configurar Rodadas`, `⬇️ CSV`).

**Bug fix crítico de mapeamento posição→aluno no filtro:**
- `applyCoFilters` antes fazia `S.students.filter(...).sort((x,y)=>x.nome.localeCompare(...))` para encontrar o aluno daquela `.pos-row`. Render usa `sortByStatusThenName` — ordenação diferente. Resultado: filtro mostrava aluno errado quando havia students sem `posicao` setada.
- Fix: usar exatamente `[...S.students.filter(s=>s.dia===dia&&s.rodada===rn&&s.status!=='absent')].sort(sortByStatusThenName)` igual ao render. Aplicado nos 3 lugares: render, filtro, export PDF.

**Export PDF (substitui CSV):**
- Função nova `window.exportEscalaPDF()`. CSV legado (`exportCSV`) removido. Botão `⬇️ CSV` no toolbar removido.
- Abre `window.open('','_blank')` com HTML formatado + `<script>window.onload=()=>setTimeout(()=>window.print(),250)</script>` (literal `</script>` splitado com `</scr`+`ipt>` por causa do parser HTML). User salva como PDF via diálogo do navegador.
- Conteúdo: **apenas Professor, Aluno, Status** agrupados por dia (`📅 Sábado`/`📅 Domingo`) + rodada (`Rodada N · HH:MM`). Estilo limpo black-on-white com border-collapse table, fonte sistema, `page-break-inside:avoid` nas tables.
- **Posições com prof mas sem aluno** mostram nome do prof + célula mesclada `colspan="2"` com texto "Livre — sem aluno" em itálico cinza. Posições sem prof e sem aluno são puladas.
- Suporta **presencial** (sem rodadas — lista corrida por dia, ordenada alfabeticamente, ausentes omitidos).
- Sanitização HTML via helper `esc()` (substitui `&<>"'`).

**Bug fix — ausentes na escala:**
- Alunos com `status:'absent'` mas com `dia`/`rodada`/`posicao` ainda setados (data legacy: registros antigos antes da lógica de limpeza em `subResp`/`subRespCoord`) apareciam **duplicados** no schedule e no painel "Ausentes" abaixo.
- Fix: adicionado `&&s.status!=='absent'` em todos os 3 `S.students.filter(s=>s.dia===dia&&s.rodada===rn)` (linhas ~21525 renderCoSched, ~23554 applyCoFilters, ~24479 exportEscalaPDF). Ausentes agora aparecem só no painel "Ausentes" e a vaga deles na rodada vira "vago".

**Stats bar discreta (topo da Escala):**
- Antes: 4 cards grandes (`.sg`/`.sc`/`.s-icon`/`.s-val`/`.s-lbl`) com emoji 20px + valor Fraunces 30px + label cinza. Ocupava muita altura.
- Agora: **uma única barra horizontal** `.stats-bar` com 4 stats inline + separadores verticais sutis. Cada stat: `.stat-dot` (8×8px, cor por contexto, halo `box-shadow:0 0 0 3px color-mix(...)`) + `.stat-lbl` (11px uppercase letter-spacing) + `.stat-val` (Space Grotesk 20px). Padding `10px 20px`. Em <640px wrap pra coluna.
- IDs preservados (`s-t`, `s-c`, `s-a`, `s-s`) — toda lógica JS de update segue funcionando sem mudança.
- CSS antigo `.sg/.sc/.s-icon/...` mantido (dead code) para evitar alterar outros lugares; só a markup foi trocada.

### Auto-swap engine — auditoria + 12 bugs corrigidos (2026-05-28)

Auditoria sistemática do motor de trocas/auto-match motivada por caso real (João Gabriel Peixoto Lopes apareceu em "aguardando troca" em 2 lugares e sumiu no painel de Solicitações). Investigação revelou que ele tinha `status:'swap'` + `swapResolved:true` simultâneo — estado "zumbi" não previsto.

**Helpers novos (linha ~22760) que centralizam a lógica de robustez:**
- `_isAfterDeadline()` — true se `S.curSim.deadline` venceu. Usado pra travar operações automáticas.
- `_hasVacancyFresh(simId,dia,rodada,ignoreId)` — re-conta ocupantes via `getDocs(query(where('dia','==',dia),where('rodada','==',rodada)))`. Substitui `hasVacancy` (que lê state local stale) nos writes críticos. Fallback pra `hasVacancy` em caso de erro.
- `_olderInQueueWants(dia,rodada,student)` — checa se há aluno em `status='swap'&&!swapResolved` com `respondedAt` mais antigo que `student` apontando pra esse slot. Implementa FIFO global.
- `_preserveOrig(s,fallbackDia,fallbackRodada)` — retorna `{originalDia, originalRodada}` preservando valores existentes ou gravando fallback. Substitui escrita direta de `originalDia:oldDia||null` que sobrescrevia histórico.
- `_sendEmailLogged(args, contexto)` — wrapper `emailjs.send` que loga falha em `auditLog` action `EMAIL_FALHOU` com `{contexto, to, assunto, erro}`. Retorna `boolean`.

**Bugs corrigidos (numeração na auditoria original):**

| # | Bug | Fix | Onde |
|---|---|---|---|
| 1 | Race condition em capacidade (snapshot local stale → estoura `getLim()`) | `_hasVacancyFresh` antes do write | `tryAutoSwap`, `tryAutoMatchedSwap`, `processWaitingQueue`, `doMatchedSwap` |
| 2 | `tryAutoSwap` fura fila (solicitante novo pula B esperando há dias) | `_olderInQueueWants` skip do slot | `tryAutoSwap` |
| 3 | `processWaitingQueue` não rodava quando coord movia ou marcava ausente | Chamada explícita após updateDoc | `dDrop`, `dDropPos`, `doMover`, `coChangeStatus(absent)` |
| 4 | Cascata infinita de realocação → inundação de email | Parâmetro `depth=0`, abort se `>=3` | `processWaitingQueue` |
| 5 | `tryAutoMatchedSwap` ignora preferência do solicitante | Sort por `mySlots.findIndex` ASC, tiebreak por `respondedAt` | `tryAutoMatchedSwap` |
| 6 | `trocasDiretas` aceita após auto-match já ter movido | `aceitarTrocaDireta` faz `getDoc` dos 2 alunos, valida `dia/rodada` originais, marca `propostaRef.status='invalidada'` se mudou | `aceitarTrocaDireta` |
| 7 | `originalDia/Rodada` sobrescritos a cada troca | Helper `_preserveOrig` em todas funções | `tryAutoSwap`, `tryAutoMatchedSwap`, `processWaitingQueue`, `doMatchedSwap`, `aceitarTrocaDireta` |
| 8 | Auto-swap roda depois do prazo (link velho, dropdown) | `_isAfterDeadline()` early return | `tryAutoSwap`, `tryAutoMatchedSwap`, `processWaitingQueue` |
| 9 | `autoEffective:true` stale após movimento manual | `_moverUpdData` seta `autoEffective:false` | `_moverUpdData` |
| 11 | `recusarTrocaDireta` deixa `swapResolved:true` zumbi no solicitante | `updateDoc({swapResolved:false})` no solicitante | `recusarTrocaDireta` |
| 12 | `emailjs.send` falha silenciosa em `.catch(()=>{})` | Wrapper `_sendEmailLogged` registra `EMAIL_FALHOU` | `sendSwapDoneEmail`, `doMatchedSwap`, `aceitarTrocaDireta`, `recusarTrocaDireta` |
| 13 | `swapTargetDia` só preenchido em presencial — perde intenção em online | `subResp` infere se todos `swapSlots` são do dia oposto | `subResp` |

**Bug 10 (auto-match em presencial) era falso positivo** — `subRespPres` linha 21385-21404 já tem auto-match inline (casa por `dia===targetDia && swapTargetDia===s.dia`, FIFO por `respondedAt`).

**Mudança semântica de produção:**
- **Bug 2** muda comportamento visível: solicitação nova que entrava direto num slot vago agora **espera** se há fila mais antiga. Coord pode notar "antes era instantâneo". Comportamento desejado mas vale comunicar.
- **Bug 8**: link velho de email após o prazo não dispara mais auto-match — fica como `status:'swap'` esperando ação da coord. Sem regressão silenciosa de escala fechada.
- **Bug 4**: cap em 3 saltos. Em fila muito longa, alguns alunos esperam o próximo gatilho. Trade-off: evita 8-10 emails seguidos em cascata. Ajustável (constante hardcoded no `if(depth>=3)return`).

**Caso piloto (João Gabriel Peixoto Lopes):** dados zumbi corrigidos manualmente pelo usuário antes do deploy. Causa: troca auto-efetivada em 2026-05-25 17:17 setou `swapResolved:true` + `status:'confirmed'`; depois o aluno respondeu nova solicitação via `subResp`, que **não** resetava `swapResolved` (bug corrigido em commit `ff0282a` antes desta auditoria mais ampla).

**Commits:** `cde4399` (auditoria principal, 12 bugs).

### Escala — status editável pela coord + auto-ausentes pós-prazo + PDF "Versão alunos" (2026-05-28)

Três features pequenas e independentes na aba Escala (visão coord do simulado), entregues juntas.

**1. Coluna STATUS virou dropdown editável (substitui badge readonly):**
- Antes: `sbadge(a.status)` mostrava badge só-leitura. Pra mudar o status do aluno, coord precisava abrir o modal de resposta como se fosse o aluno (com email validation).
- Agora: `<select>` inline na coluna STATUS com 4 opções — ✔ Confirmado, ⏳ Pendente, 🔄 Aguardando troca, ✗ Ausente — colorido por status (vide `_coStatusSel(a)` helper, perto da declaração de `renderCoSched`). Mesmas cores das pills (`--gl/--bg3/--yl/--rl`).
- Aplicado em **rodadas** (`renderCoSched`, linha ~21772) e **presencial** (`renderCoSchedPres`, linha ~21843).
- Handler: `window.coChangeStatus(alunoId, newStatus)` perto de `resetSt` (linha ~22225). Lógica por destino:
  - `absent`: confirm() → salva `originalDia/originalRodada` + limpa `dia/rodada/posicao` (libera vaga; aluno vai pro painel "Ausentes").
  - `pending`: reset completo (`email:null, respondedAt:null, swapSlots:[], obs:''`). Se vinha de `absent`, repõe na rodada original.
  - `confirmed`: salva status + respondedAt + limpa swapSlots/obs. Se vinha de `absent`, repõe na rodada original.
  - `swap`: mantém swapSlots/obs se já existiam (admin pode definir slots depois via outro fluxo).
- Audit log `STATUS_ALTERADO` em `auditLog` com before/after status + meta `{nome, via:'coord-escala'}`.
- Em caso de cancelamento do confirm (absent) ou erro de write → `renderCoSched()` re-renderiza pra resetar o select pro valor anterior (não fica em estado fantasma).

**2. Auto-marcação de pendentes como ausentes ao abrir escala com prazo vencido:**
- Função `_autoAbsentPostDeadline()` (linha ~22260) chamada no início de `renderCoSched` e `renderCoSchedPres` via `try{_autoAbsentPostDeadline()}catch(_){}`.
- Trigger: `S.curSim.deadline && new Date() > new Date(deadline)` + há pelo menos 1 student com `status:'pending'`.
- Bulk update via `Promise.all` em todos os pendentes: `{status:'absent', respondedAt:now, autoAbsent:true, autoAbsentAt:now, originalDia, originalRodada, dia:null, rodada:null, posicao:null}`.
- Flag por sessão: `window._autoAbsentDoneSimIds` (Set) garante que roda uma vez por simulado por carregamento de página — protege contra loop (cada `updateDoc` dispara `onSnapshot` → `renderCoSched` → poderia re-triggerar).
- Em caso de erro, libera o flag (`Set.delete(simId)`) pra retentar no próximo render.
- Audit log `AUTO_AUSENTES_POS_PRAZO` com `meta:{qtd, alunos:[nomes], deadline}`.
- **Banner verde** notifica: `_showCoBanner(msg)` cria/atualiza `#co-auto-banner` acima de `#co-sched` (insertBefore). Texto: "✓ N alunos pendentes foram marcados como ausente — prazo de confirmação encerrado." Botão ✕ pra fechar.
- **Decisão UX**: ação é silenciosa (sem alert/confirm) — o user disse "automaticamente" e o banner persistente é avisação suficiente. Flag `autoAbsent:true` no doc fica como trilha de auditoria caso precise reverter.
- **NÃO toca** em `status:'swap'` — alunos aguardando troca permanecem pendentes da troca, não viram ausentes automaticamente.
- Limitação: só roda quando coord abre o simulado. Não há cron — se ninguém abrir o sim depois do deadline, ninguém vira ausente automaticamente. Aceitável (coord sempre revisa antes do simulado).

**3. PDF da escala — dropdown com 2 modos (Versão completa + Versão alunos):**
- Botão "📄 Baixar PDF" virou dropdown `📄 Baixar PDF ▾` (linha 3646, dentro do toolbar da Escala). Estrutura: `#pdf-dd-wrap` (relative) com `<button>` + `#pdf-dd-menu` (absolute, right-aligned, hidden por default).
- 2 opções no menu: **Versão completa** (com professores e status — para a coordenação) e **Versão alunos** (só nomes, por rodada — para divulgação).
- Handler de abrir/fechar: `window.togglePdfDD(ev)` (linha ~24773). `stopPropagation` no botão + listener global de click pra fechar quando clica fora (auto-removido após uso).
- Função `window.exportEscalaPDF(modo)` refatorada (linha ~24793). Aceita `'completo'` (default) ou `'alunos'`. Estrutura única, branching interno por `isAlunos`.
- **Versão alunos** — diferenças:
  - Filtra `s.status==='confirmed' || s.status==='swap'` (omite pendentes e ausentes).
  - Ordenação `ordAlunos`: confirmados primeiro (alfabético), depois aguardando troca (alfabético).
  - Tabela `class="t-alunos"` com colunas `#` (numeração, 36px centralizada cinza) e `Aluno` (sem Professor, sem Status).
  - Alunos em troca ganham chip `<span class="tag-swap">🔄 troca</span>` discreto à direita do nome.
  - Header de cada rodada: `Rodada N · HH:MM` (mesmo padrão da versão completa).
  - Presencial: agrupa por dia, sem rodadas.
  - Título do `<h1>` ganha sufixo `· Escala dos Alunos`.
  - `<div class="sub">` complementa: "... · Apenas confirmados e aguardando troca".
  - Mensagem de erro específica se vazio: "Nenhum aluno confirmado ou aguardando troca para exportar."
- CSS novo no template: `.t-alunos td.n` (numeração), `.t-alunos td` (fonte 13px), `.tag-swap` (chip amarelo bg `#fff3cd` + border `#ffd96b` + color `#9a6b00`).
- Versão completa permanece **idêntica** (mesmo HTML/CSS/estrutura) — refator preserva comportamento original.

### Checklist de Aplicação — refinos UX + cronômetro embutido + projeção em tempo real (2026-05-26)

Sessão completa de refinos no Checklist de Aplicação (`tab-checklist`, função `renderCkCasos` e adjacências). Tudo entregue no mesmo dia, deploy completo (commits `c638edb` + rules deployadas).

**Layout home da aba:**
- Seletor de simulado + botão "💬 Contribuir com Feedback Geral" movidos pra dentro da coluna esquerda do cabeçalho (estavam separados, criando vácuo vertical porque a coluna direita tinha 2 botões empilhados). Agora sobem pra encostar no título.
- Botão `btn-fg-admin` renomeado de "💬 Feedback Geral dos Professores" pra "⚙️ Configurar Feedback Geral" (mantém id, lógica show/hide igual).

**Cabeçalho do card do caso refeito:**
- Antes: ícone (`⬜`/`🟡`/`✅` em 18px) `align-items:center` no flex parent — ficava no meio do bloco de 3 linhas, parecia "quebrado".
- Agora: ícone (`📋`/`🟡`/`✅` em 20px) `align-items:flex-start` — fica topo-alinhado com o título.
- Status virou **badge pill** (chip arredondado com bg tintado + border + uppercase) inline com o título à direita, em vez de texto solto na 3ª linha.
- "26 itens" e "Prof. Examinador" fundidos numa única linha auxiliar.
- Chevron `▼` topo-alinhado, sem margin awkward.

**Sticky no topo (cabeçalho + controle de projeção):**
- O `.rc` do caso ganha um wrapper sticky envolvendo `hdrInner` + (antes) o `ck-proj-wrap`. **Mudou pra cabeçalho contendo o controle de projeção direto** (próximo item).
- Posição: `position:sticky;top:78px` (mesma altura do header global `<header>` da página, que é `position:sticky;top:0;z-index:100`). Sem o offset, o cabeçalho do caso ficava escondido atrás do nav.
- **Gotcha CRÍTICO**: `overflow:hidden` no `.card` (que tem o border-radius) quebra `position:sticky` dos descendentes — torna o card o "scroll container" do sticky. Solução: mudar pra `overflow:clip` (clipa igual, mas não cria scroll context). Suportado em Chrome 90+, Safari 16+, Firefox 81+.
- **Gotcha #2**: `statusBg` (`--gl/--yl/--rl`) são `rgba(...,.12)` translúcidos por design pro hover de tabela. No sticky o conteúdo rolava por baixo aparecendo. Fix: `background:var(--bg2)` opaco no wrapper sticky — overlay translúcido fica em cima.

**Controle de projeção embutido no cabeçalho:**
- Antes: painel grande de projeção (`renderProjPanel`) ocupava `width:100%` num wrapper separado abaixo do cabeçalho.
- Agora: botão compacto "▶ Projetar caso · 4 slides" inline no header (entre info do caso e chevron), em estilo Apple (gradiente 3 paradas, ícone em círculo glass, chip do contador em JetBrains Mono, hover eleva translateY -1px + brightness 1.1).
- Quando projeção está ativa, vira **cronômetro condensado**: pill horizontal escura com `CRON 03:24 | ⟲ Zerar | ⏸ | ◀ Anterior | 2/4 | Próximo ▶ | 🔄 Reabrir | ⛔ Encerrar`. Todos os botões 28px de altura. Buttons com labels (zerar/reabrir/encerrar) usam `btnLbl` style, ícones puros (play/pause/prev/next) usam `btnIcon`.
- `event.stopPropagation()` em todos os controles pra clique não togglar o caso (header inteiro é clicável via `toggleCkCaso`).
- A ordem dos botões (zerar antes do play, anterior/próximo com labels) foi definida iterativamente com o user.

**Bug fix no cronômetro:**
- `pause` lia `st.timerMs` que só era atualizado quando o snapshot do Firestore chegava. Resultado: pausar sempre escrevia `timerPausedMs=0` (zerava o cronômetro).
- Fix: calcular ms decorrido com a mesma fórmula do render: `acumulado = st.timerStartLocal ? (Date.now() - st.timerStartLocal + (st.timerMsBase||0)) : (st.timerMs||0)`.
- Adicionado **update otimista do state local** em todas as 3 ações (play/pause/reset) + `_atualizaPainelProj(ci)` síncrono — UI responde no clique sem esperar round-trip do Firestore.

**Filtros e justificação de texto:**
- Caso clínico (caso.enunciado) e títulos das perguntas ganharam `text-align:justify; hyphens:none; -webkit-hyphens:none`. Sem hifenização automática — só justifica espaços entre palavras.
- Pergunta title precisou também de `display:block` pro `text-align` valer dentro do flex parent.

**Dropdowns que sobreviem re-render:**
- `_openCkPerguntas` (Set) novo, espelhando `_openCkCasos`. Acompanha quais perguntas/habilidades/feedbacks estão expandidos.
- `toggleCkPerg` adiciona/remove o id do Set.
- Render das 3 dropdowns (pergunta `ck-perg-${ci}-${pi}`, habilidade `ck-hab-${ci}`, feedback `ck-fb-wrap-${ci}`) consulta o Set pra definir `display` + rotação do chevron iniciais.
- **Por que era necessário**: `setCkItem` → `requireProfForCaso` → `confirmarProfCaso` (auto-confirma se prof logado) → `renderCkCasos` full re-render → fechava a dropdown que o user estava preenchendo. Só `_openCkCasos` era restaurado.

**Bug fix no status da pergunta:**
- `updatePergStatus` lia `resp.casos?.[ci]` direto (sem passar pelo bloco), mas o shape real é `_ckRespostas[student][bloco].casos[ci]`. Resultado: `marcados=0` sempre, status ficava em "Pendente" mesmo com item marcado.
- Fix: `const blocoResp=resp[blocoKey]; const cr=blocoResp.casos?.[ci]||{};`.
- Adicionado também `id="perg-st-${ci}-${pi}"` no span renderizado (a função procurava esse id, mas o span renderizado só tinha class `perg-status-lbl` — variável `pergStatusLabel` com id existia mas nunca era usada, vestígio de refactor).

**Confirmações simplificadas:**
- `resetCkPergunta`, `resetCkCaso`, `resetarSimuladoAluno`: trocados os `prompt('Digite RESETAR para confirmar')` por `confirm('Tem certeza...')` simples (OK/Cancelar nativos).
- Botão "🗑️ Resetar Pergunta N" alinhado à esquerda (`justify-content:flex-start`) em vez da direita.

**Barra de desenho na projeção:**
- Removida `<button id="btn-eraser">` duplicada (linhas 7013-7014 tinham markup idêntico copiado e colado).
- Cursor da caneta (`#proj-canvas.pen-ativa`) trocado de `crosshair` (X) por SVG inline de caneta, corpo branco com contorno preto, hotspot em `(3, 21)` na ponta.
- Cursor da borracha (`#proj-canvas.eraser-ativa`) trocado de `cell` por SVG inline de borracha (corpo rosa + ponta branca), hotspot em `(12, 13)` no centro.
- Ícone do botão Borracha trocado de `🧽` (esponja) por SVG inline 16×16 com `currentColor` no contorno (acompanha tema).

**Projeção em tempo real (feature nova — antes só aparecia no `pointerup`):**
- **Subcoleção nova**: `projecaoLive/{simId}__{alunoId}/currentStrokes/{strokeId}` pra traços em andamento.
- **Pointerdown** gera `strokeId` no início (era criado no flush): `stk_${Date.now().toString(36)}_${rand}`. Reuso pro stream + flush final.
- **Pointermove**: cada ~80ms (throttle via `_lastLiveStrokeWrite`), faz `setDoc` em `currentStrokes/{id}` com os pontos acumulados. Fire-and-forget — não bloqueia o desenho local. Constante `LIVE_STROKE_THROTTLE_MS=80`.
- **PointerUp / flushStroke**: 1º grava em `strokes/{id}` (aguarda), 2º deleta `currentStrokes/{id}` (fire-and-forget). Ordem garante que o aluno nunca vê o traço sumir.
- **Subscribe novo** `liveStrokesUnsub` em `currentStrokes/` → state `liveStrokes[]`. `renderCanvas` renderiza em **3 camadas**: (1) finais via `strokes`, (2) em andamento de outros usuários via `liveStrokes` com dedup contra `strokes` + dedup contra `strokeAtual.id` local + filtro stale (`LIVE_STROKE_STALE_MS=10000` — ignora docs >10s sem update pra cobrir crash do browser), (3) `strokeAtual` local (igual antes).
- **Botão Limpar** agora apaga `strokes/` + `currentStrokes/` do slide atual. `_limparStrokesProjLive` (chamado ao encerrar projeção) limpa ambas as subcoleções em batches paralelos.
- **firestore.rules**: nova regra `match /currentStrokes/{strokeId}` espelhando `strokes/` (read/write/delete `if true` — mesma lógica permissiva da subcoleção pai). Rules deployadas em `simulados-confirmacao`.
- **Custo estimado**: ~30 writes por traço (média 1-2s de desenho). 5 profs aplicando 1h simultâneo = ~12.500 writes + 12.500 reads — folgadíssimo no free tier (20k writes/dia, 50k reads/dia).

**Custos Firebase observados (2026-05-26):**
- Plano Blaze (obrigatório pelas Cloud Functions). Mês corrente: R$ 5,29 (R$ 5,25 Firestore + R$ 0,04 Functions).
- Maior consumo: **leituras Firestore** (pico de 273k/dia, free é 50k). Provavelmente snapshot listeners em coleções de alunos abrindo várias páginas.
- Crédito promocional Google Cloud: R$ 1.697,25 válido até 3/ago/2026. Não sai do cartão até lá.
- Alerta de orçamento configurado em R$ 100/mês.
- Pós-crédito, estimativa: R$ 5-15/mês no ritmo atual.

### Catálogo de Produtos — redesign de features + pack + concorrentes + breve descrição (2026-05-27)

Refatoração grande de UX e modelo de dados do catálogo. Tudo entregue e deployado no mesmo dia. Mudanças cobrem 4 áreas:

**1. Features (índice único por produto):**

Os 3 arrays separados antigos (`features`, `bonusFeatures`, `mentoriaFeatures`) viraram **um único `features[]`** com flags booleanas `isBonus` e `isMentoria` em cada item. Migração lazy ao abrir produto (`proAbrir`): bonusFeatures/mentoriaFeatures são mesclados em `features[]` com flag correspondente. Primeira gravação consolida e remove campos legados via `deleteField()`.

Mesmo padrão pros produtos vinculados:
- `featuresProdutoIds: string[]` + `bonusProdutoIds: string[]` (legado) → `featuresProdutoIds: [{id, isBonus}]` (novo).

Shape atual de feature em `_proNormFeature`:
```
{ id, icone, titulo, disponivel, isBonus, isMentoria,
  numeroChave, diferenciais (HTML), linkUrl, linkLabel,
  pdfUrl, pdfLabel, pdfPath, pdfSize, pdfName, updatedAt }
```

**Disponibilidade — 4 estados** (era 3): `'sim' | 'nao' | 'construcao' | 'depende' | ''`.
- `'depende'` = "Depende da oferta" (cor cyan `#06b6d4`, ícone ◐). Útil pra features que variam entre pacotes.
- `''` (vazia) é **bloqueante** no save: validação em `_proSalvar` impede save e lista os títulos pendentes em alerta. `proVoltarLista` (save silencioso ao voltar) também respeita. Pílula `⚠ falta marcar` no head do card pendente com animação pulsante.

**Editor reagrupado** (1 accordion "Features" com 3 sub-blocos visuais):
- `Features` (neutro, sem fundo)
- `🎁 Bônus` (fundo amarelado `#fbbf24` mix)
- `🎓 Mentoria` (fundo accent mix + header com toggle Tem?, descrição, responsáveis, sazonal, vagas)

Cada card de feature tem 2 toggles **mutex** (Bônus ⇄ Mentoria — marcar um desmarca o outro). Função `_proFeatsUnifiedEditHTML(p)` agrupa visualmente; `_proFeatArr(source)` sempre retorna o master `features` (source vira filtro). `_proFeatAdd(source)` cria feature já com a flag certa e `disponivel:''`.

**Detalhe (read-only)** — 1 seção "O que está incluído" com 3 sub-blocos visuais (mesma estilização do editor). Features marcadas como `'nao'` **somem do detalhe público**, mas continuam no editor pra alimentar contexto da IA. Bônus e Mentoria sub-blocks só aparecem se houver conteúdo. Header da Mentoria (descrição/responsáveis/sazonal/vagas) entra na sub-seção.

CSS novo: `.pro-subblock`, `.pro-sub-features/.pro-sub-bonus/.pro-sub-mentoria`, `.pro-detail-subblock.pro-sub-plain`, `.pro-feat-flag-toggles`, `.pro-toggle.pending` (animação `proFeatPendPulse`), `.pro-feat-edit-head-pill.pending/.bonus/.ment/.dep`, `.pro-toggle-4` (4 botões).

**2. Pack de features (preset por vertical):**

Cada vertical (`anestreview/oftreview/ortopreview/medreview`) tem doc próprio `config/featurePack_{vertical}`. Quando vazio, cai no fallback hardcoded `PRO_FEAT_PACK_DEFAULT` (atualmente `[]`).

**Shape persistido (super enxuto):** `{features: [{id, icone, titulo}], updatedAt, updatedBy}`. Disponibilidade, diferenciais, link, PDF, classificação — tudo preenchido por produto.

**Botão "📦 Gerenciar pack"** na toolbar do catálogo (só `_proCanEdit`). Modal Apple-like com lista de cards de uma linha (ícone via `prompt()` picker + input título + reorder ↑↓ + 🗑). Setter `_proFeatPackSetField` aceita só `'icone'|'titulo'`. Save com `setDoc(merge:false)`. Audit: `FEATURE_PACK_EDITADO` (adicionado em `AUDIT_ACTIONS`).

**Aplicação automática em produto novo:** `proNovo()` clona o pack em `S.produtoAtual.features`, regenera ids, força `disponivel:''`, `isBonus/isMentoria:false`. Forçar marcação preserva o conceito de "responsta obrigatória".

**Botão "📦 Aplicar pack"** dentro do sub-bloco Features do editor (próximo ao "+ Adicionar feature"). Pra produtos existentes: compara títulos do pack vs features atuais (case-insensitive, trim), injeta as que faltam. Não duplica. Sem efeito se pack vazio ou já aplicado.

**Listener `_proFeatPackUnsub`** re-sintonizado em `_proRebindVerticalListeners`. `proSelectVertical` e `proVoltarVerticais` zeram estado do modal (`_featPackModalOpen/_featPackDraft/_featPackDirty`).

**3. Concorrentes (modelo simplificado + texto introdutório):**

Cada concorrente passou de `{nome, features:[{titulo, nossoDiferencial}]}` pra **`{nome, comentario: HTML rich-text}`**. Editor mostra só o box de comentário (rich text com toolbar completa, justificado por default, expandable fullscreen). Detalhe abre o dropdown e mostra o comentário com fundo destacado.

Migração lazy em `proAbrir` (e defensiva em `_proRenderDetail`): se `c.comentario` vazio mas `c.features[]` populado, gera comentário concatenando `<p><strong>titulo</strong></p>{nossoDiferencial}` por feature. Primeira gravação consolida — `c.features` é descartado silenciosamente.

**Novo campo `p.concorrentesIntro` (HTML rich-text)** — texto introdutório no nível do produto. Editor: box rich-text no topo da accordion Concorrentes (`_proSetConcIntro`). Detalhe: renderizado num bloco com borda accent à esquerda (`.pro-conc-intro`), **acima** da lista. **Sessão Concorrentes aparece no detalhe mesmo sem concorrentes cadastrados**, se houver intro.

**4. Breve descrição (rich-text + clamp):**

Campo `p.breveDescricao` virou **rich text** (era textarea simples). Editor: `_proRtHTML('breve-desc',..., {colors:true,justify:true,expandable:true})`. Setter `_proSetBreve` recebe HTML. Save passa por `_proSanitizeResp`.

**Detalhe:** se o texto puro for ≤180 chars, mostra inteiro. Senão, **clampa em 3 linhas** com `-webkit-line-clamp:3` + máscara de fade + botão **"saiba mais ↓"** (cor accent). `proTogglePitch(pitchId, btn)` alterna classe `.expanded` e troca label pra "recolher ↑".

Card de bônus que renderiza pitch usa `_proBuscaStripHtml(_proGetBreveDescricao(bp))` pra mostrar plain text (sem tags soltas).

**5. Multi-select chips (responsáveis/mentoria/tempo de acesso):**

Input agora é **inline dentro da caixa dos chips** (classe `.pro-ms-input`, sem border/bg). Antes: 2 linhas (chips em cima, input dedicado embaixo). Agora: tudo na mesma "caixa", chips fluindo com input no fim. Refresh preserva foco e valor digitado. Placeholder muda conforme tem ou não chips ("Adicionar..." vs "Digite e tecle Enter ou vírgula"). Aplicado em: `_proRespInputHTML`, `_proMentRespInputHTML`, `_proTempoAcessoInputHTML` e respectivos `_proRefresh*`.

**6. Rich-text fullscreen — fix de escopo:**

`.pro-rt` quando entra em fullscreen (botão ⛶) é portado pra `document.body` via `_proRtExpandOpen`, saindo do escopo CSS `#tab-produtos`. Toda a estilização da toolbar (`.pro-rt-tb`, `.pro-rt-tb button`, `.pro-rt-tb-sep`, `.pro-rt-tb-colors`, etc) ficava órfã → toolbar desconfigurava. Solução: bloco de fallback CSS **sem o prefixo `#tab-produtos`**, escopado em `.pro-rt.fullscreen`, replicando os estilos essenciais (toolbar layout, botões, separadores, ícones de cor, editor).

**7. Cloud Function `dex.js` — adaptação ao schema novo:**

`formatarProduto` em `cloud-function-hotmart/dex.js`:
- Features principais filtradas excluindo `isBonus`/`isMentoria` (evita duplicação no prompt).
- Mentoria: concatena `p.mentoriaFeatures` legado + `_flagged(p.features,'isMentoria')` novo.
- Bônus: helpers `_flagged()` e `_normLinkedProds(p)` separam `isBonus:true` do `featuresProdutoIds` novo + concatena `bonusProdutoIds` legado. `bonusFeats` mescla `p.bonusFeatures` legado + `_flagged(p.features,'isBonus')`.
- Concorrentes: nova seção `**Concorrentes diretos:**` com `concorrentesIntro` no topo + cada concorrente com `c.comentario` (stripHtml). Fallback pro legado `c.features[]` quando comentario vazio.
- Breve descrição: `stripHtml(p.breveDescricao)` antes de mandar pro prompt.

**8. Outros ajustes:**
- `_proBuscaHaystack` lê ambos os formatos durante a transição (compat com produtos não-migrados).
- `proVoltarVerticais` reseta `_featPack*` (evita modal-fantasma ao trocar de vertical).
- Removidas funções órfãs do bloco bônus separado: `_proBonusProdutosEditHTML`, `_proBonusProdAdd`, `_proBonusProdRm`, `_proRefreshBonusProds`, `_proRefreshBonusAccTitle`, `_proRefreshFeatuProds`.

**Migrações pendentes/observações:**
- Produtos com `c.features` (concorrentes legados) e `disponivel` undefined em features ainda passam na validação por `_proFeatDisp` retornar `'sim'` por compat — só features adicionadas via UI nova nascem com `''`.
- Pack default está vazio (`PRO_FEAT_PACK_DEFAULT=[]`); admin precisa popular cada vertical via modal.

### Firebase Console / Project Settings (configurado 2026-05-21)

- **Idioma do template**: Português (Brasil).
- **Nome público do projeto**: "AROS · Anest-Review" (Configurações do projeto → Geral → Configurações públicas).
- **E-mail de suporte**: Workspace email (`contato@anestreview.com.br` ou similar) — adicionado como Owner do projeto antes.
- **Authorized domains**: `aros.anestreview.com.br` adicionado.
- **Auth providers habilitados**: Email/Password + Google.
- **Template editing locked**: Firebase bloqueia edição manual do template (medida anti-phishing); usuário aceita o template default em PT-BR.

## Firestore Rules (resumo — APERTADAS em 2026-05-21)

**Mudança crítica**: writes em coleções coord/prof agora exigem `request.auth.uid != null` (Firebase Auth). Login custom (sem Firebase Auth) virou **read-only** — toda escrita dá `permission-denied`. Comportamento desejado pra forçar migração.

- Helper `isAuth()` em rules: `return request.auth != null && request.auth.uid != null`.
- Default deny pra coleções desconhecidas.
- Validação de **shape** em creates (tipos, tamanho de strings, enums).
- **Block delete** em `simulados/{simId}`, `config/{cfgId}`, `usuarios/{u}`, `solicitacoesExtra/{r}`, `notas/...`, `checklists/...meta`, `feedbackGeral/{simId}`, `revisaoCasos/.../historico/...`.
- **Read aberto** em quase tudo (incl. `auditLog`).

**Coleções que exigem auth pra escrever** (`isAuth()`):
simulados, simulados/alunos (create), usuarios, listas, config (com 1 exceção), notas, checklists/meta, disponibilidade, feedbackGeral, tarefas, mentorias, blocosClinica, clinicas (parent), revisaoCasos, provas, fontesRecurso, recursosConfig, comunicacao, comunicacao/posts.

**Exceções de aluno anônimo preservadas** (sem auth):
- `solicitacoesExtra` create
- `trocasDiretas` (todas)
- `checklists/{sim}/respostas/{studentId}` (aluno salva próprio)
- `clinicas/{c}/alunos/{a}` (aluno responde swap)
- `provas/{p}/questoes/{q}/contestacoes` (aluno contesta)
- `projecaoLive` + `strokes` (aluno desenha em modo remoto)
- `simulados/{sim}/alunos/{a}` **update** anônimo preservando `nome+matricula` (aluno responde presença/troca via link)
- `config/simExtra` **update** anônimo só pra alterar `alunosGratuitos` (incremento de quota)
- `auditLog` create (custom login ainda precisa auditar)
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
- `produtos/{produtoId}/{allPaths=**}`: read+write+delete auth; up to 20MB; imagens ou PDF.
- `dex/pdfs/{perfil}/{allPaths=**}` (2026-05-25): PDFs de referência do Dex por perfil. Read+delete auth; write auth + `application/pdf` + 32MB max. Claude API lê via URL assinada (bypassa rules).
- Default deny.

Deploy: `npx -y firebase-tools deploy --only storage` (precisa autorização do usuário).

## Cloud Functions

Pasta: `cloud-function-hotmart/` (Gen 2, Node 20, region `us-central1`, invoker `public`).

Env vars em `.env` (gitignored):
- `HOTMART_TOKEN` — token de validação do webhook Hotmart.
- `SLACK_WEBHOOK` — webhook do Slack pra notificações.
- `ANTHROPIC_API_KEY` — key da Anthropic Console (org MedReview) pro Dex.

**`hotmartWebhook`** (`index.js`):
- Valida HOTTOK no header `X-HOTMART-HOTTOK` ou body.
- Extrai `xcod` de `purchase.origin.xcod` (formato Hotmart 2.0.0).
- Atualiza `solicitacoesExtra/{xcod}` → status `pago` + `paidVia: 'hotmart'`.
- Notifica Slack se `SLACK_WEBHOOK` configurado.

**`perguntarDex`** (`dex.js`, re-exportado de `index.js`):
- POST `{pergunta, perfil}` + header `Authorization: Bearer <Firebase ID token>`.
- Valida Firebase Auth via `admin.auth().verifyIdToken` — **login custom legado NÃO funciona**.
- Lê em paralelo: `produtos` collection, `config/jornadaCliente`, `config/dexPrompt`.
- Resolve template baseado em `perfil` (geral/suporte/vendas/marketing). Fallback: template legado → `DEFAULT_INSTRUCTIONS[perfil]`.
- Resolve modelo via `MODEL_MAP` (haiku/sonnet/opus → IDs completos).
- Monta system prompt: instructions + jornada (HTML strippado) + catálogo formatado.
- Monta user message: array com PDFs do perfil (cada um `type:'document', source:{type:'url', url}`) + `{type:'text', text:pergunta}`. **Cache_control no último PDF** cacheia todo o prefixo por 5min.
- Chama Anthropic SDK com `cache_control` no system + último PDF.
- CORS restrito (origens listadas em `ALLOWED_ORIGINS`).

**Pré-requisitos do deploy:**
1. `cd cloud-function-hotmart && npm install` (instala `@anthropic-ai/sdk`, `firebase-admin`, `firebase-functions`).
2. `.env` deve existir com as 3 keys (HOTMART_TOKEN, SLACK_WEBHOOK, ANTHROPIC_API_KEY).
3. Firebase analisa o source localmente — se `require()` falha, a function é silenciosamente removida do deploy. SEMPRE checar `firebase functions:list` após deploy.

Deploy: `npx -y firebase-tools deploy --only functions --force` (**SÓ quando o usuário autorizar**).

Logs: `npx -y firebase-tools functions:log --only perguntarDex --lines 50`.

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

- **Senha plaintext em `usuarios.senha`** — refatorar quando aposentar custom login. Senha admin atual mudou (perguntar ao Tiarlles; `aros2025` é DESATUALIZADA).
- **Login custom legado** continua disponível como fallback (aceita slug/nome/email + senha plaintext). **Decisão de 2026-05-21**: NÃO criar interruptor de desligamento — em vez disso, **email é obrigatório no cadastro de usuário** (forçando todos a terem email pra eventualmente migrar pro Firebase Auth). Custom login morre naturalmente quando o último user puder usar só Firebase Auth.
- **Admin antigo (`usuarios/admin`)** apagado em prod em 2026-05-21 (estava sem email). O bootstrap em `loadUsuarios()` linha 7821 só recria o admin se a coleção estiver totalmente vazia — em prod nunca dispara mais (já há outros admins).
- **Email reset usa template Firebase default** (não dá pra customizar HTML — restrição do Firebase). Nível 2 futuro: gerar link Firebase via Cloud Function + enviar email customizado via EmailJS.
- **`auditLog` read aberto** (qualquer com projectId lê todo log) — refatorar quando aposentar custom login (vai ganhar `isAuth()` no read).
- **`permissoesAdmin[]` órfão** em docs antigos — campo não é mais lido pelo código, dá pra limpar via migração.
- Slack webhook URL legível em `config/simExtra` (mover pra Cloud Function como proxy resolveria).
- Sem Firebase App Check → API key usável por qualquer um.

## Agentes especialistas disponíveis (use proativamente)

Quatro agentes project-level vivem em `.claude/agents/` e são auto-disponíveis em qualquer sessão do AROS. **Use-os em conjunto** ao planejar e executar intervenções, especialmente em features novas ou refactors de risco:

- **`aros-coder`** (opus) — especialista em coding. Conhece a fundo o single-file index.html, padrões Apple-like, estado `S.*`, gotchas (switchCoTab hardcoded, query collisions em views espelhadas, `</script>` literals). **Invoque ao implementar** nova feature ou refatorar trechos.
- **`aros-reviewer`** (sonnet) — revisor de regressão. Roda checklist específico do AROS (TAB_GROUPS, ADMIN_ONLY_TABS, switchCoTab list, hooks de render, DOM collisions, shape compat). **Invoque ANTES de aplicar mudança em código existente E DEPOIS de cada edit significativo.**
- **`aros-ux`** (sonnet) — UX. Conhece linguagem visual estabelecida (glassmorphism Apple-like, cores por categoria, tipografia), pesa mobile-first (alunos no celular), tom da copy. **Invoque ao desenhar feature/fluxo/modal** novo.
- **`aros-devil`** (opus) — advogado do diabo. Falsifica premissas, aponta riscos (senhas plaintext, read aberto, single-file inflando, mantenedor único). **Invoque APÓS decisões importantes** de design/arquitetura. Termina sempre com riscos prioritários ou "pode seguir".

**Fluxo recomendado pra feature nova**:
1. Discutir requisitos com o usuário.
2. Chamar `aros-ux` pra desenhar fluxo + copy + estados.
3. Chamar `aros-devil` pra contestar a proposta.
4. Iterar com o usuário até alinhar.
5. Chamar `aros-coder` pra implementar.
6. Chamar `aros-reviewer` pra checar regressão antes de declarar pronto.

Em pedidos simples (ajuste de texto, cor, micro-fix) você pode pular agentes — use bom-senso.

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

Catálogo Interno de Produtos (2026-05-22, em paralelo ao Financeiro RPA — branch separada que foi mergeada em 2026-05-23):
- **Nova aba "Produtos"** no painel coord — catálogo descritivo dos produtos da AnestReview pra equipes internas (marketing/vendas/suporte). Não é catálogo de venda pra alunos.
- **Coleção `produtos`** + **`config/catalogoConfig`** (listas mestre de público-alvo e provas-alvo). Storage path `produtos/{id}/`. Rules deployadas em 2026-05-22 (Firestore + Storage).
- **Permissão granular `gerenciarCatalogo`** (registry `EXTRA_PERMS`) — admin tem implicitamente. Checkbox "Permissões extras" no modal de usuário.
- **3 views** (`S.produtosView`): list (compacta com busca/filtros), detail (página dedicada, sem capa grande, com seções // Sobre, // O que está incluído, // Mentoria etc), edit/new (accordion).
- **Features modelo único**: ícone (catálogo curado + emoji custom) + título + Sim/Não + número-chave + descrição + updatedAt por feature. Drag-to-reorder. Sem tipos pré-definidos (tentado em v2 e revertido por feedback do user).
- **Mentoria** como toggle Sim/Não no produto + lista própria de features.
- **Multi-select com presets** pra público-alvo e provas-alvo: lista mestre em `config/catalogoConfig`, "+ Cadastrar novo" e `×` pra remover (avisa se em uso em N produtos).
- **Responsáveis** como tags livres multi (texto livre, sem lista mestre).
- **Audit log**: PRODUTO_CRIADO/EDITADO/EXCLUIDO/STATUS_ALTERADO + CATALOGO_OPCAO_ADICIONADA/REMOVIDA.
- **Polimento Apple-like**: emojis reduzidos (32→20px), número-chave (28→22px), popover fecha com Esc/clique-fora via handler global único, accordion animado, toolbar sem caixa pesada, mentoria com separador roxo.
- **Iterações**: v1 (estrutura completa) → v2 (tipos de feature pré-definidos + bônus) → v3 (revertido pra feature única, removido bônus) → polimento UX.
- **Importante (2026-05-23)**: a feature foi originalmente desenvolvida na branch `claude/great-brahmagupta-032554` e os 2 commits (`168aa7e` + `f1f5d18`) ficaram sem chegar em main por um tempo. Mergeada via cherry-pick em 2026-05-23 junto com toda a leva de Financeiro RPA + Orçamento.

Financeiro RPA + bug fix troca de simulado (2026-05-22 — sessão longa, deploys completos):
- **Bug crítico do TSA Oral resolvido**: alunos antigos sem campo `matricula` no doc ficavam travados ao solicitar troca após apertamento das rules de 2026-05-21. A regra `request.resource.data.matricula == resource.data.matricula` falhava silenciosamente quando o campo não existia. **Fix**: trocou pra `request.resource.data.get('matricula', null) == resource.data.get('matricula', null)`. Deploy de rules separado. Lição salva em memory `feedback_firestore_rules_legacy_docs.md`.
- **Blindagem do fluxo "Confirmar troca"** em `subResp()` e `subRespPres()`: novo helper `normalizeEmailForCompare()` (strip zero-width/NBSP/BOM antes de comparar), try/catch no `updateDoc` com mensagem visível pro aluno, `scrollIntoView` em mensagens de erro pra não ficarem fora da viewport no celular.
- **Fluxo RPA completo** (era placeholder antes):
  - Novo campo `templateIdRpa` em `S.financeiro.notaFiscalCfg` (UI no modal de Cadastros, label "Template ID — RPA").
  - `_finSolicitarRPA` deixa de ser placeholder → delega pra `_finSolicitarNota(prof, mes, 'rpa')`.
  - `_finSolicitarNota` ganhou 3º arg `regimeArg` que escolhe template, ajusta assunto ("Solicitação de RPA — [mês]" vs "Solicitação de Nota Fiscal — [mês]") e mensagens de erro/confirm.
  - `_finEnviarNotaInterno` (helper bulk) idem — aceita `opts.regime`, escolhe template, ajusta assunto, manda `regime` no payload do EmailJS.
  - `_finSolicitarTodasNotas` agora processa fila unificada PJ + RPA. Se um dos templates não estiver setado, profs daquele regime são pulados com aviso.
  - Botão e label: "📨 SOLICITAR TODAS (NF + RPA)" (era "TODAS AS NOTAS").
  - Template HTML do RPA já criado por Tiarlles no EmailJS dashboard (`template_lsfm3xc`), inspirado visualmente no template de NF (mesmo header gradiente + mesmas caixas), removendo o bloco de "Dados pra faturamento" e o aviso "O que fazer agora", trocando por um bloco azul "Sobre o pagamento" com a mensagem de RPA (contabilidade emite, envia cópia pro prof).
- **Tracking do regime usado em cada envio**:
  - Novo `mes.notasSolicitadasRegime[profNome]` = 'pj' ou 'rpa' (paralelo a `notasSolicitadas[profNome]`).
  - Docs antigos sem o campo são tratados como 'pj' (backward compat).
  - **Badge visual** `[NF]` (azul) ou `[RPA]` (laranja) ao lado da data `✓ DD/MM HH:MM` na coluna Solicitar Nota.
  - **Reenviar respeita regime atual**: passa `regimeAtual` explicitamente. Se diferente do registrado anteriormente, botão fica laranja com `⚠️ Reenviar como RPA/NF` e o `_finSolicitarNota` mostra confirm específico ("Última como NF... regime agora é RPA. Reenviar como RPA?"). Decisão de design: NÃO resetar estado automaticamente ao trocar regime — preserva histórico, deixa decisão na hora do clique.
- **Novo status `rpa-solicitada`** no dropdown Controle (5 status total) + filtro "RPA solic." na barra de filtros + validações dos `_finSetControle*`. Cor laranja matching o badge RPA. Auto-setado pelos dois fluxos de envio quando regime='rpa'. Não há `rpa-emitida`/`rpa-nao-emitida` por enquanto — admin usa NF emitida/não emitida pra fechar (pode evoluir).
- **Painel financeiro — outros refinos**:
  - **Typo `itemns` → `itens`** corrigido em 5 lugares (plural correto de "item" em português). Era `item${qtd>1?'ns':''}` produzindo "itemns".
  - **Botão "+" inline na linha do prof** (admin + mês aberto) que abre o modal de lançamento já com prof pré-selecionado. `openFinLancamento` ganhou 3º arg `prefilledProf`.
  - **Remover atividade pelo detalhamento**: seção "Atividades extras" do `openFinRelatorio` agora tem coluna "Ações" com ✏️ (editar) e 🗑️ (remover). Helper novo `_finDeleteAtividade(anoMes, lancId, profNome)` que apaga, salva, re-renderiza e reabre o relatório.
  - **Restauração automática de prof excluído ao lançar atividade**: `saveFinLancamento` agora verifica se `profNome` está em `mes.profsExcluidos[]` e remove dali. Lógica: lançar atividade pra prof excluído implica que ele voltou a fazer parte do mês.
- **Deploy completo**: 2 commits separados — primeiro o fix urgente da regra Firestore (`firestore:rules` + index.html com blindagem), depois o pacote financeiro (RPA + status + refinos). GitHub Pages atualizado em `aros.anestreview.com.br`.

Auth, audit log e onboarding (2026-05-21 — sessão longa, deploy completo):
- **Firebase Auth integrado** (Email/Password + Google) coexistindo com login custom legado como fallback. Listener `onAuthStateChanged` popula `S.currentUser`. `esqueceuSenha` envia reset via Firebase quando input tem `@`.
- **Modelo de usuário reescrito**: campo `tipo` (`adm`/`prof`/`coord`/`suporte`/`financeiro`/custom) substitui o par `role+permissoesAdmin`. `role` mantido como backward compat. `permissoesAdmin[]` **eliminado**. Helpers `getTipo`, `userTabs`, `_isAdminEm`.
- **Tipos configuráveis** em `config/settings.tiposPresets` + `tiposMeta`. UI em Configurações → "⚙️ Presets de Tipo de Usuário" (accordion). Migração automática de `professorPreset` → `tiposPresets.prof`.
- **Identidade implícita** (Fase 2): 5 selects "selecione quem é você" abolidos pra qualquer usuário logado cujo email ou nome bata com um prof cadastrado (Disponibilidade, Checklist Casos, Feedback Geral, Parecer/Recurso × 2). 3 selects mantidos editáveis (Mentorias × 2, Financeiro). Helper `getProfLogadoNome()` faz match em 2 etapas: primeiro por **email** (mais confiável — bate `S.currentUser.email` contra `S.profsEmail`), depois por **nome** (fallback case-insensitive em `S.profs`). Gate de `tipo='prof'` foi removido em 2026-05-22 — agora admin/coord que também são profs cadastrados ganham identidade implícita ao agir nesses 5 contextos (estão agindo como si mesmos). Bug do gate de tipo: alunos antigos e admins-que-são-prof viam dropdown indevidamente; fix substituiu por match por email/nome direto.
- **Audit Log** (`auditLog/{auto}`): helper `audit(action, target, payload)` + `AUDIT_ACTIONS` canônicas (~30 pontos instrumentados). Nova aba "🔍 Auditoria" (STRICT_ADMIN) com filtros, paginação, modal de diff, export CSV.
- **Tela de Usuários reformulada**: busca por nome/email, filtro dinâmico por tipo, linhas enxutas, sem badges granulares. Modal: select de tipo + preset auto, sem mais "Administrador geral" e admin granular. Soft delete (`inativo:true`).
- **Onboarding de Professores fundido com Cadastro de Professores**: contagem por status no header, linha com badge 🔴/🟡/🟢, botão "📧 Convidar" / "↻ Reenviar", bulk "Convidar todos". Modal de envio editável (`modal-convite-edit`). Modal multi-email por prof (`modal-prof-emails`). Modal de exclusão com dupla checagem (`modal-rm-prof`). EmailJS `template_rruper4` dedicado.
- **Cadastro unificado de prof (2026-05-22, fase final):** a seção "👨‍🏫 Cadastro de Professores" em Configurações foi **REMOVIDA**. Toda gestão de prof (criar, editar, multi-email, convite, apagar) agora acontece na **Users tab (Admin → Usuários)** com tipo=prof. Funcionalidades migradas/cobertas:
  - **Criar prof**: modal de Novo usuário com tipo=prof mostra bloco `mu-prof-extra` (aviso de listagens + checkbox "📧 Enviar convite por email ao salvar"). Ao salvar, `saveUser` sincroniza com `config/professores.lista` + `S.profsEmail` + dispara `_onbSendInvite` se checkbox marcado.
  - **Multi-email**: dois campos separados — "Email principal (login)" (sempre visível) + "Emails secundários (opcional, até 2)" (só visível pra tipo=prof, controlado por `onTipoChange` e `openUserModal`). Ao abrir um prof existente, split em cascata recupera multi-email de `S.profsEmail` (match exato por nome → case-insensitive → match por email).
  - **Apagar prof**: `deleteUser` agora detecta tipo=prof e executa exclusão completa — soft-delete do usuário + remove de S.profs + remove emails de S.profsEmail + grava `config/professores`. Confirmação mostra contagem de vínculos ativos (mentorias, lançamentos financeiros) como aviso, mas não bloqueia. Histórico (notas, lançamentos passados) preservado mesmo sem o prof na lista.
  - **Rename**: ao renomear prof na Users tab, `saveUser` transfere entrada antiga pra nova em S.profs + S.profsEmail (preserva continuidade).
  - **Render**: `renderProfGlobal()` continua existindo (gerencia `disp-prof-sel` e `prof-sim-sel`) mas os blocos que escreviam em `prof-global-list` e `prof-count-badge` (elementos agora removidos) são noops graças aos guards `if(list)` / `if(badge)`.
  - **Dead code** (mantido como referência, não removido): `addProfGlobal`, `onboardingConvidarTodos`, `rmProfG`, `abrirEmailsModal`, modais `modal-prof-emails` e `modal-convite-edit`, modal `modal-rm-prof`. Não há mais entrada de UI pra acessá-los.
  - **O que foi perdido**: bulk "Convidar todos" (era útil pra migração inicial, agora considerada irrelevante), status badges visuais (🔴/🟡/🟢) na listagem, botão de re-enviar convite individual (admin pode editar user + marcar checkbox de convite). Decisão consciente em 2026-05-22 — usuário priorizou simplicidade.
- **Firestore Rules apertadas**: writes em coleções coord/prof exigem `isAuth()`. Login custom → read-only. Exceções preservadas pra fluxos anônimos de aluno.
- **Badge "ADM" dinâmico**: `isAdmExclusiveTab(tabId)` substituiu `ADMIN_ONLY_TABS.has(tabId)` hardcoded — reflete decisões de preset em tempo real.
- **Firebase Console**: idioma PT-BR, nome público "AROS · Anest-Review", `aros.anestreview.com.br` em Domínios Autorizados, support email Workspace.
- **Deploy**: 3 commits + push `claude/recursing-mestorf-5f88f8 → main` + `firestore:rules` deployadas com nova regra `auditLog`.
- **Refinos finais (mesma sessão)**:
  - **Email obrigatório no cadastro de usuário**: `saveUser` rejeita salvar sem email. Hint no formulário diz "Obrigatório". Forçar email = caminho pra todos eventualmente logarem via Firebase Auth.
  - **Admin antigo (`usuarios/admin` sem email) apagado em prod**. Bootstrap em `loadUsuarios()` só recria admin se a coleção estiver vazia — não dispara mais.
  - **Decidido NÃO criar interruptor `legacyLoginEnabled`**. Em vez de UI pra desligar o login custom, email obrigatório no cadastro já força a migração natural. Custom login continua disponível como fallback indefinidamente.
  - **Linguagem simples**: usuário (Tiarlles) pediu que evite jargão técnico — usar termos do dia-a-dia (ver `feedback_linguagem_simples.md` no memory).


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
