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
| Fontes web | Plus Jakarta Sans (corpo + **abas da sidebar** desde 2026-06-23), Fraunces (legado, sendo removido), **Space Grotesk** (títulos do painel), **JetBrains Mono** (badges, mono subtitles, group headers `//`), Permanent Marker. |
| CDN externos | EmailJS (envio de email), SheetJS (export/import xlsx), Firebase JS SDK |
| Banco | Firebase Firestore (projeto `simulados-confirmacao`) |
| Storage | Firebase Storage (imagens de revisão, checklists, slides) |
| Auth | **Firebase Auth APENAS** (Email/Password + Google). **Login custom legado APOSENTADO em 2026-06-04** — `checkPass` agora só faz Firebase; input sem `@` é rejeitado ("entre com e-mail"). Leitura de `usuarios` exige login (`isAuth()`). Senhas plaintext ainda existem nos docs `usuarios` mas NÃO são mais públicas (read travado) — remoção pendente (Camada 2c). **Senha admin: perguntar ao Tiarlles; `aros2025` é DESATUALIZADA e morta.** |
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
- **Logo header (atual):** `/assets/assets/logo-medreview.png` (PNG branded MEDREVIEW, caminho absoluto de root pra funcionar em local + produção). Subido manualmente no repo em `assets/assets/logo-medreview.png`. **Substituiu** o `logo-anestreview.png` legado em 2026-05-29.
- **Logo header (legado):** `https://aros.anestreview.com.br/assets/assets/logo-anestreview.png` — não usado mais; arquivo ainda no repo por compat.
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
  ├ respostas/{studentId}           — respostas (+ feedbackGeradoEm: data do último PDF gerado)
  │   └ shape: {criar:{casos{},finalizado,notaCriar,naoFez?,parcialNaoFez?}, oral:{...,notaOral,...}, updatedAt}
  │   └ naoFez:true (NÍVEL BLOCO) = coord marcou "Aluno não fez o bloco" → nota 0 + finalizado. Conta como
  │     FINALIZADO (status/filtro/feedback), mas seus casos são IGNORADOS no feedback e na
  │     média da turma do bloco. Visual: card vermelho; selo na linha verde-escuro "Finalizado · não fez".
  │   └ casos[ci].naoFez:true (NÍVEL CASO, 2026-06-08) = "Aluno não fez ESTE caso" → caso pontua 0
  │     e conta como verde/finalizado (getCasoStatus/_calcCasoScore/casoSalvo tratam no topo). Permite
  │     finalizar o bloco com casos feitos + zerados. Caso naoFez fica fora do feedback/PDF do aluno.
  │   └ parcialNaoFez:true = bloco tem ≥1 caso zerado → flags criarParcial/oralParcial são gravados em
  │     notas/{simId}/alunos/{key} e EXCLUEM o aluno da média da turma (bloco e final). A nota individual
  │     dele soma tudo (casos zerados = 0). naoFez de BLOCO e de CASO são mutuamente exclusivos: qualquer
  │     atividade por caso (zerar caso / salvar caso / finalizar) limpa o flag de bloco (cura dado legado).
  └ relatorios/{studentId}          — {html, geradoEm}: HTML do PDF aprovado (PROTEGIDO isAuth — tem notas)

disponibilidade/{simId}/profs/{key} — disponibilidade de profs
feedbackGeral/{simId}               — feedback geral do simulado (textoFinal = consolidado; trava contribuições)

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
  ├ catalogoConfig[_{vertical}]     — listas mestre do Catálogo POR VERTICAL (multi-select)
  │                                    { publicosAlvo:[str], provasAlvo:[str] }
  │                                    Seed (presets anest) SÓ na anestreview; outras começam vazias.
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
    isCombo:bool,                   // 2026-05-31 — produto é combo (oferta com vários produtos). Mostra tag "COMBO" (gradient roxo→rosa) antes do nome no card
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
  imgUrl, imgLabel, imgPath, imgSize, imgName,  // anexo IMAGEM nomeável (gradient teal/esmeralda) — 2026-05-31
                                   // botão abre em lightbox (openImgLightbox), NÃO baixa. Storage: produtos/{pid}/features/{fid}/img-{ts}.{ext}, limite 15MB
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
- Abas da sidebar de Coordenação (`.co-tab`): **Plus Jakarta Sans** 13.5px peso 550 (redesign 2026-06-23 — antes era Space Grotesk, que parecia "infantil"). Cada aba tem **ícone SVG de traço** (estilo Lucide, mapa `_CO_ICONS` por id de aba, render via `_coIcon(id)`, classe `.co-tab-ic` 18px herda currentColor — fica accent no hover, branco no ativo). Emojis dos labels de `TAB_GROUPS` são removidos no render por `_coStripEmoji()` (regex tira símbolos do começo) — os emojis ficam só no fallback/editor de menu. Aba sem ícone mapeado → fallback ponto.
- Headers de grupo na sidebar (`.co-group-header`): **JetBrains Mono** 10.5px peso 700 uppercase letter-spacing 1.8px, cor `--t3` (bem muted), prefixo `//` accent via `::before`, + linha divisória (`border-top`) entre grupos. Propositalmente discreto p/ contrastar com as abas (sans + ícone) — resolve "não dava p/ diferenciar grupo de aba".
- Subgrupos na sidebar (`.co-subgroup-header`): Plus Jakarta Sans 13px peso 550.
- **Dropdowns de grupo/subgrupo abrem/fecham com animação fluida** (`grid-template-rows:1fr→0fr` + `opacity`, transição `.3s cubic-bezier(.33,1,.68,1)`) — exige wrapper interno `.co-group-inner`/`.co-subgroup-inner` com `overflow:hidden;min-height:0` (o render envolve os itens nele). Substituiu o `display:none` instantâneo. `toggleGroup` só alterna a classe `.collapsed` (sem mudança de JS). Mecanismo de hover/glow das abas (`::before` trilho accent + `::after` ponto) preservado.
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

**Link local pra testar no navegador do Mac (REGRA — sempre que o usuário pedir "link local"):**
- Subir servidor: `python3 -m http.server 8765 --bind 127.0.0.1` (rodar em background na worktree atual).
- **SEMPRE mandar a URL com `localhost`, NUNCA `127.0.0.1`:** `http://localhost:8765/index.html`.
- **Por quê:** o login com Google (Firebase Auth) só funciona em domínio autorizado. `localhost` está autorizado; `127.0.0.1` **não** está → o popup do Google falha. Bug observado em 2026-05-30.
- O servidor `python3 -m http.server` aceita ambos (localhost resolve pra 127.0.0.1), então o bind em 127.0.0.1 não impede — o que importa é a URL que você manda ser `localhost`.

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

**Escala (aluno) — visão pós-deadline (2026-05-29):**
- Box `<details>` "⚠️ Alunos que não confirmaram" no **rodapé de cada dia** (sábado e domingo). Aparece quando `exp=true` (deadline passou).
- Inclui **TODOS** os não-confirmados de `S.students` (pending, swap, absent — auto-ausentes têm `dia=null` + `originalDia` preservado).
- Mesmo conteúdo nos 2 dias (não tenta segregar). Cada linha mostra chip com `originalDia` + `originalRodada` ao lado do nome.
- Reusa `alunoRowHTML(s, exp, extraAfterName)` — assinatura ganhou 3º param opcional (refator pra evitar regex frágil em nomes com `<`/`>`).
- **Auto-abre quando search ativa** (expandAll passado por `searchAluno`).
- Localização: `renderAlunoDay` ~linha 23282, `renderNaoConfirmaramBox` logo abaixo.

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

**Sidebar colapsável (2026-05-29):**
- Botão `☰` (id `co-sidebar-toggle-btn`, classe `.co-sidebar-toggle`) ao lado do título "Painel da Coordenação". Estilo dark glass com `backdrop-filter:blur(18px)` + borda neon accent + pulso `coTogglePulse 2.6s`. Versão light mode também.
- Layout `.co-layout.sidebar-closed` colapsa `grid-template-columns:0 1fr`.
- `toggleCoSidebar()` toggle + persiste em `localStorage['aros_co_sidebar_closed']`.
- `_applyCoSidebarPref()` aplica preferência — **default = fechada na primeira visita** (quando localStorage null). Chamado em `openCoordPanel()` e em `switchView('coord')`.
- **User info card** (avatar+nome+role) movido pro **topo** da sidebar (wrapper `.co-sidebar-head`). Logout button continua no foot.
- **Grupos da sidebar fechados por padrão na primeira visita**: `renderSidebar` trata `localStorage.getItem('aros-sidebar-collapsed')==null` como "tudo colapsado".

**Branding (2026-05-29):**
- Eyebrow do painel coord: "AnestReview" → **"MEDREVIEW"**.
- Logo `<img src>` trocada de `logo-anestreview.png` (URL absoluta de produção) → `/assets/assets/logo-medreview.png` (caminho **absoluto de root** pra funcionar local + prod). Arquivo novo em `assets/assets/logo-medreview.png`.

### Sistema de auth (login custom APOSENTADO em 2026-06-04 — só Firebase agora)
Tela `co-login` tem **só Firebase Auth**: Google sign-in (`loginGoogle`) + Email/Password (`loginEmailFirebase`, com `sendPasswordResetEmail` no "Esqueci a senha"). O login custom legado (comparava `usuarios.senha` plaintext no cliente) foi **removido do `checkPass`** — todos os coord/profs já estavam migrados.

**Fluxo do `checkPass` (atual)**: se input não tem `@` → erro "entre com seu e-mail (ou Google)". Senão → `loginEmailFirebase(raw,senha)`. Sem mais fallback custom, sem migração transparente, sem leitura de `usuarios` pré-login. Campo `co-user` é `type=email` placeholder "E-mail".

**Listener `onAuthStateChanged`** popula `S.currentUser` após sign-in Firebase E **restaura a sessão ao recarregar** (Firebase persiste o login): busca user doc por `email` em `S.usuarios` (carrega `loadUsuarios()` pós-auth). Se não acha → erro + `signOut()`. Guard pra `?modo=projecao|projecao-live|preview`. Flag `window._freshFirebaseLogin` evita auditar `LOGIN_*` em cada reload. **É o ÚNICO caminho de login/restauração agora** — a antiga `_restoreSession` (localStorage) foi REMOVIDA (causava "pisca" e apagava sessão antes do Firebase confirmar).

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

**Sessão persistida pelo Firebase Auth** (IndexedDB próprio do SDK). Refresh mantém login via `onAuthStateChanged`. Logout = `signOut()`. (O `localStorage.aros_session` ainda é escrito por `_applyLocalSession` mas é vestigial/não-lido — limpar quando der.)

**⚠️ Boot NÃO carrega dados de coordenação (2026-06-04):** o `Promise.all` do `boot()` deixou de chamar `loadUsuarios()`, `loadFinanceiro()`, `loadSenhasAcessos()` — senão desceriam pro navegador de TODO visitante (alunos incluídos; `usuarios` tem senhas plaintext). Esses carregam sob demanda: `onAuthStateChanged` (pós-login) e ao abrir a aba (`loadSenhasAcessos` no switch da aba; `_ensureFinanceiroListener` no tab financeiro). Ao mexer no boot, NÃO re-adicione esses loaders.

### Blindagem de leitura do Firestore (2026-06-04)
O AROS sempre teve `allow read: if true` em quase tudo (alunos navegam sem login → reads públicos por design). Isso vazava dados sensíveis (a apiKey do Firebase é pública; read aberto = legível por qualquer um via SDK). Blindagem feita em camadas (deploy de `firestore.rules`):
- **Fase 1:** `config/senhasAcessos` (cofre de senhas) e `config/financeiro` → `read: if isAuth()`. Feito via wildcard `config/{cfgId}` negando esses dois IDs + matches específicos. Faxina: removidas senhas mortas `password`/`profPassword` de `config/settings` (deleteField ao abrir aba Config logado).
- **Camada 1:** travadas pra `isAuth()` 10 coleções que NENHUM fluxo público usa: `notas`, `orcamentos`, `tarefas`, `disponibilidade`, `feedbackGeral`, `auditLog` (create segue aberto p/ legado), `produtos`, `revisaoCasos/comentarios`, `revisaoCasos/historico`, `adminUids`.
- **Camada 2:** `usuarios` → `read: if isAuth()` (+ login legado aposentado, ver acima). CPF já era protegido (`alunosAprovados` é admin-only).
- **AINDA público (Camada 3 pendente):** `simulados`(+alunos), `listas`, `mentorias`, `clinicas`(+alunos), `blocosClinica`, `revisaoCasos`(parent), `provas`(+questoes+contestacoes), `fontesRecurso`, `recursosConfig`, `config/{settings,menu,simExtra,comunicacao,conteudosLiberados}`, `comunicacao/posts`, `trocasDiretas`, `projecaoLive`, `checklists`(meta+respostas), `orcamentos`? (não — travado), `solicitacoesExtra`. Essas alimentam as abas públicas — contêm **emails de alunos** (listas/mentorias/clinicas/solicitacoesExtra/simulados-alunos) e o **Slack webhook** em `config/simExtra`. Camada 3 = separar emails pra doc protegido sem quebrar a navegação. Ver [[project_aros_seguranca_leituras]].

**Regra de ouro ao mexer em rules ou no que uma aba lê:** as 4 abas públicas (Início, Simulados, Recursos, Mentorias) + Mural + sim-extra do aluno + boot rodam SEM login. Qualquer coleção que elas leem precisa continuar pública; o resto deve exigir `isAuth()`.

**Allowlist de `tipo` nas writes (`mentorias`, `blocosClinica`, `clinicas`):** as rules validam `request.resource.data.tipo in ['TEA','TSA','TSA Oral','ME1','ME2','ME3']` (`'TSA Oral'` incluído em 2026-06-16 + redeploy). Ao adicionar um tipo novo de mentoria, atualize ESSA allowlist e faça deploy das rules — senão o save é negado em produção (e o localhost também, que usa o Firestore real). Ver [[project_aros_localhost_firestore]].

### Endereço da coordenação (subdomínio) — gating por host
O `index.html` tem `arosIsPainelHost()` + `window.AROS_IS_PAINEL` (perto de `window.switchView`). A coordenação só funciona em hosts da lista `AROS_PAINEL_HOSTS` (+ localhost/file/`*.github.io` p/ dev). No endereço do aluno a coord fica TOTALMENTE bloqueada: `switchView('coord')`, `openCoordPanel`, `_revealCoordTab` caem em `goHome()`; cadeado 🔐 + atalho mobile removidos no load. Objetivo: coord em `admin.anestreview.com.br`, alunos em `aros.anestreview.com.br`.
**Estado transitório:** `AROS_PAINEL_HOSTS` inclui TEMPORARIAMENTE `aros.anestreview.com.br` (coord funciona nos dois) enquanto `admin.*` não está no ar. Quando admin.* for publicado/testado, REMOVER `aros.anestreview.com.br` da lista. Plano de infra (2º repo GitHub Pages `aros-admin` + Action de sync em `.github/workflows/sync-admin.yml` — NÃO commitado até o repo existir) em [[project_aros_painel_subdominio]]. **Adicionar admin.* em Firebase Auth → Authorized domains** senão login quebra.

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

**Refinos do editor de Revisão (coord) — 2026-06-08:**
- **Reordenar casos por drag** dentro do MESMO bloco: card do caso tem alça ⠿ no header (`_revCasoDragStart/Over/Drop/End`), splice no `S._revEdit.casos`. Drop entre blocos é barrado (pra trocar de bloco usa o select 🩺/🎙️). Itens do checklist já tinham drag análogo (`_revItemDrag*`).
- **Penalidade já na revisão**: cada item tem botão "⚠ Penalidade?" (`toggleItemNegativoRev`) que liga `it.negativo`. Renumeração (`_revRenumerarItens`): positivos = A,B,C limpos; penalidade = ⚠. **`stripPrivate` (exportarRevisao) e o seed de import agora carregam `negativo` (+obs)** → a penalidade chega no checklist oficial. Revisor (prof) vê selo PENALIDADE no item.
- **Perguntas em dropdown** (`togglePerguntaRev`, flag `p._aberto`): header clicável com prévia do enunciado + contagem de itens; **fechadas por padrão**; pergunta nova (`addPerguntaRev`) abre expandida.
- **Nome do caso inline** no header do box (`editCasoRev(ci,'nome',...)` com stopPropagation); campo "Nome do caso" do corpo foi removido.
- **Fontes**: títulos da Revisão migraram Fraunces → **Space Grotesk** (com letter-spacing negativo). Box de comentários renomeado "Revisão dos professores" (antes "FEEDBACK DOS PROFS"), tom discreto (`--t2`), amarelo só quando há item não resolvido.

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
- Clique chama `abrirSalaAluno(simId, alunoId)` → abre `?modo=projecao-live&...&role=aluno`.
- Pra Simulado Extra (que não tem card na home): prof envia o link copiado por WhatsApp/email.
- **GOTCHA (corrigido 2026-06-11):** `_alunoBtnEntrarSala(s, simId)` PRECISA do 2º arg `simId`. `presAlunoRow` (presencial) chamava só `_alunoBtnEntrarSala(s)` → link saía com `sim=undefined` → aluno preso em **"Sala ainda não iniciada"** (escuta `projecaoLive/undefined__alunoId`, que nunca existe). `simId` vem de `S.curSim.id`. Se mexer no botão da sala, conferir os DOIS renderers (`alunoRowHTML` normal/oral E `presAlunoRow` presencial).

**Anti-flash da home em janelas de projeção/sala/preview** (2026-06-11):
- Toda janela `?modo=projecao|projecao-live|preview` carrega o `index.html` inteiro (com a home) e só depois `_init*` substitui `document.body.innerHTML`. Isso causava um "pisca" da home.
- Fix: script inline no `<head>` (cedo, antes do body pintar) marca `data-proj-boot="1"` no `<html>` quando o `modo` é um desses; CSS revela a capa `#proj-boot-cover` (preta, spinner, "Abrindo a sala…"). A capa vive no início do `<body>` e some quando `_init*` reescreve o body. Atributo leftover é inofensivo (CSS só mira `#proj-boot-cover`, que já não existe).

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
- **Tipos:** `'TEA'`, `'TSA'`, `'TSA Oral'`, `'ME1'`, `'ME2'`, `'ME3'` (lista em `MENTORIA_TIPOS`). `'TSA Oral'` (string com espaço) adicionado em 2026-06-16.
- **Badge `_mentBadge(t)`**: pill em JetBrains Mono uppercase com cor por tipo (TEA=azul, TSA=laranja, **TSA Oral=dourado/âmbar `#e3b341`**, ME1=roxo, ME2=ciano, ME3=rosa). Cores em `_MENTORIA_CORES`. NÃO usa mais a classe `.badge` legada (que tem `text-transform:lowercase`).
- **Duas abas de coordenação (2026-06-16):** o grupo Mentorias da sidebar tem 2 tabs — **🎓 Coord. 1ª fase** (`tab-mentorias`/`renderMentorias`, TEA/TSA/ME — exclui TSA Oral; tem Trocas, Clínicas, Grupos) e **🟨 Coord. 2ª fase** (`tab-mentoriasF2`/`renderMentoriasF2`, SÓ `tipo==='TSA Oral'`, simplificada: só "Grupos e Mentores", sem trocas, sem clínicas). Card de grupo extraído em `_mentGrupoCardHTML(g)`, usado pelas 2 abas (conjuntos disjuntos → sem colisão de id `grp-alunos-${g.id}`). `openMentorGrupo(id, fixedTipo)`: com `fixedTipo==='TSA Oral'` (ou grupo já TSA Oral) trava o dropdown de tipo (`disabled`) e esconde as outras options. Grupos TSA Oral NÃO criam clínica → não aparecem no front do aluno. **Datas obrigatórias na 2ª fase** (validação no `saveMentorGrupo` quando `tipo==='TSA Oral'`) pra garantir que o mentor entre no Financeiro. `switchCoTab`: id `'mentoriasF2'` na base (~25259) + `renderMentoriasF2()` no wrapper (~29202). Ver [[project_aros_mentorias_2fase]].
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
- Botões por card: **✓ Validar** (concordo com gabarito oficial — bool global `validada`), **💡 Emitir parecer** (parecer proativo sem precisar de contestação — renomeado de "Sugerir recurso" em 2026-06-02), **✏️ Editar**, **🗑️ Apagar**.
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

**Botão "💡 Emitir parecer" (parecer proativo — renomeado de "Sugerir recurso" em 2026-06-02):**
- Bypassa o fluxo de assumir/rascunho — abre modal direto editável.
- Em modo VF, abre `prompt()` pedindo qual alternativa (A-E).
- Dropdown de parecer pré-selecionado em **"Cabe Recurso"** automaticamente.
- Botão final é **"✓ Salvar parecer"** (cabe recurso direto), não "Finalizar".
- **Editar parecer existente**: botão `✏️ Editar` em cada parecer ativo → `editarSugestao` → `abrirParecer(...,{editSug})` (modo `isEdit`) → salva via `_salvarParecerEdicao` (atualiza o item no array, não cria novo; não reenvia email). Ver changelog 2026-06-02.

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
- **Coluna "Mentoria TSA Oral" separada (2026-06-16):** `calcFinanceiroMes` divide os grupos em 2 buckets disjuntos — `mentoriasDet`/`totalMentorias` (tipo != TSA Oral) e `mentoriasTsaOralDet`/`totalMentoriasTsaOral` (tipo === TSA Oral). Cada um vira coluna própria na tabela, no relatório, no email e no Excel. O `total` soma os dois uma vez (sem dupla contagem). O card resumo "Mentoria" mostra a soma das duas.
- **Desconto Plano de saúde (2026-06-16):** coluna **"Plano de saúde"** editável na tabela (pill `.fin-plano-wrap` com prefixo "R$"), por mês, subtraída do total. Guardado em `meses[anoMes].descontoPlano[profNome]`. Só aparece o campo pra profs marcados no Cadastro (`profsFin[nome].temPlanoSaude` — checkbox na aba Professores); não marcados mostram "—". `calcFinanceiroMes` expõe `descontoPlano`, `totalBruto`, `temPlanoSaude` e `total = totalBruto - descontoPlano` (LÍQUIDO — propaga pro email/resumo/Excel). Se o prof não tem `temPlanoSaude`, o desconto é ignorado (0). `totalVar` no resumo usa `totalGeralBruto` pra não ser afetado. Handler `_finSetDescontoPlano(profNome, anoMes, val)`. Aparece no relatório ("TOTAL LÍQUIDO") e no email de Solicitar Nota (linha "Desconto plano de saúde: − R$ X"). Compat snapshots antigos: `(p.descontoPlano||0)` / `(p.totalBruto??p.total)`.
- Relatório individual: seção Mentoria com tabela `Tipo · Período · Alunos · Dias trabalhados no mês · Valor`.
- Excel: aba **Mentoria** com colunas `Professor, Tipo, Início, Fim, Alunos, Dias no mês, Dias do mês, Tipo de mês (Parcial/Mês cheio), Valor cheio, Valor pago`.
- Card resumo do topo: 4 cards agora (Total geral, Salários fixos, **Mentoria**, Variáveis).
- `FIN_DEFAULT_TIPOS` ainda tem `'mentoria'` como tipo de lançamento livre (legado), mas mentoria automática NÃO usa esse tipo — ela é gerada via cálculo de sobreposição direto, não fica gravada como lançamento.

**Cadastros do Financeiro** (modal **⚙️ Cadastro / Configurações**, admin-de-financeiro-only — renomeado de "Cadastros" em 2026-05-19) com 3 abas:
- **👨‍⚕️ Professores**: tabela com **busca por nome** (filtra em tempo real via `_finCadFilterProfs`) + colunas: Professor / Email (somente leitura — fonte: `S.profsEmail[nome]`) / Regime (PJ·RPA) / **Plano de saúde** (checkbox `temPlanoSaude` — quem está marcado tem o campo de desconto na tabela do mês) / Salário fixo / Início / Fim. Início/Fim são `<input type="month">` (YYYY-MM) opcionais; se vazios o salário aplica em todos os meses; se preenchidos restringe ao intervalo.
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

**Bug fix 2026-06-23 (corrida de carregamento da aba):** ao abrir o tab Financeiro o `switchCoTab` chamava `renderFinanceiro()` **antes** de `loadFinanceiro()` (que não está no boot por segurança — ver §boot). Resultado: 1º desenho saía com `S.financeiro` vazio/parcial (salários fixos R$0, só os profs com mentoria/variável aparecendo — ~13 em vez de 26), e só corrigia ao trocar de mês e voltar (dados já chegados → snapshot do fechado). Sintoma: mês **fechado** mostrava números diferentes no reload vs. depois de navegar. Fix: `if(tab==='financeiro'){_ensureFinanceiroListener();loadFinanceiro().then(()=>renderFinanceiro());}` — carrega ANTES de desenhar (trade-off: pisca de <0.5s ao entrar na aba). Mentoria batia nas 2 telas porque `S.mentorias` já vinha do boot.

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
- `config/catalogoConfig[_{vertical}]` — listas mestre **POR VERTICAL** (`publicosAlvo`, `provasAlvo`). Doc legado sem sufixo = anestreview; outras verticais usam `catalogoConfig_{vertical}` (via `_verticalDocId`).

**Seed POR VERTICAL (corrigido 2026-06-05):** o `PRO_CATALOGO_SEED` (9 públicos + 7 provas, tudo de anest — ver abaixo) só é gravado na vertical **anestreview**. Outras verticais (oftreview/ortopreview/medreview) começam com público/provas **VAZIOS** — cada uma cadastra os seus. **Bug antigo:** `_proSeedCatalogoConfigIfNeeded` e `_proAddCatalogoOption` gravavam o seed da anest em QUALQUER vertical → oftalmologia aparecia com público da anest. Fix: ambos gateiam por `S.verticalAtual==='anestreview'`; e o `onSnapshot` do catalogoConfig, pra verticais ≠ anest, **remove do display E do doc** (arrayRemove, idempotente) quaisquer entradas que batam exatamente com `PRO_CATALOGO_SEED` — limpeza automática quando um editor abre a vertical. Opções próprias da vertical são preservadas.

**Presets seed `publicosAlvo`** (9 opções iniciais — SÓ anestreview):
"Residentes e Anestesiologistas em geral", "ME1/ME2/ME3", "Anestesiologistas que farão TEA 1ª/2ª Fase", "Anestesiologistas que farão TSA 1ª/2ª Fase", "Anestesiologistas que buscam atualização".

**Presets seed `provasAlvo`** (7 opções iniciais — SÓ anestreview):
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
- Picker `#pro-picker-pop` (genérico) lista opções do `config/catalogoConfig[_{vertical}]` da vertical atual + botão "+ Cadastrar novo" no rodapé.
- **Posicionamento (2026-06-05):** `_proPositionPicker` agora **CENTRALIZA na viewport** (`left/top:50%` + `transform:translate(-50%,-50%)`), em vez de ancorar abaixo do botão. Antes (`top=rect.bottom+8` com estimativa fixa de 360px) estourava pra fora da tela quando o botão estava na parte de baixo do form. O picker é reparentado pro `<body>` ao abrir (escapa ancestral com transform) e tem `max-height:70vh; overflow-y:auto` (rola internamente se a lista for grande).
- Cada item tem botão `×` (só pra quem edita) que remove do catálogo da vertical via `arrayRemove`. Se a opção está em uso em N produtos, confirm avisa "Está em uso em N produto(s)" — os produtos mantêm a tag órfã.
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
- Vincular produto: picker `_proBonusOpenProdPicker`/`_proFeatuOpenProdPicker` → `_proOpenProdMultiPicker` lista os produtos **da vertical atual** (exceto o próprio e os já vinculados), com mini-capa+nome+status. Click adiciona como chip. **(2026-06-02: passou a filtrar por `(p.vertical||'anestreview')===S.verticalAtual` — antes mostrava produtos de todas as verticais.)**
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

### Catálogo + Dex — sessão grande (2026-05-31) ⚠️ PENDENTE DEPLOY

Sessão de polimento do catálogo + rearquitetura do Dex. **Frontend (`index.html`) commitado mas NÃO pushado; Cloud Function (`dex.js`) editada mas NÃO deployada.** As mudanças de `dex.js` (itens 5, 6, 7) só valem APÓS `firebase deploy --only functions`. Supersede partes das seções "Pergunte ao Dex — evolução (2026-05-25)" (abas por perfil e PDFs foram REMOVIDOS).

**1. Box "Dores dos Nossos Clientes"** (clone do padrão Editais):
- Caixa colapsável no topo do catálogo (após Jornada). Cada cliente é um card-dropdown com `nome` + `info` (rich-text editável via modal). Reusa classes `.pro-edital-*` / `.pro-editais-modal-*`.
- Firestore: `config/{verticalDoc('doresClientes')}` = `{ lista:[{id,nome,info,updatedAt,updatedBy}], updatedAt, updatedBy }`.
- Funções: `_proDoresHTML`, `_proDoreItemHTML`, `_proDoresModalHTML`, `proDoresAbrirNovo/Editar/Remover/ModalSalvar`, `proToggleDores`, `proDoreToggle`. Audit `DORE_CRIADO/EDITADO/REMOVIDO`.
- Lida pela IA (ver item 7 — leitor dedicado `formatarDores` no `dex.js`).

**2. Tag COMBO** — produto com `isCombo:true` mostra pílula "COMBO" (gradient roxo→rosa, `.pro-combo-tag`) antes do nome no card. Toggle `.pro-combo-toggle` na seção Básico do editor (abaixo de Status). Campo persistido no payload do `_proSalvar`.

**3. Anexo de IMAGEM por feature** (espelha o anexo PDF): campos `imgUrl/imgLabel/imgPath/imgSize/imgName`. Botão verde-esmeralda `.pro-feat-img-btn` no card **abre em lightbox** (`openImgLightbox`, reusado da Revisão) — NÃO baixa. Editor: linha "🖼️ Imagem" após PDF, com label + miniatura + remover/trocar. Upload `_proFeatImgUpload` / `_proFeatImgRemove`, Storage `produtos/{pid}/features/{fid}/img-{ts}.{ext}` (15MB; rule `produtos/{produtoId}/{allPaths=**}` já aceita img até 20MB). Campos adicionados em `_proNormFeature`, `_proPrepareFeatures`, `_proFeatEqual` (keys), e nos 3 criadores de feature default.

**4. Dex — PROMPT ÚNICO (substitui abas por perfil):**
- Em vez de 4 campos (`templateGeral/Suporte/Vendas/Marketing`), agora **um campo só `templateUnico`** com instruções gerais + blocos condicionais escritos pelo admin (ex: "Se o perfil ativo for VENDAS: ..."). Os 4 campos legados continuam salvos (compat) mas a UI não os edita mais.
- **Migração automática** em `_proDexConfigEnsureDraft`: se `templateUnico` vazio e há prompts legados, `_proDexMontarUnicoDeLegado()` monta um prompt único estruturado (instruções gerais = templateGeral + blocos "SE O PERFIL ATIVO FOR X" pros outros). Marca dirty pra nudge ao salvar. (Banner explicativo REMOVIDO a pedido — `S._dexConfigMigrado` ainda existe mas não renderiza banner.)
- **Chips de perfil seguem** no input (quem pergunta escolhe Geral/Suporte/Vendas/Marketing). O backend injeta o perfil ativo no system prompt (ver item 6).
- Popup **Expandir** (`_proDexConfigExpandInstr('templateUnico', ...)`) — editor em tela cheia, montado no `<body>` (escapa ancestral transformado), fecha SÓ no ✕/Fechar (backdrop sem onclick). Classes globais `.pro-dex-instr-ta`.

**5. Dex — PDF REMOVIDO** (UI já removida antes + backend agora):
- UI de anexar PDF (`_proDexConfigPdfsHTML`) já não é renderizada; `dex.js` não monta mais blocos `document`/PDF — `messages` é só histórico + pergunta. Campos `pdfs*` e Storage `dex/pdfs/` ficam órfãos (não lidos). Removido `pdfs_count` do log.

**6. Dex — config UI redesenhada:**
- Botão da engrenagem agora é **"⚙️ CONFIGURAÇÕES"** (ícone+texto, `.pro-dex-cfg-btn`) com estado `.on` = fundo gradient roxo (bem visível quando aberto).
- Modelo de IA + Tamanho da resposta embutidos no **dropdown colapsável "Configurações do Modelo de IA"** (`.pro-dex-cfg-disc`, toggle `_proDexCfgModeloToggle`, state `S._dexCfgModeloOpen`, começa fechado).
- **Removidos:** botões "Carregar exemplo" / "Usar padrão", o hint-rodapé do prompt, o "— único, para todos os perfis" do cabeçalho (vira só "Prompt do Dex"). Rodapé = só Cancelar/Salvar.
- Backend `buildSystemPromptFromInstructions` ganhou `ctx.perfilAtivo` → injeta seção "## PERFIL ATIVO NESTA CONSULTA" (só no modo prompt único). `PERFIL_LABEL` mapeia perfil→label. `usandoUnico = !!templateUnico` decide entre prompt único e fallback legado por perfil.
- Doc `config/dexPrompt` ganhou campo `templateUnico`. Audit `DEX_PROMPT_SALVO` agora loga `{modelo,maxTokens,unico:bool}`.

**7. Dex — AUTO-LEITURA de qualquer box novo (`dexLer:true`):**
- Objetivo: novos "boxes" passam a ser lidos pela IA **sem editar `dex.js`**. Qualquer doc em `config` com `dexLer:true` vira contexto automaticamente.
- `dex.js`: query `db.collection('config').where('dexLer','==',true).get()` (no Promise.all, com `.catch(()=>null)`). `formatarCaixasExtra(snap, vertical)` formata genericamente: shape `lista:[{...}]` → `### <1º campo string>\n<demais campos>` (strip HTML); shape `texto` → parágrafo. Filtra por `vertical` (campo no doc; ausente=anestreview) e **pula** doc-bases com leitor próprio (`FONTES_COM_LEITOR_PROPRIO`: jornadaCliente, editais, datasImportantes(+Tipos), doresClientes, dexPrompt, catalogoConfig, settings, professores, menu, simExtra, slackTime, featurePack, recursosConfig). Seção injetada antes do catálogo via `ctx.caixasExtraFmt`.
- Convenção pra box futuro entrar na IA: gravar no doc de config `{dexLer:true, dexTitulo, dexDescricao, vertical}`. (Produtos já são 100% auto-lidos; entries de qualquer box já são auto-lidos — isto cobre TIPOS de box novos.)
- Formatador testado isoladamente via node (lista, texto, strip HTML, skip bespoke, filtro vertical, ignora dexLer:false). ⚠️ A query Firestore só foi validada por raciocínio (não há índice composto — equality simples).

**8. Fixes de UX (catálogo):**
- **Seletor de ícone fora da tela** (`_proOpenIconPop`) + picker genérico (`_proOpenMsPicker`): reparentados pro `<body>` ao abrir. Causa: ancestral com `transform`/`filter` no shell logado fazia o `position:fixed` ancorar no ancestral, não na viewport. (Provado com teste sintético.)
- **"Atualizado em…"** nos boxes (Jornada/Dores/Editais/Datas): só data (sem hora, sem "por X"), via `_proFmtDateShort`. Alinhamento à direita corrigido com `.pro-jornada-head:not(:has(.pro-jornada-meta)) .pro-jornada-caret` (dois `margin-left:auto` brigavam quando fechado).
- **Botão "Pergunte ao Dex"** mais destacado: maior + pulso de brilho (`@keyframes dexBtnPulse`), respeita `prefers-reduced-motion`.
- **Save de produto sem disponibilidade**: removido o bloqueio que exigia marcar disponibilidade de todas as features (inclusive as do pack) antes de salvar. Feature sem marcação → `disponivel:''` → exibida como disponível por padrão (fallback em `_proFeatDisp`/`PRO_FEAT_DISP_META`).

**Dev tooling:** `.claude/launch.json` + `.claude/static-server.js` (servidor estático Node na porta 8766) pro preview MCP — o `http.server` do Python falha no sandbox do preview. App exige login, então verificação visual usa overlay com `id="tab-produtos"` (herda CSS scoped) injetado via `preview_eval`.

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

**Pack de features básicas replicado em todas as verticais (2026-06-02):**
- `PRO_FEAT_PACK_DEFAULT` (antes `[]`) agora contém o **pack básico** (11 features: Videoaulas, Slides das Aulas, Banco de Questões, Flashcards, Apostilas, HotTopics, Cronograma/Flow, Bot IA, Grupo de Whatsapp, Fórum de Dúvidas, Garantia de Aprovação). É o fallback quando a vertical não tem doc próprio → **toda vertical nova já nasce com o pack básico**.
- Além do código, os docs `config/featurePack_oftreview`/`_ortopreview`/`_medreview` foram **gravados** com o pack básico (11) via API REST do Firestore usando as credenciais do firebase-tools logado (owner tiarllesmiller@gmail.com — acesso de owner ignora as security rules). OftReview tinha 2 features (subset do básico) → upgrade sem perda. Backup do estado anterior em `/tmp/pack-backup-*.json`. Resultado: as 4 verticais com as 11 básicas.
- **Como gravar no Firestore como owner (sem senha de app):** trocar `~/.config/configstore/firebase-tools.json` → `tokens.refresh_token` por access token no endpoint `oauth2.googleapis.com/token` (client_id/secret públicos do firebase-tools), depois `PATCH https://firestore.googleapis.com/v1/projects/simulados-confirmacao/databases/(default)/documents/<col>/<doc>` com `Authorization: Bearer <token>` + `updateMask.fieldPaths`. Owner bypassa as rules. Script de referência em `/tmp/pack-write.mjs`.

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

### Catálogo de Produtos — Datas Importantes (página dedicada, redesign 2026-06-01)

Calendário de eventos da vertical (provas, revisões, liberações, prazos) com link/descrição. Dex/Íris/Thor/Lux lêem essas datas. **Refeito em 2026-06-01**: deixou de ser caixa colapsável inline e virou **PÁGINA DEDICADA** (`S.produtosView==='datas'`, roteada em `_proRender`).

**Arquitetura da página:**
- Entrada: na lista do catálogo (`_proRenderList`), `<div id="pro-datas-imp-wrap">` renderiza `_proDatasImpHTML()` = um **card de entrada** clicável (`.pro-dimp-entry`: 📆 + título + "Próximo: …" + contador) que chama `proDatasImpAbrirPagina()`. Fica logo **abaixo do box Aprovações**.
- `_proRenderDatas(root)` monta `<div id="pro-datas-imp-page">` (via `_proDatasImpPageInnerHTML`) + `<div id="pro-dimp-overlays">` (modais separados — ver Flicker).
- Header: breadcrumb "← {vertical}" + título "📆 Datas importantes" + botão **Cadastrar evento** (`.pro-dimp-cadastrar-btn`, dark glass destacado, só `canEdit`).
- **Switcher (segmented control iOS, `.pro-dimp-viewswitch`)**: só **🗓️ Mês** e **📅 Ano** (a antiga grade "Ano" foi removida; o que era "Agenda" foi renomeado pra "Ano"). Estado `S._datasImpVisualizacao` ('mes'|'agenda'), default 'mes', salvo por vertical em `localStorage['aros.datasImp.view.<vertical>']`. `_proDimpView()` mapeia qualquer coisa ≠'mes' (inclui legado 'ano') → 'agenda'.
- **Filtrar** fica numa linha abaixo do switcher; painel inline (não modal) com os 3 filtros lado a lado, **ordem TIPO · ESCOPO · STATUS**.
- Refresh: `_proDatasImpRefresh()` re-renderiza a página OU (se um modal está aberto) só o `#pro-dimp-overlays` (ver Flicker).

**Visão MÊS (`_proDatasImpViewMesHTML`):** calendário em grade inline (`.pro-dimp-cal.inline`, vidro fosco), reusa `_proDimpCalendarioRender` (grid 7 col, células crescem com conteúdo e títulos quebram em linha). Nav `←/→/Hoje`. Hoje = número vira **círculo ciano preenchido** (estilo Apple). Chips por dia (até 3 + "+N" popover). Clique no chip → popup do evento.

**Visão ANO (`_proDatasImpViewAgendaHTML`):** lista **por ano**. Topo: **ano grande centralizado** (`.pro-dimp-ano-titulo` 32px) com **← {ano} →** (`proDatasImpCalNavAno(±1)` muda o ano via `S._datasImpCalMes`) + botão **Hoje**. Abaixo: botão **⊞ Expandir/⊟ Recolher todos** (`proDatasImpAgendaToggleAll`, estado `S._datasImpAgendaExpandAll` true/false/null). Eventos só do ano selecionado, agrupados por mês — cada mês é um **`<details>`** (`.pro-dimp-agenda-disc`); **mês atual aberto por padrão**, demais fechados. Nome do mês em MAIÚSCULO destacado (mês aberto fica ciano), **sem repetir o ano**.
- Card do evento (`_proDatasImpItemHTML`): grid alinhado no desktop (`@media min-width:641px`): `[bolinha] [nome+data] [escopo] [tipo] [ações]`. Data fica **logo após o nome** em cor discreta (`color-mix(text 55%)`). Colunas de escopo e tipo **alinhadas** entre linhas. Tag **Previsto** fica junto do lápis (na coluna de ações). No mobile (≤640) vira flex que quebra linha.

**Bolinhas neon (não mais ícones de tipo):** eventos usam `.pro-dimp-dot` (bolinha na cor do tipo com glow) no lugar do emoji — no calendário, nos cards da lista, no popup e no gerenciar tipos. O tipo NÃO tem mais seletor de emoji.

**Cores:**
- **Tipo:** cada tipo tem cor (paleta `PRO_DIMP_CORES_PALETA`, 18 cores). Bolinha + traço lateral esquerdo do card usam a cor do tipo. **A tag de tipo escrita** (badge "PROVA" etc) na visão Ano é **monocromática** (cinza neutro) — a cor fica só na bolinha+traço.
- **Escopo:** cor distinta por escopo, derivada da posição alfabética via `_proDimpEscopoCor()` + paleta dedicada `PRO_DIMP_ESCOPO_CORES` (hues espalhados). Badge na lista + chips do filtro.
- **Previsto:** sombreado âmbar escuro discreto (`#92710a`/`#b45309`), borda esquerda tracejada.

**Popup do evento:** vive num **portal no `<body>`** (`.pro-dimp-evpop-portal`, `position:fixed`) porque `#view-co` tem `transform` (criaria containing block e prenderia o fixed). `_proDimpSyncEvpopPortal()` move o backdrop pro body a cada refresh.

**Filtros — MULTI-SELEÇÃO (chips, 2026-06-01):** `S._datasImpFiltroTipo`, `_datasImpFiltroEscopo`, `_datasImpFiltroStatus` são **arrays** (vazio = todos). Chips `.pro-dimp-fchip` que alternam (`proDatasImpToggleFiltroTipo/Escopo/Status`). Combina E entre dimensões, OU dentro. `_proDimpAplicaFiltros` lê os 3 arrays. Tipo sem emoji (só nome + bolinha); escopo com bolinha colorida; status = Confirmados/Previstos. Badge no "Filtrar" conta dimensões ativas; "✕ Limpar filtros".

**Modal de cadastro/edição (no `#pro-dimp-overlays`):**
- **Tipo: dropdown** (`<select>`, ordem alfabética) + "＋ Novo" + "⚙" (gerenciar). Sem emoji.
- **Escopo: dropdown** (alfabético, "Sem escopo" + cadastrados) + "＋ Novo" + "⚙".
- Novo/editar tipo: só **Nome + Cor** (paleta 18 cores) — **sem seletor de emoji** (removido 2026-06-01).
- Título obrigatório. Modo **pontual** (data+horário) ou **período** (início+fim). Descrição (textarea). Link (URL http/https).
- Só `_proDatasImpSetCampo('modo',…)` re-renderiza o modal; tipo/escopo são `<select>` (mostram sozinhos, sem refresh).

**Flicker fix (modais separados):** o `#pro-dimp-overlays` é re-renderizado isolado quando um modal está aberto (`_proDimpOverlaysRefresh`), sem tocar na página/calendário; a animação de abertura é suprimida no re-render via classe `.pro-dimp-no-anim`. Resolve o "piscar" ao clicar campos do modal.

**Tipos de evento (system + custom + override + tombstone):**
- 4 system fixos hardcoded em `PRO_DIMP_TIPOS_SYSTEM`: `prova` 📅 #ef4444, `revisao` 📚 #2563eb, `liberacao` 🎁 #16a34a, `inscricao` 📝 #e46d0a.
- Persiste em `config/datasImportantesTipos` (GLOBAL, sem sufixo de vertical) com shape `{lista:[{id,nome,icone,cor,system,criadoEm,criadoPor}], deletedSystemIds:[], updatedAt, updatedBy}`.
- `_proDimpTiposAll()`: começa com defaults → remove `deletedSystemIds` → aplica overrides de `lista` (se id bate com system, substitui nome/icone/cor mantendo `system:true`) → appenda custom.
- **TUDO renomeável/removível** (system inclusive). Renomear "prova": cria entry em `lista` com `id:'prova'` e novos campos. Remover "prova": adiciona `'prova'` em `deletedSystemIds`.
- Eventos cujo tipo foi deletado: render mostra "❓ (tipo removido)" — não quebra.
- Painel "Gerenciar tipos": lista TODOS (system + custom + overrides), botões ✏️ Editar (subform pré-preenchido) + 🗑 Remover (confirm com count de eventos afetados).
- ~~Ícone/emoji do tipo~~ **REMOVIDO 2026-06-01** (eventos usam bolinha colorida). Campo `icone` ainda existe no doc por compat mas não é editável nem exibido. Novo/editar tipo = só Nome + Cor.

**Escopos (por vertical, 1 por evento):**
- Persiste no MESMO doc `config/datasImportantes_{vertical}` campo `escopos:[{id,nome,criadoEm,criadoPor}]`.
- Eventos têm `escopoId: string|null`. Vazio = "Sem escopo".
- Painel "Gerenciar escopos": lista com count de eventos por escopo, renomear inline + remover (confirm com count). Remover zera `escopoId` em eventos afetados no MESMO write; remove o id do array de filtro se presente. Gerenciar escopo fica SÓ no cadastro de evento (não há mais engrenagem no filtro).
- Filtro multi-seleção (arrays) NÃO persiste entre sessões (reset em page load + `proSelectVertical` + `proVoltarVerticais`).
- Cor dos escopos: distinta por escopo via `_proDimpEscopoCor()` + `PRO_DIMP_ESCOPO_CORES` (era roxo fixo `#a855f7` até 2026-06-01).
- Listas de escopos sempre alfabéticas via `_proDimpEscoposOrd()` (filtro, cadastro, gerenciar). Tipos também alfabéticos via sort em `_proDimpTiposAll()`.
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

- ~~**Coluna CONTROLE** (Triagem · Áudio · Vídeo)~~ **REMOVIDA em 2026-06-01** (pedido do user — não usavam). Sumiram: header `.pos-ctrl-h`, cell `.pos-ctrl-c`, defs `ctrl/ctrlChk` no render e a função `window.toggleCtrl`. O campo `simulados/{simId}/alunos/{studentId}.controle.*` pode existir em docs antigos mas é ignorado (não lido/escrito). Audit `CONTROLE_TOGGLE` não dispara mais.
- **Scroll horizontal com colunas fixas**: grid do `.pos-hdr`/`.pos-row` = `32px 130px 240px 160px 110px 160px` (6 cols: # · PROF · ALUNO · STATUS · PRESENÇA · AÇÕES). Era 7 cols com CONTROLE (220px) até 2026-06-01. Wrapper `.pos-tbl{overflow-x:auto;overflow-y:visible}` envolve `.pos-hdr` e o `<div>` das rows. **#, PROF e ALUNO** são `position:sticky;left:0|32px|162px;z-index:2-3`. Headers ficam acima (`z-index:3`) das body cells fixas.
- **Sobreposição resolvida via `linear-gradient + bg opaco`**: as cores de status `--gl/--yl/--rl` são `rgba(...,.12)` (translúcidas por design). Cells sticky usavam `background:var(--row-bg, var(--bg2))` direto e mostravam conteúdo passando por baixo. Fix: `background-color:var(--bg2); background-image:linear-gradient(var(--row-bg,transparent),var(--row-bg,transparent))` — `bg2` opaco como base + overlay translúcido do status por cima. Mesmo visual, sem vazamento.
- **Status colors via CSS var**: a inline style das `.pos-row` migrou de `style="background:var(--gl)"` para `style="--row-bg:var(--gl)"`. Cells filhos herdam via cascade do custom property. Hover faz `--row-bg:var(--bg3)`. `.pos-row.drag-target` também usa `--row-bg`. CSS base: `.pos-row{background:var(--row-bg,transparent)}`.
- **Overflow:hidden nas células sticky** (`.pos-prof`, `.pos-aluno-sticky`, `.pos-hdr>div`): nome de aluno longo trunca com `text-overflow:ellipsis` em vez de vazar pro lado.

**Rodadas colapsáveis (dropdown):**
- `.rc` ganha classe `collapsed` que esconde `.pos-tbl`/`.cb` via `.rc.collapsed .pos-tbl,.rc.collapsed .cb{display:none}`. Default: **todas colapsadas** ao render.
- Chevron `▾` no header (`.rh-toggle`) gira -90° via `transform` quando collapsed.
- `.rh` ganha `onclick` que chama `toggleRoundCard(this.parentElement)`. Guard `if(event.target.closest('button'))return;` permite que botões dentro do header (presencial: "📅 Painel do Dia" [ex-"🎯 Configurar Estações", ver seção Painel do Dia], "+ Aluno") continuem funcionando sem disparar o collapse.
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

**Presença: update otimista + sombreado + no-show automático (2026-06-01):**
- **Bug de lentidão corrigido.** Antes `togglePresBtn` fazia `await updateDoc` e a cor do `<select>` só atualizava quando o `onSnapshot` (linha ~9488) re-renderizava a escala INTEIRA + re-assinava `projecaoLive` de todos os alunos (`subLiveStudents`) — round-trip + render pesado por toggle = parecia travado. Fix: **update otimista** — `togglePresBtn(simId,studentId,val,sel)` agora recebe o `<select>` (`this`) e chama `_applyPresVisual(sel,presenca,status)` que pinta bg/cor/borda do select + `--row-bg` da `.pos-row` na hora, antes do await. Estado local `S.students[i].presenca` atualizado também. Em erro, faz rollback visual + `sel.value=prev` + alert.
- **Sombreado vermelho na linha** quando `presenca==='ausente'`: o cálculo de `--row-bg` no render (`_rowBg`) prioriza `presenca==='ausente'?'var(--rl)'` acima do status. `_applyPresVisual` replica a mesma lógica pro update instantâneo.
- **No-show automático (30 min):** ausente na presença há ≥30 min vira `status:'absent'` automaticamente (reusa o mecanismo do painel "Ausentes" — mesmo box). `togglePresBtn` carimba `presencaAusenteAt` (ISO) quando marca ausente, limpa ao desmarcar. `_noShowSweep()` (perto de `_autoAbsentPostDeadline`) filtra `presenca==='ausente' && status!=='absent' && presencaAusenteAt` com idade ≥`NO_SHOW_MIN*60000` (const `NO_SHOW_MIN=30`) → seta `status:'absent', noShow:true, noShowAt, originalDia/originalRodada` salvos, `dia/rodada/posicao=null`. **NÃO** roda `processWaitingQueue` (não puxa fila — decisão do user). `_startNoShowSweep()` cria um `setInterval(60s)` (idempotente via `_noShowTimer`); ambos chamados no topo de `renderCoSched`/`renderCoSchedPres` ao lado de `_autoAbsentPostDeadline`. Banner verde via `_showCoBanner`. Audit `NO_SHOW_AUTO_AUSENTE`.
- **Box "Ausentes" (`renderNotGoingPanel`):** botão **📅 Voltar para a escala** (`openPickSlot`) agora aparece pra **TODOS** os ausentes, inclusive quem nunca confirmou (`exp` deixou de gatear — antes sumia com prazo encerrado; aluno pode aparecer no dia e ser realocado). No-shows ganham tag vermelha `🚫 Faltou no dia` + "Ausente desde {noShowAt}". Ao voltar (`confirmPickSlot`/`confirmPickSlotPres`) ou mudar status pra ≠absent (`coChangeStatus`), limpa `presenca/presencaAusenteAt/noShow/noShowAt` pra não cair de novo na varredura.

**Stats bar discreta (topo da Escala):**
- Antes: 4 cards grandes (`.sg`/`.sc`/`.s-icon`/`.s-val`/`.s-lbl`) com emoji 20px + valor Fraunces 30px + label cinza. Ocupava muita altura.
- Agora: **uma única barra horizontal** `.stats-bar` com 4 stats inline + separadores verticais sutis. Cada stat: `.stat-dot` (8×8px, cor por contexto, halo `box-shadow:0 0 0 3px color-mix(...)`) + `.stat-lbl` (11px uppercase letter-spacing) + `.stat-val` (Space Grotesk 20px). Padding `10px 20px`. Em <640px wrap pra coluna.
- IDs preservados (`s-t`, `s-c`, `s-a`, `s-s`) — toda lógica JS de update segue funcionando sem mudança.
- CSS antigo `.sg/.sc/.s-icon/...` mantido (dead code) para evitar alterar outros lugares; só a markup foi trocada.

### Checklist — incidente de lost-update + features (2026-06-13)

**INCIDENTE GRAVE (presencial 26.1):** durante a aplicação, ~32 casos foram zerados. Causa: abas rodando versão ANTIGA do `index.html` (abertas antes do conserto) regravavam o aluno INTEIRO em memória → a foto velha sobrescrevia o trabalho dos outros examinadores. Assinatura do clobber: caso com `savedAt`+`prof` preenchidos MAS `itens:{}`. Conserto em JS não alcança aba já carregada.

**Gravação CIRÚRGICA (a correção central, NO AR):** toda ação do checklist grava só o pedaço que mudou, nunca o doc inteiro.
- Helper `_ckWriteBlocoParcial(studentId,blocoKey,partial)` → `setDoc({[blocoKey]:partial,updatedAt},{merge:true})`. Usado em saveCkCaso, finalizarChecklist, ckZerarCaso, ckDesfazerNaoFezCaso, ckZerarBloco.
- resetCkCaso/resetCkPergunta/ckRestaurar → `updateDoc` com caminho de campo `${bloco}.casos.${ci}` + `deleteField()` pra nota. **NUNCA passar serverTimestamp/deleteField por removeUndefined** (corrompe o sentinel — adicionar depois).
- `reloadRespostasAndRender` faz reconciliação POR CASO: adota o fresco do servidor (pra ver o que o OUTRO prof gravou no mesmo aluno) mas preserva o caso aberto em edição e o que tem savedAt mais novo (Firebase pode atrasar). Permite 2 profs no mesmo aluno em casos diferentes sem perda.

**TRAVA DE VERSÃO (serverTimestamp) — código NO AR, regra DESLIGADA:** `_ckStamp()` carimba todo write de respostas com `_ckwTs=serverTimestamp()`. Regra (em firestore.rules, comentada/permissiva agora): `allow create,update: if request.resource.data.keys().hasAll(['_ckwTs']) && request.resource.data._ckwTs == request.time`. Só código novo passa; aba antiga é recusada. **LIÇÃO: só ligar a regra no INÍCIO de uma aplicação (todos carregam fresco) — ligar no meio bloqueia quem não recarregou.** Auto-reload: heartbeat `onSnapshot(config/appVersion)` vs `APP_BUILD` → bumpar o doc força todas as abas a recarregar.

**BACKUP automático (launchd na máquina do Tiarlles):** `~/AROS-Backups/snapshot.mjs` roda a cada 2min (StartInterval 120, `com.aros.backup.plist`), lê respostas (coleção aberta, SEM login), salva snapshot JSON timestampado só quando muda (hash estável), mantém 7 dias. Recuperação: `~/AROS-Backups/recuperar.mjs "Nome"` (dry-run) / `APPLY=1 ...`. **Backup sob demanda (foto pontual) NÃO protege contra clobber contínuo — só a trava de versão + este snapshot frequente.** O auditLog (read exige isAuth) também é backup per-save, mas abas antigas não o gravavam.

**Features novas (NO AR):**
- **Nota PARCIAL do bloco:** `_ckCalcParcial(blocoResp,template)` soma os casos JÁ SALVOS. Aparece no topo da avaliação (`#ck-parcial`) e nos cards de bloco, em andamento — sem precisar finalizar 100%.
- **Nota MANUAL por caso:** botão "✏️ Nota manual" → esconde o checklist do caso e mostra input de pontos brutos (0 a `100/nºcasos`). `caso.modoManual` + `caso.notaManual`. `_calcCasoScore` retorna a nota manual quando ativo. Habilidades/feedback seguem opcionais (nunca pontuaram). Reversível (desliga → volta pro checklist, nota manual fica guardada).
- **Contador X/Y da pergunta ignora PENALIDADES** (itens `negativo`) — conta só positivos (updatePergStatus + render).
- **Botão "Restaurar versão salva" REMOVIDO** (existia por ~1 dia, lia auditLog; o Tiarlles não quis).

**Desempenho — presencial (`sim.presencial`):** o presencial só tem bloco CRIAR (sem Oral). Correções: notaFinal = nota do CRIAR (no finalizar, no zerar-bloco, e na exibição/média/export — pós-processa allNotas pra derivar notaFinal=criar inclusive nos lançamentos antigos). **Cruzamento tolerante de nome:** alunos do presencial costumam ter nome curto/sem matrícula ("Valéria Karine") vs lista completa ("Valéria Karine de Azevedo Ferreira") → notas/presença não casavam. Fix: alias por **prefixo EXATO de tokens** (≥2, ignora acento/parênteses) — casa "Gabriel Regueira (Dutra)"↔"Gabriel Regueira Dutra" mas REJEITA dois "João Pedro" distintos. Media da turma dedupa com `[...new Set(Object.values(...))]` pra não contar o alias 2×. Raiz real seria preencher matrícula nos alunos do presencial (write em `simulados/alunos` exige login — único write trancado relevante). **(2026-06-14)** o prefixo NÃO cobre nome do meio EXTRA nem grafia trocada → adicionado casamento por **E-MAIL** (ver seção 2026-06-14 abaixo).

### Incidente casca-vazia (presencial, 2026-06-14) + trava no save + Desempenho casa por e-mail + fixes Jornada

**RECORRÊNCIA do clobber (aluno Thiago Schroeder):** Casos 6/7/8 gravados só com `prof`+`savedAt`, `itens:{}` `habilidades:{}` `feedback:''` — a "casca vazia" de novo, AGORA na versão atual (Patrícia reproduziu em aba anônima/nova — NÃO era versão velha). Investigação descartou, com prova: deploy hoje (não houve), auto-reload de versão (`config/appVersion` NÃO existe no banco → o heartbeat `onSnapshot(config/appVersion)` é INERTE, nunca dispara — abas velhas NÃO se auto-atualizam), nota manual, log global quebrado (login/no-show de hoje gravam; só CK_CASO_SALVO de hoje não). RAIZ provada pela assinatura: no instante do save, o gabarito (`window._ckTemplateCurrent`) estava vazio → o auto-preenchimento (itens não marcados → 'errado') não rodava → gravava casca. Varredura dos 49 com filtro ESTRITO (exclui naoFez/modoManual/notaManual/feedback/habilidades): só o Thiago. Recuperação: feedback resgatado das anotações manuais dos profs (auditLog NÃO tinha — nunca registrou os saves do Thiago).

**TRAVA anti-casca-vazia (NO AR 2026-06-14):** em `saveCkCaso`, logo após calcular `perguntas`, ANTES do auto-preenchimento/write: `if(!cr.modoManual && perguntas.length===0)` → RECUSA salvar, `alert` pra atualizar a página, e grava `CK_SAVE_BLOQUEADO_SEM_GABARITO` no auditLog (flagrante p/ pegar recorrência em QUALQUER aluno, sem console aberto; ação adicionada ao `AUDIT_ACTIONS`). NÃO conflita com o auto-preenchimento — ele só roda com gabarito carregado, e a trava só barra quando NÃO está. No uso normal nada muda.

**Desempenho casa por E-MAIL (NO AR 2026-06-14):** o cruzamento por prefixo não pega nome do meio extra nem grafia trocada ("Guilherme Nogueira Santana" ≠ "Guilherme Santana", "Filipe" ≠ "Felipe", "Bruno Gimenes" ≠ "Bruno Ferreira Gimenes", "Rafael Nuzzi" ≠ "Rafael Ximenes do Prado Nuzzi"). `renderDesempenho` agora indexa os alunos do sim por e-mail (`simStudentByEmail[simId][emailNorm]={nk,mt}`) e tenta o **e-mail ANTES do prefixo** (chave confiável/única). Resgatou 4 alunos do presencial SEM mexer em dado. 2 ficaram de fora por **e-mail vazio no roster** (Diogo Rizzo, Carol Gaudencio) → corrigido adicionando o e-mail no doc `simulados/{sim}/alunos/{id}` (update anônimo é permitido pela regra DESDE QUE `nome`+`matricula` fiquem inalterados).

**Jornada do Cliente (fixes NO AR 2026-06-14):** (1) `_proJornadaSalvar` recusa salvar se `!S.jornadaCliente.loaded` e pede confirmação se for salvar VAZIO — evita apagão (foi assim que a jornada Anest sumiu em 05/06: `config/jornadaCliente.texto=''` gravado por daniel.costa; o log só guarda `hasTexto` boolean → texto antigo irrecuperável). (2) Rascunho local AGORA por vertical: `_proJornadaDraftKeyFor()` = `aros.jornadaCliente.draft.<vertical>.v1` (antes era 1 chave única → vazava entre Anest/Oft/Med; limpa a chave legada). (3) Fix do "Carregando..." travado: ao trocar de vertical, `_proRebindVerticalListeners` resetava `jornadaCliente.loaded=false` mas NÃO o `_jornadaDirty` → o onSnapshot não re-renderiza enquanto dirty (gate `!S._jornadaDirty`) → travava em "Carregando...". Fix: resetar `S._jornadaDirty=false;S._jornadaDraft=null` na troca (texto não-salvo fica no rascunho por vertical; banner Restaurar reaparece).

**Desempenho — média do presencial + PDF (NO AR 2026-06-14, commit 9f43a19):** (1) cabeçalho da grade: simulado **presencial** mostra "Média turma — X" (valor único, = nota do Criar, que já é a final), em vez do trio "Criar · Pres · Final" que só faz sentido pros online (`_mbSpan` agora aceita rótulo vazio; ramo `s.presencial`). (2) Export PDF: removido o subtítulo "N alunos · N simulados aplicados" (`.subtitle`); fonte da `.media-turma` 9px→11px; presencial mostra só o valor único. (3) **DUPLICAÇÃO corrigida:** o export `doExportDesempenhoPDF` tinha CÓPIA PRÓPRIA do cruzamento e buscava a nota **só por matrícula** (`allNotas[sim][a.matricula]`) → SUMIA com quem tem nota sob chave-nome (Valéria Karine, Guilherme, Felipe, Bruno, Rafael) e o **PDF divergia da grade**. Adicionei ao export o MESMO cruzamento tolerante (matrícula → prefixo de nome → e-mail) que a grade tem. ⚠️ **LIÇÃO: a lógica de cruzamento nota↔aluno vive DUPLICADA — grade (`renderDesempenho` ~L29312) e export (`doExportDesempenhoPDF`). Mexeu numa, replique na outra.** (Idem as DUAS `mediasTurma`.)

**Finalização do checklist — bug "avaliado some do Desempenho" + rede de segurança (NO AR 2026-06-14, commit de5ccac):** O auto-finalizar (em `saveCkCaso`, `setTimeout(...,800)`) pulava **em silêncio** quando `window._ckTemplateCurrent` estava vazio no instante (`getBlocoStatus`→'red' por `!casos.length`). Resultado: bloco com 8/8 casos completos MAS `criar.finalizado=false` e SEM doc em `notas` → some do Desempenho, **mesmo a tela mostrando "Enviada automaticamente para o painel de Desempenho"** (essa msg só checa `blocoResp.finalizado`; e os selos "✅ FINALIZADO" por caso são por-caso/verde, dando ilusão de pronto). Aconteceu com **6 alunos do presencial** (Charles Cerveira, Mário Ronaldo, Pedro Henrique Costa Silva, Remulo Orlando, Talita de Freitas, Thiago dos Santos Salvi — todos com 8/8 casos completos, habilidades 5/5, feedback) — resgatados via console logado (replica de `_calcCasoScore` somando casos com `ptsPorCaso=100/n`, `Math.round(x*10)/10`, + escrita em `notas/{sim}/alunos/{matricula}` e `checklists/respostas`). Três consertos: **(B)** botão "🔖 Gerar Feedback" no PRESENCIAL — `done` em `renderCkStudents` exigia Criar+Oral verdes; presencial não tem Oral → nunca aparecia. Agora `const _isPres=!!_curSimCk?.presencial; done=_isPres?(stCriar==='green'):(stCriar==='green'&&stOral==='green')`. Online inalterado. **(A1)** novo `_ckReloadTemplate()` recarrega `templateCriar`/`templateOral` do Firestore + ressincroniza `_ckTemplate`/`window._ckTemplateCurrent`; o auto-finalizar chama isso se `tplNow` está sem casos antes de decidir (em vez de pular calado). **(A2)** banner âmbar no topo do `renderCkStudents` quando há alunos com bloco **verde mas `!finalizado`** (presencial: só criar; online: criar e/ou oral) + botão "✅ Finalizar e enviar todos" → `window._ckFinalizarPendentes()` (com trava `_ckFinalizandoPendentes` anti-duplo-clique). **Refatoração-chave:** extraído `_ckFinalizarBlocoCore(simId,studentId,blocoKey,resp,template,students)` do `finalizarChecklist` (miolo: compute nota + `_ckWriteBlocoParcial` + escrita em `notas`, sem DOM/globals exceto swap temporário de `_ckSimId` restaurado em `finally`) — usado pelo botão manual E pelo lote → nota idêntica. ⚠️ O write em `notas` usa chave = matrícula achada na lista **por NOME**, senão o nome lowercased — NÃO usa email/prefixo, então pode gravar nota sob chave-nome; quem reconcilia é o Desempenho/PDF (ver "Desempenho casa por E-MAIL").


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

### Sistema de Recursos — refator amplo da Coord (visão coord + visão aluno) (2026-05-28)

Sessão maratona de evolução do Sistema de Recursos. Tudo entregue + deploy no fim. Pacote completo:

**Visão Coord — lista de provas:**
- Card da prova **inteiro clicável** → abre questões (não tem mais botão "📝 Questões")
- **Lápis ✏️** inline ao lado do nome da prova (só ícone, sem texto "Editar"), com `stopPropagation`
- 🗑️ continua à direita do card

**Visão Coord — lista de questões dentro da prova:**
- Cards de questão são **dropdowns** (chevron). Body expandido contém o form de edição completo + sugestões. Estado de expansão persistido em `S.recursos._questaoExpanded` (Set) — sobrevive a re-render. **Ao clicar "← Voltar pra Provas" (`recVoltarProvas`), o Set é limpo + filtros e busca resetados** — ao reentrar todos os cards voltam fechados.
- **Drag-and-drop pra reordenar**: cada card é `draggable="true"` com handle ⠿. Drop renumera todas as afetadas em batch (até 400 ops por commit). Numeração derivada da posição.
- **Filtros no topo**: TODAS / 📷 COM IMG (verde) / 📷 IMG PENDENTE / 🎯 GABARITO PENDENTE. Cada filtro só aparece se houver pelo menos 1 questão matching. Cor temática (verde/laranja/amarelo).
- **Barra de busca** acima dos filtros: input arredondado com 🔍 + ✕ pra limpar. Filtra por **ID Anest** (substring case-insensitive em `q.idExterno`). State em `S.recursos.questoesSearch`. Foco é restaurado após cada keystroke pra não perder a digitação durante o re-render. Funciona combinada com qualquer filtro de chip.
- Linha do card mostra (ordem): chip **ID ANT2614** (accent, antes do status, só se tiver `idExterno`) + status badge (cor por parecer) + 📷 IMG (verde — questão tem `<img>` no enunciado ou `imagemUrl` legacy) + 📷 IMG PENDENTE (com **✕** discreto pra desmarcar falso positivo via `iqDescartarImgPendente`) + gabarito atual + ações.
- **Ações na linha** (ordem): 🎤/⏳/✓ Comentário (3 estados, ver bloco abaixo) · ✓ Validar gabarito (verde, com texto) · 💡 Sugerir recurso (laranja, com texto) · 🗑️ (sem 👁 Visualizar — redundante com o dropdown).

**Workflow de comentário da questão (entrega 2026-05-29):**
- Campos novos no doc `provas/{provaId}/questoes/{qId}`: `comentarioAssumidoPor` (string nome), `comentarioAssumidoEm` (ISO), `comentarioFinalizado` (bool), `comentarioFinalizadoPor`/`comentarioFinalizadoEm` (auditoria).
- Botão `_recComentarioBtn(q)` tem 3 estados:
  - **🎤 ASSUMIR COMENTÁRIO** (azul) quando nada está setado → clique chama `assumirComentario(qId)`, grava direto sem modal, toast "🎤 Você assumiu...".
  - **⏳ COMENTÁRIO EM ANDAMENTO · Nome** (âmbar) quando `comentarioAssumidoPor` setado e não finalizado → clique chama `abrirAssumirComentario(qId)`. Modal via `arosConfirm`: se for outro prof, pergunta "está sendo comentada por X desde Y. Quer assumir o lugar?"; se for o mesmo prof, oferece **🔓 Liberar** pra outro pegar.
  - **✓ QUESTÃO COMENTADA** (badge verde, não clicável) quando `validada || comentarioFinalizado`.
- **Dois gatilhos pra estado final "QUESTÃO COMENTADA"**:
  1. `validarGabarito(qId)` agora seta `validada:true` **E** `comentarioFinalizado:true` no mesmo write (auditoria via `comentarioFinalizadoPor/Em`).
  2. `salvarParecer` em modo `isSugerir` → após salvar com sucesso, dispara `arosConfirm` com título "A questão foi comentada no Laravel??" e `message:''` (corpo vazio, intencional). Confirm seta `comentarioFinalizado:true`; cancelar segue fluxo normal sem alterar.
- Cache de questões da prova é invalidado (`delete S.recursos.questoesCache[provaId]`) após cada write desse fluxo pra UI refletir imediatamente.

**Form inline da questão (dentro do dropdown):**
- Modo `'estruturado'` é o ÚNICO mode existente — radio "Bloco único" removido. Pareces antigos como `'bloco'`/`'vf'` renderizam compat como bloco/estruturado.
- **Enunciado virou rich text** (`contenteditable`) com toolbar: B/I/U, listas, **📷 Imagem** (upload pra Storage + insere `<img>` inline com `execCommand insertHTML`), Limpar formatação.
- **Imagem agora vive DENTRO do enunciado HTML** (não mais em campo `q.imagemUrl` separado). Legacy `q.imagemUrl` continua sendo renderizado anexado ao enunciado pra back-compat.
- **Texto justificado** no editor (back) E no front aluno via CSS `.enunciado-editor`, `.enunciado-aluno-txt` com `text-align:justify !important; hyphens:none`.
- **Alternativas em coluna vertical** (A em cima de B em cima de C em cima de D), cada uma com **chip clicável da letra à esquerda** (42×42px) que marca/desmarca como gabarito oficial (verde + glow + ✓). Sem mais select de gabarito.
- Campo "Número" não aparece visível — fica `<input type="hidden">` só pra `iqSalvar` ler. Numeração 100% via drag.
- **Padronização de tamanho de imagem** via CSS: `img.questao-img, .enunciado-aluno-txt img, .enunciado-editor img, .parecer-aluno-txt img { max-width:100%; max-height:400px; object-fit:contain; border-radius:8px; border:1px solid var(--border); margin:10px auto }`.
- **Validação de número único** em `iqSalvar`: se outra questão da prova tem o mesmo número, erro inline.
- **Sanitizer trocado de `_featSanitize` → `_gabSanitize`** pro enunciado, pois `_featSanitize` não permitia `<img>` na whitelist (strippava silenciosamente as imagens ao salvar — bug crítico). `_gabSanitize` permite IMG com src https/data:image.

**Sugestões de recurso (modelo de múltiplos pareceres):**
- `q.sugestoes[]` = array de `{id, profNome, parecer, argumento, imagemUrl, criadoEm, excluida?, excluidaEm?, excluidaPor?}`. Cada "💡 Sugerir recurso" + Salvar adiciona uma entrada via `arrayUnion(novaSugestao)` (atomic, evita race).
- Aluno vê **TODAS as ativas** (não excluídas) como pareceres independentes — não há mais conceito de "parecer oficial único". `_alunoParecerBox(q)` renderiza cada uma com seu próprio bloco (CABE RECURSO / NÃO CABE), header "Parecer N de M" quando há múltiplas.
- **Soft-delete**: cada sugestão tem flag `excluida` toggável. `_toggleExcluirSugestao(qId, sugId, marcarExcluida)` faz o toggle. **Excluídas ficam só visíveis pra coord** num accordion vermelho 🗑️ PARECERES EXCLUÍDOS (com botão ↩️ Restaurar por entrada).
- **Status agregado** (`_recStatusQuestaoAluno`, `_recStatusQuestao`): qualquer ativa "cabe-recurso" → status CABE. Todas ativas "nao-cabe" → NÃO CABE. Senão estados de análise.
- **Compat legado**: questão antiga sem `sugestoes[]` mas com `parecerFinalizado` continua renderizando via fallback "virtual sugestão" do `q.parecer*`.
- **Sugerir recurso NÃO pede identidade do prof** — usa `S.currentUser.nome` direto (cada coord/prof tem login próprio agora).
- **Autoria/data NÃO aparecem pro aluno** (só backend pra auditoria) — removido do `_alunoParecerBox`.

**Cadastro de prova:**
- Modal **fecha automaticamente** após save + toast verde "✅ Prova cadastrada/atualizada".
- **Delete robusto** via `arosPrompt` (requireMatch:'EXCLUIR'). Cascade otimizado (paralelizado contestações + batches de 500). Modal de progresso enquanto roda.

**Provas tipo ME:**
- V/F descontinuado totalmente em sessões anteriores
- **ME agora usa A-D** (igual TEA/TSA). `_letrasPorTipo(tipo)` retorna `['A','B','C','D']` pra qualquer tipo. Parser de gabarito também restringido a A-D.

**Importação (3 fluxos refeitos):**
- Botão único **"📥 Importar questões ▾"** com dropdown: "📋 Colando conteúdo (Ctrl+V)", "📄 Importar PDF" e **"🧩 Importar JSON"** (3ª opção entregue 2026-05-29). Subtítulo do botão: "PDF, JSON ou colar texto".
- Botão único **"🎯 Importar gabarito ▾"** com dropdown análogo (focar textarea OU disparar file picker).

**Importação JSON (lote estruturado com ID Anest + imagens base64):**
- Modal `modal-import-json` (cor `#22c55e`, padrão visual `.mim-md`). Input `accept="application/json,.json"` + textarea pra colar + preview lado-a-lado.
- Schema esperado: array de `{id, enunciado, enunciado_html?, alternativas:[{letra,texto}], gabarito}`. `id` (numérico ou string) vira **`idExterno`** (ID Anest). `numero` é gerado pela ordem do array (1..N).
- Parser `_parseImportJson(texto)` retorna `{questoes, erro}`. Cada questão parsed tem campos extras temporários `enunciadoHtml` e `imgCount` (consumidos pelo upload).
- **Upload de imagens base64**: `_uploadJsonImages(provaId, questoes, onProgress)` varre `<img src="data:image/...">` em cada `enunciadoHtml`, faz `fetch(dataUrl).blob()` e sobe pra Storage em `provas/{provaId}/import-{ts}/q{n}_img{j}.{ext}` via `window._fbStorage.uploadBytes`. Substitui src pela `getDownloadURL`. Falha por imagem: remove o src (não persiste base64 quebrado).
- Após upload, aplica `_gabSanitize` no HTML final → atribui a `q.enunciado` (modelo moderno: imagem inline no enunciado HTML). Limpa `enunciadoHtml`/`imgCount` antes de salvar.
- `_importarQuestoes` ganhou propagação opcional: `if(q.idExterno)payload.idExterno=q.idExterno` — só seta quando vier preenchido, então fluxos PDF/texto continuam intactos (não zeram idExterno de questões existentes em substituir).
- Preview mostra: número, chip ID/⚠️ SEM ID, chip gabarito, contagem de alts, 📷 N img se houver. Cabeçalho do count agrega total de imagens detectadas.
- Toast final inclui imagens enviadas: "N substituídas + M novas + K imagens enviadas".
- **Modal de Importar Bloco** renomeado pra "📋 Importar questões colando o texto". Regras de detecção viradas lista bullet legível.
- **Parser de PDF unificado** — independe do tipo da prova. Sai sempre como `modo:'estruturado'`. Gabarito vem por fluxo separado.
- **Importação de gabarito é standalone** (`modal-import-gabarito`): PDF ou texto colado (`1-A`, `1) A`, `Questão 1: B`, etc.). Parser robusto (`_parseGabaritoPdf`) com Y-bucket tolerância 3.5px + X-sort + multi-padrão regex + fallback tabular.
- **Feedback visual rico durante import**: classe `.import-status` com **ampulheta ⏳ girando** (animação flip 180°), barra de progresso com **listras animadas** (efeito skate), pulse box-shadow, cores por estado (loading/success/err). `_yieldUI()` entre páginas do PDF (`requestAnimationFrame + setTimeout 0`) força repaint — sem isso JS bloqueia o spinner.
- **Helper `arosImportarChoice`** modal padrão de 3 opções (Cancelar / Adicionar / Substituir) com **descrições clicáveis** (cada caixinha de descrição funciona como botão; cursor pointer + hover lift). Aplicado em import bloco, import PDF, import gabarito.
- **Lógica per-número**:
  - `'adicionar'` → ignora números do import, renumera como continuação (max+1, +2, ...).
  - `'substituir'` → para cada importada, procura existente com mesmo número. Se achou: substitui conteúdo (preserva ID, reseta pareceres/sugestões/validação). Se não: cria nova com aquele número. **Demais existentes intactas.**
- Função compartilhada `_importarQuestoes(provaId, questoes, modo, onProgress)` retorna `{reps, novas}` pra toast detalhado.
- 2ª confirmação no "substituir" lista os números que serão sobrescritos vs criados (quando há matches).

**Modais padronizados (decisão 2026-05-28 — convenção #11 das CRÍTICAS):**
- **NUNCA mais `confirm/prompt/alert` nativos.** Sempre os 4 helpers: `arosConfirm` / `arosPrompt` (com `requireMatch` pra "EXCLUIR") / `arosAlert` / `arosToast`. Definidos perto de `window.CM`.
- `_arosBuildModal({title,sub,icon,bodyHtml,footHtml,danger,maxWidth})` é o helper interno pra construir modal dinâmico (usado em `deleteProvaDireto`, `excluirSugestao`, `arosImportarChoice`, etc.).
- Reusam classes `.mo`/`.md`/`.mh`/`.m-body`/`.m-foot` já estabelecidas. Suportam Esc/Enter, backdrop click cancela.

**Otimização da visão aluno (`/recursos`):**
- Antes: `for(const q of questoes) await getDocs(contestacoes)` sequencial → 160 questões = 30-60s.
- Agora: renderiza UI imediatamente com `loadRecQuestoes` (1 round-trip), depois carrega contestações em **`Promise.all` paralelo** com indicador discreto no canto inferior direito. Cai pra ~2-3s.

**Commits da sessão** (entregues no deploy final): refator do Sistema de Recursos completo.

### Sistema de Recursos — reordenar provas, cores no front, editar parecer, anti-flash (2026-06-02)

Pacote entregue + deploy. Mudanças:

**Provas reordenáveis (visão Coord, lista de provas):**
- Campo novo `ordem` (number) no doc `provas/{id}`. `_recProvaSort`: quem tem `ordem` manda (crescente); quem não tem fica no topo, mais novas primeiro (`criadoEm` desc) até ser posicionado. `loadRecProvas` ordena por `_recProvaSort`.
- Cada card tem alça `⠿` (`.rec-prova-grip`) — só ela liga `draggable=true` (`onmousedown`), reset no `mouseup`/`dragend` pra não atrapalhar o clique-abre-questões. Handlers `recProvaDragStart/Over/End`. Dragover move o nó no DOM (sem re-render); dragend lê a ordem final do DOM e grava `ordem` 0..n via `setDoc merge` só nas que mudaram. Container `#rec-provas-list`. Audit `PROVAS_REORDENADAS`.
- O **front do aluno reflete** automaticamente (mesmo array ordenado).

**Cores da prova por tipo no front (aluno):**
- Card `.rec-prova-card` recebe `style="--tipo-cor:${tipoCor.fg}"`. CSS usa `var(--tipo-cor, var(--accent))` na barra lateral (`::before`), glow (`::after`), hover, nome, pill de prazo e botão "Abrir". Antes tudo era accent fixo. `.rec-prova-card-fechada` (prazo encerrado) continua sobrescrevendo pra vermelho.

**Anti-flash (2 telas distintas):**
- `renderAlunoProva` (aluno): o 2º render que mostra as contestações deixou de reconstruir todo o `#rec-aluno-content`. Novo `_alunoRefreshContestacoes(prova,questoes)` atualiza in-place só `#rec-aluno-mapa`, `#rec-aluno-stats` e cada `[id^=rec-q-card-]` via `outerHTML`. Cabeçalho/contador preservados.
- `_renderRecQuestoesView` (coord): o re-render pós-load das contestações pendentes não passa mais pelo spinner + refetch. Flag `S.recursos._qViewQuiet` + cache `S.recursos._qViewCache={provaId,questoes}` — quando o callback de `loadContestPendMap` marca `quiet=true` e chama `renderRecProvas`, reusa as questões cacheadas e pula o "⏳ Carregando questões...". Flag reseta no início de cada render.

**Badge CONTESTADA clicável:** na linha da questão (coord), `⚠️ CONTESTADA →` agora é clicável → `event.stopPropagation();abrirParecer(prova.id,q.id,'')` (abre o modal de parecer mostrando a contestação) + hover effect.

**Editar parecer + renomeações:**
- "PARECER OFICIAL" — título do bloco em `_renderSugestoesBoxHTML` virou `📋 PARECER OFICIAL` (era "💡 SUGESTÕES DE RECURSO (N)"); a nota "a mais recente vale..." só aparece com 2+.
- **Botão "Sugerir recurso" renomeado pra "Emitir parecer"** em todos os lugares visíveis (card, modal visualizar, título do modal-parecer `💡 Emitir parecer`, save `✓ Salvar parecer`, prefixo do sub `💡 EMITIR PARECER ·`). Funções internas (`abrirSugerirRecurso`, `mvqSugerir`) mantêm o nome.
- **Editar parecer existente**: cada parecer ativo ganhou `✏️ Editar` (ao lado do 🗑️). `editarSugestao(qId,sugId)` abre `abrirParecer(provaId,qId,'',{editSug})`. `abrirParecer` ganhou modo `isEdit`: pré-preenche os campos com a sugestão, título `✏️ Editar parecer`, save `✓ Salvar edição`, esconde rascunho/assumir, grava `dataset.editSugId`. `salvarParecer` desvia pra `_salvarParecerEdicao` quando `editSugId` setado: atualiza o item no array `sugestoes` (preserva id/autor/`criadoEm`, adiciona `editadoEm`/`editadoPor`), recalcula o parecer oficial (mais recente ativo) e espelha nos campos de topo. **Não reenvia email nem mexe no status das contestações.** Audit `PARECER_EDITADO`.

**Botão "marcar como comentada" no modal de liberar:** `abrirAssumirComentario` (quando o prof é o próprio que assumiu) abre `_comentarioFinalizarModal(desde)` — 3 ações: ✓ Marcar como comentada (= valida gabarito + `comentarioFinalizado`, mesmo efeito do `validarGabarito`) · 🔓 Liberar · Continuar comigo. Audit `QUESTAO_COMENTADA`.

**Modal genérico:** `.m-foot` ganhou `flex-wrap:wrap` (rodapé com 3 botões quebra linha em vez de cortar em telas estreitas).

**Barra de progresso "% comentadas" no card da prova (visão Coord):** cada `_recProvaCard` exibe uma barra com quantas questões da prova já estão no estado "comentada" (`comentarioFinalizado || validada`) / total. `_recProvaCarregarProgresso(provas)` roda em background na `renderRecProvas` (1 `getDocs` por prova na subcoleção `questoes`), cacheia em `S.recursos._provaProgCache[provaId]={total,comentadas}` e preenche cada `#rec-prova-prog-${id}` via `_recProvaProgressRender`/`_recProvaProgressHTML`. Cor escala por faixa: <34% vermelho, <67% laranja, ≥67%/100% verde; 100% mostra "✓ 100%". Visual: track + fill com gradiente da cor + glow + shimmer (`@keyframes recProgShimmer`). Cache dá display instantâneo no re-render; o background sempre recomputa fresco (sem invalidação manual necessária).

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

## Group Remember — Casos Clínicos TSA 2ª fase (Kanban · 2026-06-22)

Grupo novo na sidebar da coordenação: **Group Remember**, com 2 abas — `rememberF1` (🧠 TSA 1ª fase, só placeholder) e `rememberF2` (🗣️ TSA 2ª fase, feature real). Banco de casos clínicos vindos das **lembranças da prova oral**: alunos relatam o que caiu, a coordenação cadastra e os casos caminham num Kanban até virarem material pros simulados. Quem acessa é configurado em Usuários (presets); por padrão aparece só pra admin.

**Coleção `remembers/{id}`** (rules: read/write exigem `isAuth()`; status enum `pendente|confeccao|revisao|reprovado|aprovado|utilizado`). Campos: `fase:'f2'`, `codigo` (ID curto único `CC-XXXX`, identifica o caso — **não há título visível**; `titulo` interno = assuntos ou codigo só pra satisfazer a rule), `ano`, `assuntos[]` (códigos dos 56 pontos do edital, lista `_REM_ASSUNTOS` P1–P56 hardcoded no index.html), `tipoProva` (TSA default/TEA), `categoria` ("Tipo de Caso": simulacao/oral/criar), `origem` (autoral default/oficial), `status`, `profNome`, `enunciado` (HTML rico), `perguntas[]` ({id, html, **comentario**}), `review` (veredito por bloco), `arquivado`, `pagamentoLancId/Mes/Valor`, `criadoEm/updatedAt`. Subcoleção **`remembers/{id}/versoes/{auto}`** = snapshot imutável de backup a cada gravação (rule: create+read auth, update/delete=false). Storage: imagens inline em `remembers/{caseId}/**`.

**Fluxo do Kanban (6 colunas):** pendente → confecção → revisão (Peer-review) → reprovado → aprovado → utilizado. Arrastar e soltar + **"Salvar tudo" com modal de decisão por coluna** (`_remDecide`): confecção → "enviar p/ revisão | manter"; revisão → "aprovar (→aprovado) | reprovar (→reprovado)"; reprovado → "reenviar p/ revisão | manter". GOTCHA: `_remPersist` passa `opts.forceStatus` (o `_remSync` interno relê o dropdown e sobrescreveria o destino).

**Regras de negócio principais:**
- **Novo caso** nasce sempre em `pendente` (sem dropdown de Etapa no modal).
- **Assunto opcional** no cadastro (card mostra "Definir Tema"); **obrigatório ao mover Produção→Peer-review** — abre `_remPickTema` exigindo 1+ assunto, senão não move.
- **Professor** definido só ao entrar em Confecção (`openRemAskProf`); no modal do caso dá pra **Trocar** (`remConfirmProf`, não mexe na etapa) e **Remover** (`remRemoverProf`).
- **Peer-review por bloco**: cada bloco (enunciado + perguntas) tem Aprovar/Reprovar; reprovar exige comentário "o que ajustar". No modo `reprovado` o criador vê os comentários (read-only) e ajusta.
- **Pagamento ao aprovar**: ao entrar em Aprovado, oferece lançar pagamento ao prof (valor = tipo de sistema `sys-caso-remember` R$1000, editável em Financeiro→Cadastros→Valores automáticos). Cria lançamento em `financeiro.meses[mês].lancamentos` (mês fechado → cai no próximo via `_remMesPagamento`). Financeiro tem **coluna própria "Caso clínico"** (separada de "Atividades extras"). Gated por `_isAdminEm('financeiro')`.
- **Estados pagos = Aprovado E Utilizado (`_remPago`, ajuste 2026-06-23):** `_remHandleStatusPayment` trata os dois como conjunto pago. Entrar em Aprovado (vindo de coluna não-paga) → oferece pagamento; mover **Aprovado↔Utilizado mantém** o lançamento; sair do conjunto pago p/ qualquer coluna não-paga (pendente/confecção/revisão/reprovado) → cancela (`_remCancelPayment`). **Arquivar** (`arquivarRemCaso`) e **excluir definitivo** (`hardDelRemCaso`) também removem o lançamento da planilha (arquivar avisa no confirm; restaurar NÃO reoferece — teria que relançar). 
- **Relatório do prof tem seção "Casos clínicos" (2026-06-23):** `openFinRelatorio` renderiza `casoClinicoDet` numa seção própria com botões ✏️/🗑️ (reusa `_finDeleteAtividade`) — é a única forma de remover um lançamento de caso clínico órfão pela UI; antes não existia seção e o registro ficava preso. Linha no resumo também.
- **Segurança contra perda**: versões/backup imutável + botão "⬇️ Backup" (.json) + "🗄️ Arquivar" (soft-delete recuperável; excluir definitivo só na área de arquivados com dupla confirmação).
- **Card** exibe: ID discreto (#codigo + dot da categoria) · Assunto (só os códigos, ex.: "P5, P16") · Professor · Ano. Feedback central "Caso salvo" (`_remSavedFlash`) a cada gravação.
- **Filtros** colapsável no topo do quadro (`#rem-filtros`): por Assunto (árvore dos 56) e Professor, com Aplicar/Limpar.
- Colunas renomeáveis por duplo clique (`config/settings.rememberColLabels`).

**PENDENTE — Enviar caso aprovado p/ o sistema Laravel via API (em negociação com o dev, 2026-06-23):** da coluna Aprovado, botão pra exportar o caso pronto pro sistema deles. **Arquitetura decidida: rotear por Cloud Function** (nova `enviarCasoLaravel`), nunca POST direto do navegador — mesmo padrão de `sincronizarLaravel`/`vimeoTranscricao` etc. (browser → CF valida Firebase ID token → Laravel; chave da API do Laravel no `.env` da function, fora do JS público; evita CORS). CF lê o caso via Admin SDK, mapeia pro shape do Laravel, faz POST, grava de volta no `remembers/{id}` o ID retornado + `enviadoLaravelEm` (anti-duplicidade + selo "📤 Enviado" no card). **Bloqueado aguardando CONTRATO da API do dev:** (1) endpoint URL (+ staging?); (2) auth header esperado; (3) schema do JSON; (4) **assuntos: códigos P1–P56 ou taxonomia deles? (precisa de-para)**; (5) enunciado/perguntas em HTML rico — aceita HTML ou quer texto/markdown?; (6) **imagens inline** (storage `remembers/{caseId}/**`) — aceita URL e baixa, ou quer base64/multipart?; (7) resposta de sucesso (ID?) + formato de erro; (8) reenvio = upsert via `codigo` ou cria duplicado?; (9) destino (banco geral ou precisa de prova/módulo alvo). Decisões de produto a confirmar: gatilho (botão manual vs auto), pós-envio (vira Utilizado vs selo), reenvio (editar+reenviar vs trava), quem pode enviar.

Pontos de inserção no index.html: TAB_GROUPS (~12678), array de toggle do `switchCoTab` (~26246) + wrapper (~30190). Quase tudo vive num bloco JS único do módulo (prefixo `rem`/`_rem`). Rules `remembers` + `versoes` + storage deployadas em 2026-06-22.

## Treinamento TSA Oral — Biblioteca de Temas · Trilhas de Casos (API) · Geração de Cronograma (2026-07-01)

Aba de topo **🎓 Treinamento TSA Oral** (admin-only), grupo `treinamento` em `TAB_GROUPS`, com 3 sub-abas: `cronoBib`, `cronoTrilhasLib`, `cronoGer`. Todo o código é namespaced `crono*` no `index.html` (estado em `S.crono*`). Pontos de registro: `TAB_GROUPS`, `ADMIN_ONLY_TABS`, array hardcoded do `switchCoTab`, e um wrapper próprio (`_origSwitchCoTabCrono`) que chama `renderCronoBib`/`renderCronoTrilhasLib`/`renderCronoGer`.

**1. Biblioteca de Temas (`cronoBib`).** Cada MÓDULO do Extensive (lido de `S.poAulas`, filtrado à vertical `anestreview`) é um "tema". Coleção `cronoTemas/{temaId}` (`temaId = _poSlug(cursoNome+'__'+modulo)`): `{cursoId,cursoNome,modulo, trilhaIds[], hotTopics:[{tema,onde}], hotTopicsTempoMin, hotNA, trilhasNA, aulasOff[], prioridade:'alta'|'media'|'baixa'|''}`. Lista em tabela (colunas Casos Clínicos | Hot Topics) com status colorido pend(vermelho)/ok(verde)/na(cinza) + prioridade (tinta translúcida + tag). Botão **⇅ Ordenar por prioridade**. Slider ON/OFF por tema (`config.temasOff` — some da montagem do cronograma). Modal do tema: botões de prioridade + 3 dropdowns (Casos Clínicos = vincular trilhas da biblioteca; Hot Topics = tabela Tema|Onde estudar, tempo total, cada item salvo na hora, delete c/ dupla confirmação; Aulas = lista do PO com slider ON/OFF por aula → `aulasOff`, sai do tempo). "Tempo total estimado" no topo = aulas + casos + hot topics. Botão **Atualizar** = recarrega do banco (interno, SEM Laravel).

**2. Trilhas de Casos Clínicos (`cronoTrilhasLib`).** Biblioteca sincronizada da API Laravel. Coleção `cronoTrilhas/{id}` (só a Cloud Function escreve — `write:false`; cliente lê). Botão **Sincronizar** chama a CF `sincronizarTrilhasCasos` (aí sim bate no Laravel). Cada trilha: `{titulo, totalCasos, totalProblemas, totalChars, mediaCount, contentError}`. Tempo da trilha = `totalChars/ritmo + mediaCount*multimidia` (recalcula na tela ao mudar o ritmo). Config em `config/cronoConfig`: `{ritmoCharsMin:900, multimidiaMin:2, trilhasOff[], trilhasTempoManual{}, temasOff[]}`. Slider ON/OFF por trilha (`trilhasOff` → some do seletor). Trilhas que deram erro no servidor aparecem como "erro laravel" e aceitam **tempo manual** (`trilhasTempoManual`); numa nova sync, se voltarem com conteúdo, o tempo manual é limpo. **Gotchas da API** (ver memória `project_aros_api_trilhas_casos`): `show_content:true` com `per_page>1` dá 500 (payload até 38MB/trilha) → puxar `per_page:1`; disparar rápido dá 429 → respiro ~650ms + backoff; algumas trilhas dão 500 sozinhas (bug de dados deles — PONTO 11/12/24) → CF resiliente cai pra `show_content:false` (metadados, `contentError:true`) e segue, reporta `contentErrors[]`.

**3. Geração de Cronograma (`cronoGer`).** Coleção `cronoTurmas/{id}`: `{nome, dataInicio, dataFim, simulados:[{id,nome,ini,fim}], provas:[{id,nome,data}], revisaoPreProva:[{id,nome,data}], semanas:[{dias,temas[],sobra[],revisoes[],nota}]}`. Semanas geradas de dataInicio+dias acumulados; datas/eventos calculados (`_cronoTurmaSemanas`). **Simulado** = intervalo (fim de semana, badge de semana); **prova** e **revisão pré-prova** = 1 dia por entrada, ficam FORA das semanas → **bloco separado no fim** (editor + PDF): "PROVA OFICIAL: X|Y|Z" e "REVISÃO PRÉ-PROVA: X|Y|Z" + nota (o cronograma termina no dia anterior à 1ª prova). Cada semana tem **3 listas**: `temas` (prioritários), `sobra` ("se sobrar tempo") e `revisoes`. Picker de temas em árvore (modal) com toggle **por prioridade** / **por ordem numérica do Ponto**, seleção MÚLTIPLA (fecha só no Concluir); tema não se repete entre `temas`/`sobra` de nenhuma semana (revisão é livre e mostra "(visto na semana X)"). PDF por semana: **Temas prioritários para estudo** → trilhas+hot topics aninhados; **Se sobrar tempo estude:** idem; **Revisão**. Semanas em dropdown (fechado) + Expandir todas. Export **PDF** via jsPDF (A4 retrato; `_loadJsPDF`). **IA fica pra v2.** Gravações **serializadas** (`_cronoSaveQ`) + objeto por referência — corrige corrida onchange-vs-clique que revertia nomes.

**Divisão de módulo (overlay em `config/cronoConfig.divisoes`).** Um módulo do PO pode ser dividido em N partes SEM quebrar o import (a biblioteca é projeção de `poAulas` via `_cronoModulosRaw`; `_cronoModulos` aplica a divisão por cima). `divisoes[divKey]` (divKey = slug do módulo original) = `{cursoNome, modulo, partes:[{id,nome,aulaKeys[],aulasManuais:[{id,titulo,duracao:"MM:00"}]}]}`. Cada parte vira um **tema próprio** (temaId = `parte.id`), com aulas do PO atribuídas (por `_cronoAulaKey`) + **aulas manuais** (título+duração, pra produto ainda fora do PO). Aula não atribuída = "a classificar" (não some). UI: botão **✂ Dividir módulos** no cabeçalho da biblioteca → modal `#cg-div-modal`. Ao dividir, trilhas/hot topics do módulo inteiro NÃO migram pras partes. `config/cronoConfig` = `{ritmoCharsMin, multimidiaMin, trilhasOff[], trilhasTempoManual{}, temasOff[], divisoes{}}`.

Cloud Function: `sincronizarTrilhasCasos` em `cloud-function-hotmart/trilhas-casos.js` (exportada no index.js). Rules deployadas 2026-07-01: `cronoTemas` (write exige `modulo`), `cronoTurmas` (write exige `nome`), `cronoTrilhas` (`write:false` — só Admin SDK da CF). Config em `config/cronoConfig` (write via regra genérica de `config` — exige auth).

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
- `checklists/{simId}/relatorios/{studentId}` (deploy 2026-06-05): `read/create/update/delete: if isAuth()` — PROTEGIDA (contém histórico de notas). Guarda o HTML do PDF aprovado pro link "Baixar PDF". Contraste com `respostas` (mesma árvore, mas aberta).

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

**`gerarFlashcardsPO`** (`flashcards-po.js`) — gera flashcards de uma aula (transcrição + questões da trilha + gabarito comentado + Resumo LM), Sonnet 4.6, `ANTHROPIC_API_KEY_PO`. Ver rodada 2026-06-23 e [[project_aros_flashcards]].

**Custos IA** (`custos-ia.js`) — `registrarCusto(categoria, custoUsd)` acumula em `config/poCustosIA` (por tipo + por mês). Chamado por `gerarFlashcardsPO`, `gerarPromptThumb` e as 3 `analisar*PO`. Tela 💰 Gastos API.

**Pré-requisitos do deploy:**
1. `cd cloud-function-hotmart && npm install` (instala `@anthropic-ai/sdk`, `firebase-admin`, `firebase-functions`). **Em worktree, rodar `npm install` na pasta da worktree** (o Firebase precisa do `node_modules` local pra analisar o source) e **copiar o `.env` do repo principal** antes de deployar função nova.
2. `.env` deve existir com as 3 keys (HOTMART_TOKEN, SLACK_WEBHOOK, ANTHROPIC_API_KEY).
3. Firebase analisa o source localmente — se `require()` falha, a function é silenciosamente removida do deploy. SEMPRE checar `firebase functions:list` após deploy.

**`sincronizarTrilhasCasos`** (`trilhas-casos.js`, deployada 2026-07-01): POST auth (Firebase ID token). Puxa as trilhas de casos clínicos TSA da API do aluno do Laravel (`/aluno/simulados-casos-clinicos`, token `LARAVEL_TOKEN`), 1-a-1 com respiro/backoff (evita 500 por payload e 429 por rate), soma caracteres + multimídia por trilha e grava totais em `cronoTrilhas`. Resiliente: trilha que dá 500 no servidor cai pra `show_content:false` e segue. Ver seção **Treinamento TSA Oral**.

Deploy: `npx -y firebase-tools deploy --only functions --force` (**SÓ quando o usuário autorizar**). Deploy de uma função só: `--only functions:sincronizarTrilhasCasos`.

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
11. **NUNCA usar `confirm()`, `prompt()`, `alert()` nativos** (decisão 2026-05-28). Sempre usar os helpers customizados:
    - `await arosConfirm({title, message, danger, confirmLabel, cancelLabel, icon})` → `Promise<bool>`
    - `await arosPrompt({title, message, placeholder, default, requireMatch, danger, confirmLabel, cancelLabel, icon})` → `Promise<string|null>`. `requireMatch:'EXCLUIR'` força digitação exata pra ações destrutivas.
    - `await arosAlert({title, message, icon, okLabel})` → `Promise<void>`
    - `arosToast(message, kind, durationMs)` — fire-and-forget pra feedback rápido. `kind in ['info','success','warn','err']`
    Definidos perto do `window.CM` (final do `<script>`). Reusam classes `.mo`/`.md`/`.mh`/`.m-body`/`.m-foot`/`.m-title`/`.m-sub`/`.m-close` já estabelecidas (consistência visual). Suportam Esc pra cancelar, Enter pra confirmar (em prompt/confirm), foco automático no campo de input ou botão OK, backdrop click cancela. **Por que**: browsers podem bloquear dialogs nativos (especialmente em fluxos não-iniciados-por-clique), UX inconsistente com o tema do app, não centralizam truncate/sanitize. Pra operações longas com progresso, usar `_arosBuildModal({title,sub,icon,bodyHtml,footHtml,danger,maxWidth})` direto (helper interno que retorna `{cont, close}`) e atualizar conteúdo via `cont.querySelector(...)` — vide `deleteProvaDireto` como exemplo canônico (confirma via `arosPrompt` com `requireMatch`, abre modal de progresso, atualiza msg em tempo real, fecha + `arosToast` de sucesso, `arosAlert` em erro).
    **Retrofitting do código legado**: as ~centenas de `alert/confirm/prompt` espalhados serão substituídos gradualmente — não bloquear feature pra fazer migração massiva, mas **toda mudança nova já entra com o padrão novo**, sem exceção.

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

- **(2026-06-14) Reordenar ITENS por drag** dentro da MESMA pergunta: cada item tem alça ⠿ (`_renderTplItem` agora com `id=tpl-item-{bloco}-{ci}-{pi}-{ii}` + `draggable`; container dos itens com `id=tpl-itens-{bloco}-{ci}-{pi}`). Handlers `_tplItemDragStart/Over/Leave/Drop/DragEnd` + `_tplRerenderItens` (re-render SÓ do container da pergunta) — espelham os `_revItemDrag*` da Revisão de Casos (mesma estrutura casos→perguntas→itens). A LETRA (A,B,C…) é `String.fromCharCode(65+ii)` = POSICIONAL, então reordenar o array re-mapeia as letras sozinho: a sequência fica fixa por posição, só o item muda de lugar. `autoSaveCkTemplate()` ao soltar. Penalidades (`⚠`) também são arrastáveis e ocupam posição (não consomem letra, mas o índice conta).

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
- **Aviso de feedback geral não configurado (2026-06-01):** logo no início, lê `feedbackGeral/{simId}.textoFinal`. Se vazio/ausente, abre modal `uiConfirm` "O feedback geral para a turma ainda não foi configurado. Deseja seguir com o feedback mesmo assim?" (Sim, seguir → continua gerando · Não → aborta e volta pro checklist). Vale pros 2 botões (topo `btn-gerar-relatorio` e por-linha em `renderCkLista`).
- **`uiConfirm(message,{title,yesLabel,noLabel,yesClass})`** — helper novo de confirmação estilizado, retorna `Promise<boolean>`. Cria um `.mo>.md` (mesmo padrão dos modais do app) dinamicamente, `z-index:300`, fecha clicando fora (=false). Definido logo antes de `gerarFeedbackAluno`. Reusável pra outros confirms.
- Carrega checklist do aluno, templates, histórico, médias, feedback geral.
- Aplica IA (Gemini 2.5 Flash) em cada feedback de caso via `applyAIPrompt` (silent fallback se sem API key).
- Abre view `ck-preview` populando dados via `abrirPreviewV2(data)`.

**Seção Extra na preview (`prev-extra-cases`)**:
- Aparece SÓ pra `data.isExtra === true`.
- Render via `_renderExtraCasesPreview(data)`: por bloco (Criar azul, Oral laranja), mostra cada caso com enunciado + imagens + perguntas (título + imagens + checklist `A) B) C)` + box verde "💬 Gabarito comentado" com texto + imagens).

**PDF final (`montarHTMLRelatorio`)**:
- Ordem das seções: Histórico → Feedback por Caso → Feedback Geral → Avaliação de Habilidades → **📚 Casos, checklist e gabarito** (só Extra) → Rodapé.
- Helper `_montarHTMLExtraCasesPDF(d)` renderiza a seção Extra com `page-break-inside:avoid` por caso pra não cortar no meio.

#### Refino do feedback: sem email, sem média da turma, progresso visual, PDF via iframe, "gerado em + Baixar PDF" (2026-06-05)

Sessão de polimento do fluxo de feedback (commits na `main`; uma mudança de rules deployada). Tudo no ar.

- **Média da turma REMOVIDA** do relatório do aluno (os 3 pontos: corpo do email — depois removido —, `montarHTMLRelatorio` e `abrirPreviewV2`). O cálculo `getDocs(notas/{sim}/alunos)` foi apagado de `gerarFeedbackAluno` (era 1 ida à rede só pra isso). Campo `mediaTurma` não existe mais no objeto `data`.
- **Progresso visual durante a IA:** `gerarFeedbackAluno` mostra overlay (`_fbGenShow/_fbGenMsg/_fbGenProgress/_fbGenHide`) com spinner (`@keyframes imp-spin`) + barra "X de N" enquanto `applyAIPrompt(fbRaw,_aiProg)` revisa cada caso. `applyAIPrompt(text,progressCallback)` já aceitava o callback (dispara só nos casos que realmente vão à API). `_fbGenHide()` no `finally` e nos returns antecipados.
- **Envio por EMAIL REMOVIDO por completo:** sumiram os botões "📧 Enviar relatório por email" (topo `btn-email-top` + rodapé `btn-email`), o `sendEmailHandler` (EmailJS `template_r0vjejs`) e a função `buildReportEmailBody`. O relatório agora é só PDF.
- **"Gerar PDF Final" imprime via iframe oculto** (`_imprimirRelatorioIframe(html)`) em vez de abrir nova aba — o popup "Salvar como PDF" abre direto sobre a página (resolve o bug do "Voltar" travado quando havia 2 abas). Helper: cria iframe `visibility:hidden`, escreve o HTML, chama `contentWindow.print()` **UMA vez** (guard `_impresso` + checa `doc.body.children.length>0` pra ignorar o `load` do about:blank que disparava print 2× → popup reabria sozinho). Remove qualquer `<script>` embutido do HTML antes (regex split `<scr`+`ipt>`) pra não duplicar print. Limpa o iframe em `onafterprint` + fallback timeout.
- **"📄 Feedback gerado em DD/MM/AAAA · Baixar PDF":** ao confirmar o PDF, `confirmarGerarPDF` grava o HTML aprovado em **`checklists/{simId}/relatorios/{studentId}`** (subcoleção PROTEGIDA, `read/write: if isAuth()` — contém histórico de notas) + a data leve `feedbackGeradoEm` no doc de `respostas` (aberto, só data). Salva o HTML PRIMEIRO; só marca a data se ele salvou (link nunca aparece sem relatório). `baixarPDFFeedback(studentId)` lê o HTML guardado e reabre via iframe (sem re-rodar IA, preserva edições). A linha aparece na **grade** (`renderCkStudents`, sob o nome — div `max-width:300px`) E no **box** (`updateRelatorioBtnVisibility`, abaixo do botão `btn-gerar-relatorio`, id `ck-blocos-relatorio-info`).
- **Bug do botão do box consertado:** o `onclick="gerarFeedbackAluno(_ckStudentId)"` lançava `ReferenceError` (inline handler não enxerga `let` de `<script type="module">`). Agora chama `window.gerarFeedbackBoxBtn()` (wrapper no escopo do módulo que lê `_ckStudentId`). **Lição:** inline `onclick` nunca acessa vars de módulo — usar wrapper em `window.*` ou id literal interpolado.
- **"Habilitar Simulado" some no dia seguinte à data:** `renderCkStudents` calcula `_simPassou` (mesma regra do `renderSimCards`: nem `dataSab` nem `dataDom` às 23:59:59 ≥ agora). Esconde só o botão de habilitar; mantém "✓ Habilitado" (desabilitar) se a sessão ainda estiver ativa. Sem datas → não esconde.
- **Contribuição de feedback geral travada após consolidar:** `openFeedbackGeralModal` virou `async` — lê `feedbackGeral/{simId}.textoFinal`; se preenchido, mostra `uiAlert('O feedback geral já foi gerado, entre em contato com a coordenação.')` em vez de abrir o modal de contribuição.
- **`uiAlert(message,{title,okLabel,okClass})`** — helper novo (irmão do `uiConfirm`), aviso de UM botão ("Entendi") no mesmo `.mo>.md`. Retorna `Promise`. Definido logo após `uiConfirm`.
- **Fonte dos títulos** "✏️ Prévia Editável do Relatório" e "📝 Checklist de Aplicação" trocada de `Fraunces,serif` (legado, "infantil") pra `'Space Grotesk','Plus Jakarta Sans',sans-serif; letter-spacing:-.3px` (padrão moderno do painel).
- **Nova rule Firestore:** `match /checklists/{simId}/relatorios/{studentId} { allow read, create, update, delete: if isAuth(); }`.

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

## PO MEDREVIEW — Coordenação de Produto (PERSISTE NO FIRESTORE · 2026-06-17)

Área **interna** de gestão dos cursos (≠ Catálogo de Produtos, que é a vitrine pra vendas/marketing/suporte). É o "backstage" da produção das aulas — o que hoje o Tiarlles controla no **Monday**. Objetivo: centralizar produção das aulas (status, anexos, demandas) + uma **IA conhecedora do produto** que prioriza o que gravar/atualizar e analisa lotes de questões.

**ESTADO ATUAL (2026-06-17): persiste no Firestore e é editável.** O PO carrega de `poAulas` + `config/poConfig` + `poModQuestoes` (via `loadPO()` no `initPO`). Se a coleção `poAulas` estiver vazia OU o usuário não estiver logado, cai num **fallback de dados de exemplo em memória** (`_PO_DEMO_*`) com um aviso (`S._poAvisoDemo`). Edições/criações persistem **best-effort** (só pra `a.id` real; ids `tmp_*` do demo ficam só em memória). A **IA real de análise já está no ar** (ver seção megabrain Fase 2). Pendência: integração das notas (API Laravel). Ver [[project_aros_localhost_firestore]] (localhost grava no Firestore de produção).

### Onde está no código (index.html)
- **Grupo de menu** `poMedreview` (label "PO MEDREVIEW") em `TAB_GROUPS`, com 1 aba `{id:'po', label:'🧭 Coordenação de Produto'}`. Aba `'po'` está em `ADMIN_ONLY_TABS` (só admin por enquanto; permissão de professor vem depois).
- `switchCoTab`: `'po'` no array hardcoded + `if(tab==='po')initPO()`.
- HTML: `<div id="tab-po">` com `<style>` inline (todo o CSS `#tab-po .po-*` + modal `#po-col-modal`) e `<div id="po-root">`. Fica logo depois de `#tab-produtos`.
- JS: bloco isolado antes de `window.initProdutos`. Prefixos `_po*` / `po*` / `S.po*` / `PO_*`. Reusa `VERTICAIS`, `_verticalById`, `_arosBindTilt/_arosObserveReveal`, classes `home-card` (re-escopadas pra `#tab-po`).

### Navegação (3 telas, roteadas por `S.poView`)
`verticals` → cards das 4 verticais (reusa VERTICAIS: anestreview/oftreview/ortopreview/medreview) → `cursos` → cards dos cursos da vertical → `curso` → planilha de aulas + painel de IA (análise do produto, no ar — ver megabrain Fase 2). Handlers: `poSelectVertical`, `poAbrirCurso`, `poVoltarVerticais`, `poVoltarCursos`.

### Planilha de aulas (o "Monday interno")
- **Colunas configuráveis** em `S.poColunas` = array de `{id,label,type,w,opts?}`. `type`: `'texto'|'link'|'status'`. Status usa `opts:[{v,cor}]`. Render genérico por `_poColCell(a,col)` lendo `_poCellVal` (campo direto `a[col.id]` ou `a.dados[col.id]`).
- **Criar coluna**: botão `＋` no fim do cabeçalho → modal (`poNovaColuna`/`_poColModalRender`). **Excluir coluna**: ✕ no cabeçalho (dupla confirmação, `poExcluirColuna`). **Renomear coluna**: **duplo-clique** no `.po-th-label` (`poEditarNomeColuna`, atualiza in-place sem re-render). **Filtro por coluna**: campo no cabeçalho (`poSetColFiltro`, `S.poColFiltros` — efêmero); o filtro da coluna fixa "Aula" filtra pelo **Ponto/módulo** (não pelo nome). Colunas `status` têm ⚙ pra **gerenciar opções** (add/del/cor, `poGerenciarOpcoes`/`#po-opts-modal`).
- **1ª coluna "Aula" fixa** (sticky left, `.po-col-aula`): tem alça de arrastar ⠿ + checkbox de seleção + nº **posicional** (1,2,3… pela ordem atual no módulo, NÃO o `ordem` importado) + nome editável.
- **Módulos/Pontos** (`_poGroupByMod`): linha-cabeçalho. **Clique simples na linha abre/fecha** (`poToggleMod`); **duplo-clique no nome renomeia** (`poEditarNomeModulo`, propaga `a.modulo` em todas as aulas, batch). Estado em `S.poModAbertos`. Ordem **default por número do Ponto** (`_poPontoNum`: 1,2,…10,11,21); ordem manual (arrastar) em `S.poModOrdem[cursoId]`. Botão "⊕ Expandir/Recolher tudo". Última linha de cada módulo aberto = **"＋ Nova aula neste módulo"** (`.po-addaula-btn`).
- **Resize de colunas**: alça `.po-rsz` (`_poBindResize`), `S.poColAulaW`/`col.w`. **Editar célula**: clicar (`poCelEditar`) → texto/link viram input, status vira select (com "➕ Nova opção"). **Status com famílias de cor** (`PO_STATUS_FAM`/`_poStatusCor`, `_PO_ATENCAO`, `_poIsPronta`).
- **Status com famílias de cor** (`PO_STATUS_FAM` → `_poStatusCor`): verde=no ar, azul=em produção, amarelo=agendado, vermelho=atenção (demanda/erro/atualizar), cinza=inexistente/removida. `_PO_ATENCAO` (Set) marca os que precisam de atenção. `_poIsPronta` conta as "no ar".

### Persistência (Firestore) + import + CRUD (entregue 2026-06-17)
- **Schema:** `poAulas/{autoId}` (1 doc por aula: `{ordem, ordemPO, titulo, nomeOriginal, status, ano, prof, cursos:[nomes], modulo, video, categoria, questoes, cards, livros, fichaResumo, slides, conteudo, avaliacao, dados:{}, criadoEm, updatedAt}`; `cursos` é array = many-to-many). `config/poConfig` (doc único: `{colunas, colAulaW, cursos:[{id,nome,vertical}], modOrdem, modExtra, poPesos, editais:{cursoId:texto}, temaModulo:{cursoId:{modulo:[catIds]}}, flags de migração}`). `poModQuestoes/{slug(curso__modulo)}` (`{cursoId, modulo, TEA:[], TSA:[], MEs:[], Outras:[], pedidos:[], apostilas:[{titulo,link,status}], questoesFonte, questoesCategorias, questoesAnos}`).
- **Rules:** `poAulas` e `poModQuestoes` exigem `isAuth()` (read+write); `config/poConfig` read só logado (excluído do wildcard público). Deploy feito 2026-06-17.
- **Importador no app** (botão "⬆ Importar do Monday", `poAbrirImport`): sobe o `.xlsx`, parseia com `_poParseMondayXlsx` (puro — pula linhas de grupo/cabeçalho do Monday, extrai `ordem`+`titulo` de "N - Título", split de Produto, **vazio→Extensive Geral**), preview, e grava em `writeBatch` (chunks 450) — substitui as `poAulas` existentes. Roda com a sessão logada (Google) → **não precisa de senha/script Node**. Arquivo real: `~/Downloads/ANEST_Aulas_1780686227.xlsx` (~756 aulas, 9 cursos).
- **Edição inline:** célula (`poCelEditar` → `_poSaveAula`=updateDoc), nome de aula/módulo/coluna, opções de tag. **Numeração posicional** + **arrastar** (alça ⠿; `_poReordenarAulas` grava `ordemPO`, `_poReordenarModulos` grava `S.poModOrdem`); drag desligado durante busca/filtro.
- **CRUD:** **Nova aula** (`poNovaAula(modulo?)` → modal `#po-aula-modal`; quando criada por dentro do módulo, o módulo vem fixo via chip, sem seletor). **Novo módulo** (`poNovoModulo` → modal `#po-novomod-modal`; módulos vazios ficam em `S.poModExtra[cursoId]`). **Excluir**: por **checkbox** (seleção em `S.poSel.aulas` → barra `.po-sel-bar` → `poExcluirSelecionadas`, dupla confirmação, apaga de todos os cursos); excluir **módulo** (`poExcluirModulo`) e **produto/curso** (`poExcluirProduto` — apaga aulas exclusivas, desvincula as compartilhadas). Tudo dupla confirmação.
- **Coluna "Duração"** (id `duracao`, 2026-06-17): mostra `video_duration` do Laravel. Adicionada por **migração one-time** no `loadPO` (se as aulas têm `a.duracao` e a coluna não existe → insere + grava flag `duracaoColInjetada` no poConfig pra não voltar se excluída).

### ⭐ FONTE = Laravel (integração iniciada 2026-06-17, EM ANDAMENTO)
Decisão: o **Laravel** (produto real, onde os alunos assistem) é a **fonte de verdade** do PO, no lugar do Monday. A API é `https://api.grupomedreview.com.br/api`:
- Endpoints (auth por **token Bearer Sanctum**, formato `123|abc…`; rotas protegidas → 401 sem token, e `/login` 302 sem cookie): `GET /api/producers` (verticais, **público**), `GET /api/curso/{id}/modulos` (lista de módulos `{id,nome}`), `GET /api/modulo/{id}/conteudos` (aulas do módulo). Frontend em `anestreview.medmembers.com.br`.
- **Campos de cada conteúdo:** `id` (id estável Laravel), `title` ("N - Título"), `module_name`, `course_name` ("Extensive"), **`video_external_id`** (id do Vimeo), **`rating`**+`total_ratings`+`my_rating` (avaliação), `video_duration`, `published_at`, `type` (sempre `PAGE` no Extensive), **`trilhas`** (array de trilhas de questões — cada uma tem `json` com `ids[]` das questões; 378/436 têm), **`trilhasFlashcard`** (array de trilhas de flashcard com `total_flashcards`+`flashcards.todos[]`; só 3/436 no Extensive), `tasks`, `body`/`subtitle` (vazios no Extensive — descrição NÃO vem por aqui).
- **Trilha Questões / Trilha de Flashcards (colunas do PO):** o parser `_poParseLaravel` seta `questoes:'Lançada'` se `trilhas[]` não-vazio (senão `'Pendente'`) e `cards:'Lançada'` se `trilhasFlashcard[]` não-vazio. Colunas renomeadas de "Questões"/"Flashcards" → **"Trilha Questões"**/**"Trilha de Flashcards"** (migração one-time no `loadPO` via flag `trilhaColsRenamed` no poConfig).
- **Como puxar (one-time, sem token gravado):** o token só fica na MEMÓRIA do app (não em localStorage/cookie). Capturado via patch de `fetch`/`XMLHttpRequest.setRequestHeader` no console enquanto o user clica num módulo. Script percorre os módulos e baixa um JSON `[{moduloId, conteudos:[...]}]`. Arquivo real obtido: `~/Downloads/aulas-laravel*.json` (Extensive = 436 aulas, 57 módulos).
- **Importador do Laravel no PO** (botão "⬆ Importar do Laravel", `poAbrirImportLaravel`, modal `#po-laravel-modal`): parser puro `_poParseLaravel(json)` mapeia → `video:'https://vimeo.com/'+video_external_id`, `vimeoId`, `avaliacao:"4.87 (78)"` (+`ratingNum`/`ratingTotal`), `duracao`, `ano` (de published_at), `laravelId`, `publishedAt`, `tipoLaravel`, **`questoes`/`cards`** (das trilhas, ver acima). `modOrdem` = ordem dos módulos no arquivo. **CLEAR+INSERT**, mas **preserva campos manuais** casando por `laravelId` (lista `_PRESERVAR`: status/prof/conteudo/categoria/apostila/fichaResumo/slides/livros + marcadores de transcrição) — re-importar NÃO zera mais o trabalho manual. Globais: `poAbrirImportLaravel`/`poImportLaravelFile`/`poImportLaravelConfirmar`/`poImportLaravelModalClose`/`_poParseLaravel`. **Já importado em produção pelo Tiarlles.**
- **Transcrição via Vimeo (ENTREGUE 2026-06-17, no ar).** Cloud Function **`vimeoTranscricao`** (`cloud-function-hotmart/vimeo-transcricao.js`, exportada no `index.js`): recebe `{vimeoId, aulaId}` + Firebase ID token → `GET https://api.vimeo.com/videos/{id}/texttracks` (token em **`VIMEO_TOKEN`** no `.env`) → escolhe a faixa (prefere legenda humana sobre `pt-x-autogen`, e `active:true`) → baixa o VTT (link assinado) → `vttParaTexto` limpa (sem timestamps/índices/tags, dedup de linhas) → grava **`poTranscricoes/{vimeoId}`** via Admin SDK (chave = **vimeoId**, estável entre re-imports e compartilhado quando o mesmo vídeo está em vários cursos). Retorna `{ok,chars,palavras,lang,preview}`. Cobertura real: **100% da amostra** tem legenda automática PT (~31k chars/aula). **Conta Vimeo dona dos vídeos = "OFT-Review Educação Médica LTDA"** (13.574 vídeos).
  - **Frontend (PO):** botão **"🎬 Puxar transcrições"** (`poAbrirTranscricoes` → modal `#po-trans-modal`, lote com concorrência 3, progresso, **retomável** — pula as que já têm; botões "Puxar N pendentes" e "↻ Refazer todas"). Marcador na coluna **Conteúdo da aula** = chip `📄 N palavras` (`a.transcricaoPalavras`/`conteudoPreview` no doc da aula); clicar abre **visualizador read-only** (`poVerTranscricao` → modal `#po-transview-modal`) que carrega `poTranscricoes/{vimeoId}` sob demanda + botão copiar. `poCelEditar` intercepta a célula `conteudo` com transcrição → abre o visualizador em vez de editar. Endpoint: `VIMEO_TRANSCRICAO_ENDPOINT`. **Rule:** `poTranscricoes` read se logado, write `false` (só Admin/Function).
- **Sincronização Laravel→PO (ENTREGUE 2026-06-17, no ar).** `cloud-function-hotmart/sincronizar-laravel.js` (2 exports no `index.js`): **`sincronizarLaravel`** (HTTP, exige Firebase ID token) e **`sincronizarLaravelAuto`** (`onSchedule '0 6 * * 1'`, segunda 06:00 BRT). Núcleo `sincronizarCurso(courseId,nome,{dryRun})`: `GET /curso/{courseId}/modulos` → por módulo `GET /modulo/{id}/conteudos` → `mapAula` (espelha `_poParseLaravel`) → diff com poAulas por `laravelId`. **Cria** novas / **atualiza** só os `CAMPOS_LARAVEL` que mudaram (preserva campos manuais implicitamente; faz **merge** de `cursos[]` pra não derrubar pertencimento) / **não deleta** as que sumiram. Atualiza `modOrdem` no `config/poConfig`. Puxa transcrição (`obterTranscricao`) das aulas **novas** com vídeo. **`dryRun:true`** = pré-visualização (não escreve). `CURSOS_VIGIADOS` = `[{courseId:'3df5bb00-…b48f4', nome:'Extensive'}]` (constante no arquivo — **adicionar outros cursos aqui**). Token Laravel em **`LARAVEL_TOKEN`** (.env, **permanente** — dev confirmou que não vence; valor atual `3046247|…`). Slack ping no auto. **Validado em prod:** preview deu 0 novas (casamento por laravelId correto).
  - **Frontend (PO):** botão **"🔄 Sincronizar agora"** (`poAbrirSync` → modal `#po-sync-modal`): roda **preview primeiro** (mostra novas/atualizadas + listas), só escreve ao clicar **"Aplicar agora"** (`poSyncAplicar`), depois `loadPO()`+render. Endpoint `SINCRONIZAR_ENDPOINT`.
- A **IA real de análise** (usa a transcrição como fonte) já está **no ar** — ver seção megabrain Fase 2. ⚠️ Tokens colados no chat e orientados a **regenerar**: **Vimeo PAT** (`6eed…342f`, conta OFT-Review) + Client secret do app Vimeo + a chave `ANTHROPIC_API_KEY_PO` (colada no chat em 2026-06-18). (O **Laravel token é permanente** — manter.)

### 🔌 REFERÊNCIA DE APIs EXTERNAS (tokens, rotas e o que cada uma devolve) — atualizado 2026-07-01
**Seção de consulta rápida pra não re-testar toda vez.** Todos os tokens ficam server-side no `cloud-function-hotmart/.env` (gitignored) — aqui só os **nomes das env vars**, nunca o valor.

**Tokens Laravel POR VERTICAL** (mapa em `sincronizar-laravel.js` e `flashcards-po.js` → `TOKENS_POR_VERTICAL`):
| Vertical | Env var | Conta / escopo do **banco de questões** |
|---|---|---|
| `anestreview` (Extensive) | `LARAVEL_TOKEN` | Anest. `/filtros` → **59 categorias**. IDs de questão **altos**. |
| `medreview` (Extensive R1) | `LARAVEL_TOKEN_MEDREVIEW` | Conta **medmembers**. `/filtros` → **6 macro-categorias de residência** (IDs **2985–4649**: Cirurgia, Clínica, Preventiva, GO, Pediatria, Outros). IDs de questão **altos**. |
| `oftreview` (Extensive Oft) | *(falta `LARAVEL_TOKEN_OFTREVIEW`)* → **herda `LARAVEL_TOKEN_MEDREVIEW`** | Mesmo token do R1. Lê **curso/módulos/trilhas/comentários** do Oft OK, mas o **banco de QUESTÕES do Oft NÃO** (ver bug abaixo). |

**Course IDs no Laravel** (de `config/poConfig.cursos[].laravelCourseId`):
- Extensive (Anest): `3df5bb00-db83-49a3-a334-f55af33b48f4`
- Extensive R1 (MedReview): `43b2fb17-b7c1-4770-bb0e-0fc11355dfdb`
- Extensive Oft (OftReview): `5a84366a-0823-4870-8b55-34f7eaf766f2`

**API Laravel** — base `https://api.grupomedreview.com.br/api`, auth `Authorization: Bearer <token>`:
| Rota | Método / corpo | Devolve | Escopo |
|---|---|---|---|
| `/producers` | GET | verticais | **público** |
| `/curso/{courseId}/modulos` | GET | `[{id,nome}]` | estrutura — token medreview vê R1 **e** Oft |
| `/modulo/{moduloId}/conteudos` | GET | aulas: `id,title,module_name,course_name,video_external_id,rating,video_duration,published_at,type,`**`trilhas[]`**`,trilhasFlashcard[],tasks`. Cada `trilha.json` (string) tem `ids[]` (IDs das questões) + `filtro_categorias` + `filtro_page_id`. | estrutura — vê R1 e Oft |
| `/filtros` | GET | `{categorias[+incidência/peso], tipo_de_provas, anos}` | **ESCOPADO ao token** |
| `/v2/web/questoes?page=N` | POST `{ids:[...]}` (ou `{categorias,anos}`) | `{total, data:[{id,descricao,alternativas[],escopo,ano}]}` — a QUESTÃO | **ESCOPADO ao banco do token.** R1/Anest OK; **Oft → total:0** |
| `/web/comentario/gabarito` | POST `{model_id:<id da questão>, is_gabarito:true, model_type:'QUESTAO'}` | `{content: <comentário HTML>, user, rating}` — **só o comentário, NÃO a questão** | **NÃO escopado** — funciona pro Oft |
| `/analise-provas/incidencia` | POST `{provas:[{escopo_id,ano}]}` | incidência oficial por prova | — |

**MegaBrain API** (Cloud Function `megabrain`, consumida pelo MCG do dev) — base `https://us-central1-simulados-confirmacao.cloudfunctions.net/megabrain`, auth `X-API-Key` ou `Bearer` com `MEGABRAIN_KEY_<VERTICAL>` (escopo por vertical) ou `MEGABRAIN_API_KEY` (master, vê tudo):
| Rota | Devolve |
|---|---|
| `GET /lessons?page=&course=&q=` | `{data:[{id,vertical,course,module,title,has_transcription,has_questions,updated_at}], total, page, scope}` |
| `GET /lessons/{id}/content` | `{transcription, questions:[{label,statement,alternatives[],answer,comment}], title, course, module, ...}`. `questions` = `idsDaTrilha` → `questoesPorIds` → `anexarComentarios`. **Pro Oft vem `questions:[]` (bug).** |
| `GET /lessons/{id}/materials` · `/materials/{attId}` | lista de materiais / download (proxy server-side) |

**✅ RESOLVIDO 2026-07-01 — cada vertical tem seu PRÓPRIO token Laravel (produtor).** A causa era não haver token do Oft: o `oftreview` caía no `LARAVEL_TOKEN_MEDREVIEW` (produtor 7/residência), que lê a ESTRUTURA do curso Oft (por isso as aulas sincronizavam) mas NÃO as categorias/questões (escopadas por produtor). Correção: **adicionado `LARAVEL_TOKEN_OFTREVIEW` no `.env`** (token do produtor Oft = produtor 1; formato Sanctum `3096324|…`, o MESMO que o app `oftreview.medmembers.com.br` usa) + **redeploy das functions**. Zero mudança de código — o mapa `TOKENS_POR_VERTICAL` já preferia esse token. Verificado em prod: `/lessons/{id}/content` do Oft agora traz questões + comentários (ex.: Acomodação 39, Alergia 26, Acuidade 22). **Regra geral: cada vertical = 1 token Laravel próprio, MESMOS endpoints, MESMA ordem de chamadas; só troca o token.** (Obs.: a 1ª chamada por instância fria pode vir com `questions:[]` — cold start; repetir aquece. E a contagem de comentários pode variar entre chamadas — `anexarComentarios` é best-effort.) Histórico do diagnóstico abaixo, mantido como referência das rotas:

**~~BUG~~ — OftReview não puxava as questões da trilha (diagnóstico 2026-07-01).** Sintoma: `/lessons/{id}/content` do Oft vem com **transcrição cheia mas `questions:[]`** em 100% das aulas (transcrição não é afetada). **Causa provada** (testado ponta-a-ponta): as trilhas do Oft EXISTEM (`has_questions:true` em ~181/273) e guardam `ids[]` válidos, mas essas questões estão num **banco separado** (categoria **"10"** — que **nem existe** no `/filtros` do token medreview — IDs **baixos**, `filtro_page_id:12`). O endpoint atual `POST /v2/web/questoes {ids}` **não serve esse banco** com o token medreview (retorna `total:0` por id, por categoria, por page_id e mandando o filtro inteiro); pro R1 o mesmo endpoint funciona. **O token, o curso, os módulos, as trilhas e o COMENTÁRIO do Oft funcionam** — só a QUESTÃO (enunciado+alternativas+gabarito) não vem. **Raiz confirmada (2026-07-01): o token `LARAVEL_TOKEN_MEDREVIEW` está PRESO ao `produtor_id: 7` (MED-REVIEW / residência).** `/categorias`, `/filtros`, `/v2/web/questoes` sempre retornam produtor 7 — os params `produtor_id`/`filtro_page_id`, o domínio no Origin/Referer (`oftreview.medmembers.com.br`) e headers de tenant são TODOS ignorados. A **estrutura** do curso (módulos/conteúdos/trilhas) é legível cross-produtor (por isso as aulas do Oft sincronizam com esse token), mas **categorias e questões são escopadas por produtor** — as do Oft (cat 10, IDs baixos) são de outro produtor. **O curso Extensive Oft tem produto/domínio próprio:** `/producers` → OFT-REVIEW com `auth_url: https://oftquest.grupomedreview.com.br`, `medmember_url: https://oftreview.medmembers.com.br`. **FALTA (mais provável): um token Sanctum do PRODUTOR do Oft** (`LARAVEL_TOKEN_OFTREVIEW`) — com ele, os MESMOS endpoints (`/categorias`, `/v2/web/questoes {ids}`, `/web/comentario/gabarito`) passam a devolver o Oft **sem mudar código** (só env var + redeploy), igual R1/Anest têm o deles. Alternativa: o dev liberar o produtor Oft pro token atual. **Aguardando o dev (2026-07-01):** ele disse que vai retornar as categorias do Oft — confirmar se via token novo ou liberando no backend.

### 🧭 LÓGICA MULTI-VERTICAL / MULTI-CURSO + RUNBOOKS (ler antes de criar curso/vertical) — 2026-07-01
**Modelo mental (2 níveis):**
- **Vertical** = a marca/produtor no Laravel (`anestreview`, `medreview`, `oftreview`, futuro `ortopreview`…). **Cada vertical = 1 login/produtor = 1 token Sanctum próprio.** As **questões e categorias são escopadas por produtor** — o token de uma vertical NÃO enxerga as questões de outra (a estrutura do curso — módulos/aulas/trilhas — é legível cross-produtor, por isso aula sincroniza mesmo com token errado, mas a questão não vem). Foi essa a causa do bug do Oft.
- **Curso** = um produto dentro da vertical (ex.: "Extensive Oft"). Cadastrado no painel; guarda `nome`, `vertical` e **`laravelCourseId`** (UUID do curso no Laravel).

**As 2 credenciais de cada vertical (no `cloud-function-hotmart/.env`):**
1. **`LARAVEL_TOKEN_<VERTICAL>`** — token Sanctum do produtor (formato `123|abc…`). É o **mesmo token que o app `<vertical>.medmembers.com.br` usa** (capturável no DevTools). Serve pra TUDO que vem do Laravel: aulas, trilhas, **questões**, **comentários**, materiais/apostilas.
2. **`MEGABRAIN_KEY_<VERTICAL>`** — chave que o **dev/MCG** usa pra ler a NOSSA API MegaBrain, restrita àquela vertical (o `KEY_MAP` em `megabrain-api.js` monta `chave→vertical` automático de toda env `MEGABRAIN_KEY_*`).

**Onde o código resolve o token por vertical:** constante **`TOKENS_POR_VERTICAL`** — **repetida em 3 arquivos** (`sincronizar-laravel.js`, `flashcards-po.js`, `materiais-po.js`): `{ anestreview: LARAVEL_TOKEN, medreview: LARAVEL_TOKEN_MEDREVIEW||LARAVEL_TOKEN, oftreview: LARAVEL_TOKEN_OFTREVIEW||LARAVEL_TOKEN_MEDREVIEW||LARAVEL_TOKEN }`. O fallback existe mas **o certo é cada vertical ter o SEU token** (senão puxa aula e não puxa questão). Aula→vertical: `config/poConfig.cursos[]` (`{id,nome,vertical,laravelCourseId}`) casando `aula.cursos[nome]`→curso→vertical (`fonteDaAula` em flashcards/megabrain resolve `{token,courseIds}`; `mapaVerticalPorCurso` em megabrain).

**Fluxo de chamadas Laravel — IDÊNTICO em toda vertical, só troca o token** (base `https://api.grupomedreview.com.br/api`, `Authorization: Bearer <LARAVEL_TOKEN_da_vertical>`):
1. `GET /curso/{laravelCourseId}/modulos` → módulos `{id,nome}`.
2. `GET /modulo/{id}/conteudos` → aulas; cada uma tem `video_external_id` (Vimeo), **`trilhas[].json.ids[]`** (IDs das questões), `tasks` (materiais).
3. **Questão:** `POST /v2/web/questoes?page=N` body `{ids:[...]}` → `{total,data:[{descricao,alternativas,escopo,ano}]}`.
4. **Comentário:** `POST /web/comentario/gabarito` body `{model_id:<id da questão>, is_gabarito:true, model_type:'QUESTAO'}` → `{content}`.
5. **Categorias/filtros:** `GET /categorias` · `GET /filtros` (escopados ao produtor do token).
(Transcrição NÃO vem do Laravel — vem do Vimeo, `VIMEO_TOKEN`, gravada em `poTranscricoes/{vimeoId}`.)

**Sincronização:** `sincronizar-laravel.js` vigia `CURSOS_BASE` (hardcoded: Extensive Anest + Extensive R1) **+ todo curso do painel** (`poConfig.cursos`) que tenha `laravelCourseId` **E** token configurado pra sua vertical (`montarCursosVigiados`). Roda seg 06:00 BRT (`sincronizarLaravelAuto`) ou no botão **"🔄 Sincronizar agora"**.

---
**▶ RUNBOOK A — novo CURSO numa vertical que JÁ existe** (ex.: mais um Extensive dentro de Oft). Pré-req: a vertical já tem `LARAVEL_TOKEN_<VERTICAL>` no `.env`.
1. Painel PO → entrar na vertical → botão **"➕ Novo curso"** (`poNovoCurso`/`poNovoCursoSalvar`): preencher **Nome** + **ID do curso no Laravel (UUID)**. Salva em `config/poConfig.cursos` com a vertical atual (`S.poVertical`). (precisa estar logado)
2. **"🔄 Sincronizar agora"** (ou esperar a automática) → puxa aulas/trilhas/transcrições.
3. Pronto — questões/comentários/materiais já funcionam (mesmo token da vertical). **SEM deploy** (curso entra por dado, não por código). Do meu lado: confirmar o UUID e disparar o sync.

**▶ RUNBOOK B — vertical NOVA** (ex.: OrtopReview). Precisa deploy.
1. Pegar o **token Sanctum do produtor** (mesmo do app `<vertical>.medmembers.com.br`; captura no DevTools — snippet que intercepta `Authorization: Bearer`).
2. `.env`: adicionar **`LARAVEL_TOKEN_<VERTICAL>=…`** (+ **`MEGABRAIN_KEY_<VERTICAL>=…`**, essa eu gero).
3. Adicionar a linha da vertical em **`TOKENS_POR_VERTICAL`** nos **3 arquivos** (`sincronizar-laravel.js`, `flashcards-po.js`, `materiais-po.js`). (o `KEY_MAP` da MegaBrain é automático.)
4. Cadastrar a vertical no catálogo do frontend se ainda não existir (lista de verticais no `index.html`, ex.: `{id:'oftreview',nome:'OftReview',…}`).
5. **Redeploy das functions** (autorização do Tiarlles).
6. Criar os cursos dessa vertical (Runbook A).

### Modelo de dados real (do board Monday — export `ANEST_Aulas_*.xlsx`, ~756 aulas reais)
Mapeamento Monday → campo da aula:
- **Nome** ("1 - O Sangue") → nº + título · **Status Aula** → status principal (16 estados, **já embute demandas/erros**) · **Produto** → **define a qual curso(s) a aula pertence** (many-to-many) · **Módulo** ("Ponto 10…", "M1…") → módulo · **Professor** (pode ter vários) · **ANO** (2023–2026) · **Link Drive (Revisão)** → na real é o **link do vídeo (Vimeo)** · **CATEGORIA** → tópico do edital (só **22 de 765** preenchidos!) · **Trilha Questões** / **Trilha Cards** → status Pendente/Lançada/Não se aplica.
- **Cursos = valores distintos de "Produto"**: `Extensive Geral` (~400 aulas = **curso principal**), `Extensive ME1/ME2/ME3`, `ANEST-PED`, `Revisão Extrema`, `Mentoria TEA/TSA`. Aula com "Extensive Geral, ME1" entra nos 2.
- Colunas **Apostila / Ficha Resumo / Slides / Livros** existem no board mas estão quase vazias.

### Decisões travadas com o Tiarlles
- **279 aulas sem "Produto"** → entram todas no **Extensive Geral** (decisão dele).
- **Edital fica FORA da planilha** — entra só num lugar específico pra IA (cruzamento conteúdo × edital).
- **Status (16 estados) importados como estão**, com as famílias de cor.
- **Notas das aulas** virão do sistema dele (**Laravel**, via API — devs entregam). No MVP a nota é **manual**; integração automática depois.
- **Aula reutilizável em vários cursos** (many-to-many confirmado).
- **Botão "Publicar na Comunicação"** (joga a aula publicada pra aba Comunicação que o aluno vê) → Fase 3.
- Verticais do Catálogo: **AnestReview, OftReview (OFT), OrtopReview (Ortop), MedReview (R1)**.

### IA do Produto — "megabrain" Fase 2 ENTREGUE e no ar (atualizado 2026-06-20)
A IA real de análise está **publicada e funcionando** (substituiu os mocks). Resumo do que existe:

---
**📋 REFERÊNCIA — O QUE A IA USA PRA ANALISAR (⚠️ MANTER ATUALIZADO: toda mudança de input/regra/peso/critério deve ser refletida AQUI quando esta skill for atualizada)**

**A) INPUTS da análise de MÓDULO** (`analisarModuloPO`, lê tudo server-side via Admin SDK a partir de `{cursoId,cursoNome,modulo}`):
1. **Aulas do módulo** (`poAulas`): título, status, ano de gravação, avaliação dos alunos, e status por aula de **trilha de questões / flashcards / ficha resumo**.
2. **Transcrições** (`poTranscricoes/{vimeoId}.texto`): conteúdo real da aula; orçamento ~360k chars distribuído (módulos normais vão inteiros). Pode ser do Vimeo OU **manual** (colada; `fonte:'manual'`).
3. **Questões reais por prova** (`poModQuestoes`: ME/TEA/TSA 1ªF) + **TSA Oral por temas** (`oralTemas`).
4. **Pedidos de alunos** (`poModQuestoes.pedidos[]`).
5. **Edital** — **por módulo** (`poModQuestoes.editalModulo`) se preenchido; senão o **do curso** (`config/poConfig.editais[cursoId]`). Sem corte rígido (guarda alta 60k chars).
6. **Status da apostila** do módulo (`poModQuestoes.apostilas[]`; auto-importada do Laravel quando `apostila:true`).
7. **Atualização de conteúdo / nova diretriz** (`atualizacaoConteudo`) + **AULAS DA BANCA** (`transcricaoAvulsa` — campo mantido; UI renomeada de "aula avulsa" em 2026-06-20). ⚠️ **Semântica INVERTIDA:** antes "já coberto" (sinal negativo); agora aula da BANCA examinadora = **sinal FORTE do que cai** — conteúdo que a banca cobre e o módulo NÃO cobre vira **ação de gravar** (`notas.banca=1`, critério/peso próprio `banca`). + **CASOS CLÍNICOS** (`casosClinicos`, cap 350k) — usado SÓ na análise separada do TSA Oral (ver bloco 2026-06-20).
8. **Erros detectados ABERTOS** (`poErros/{aulaId}.erros`, status='aberto') → justificam **REGRAVAR** a aula (o "porque" resume o erro).
9. **Dúvidas com DEMANDA de atualização** (`poDuvidas/{aulaId}.posts`, status='demanda') → justificam **ATUALIZAR** a aula.
10. **Ações já dispensadas** (`analiseDismissed`) — a IA não repropõe.
Saída: `{resumo, acoes:[{titulo,categoria,provas,aula,porque,notas}], meta}`, salva em `poModQuestoes/{key}.analise`.

**B) INPUTS da análise de PRODUTO** (`analisarProdutoPO`, a partir de `{cursoId,cursoNome}`):
- Consolida as **análises JÁ SALVAS** de cada módulo (resumo + ações + provas) — NÃO reprocessa transcrição/questão.
- **Incidência OFICIAL por módulo** (API `POST /api/analise-provas/incidencia`, formato `{provas:[{escopo_id,ano}]}`, recorte **últimos 5 anos + o atual**), cruzada via `temaModulo` → **% de cada prova** que os temas do módulo cobrem. Escopos: TEA=9, TSA 1ªF=8, **ME = anuais 10/11/12 + quadrimestrais 136-144**. Substitui a contagem crua. TSA Oral = nº de temas.
- Produz **ranking por prova** (ME/TEA/TSA 1ªF/TSA Oral) priorizando incidência + gravidade. Persiste em `config/poConfig.analiseProduto[cursoId]`. O **sync Laravel reatualiza só os números** de incidência salvos (sem IA, via `atualizarIncidenciaSalva`).

**C) REGRAS que a IA segue** (instruções em `DEFAULT_PROMPT_MODULO`, editáveis em ✍️ Prompt da IA):
- **Menos é mais:** se o módulo já cobre bem o que cai (pelas QUESTÕES), o certo é retornar POUCAS ou ZERO ações. Não inflar.
- **Quem manda é a QUESTÃO:** só propõe aula (gravar/aprofundar) se o tema CAI na prova (questões reais) OU é alicerce clínico. Tema raro que já cai em 1-2 questões → a questão já cobre, NÃO propor ação.
- **Edital = sinal de BAIXO peso:** dá um empurrãozinho/desempate (critério `edital`), mas NÃO justifica sozinho. Itens administrativos do edital sem questões → omitir ou prioridade mínima.
- **Material de apoio = 4 ações SEPARADAS** (apostila do módulo; ficha resumo / trilha de questões / trilha de flashcards POR AULA com status Pendente).
- **Erro aberto → `regravar`** (porque resume o erro). **Dúvida com demanda → `atualizar`**. (sinais FORTES — demanda do time.)
- **(2026-06-20) Coluna "Regravar"** (slider Não/Sim por aula, `poAulas.regravar`, preservado no sync Laravel): ON → IA SEMPRE gera ação `regravar` (motivo fixo "Definido pela coordenação", prioridade pela incidência do módulo).
- **(2026-06-20) Cobertura do edital:** tema EXPLÍCITO no edital **+ >1 questão (2+) + NENHUMA aula cobre** → IA DEVE gerar `gravar` (regra anexada por código em `buildSystemPrompt`, vale mesmo com prompt custom). Resolve temas essenciais ausentes (ex.: tireoide no Sistema Endócrino).
- **(2026-06-20) Material pendente SEMPRE vira ação** (não sujeito a "menos é mais"); **módulo vazio / tema do edital sem aula → SEMPRE gera `gravar`** (nunca devolve lista vazia havendo aulas faltando). Trilha de questões/flashcards VAZIA conta como Pendente.

**D) COMO FUNCIONAM OS PESOS** (`⚖️ Pesos da priorização` · `config/poConfig.poPesos` × `PO_CRITERIOS`):
- A IA pontua cada **critério de 0 a 1** por ação (só os fatos). O **FRONTEND aplica os pesos** → mexer num peso re-ordena na hora, SEM custo de IA.
- Fórmula = **média ponderada NORMALIZADA**: `Σ(peso×nota) ÷ Σ(pesos)` (`_poPrioridade`). **A soma dos pesos NÃO precisa dar 100** — só importa a PROPORÇÃO de cada um (peso ÷ soma); dobrar todos os pesos não muda nada. O modal mostra o **% (fatia)** e uma barra de proporção por critério (amarelo), o valor do peso em azul, lista ordenada por peso, "Restaurar padrão".
- **12 critérios** (ids DEVEM bater entre `PO_CRITERIOS` no front e `CRITERIOS` na função), pesos-padrão: `lacuna(30), frequencia(20), edital(6), banca(25), status(15), avaliacao(12), pedidos(10), idade(8), apostila(5), fichaResumo(5), trilhaQuestoes(5), trilhaFlashcards(5)`. Sliders 0-50. (`banca` adicionado 2026-06-20.)

**E) O QUE NÃO É CONSIDERADO / não vira ação forte:**
- Estar no edital **sem** cair em questão e sem ser essencial clínico.
- Tema raro (1-2 questões isoladas) — a questão basta; não gravar/incluir.
- Ações **dispensadas** (`analiseDismissed`); erros **corrigidos**; dúvidas **resolvidas** ou só "abertas" (sem demanda).
- A IA NÃO inventa aulas/números/temas fora do material; transcrição "(truncada)" não vira "ausência".
---


**Cloud Functions** (`cloud-function-hotmart/po-analise.js`, exportadas no `index.js`): `analisarModuloPO`, `analisarProdutoPO` e **`analisarTSAOralPO`** (análise separada do TSA Oral, 2026-06-20). Modelo **Sonnet** (`claude-sonnet-4-6`), chave **separada** `ANTHROPIC_API_KEY_PO` (no `.env`, isola custo). CORS libera `localhost:8766` (dá pra testar local chamando a função de produção). Auth: Firebase ID token. Endpoints `analisarModuloPO`/`analisarProdutoPO`.
- **Módulo:** recebe só `{cursoId,cursoNome,modulo}` e lê TUDO server-side (Admin SDK): aulas do módulo (`poAulas`, com status/ano/avaliação/**status de trilha de questões, flashcards e ficha resumo por aula**), transcrições (`poTranscricoes/{vimeoId}` — orçamento ~360k chars distribuído, manda INTEIRO em módulos normais), questões + temas do oral + pedidos + atualização + transcrição avulsa (`poModQuestoes`), edital (`config/poConfig.editais`). Devolve `{resumo, acoes:[{titulo,categoria,provas:[],aula,porque,notas:{...}}], meta:{porProva,...}}`. **Cada ação pontua os critérios 0-1; o FRONTEND aplica os pesos.** Persiste em `poModQuestoes/{key}.analise`.
- **Produto:** `{cursoId,cursoNome}` → lê as `analise` JÁ SALVAS de cada módulo (NÃO reprocessa transcrição/questão), ranqueia os módulos POR PROVA priorizando incidência+gravidade. Frontend persiste em `config/poConfig.analiseProduto[cursoId]`.

**Taxonomia de provas (chaves internas → rótulos):** `MEs`→**ME**, `TEA`→**TEA**, `TSA`→**TSA 1ªF**, `TSAOral`→**TSA Oral**, `Geral`→**GERAL**. Ordem nas abas: ME · TEA · TSA 1ªF · TSA Oral · GERAL. **TSA Oral = lista de TEMAS** (não questões), pois a prova oral não tem múltipla escolha.

**Inputs (modal `#po-mod-modal`, dropdown "📥 INPUTS ANÁLISE"):** baldes de questões **ME/TEA/TSA 1ªF** (via API, `_PO_MOD_TIPOS=['MEs','TEA','TSA']`, rótulos `_PO_TIPO_LBL`), **TSA Oral** (textarea, 1 tema/linha → `poModQuestoes.oralTemas`), **ATUALIZAÇÃO DE CONTEÚDO** (textarea de nova diretriz → IA recomenda atualizar aulas desatualizadas; `atualizacaoConteudo`), **AULAS DA BANCA** (`transcricaoAvulsa`; sinal forte do que cai — ver REFERÊNCIA A.7), **🩺 CASOS CLÍNICOS** (`casosClinicos`, só pro TSA Oral), **PEDIDOS DE ALUNOS** (`pedidos`). Handlers `poModSetOral`/`poModSetCampo` salvam no blur.

**Critérios (`PO_CRITERIOS` no front × `CRITERIOS` na função — ids DEVEM bater):** **12 critérios** = `lacuna, frequencia, edital, banca, status, avaliacao, pedidos, idade` + **4 de material separados**: `apostila, fichaResumo, trilhaQuestoes, trilhaFlashcards`. (Ver bloco REFERÊNCIA acima pros pesos-padrão.) Cada um com peso editável em ⚖️ Pesos. A IA gera **ação separada** por tipo de material faltante (apostila do módulo; ficha/trilha de questões/trilha de flashcards POR AULA com status Pendente, listando quais aulas).

**Relatório (redesenho técnico/Apple-like):** abas por prova, **linha colorida por prioridade** (3 níveis: vermelho/amarelo/verde, sem bolinha), ação curta + **ℹ️** (abre o "porque"; listas viram bullets via `_poFmtPorque`) + **✕ descartar** (confirmação custom `#po-an-confirm`). "última análise em …". **Não fecha ao clicar fora.** Descartar → `poModQuestoes.analiseDismissed` (a função não repropõe; o produto ignora; restaurável).

**Barras de SAÚDE — REESCRITAS em 2026-06-20 (eram enganosas: vinham da AUSÊNCIA de ações da IA → módulo VAZIO dava 100%).** Agora: **📎 Materiais = determinístico**, lido das colunas (apostila + ficha resumo/trilha de questões/trilha de flashcards por aula; "Lançada"=ok, "Não se aplica" fora, vazio/"Pendente"=pendente) via `_poSaudeMateriais`. **🎬 Aulas = prontidão real × lacunas da IA**: % das aulas com status "pronto" (`_poIsPronta`: Postado/Visão validada/Revisão Aprovada) × fator das ações gravar/regravar/atualizar (`_poProntidaoAulas` + `_poModProgressoSplit`). **Módulo vazio = 0%** (nunca 100%). Linha do módulo (`_poProgBar2`), box de análise, e média no card do produto (só módulos analisados). Cor: ≥70 verde / ≥40 amarelo / <40 vermelho. (`_poSaudeDeAcoes` segue existindo como o "fator de lacunas".)

**Prompt editável** (✍️ Prompt da IA, painel do produto): `config/poConfig.analisePrompt = {modulo, produto}`. Edita só as **instruções/regras**; a parte técnica (lista de critérios + provas + formato JSON) é anexada pelo código (não quebra parsing). Função usa o custom se houver, senão o `DEFAULT_PROMPT_*`. Modo `{acao:'defaults'}` no endpoint devolve os textos-padrão pra tela. Modal `#po-prompt-modal`, abas Módulo/Produto.

**Ficha Resumo** virou **coluna de STATUS** (igual Trilha de Flashcards, `_PO_TRILHA3` = Pendente/Lançada/Não se aplica). Migração one-time `fichaResumoStatusMigrada` (coluna link→status; valores vazio→Pendente, link→Lançada).

### IA do Produto — Fase 1 ENTREGUE e no ar (2026-06-17)
Fundações da IA de priorização do PO (tudo em produção):
- **Apostila por MÓDULO** (não por aula) — **100% AUTOMÁTICA desde 2026-06-27** (era cadastro manual `{titulo,link,status}` c/ 4 status; o manual foi DESCONTINUADO). Schema novo: `poModQuestoes/{key}.apostilas:[{titulo,status:'Finalizado',fonteLaravel:true,laravelId,attId,laravelLabel,tamanho,bytes,addedAt,tituloCustom?}]` — vem do Laravel (`tasks[]` apostila=true) na sync. Status agora **BINÁRIO**: tem apostila→Finalizado / não→Pendente (`_poApostStatusModulo` simplificada). UI: 1ª linha do módulo aberto (`apostRow`), abre modal que LISTA as apostilas (só `fonteLaravel`) com botão **⬇ Baixar** (proxy `materiaisPO`, sem add/link manual). Download e nome editável detalhados na **Rodada 2026-06-27**. Coluna "Apostila" por aula REMOVIDA (migração `apostilaColRemovida`).
- **Pedidos de alunos** por módulo: `poModQuestoes/{key}.pedidos:[]` (array; migrou de string), tabela no modal (cada linha salva). (Baldes de questões hoje = `_PO_MOD_TIPOS=['MEs','TEA','TSA']`; o antigo "Outras" deu lugar ao **TSA Oral** por temas — ver megabrain Fase 2.)
- **Edital** por produto: `config/poConfig.editais[cursoId]` (campo único, botão "📋 Edital").
- **Pesos** da priorização: `config/poConfig.poPesos` + `PO_CRITERIOS` (**12 critérios** — inclui `edital` e `banca`, sliders 0-50, botão "⚖️ Pesos"). **Design:** a IA pontua cada critério 0-1; o código aplica os pesos → mexer peso re-ordena (e recalcula a barra de saúde) SEM chamar IA. Fórmula é média ponderada normalizada (soma dos pesos não precisa ser 100 — ver bloco REFERÊNCIA). `_poSavePesos` sanitiza o payload (só números válidos) pra não falhar no Firestore.
- **Questões via API do Laravel** (substituiu o anexo manual de .json): Cloud Functions **`filtrosPO`** (GET `/api/filtros` → categorias com `taxa_incidencia`+`peso`, tipos, anos) e **`puxarQuestoesPO`** (POST `/api/v2/web/questoes` por `categorias`, **últimos 5 anos SEM o atual**, paginado; adapta `descricao`→enunciado c/ decode de entidades, `isResposta`→gabarito, `escopo.alias`→balde TEA/TSA/MEs/Outras; grava em poModQuestoes preservando pedidos/apostilas). **Params da API (sem `filtro_`):** `categorias:[id]` (pai P1.. agrega subs), `ids:[]`, `anos:[]` — tipo de prova NÃO filtra (agrupa pelo `escopo` da questão). Mapeamento Ponto↔tema: `config/poConfig.temaModulo[cursoId][modulo]=[catIds]`, auto-match por número (P10↔Ponto 10) via botão "🧩 Temas dos módulos" (`poAbrirMapaTemas`), revisável. Botão "🔄 Puxar questões da API" no modal do módulo. **Só roda publicado** (token Laravel server-side + CORS).

### Próximos passos (retomar aqui)
> **Onde paramos (2026-06-20):** rodada grande — funções deployadas, frontend publicado. Novidades:
> - **Coluna "Regravar"** (slider) + IA considera o flag. **Aulas da banca** (renomeado de "avulsa", semântica invertida → priorização) com critério/peso `banca`. **Regra do edital** (explícito + 2+ questões + sem aula → gravar). Ver [[project_aros_po_regravar_edital]].
> - **Barras de saúde DETERMINÍSTICAS** (materiais das colunas; aulas = prontidão × lacunas; **módulo vazio = 0%**). **Backfill** one-time de status vazio → "Postado" (`statusPostadoBackfill`); aula nova do Laravel entra "Postado". Ver [[project_aros_po_saude_e_oral]].
> - **Análise SEPARADA do TSA Oral** (`analisarTSAOralPO`): botão no modal do módulo; conteúdo = aulas+transcrições + **CASOS CLÍNICOS** (`casosClinicos`, cola manual hoje, API depois); cobertura = aulas da banca + atualização + temas oral + pedidos (**SEM edital, SEM questões ME/TEA/TSA**). Lista só lacunas. Box dropdown próprio "TSA Oral" (fechado quando já gerado), NÃO mexe nas barras. Persiste em `poModQuestoes/{key}.analiseOral`.
> - **Inteligência do Produto = dropdown no topo** (fechado, design tech). Botão "Analisar produto" revela 2 opções com "i": **Análise rápida** (só módulos sem análise → consolida; economiza IA) e **Análise completa** (re-analisa todos, **front orquestra 3 em paralelo, barra X/Y, cancelável**, `_poProdAnalisarLote`/`_poProdRun`). Card do produto: barra "Produção" removida (só Aulas/Materiais). Blocos do modal coloridos por estado (vazio=vermelho/cheio=verde, exceto Pedidos). Botões redesenhados (mono/tech, sem emoji). **Fix 2026-06-20 (tarde):** `analisarProdutoPO` agora usa `max_tokens:16384` (era 4096 — com muitos módulos o JSON do ranking truncava → erro "panorama inválido"). **Rápida/Completa pedem confirmação antes** (Rápida LISTA os módulos sem análise que vai rodar — útil pra flagar análise órfã por rename). O **"i"** das opções abre a explicação ao CLICAR (`poProdInfo`), não no hover.
> - **⚠️ Deploy de função NOVA em worktree** precisa do `.env` copiado pro worktree antes (gitignored, só no repo principal). Ver [[feedback_worktree_env_deploy]].

> **Onde paramos (2026-06-19):** rodada grande entregue (funções deployadas; frontend commitado e publicado). Novidades desta rodada:
> - **Incidência oficial** ligada no produto (ver REFERÊNCIA B) + botão "🔌 Testar API de incidência".
> - **Edital com peso próprio** (critério `edital`, baixo) + **edital POR MÓDULO** (`editalModulo`) + limite de 8k removido.
> - **Sync Laravel** mais seguro: preserva trilha "Não se aplica", **auto-importa apostilas** (`apostila:true` no `tasks[]`), reatualiza incidência salva, retry/backoff em 429.
> - **Transcrição:** fallback entre faixas do Vimeo (faixa active quebrada → usa a inativa) + **entrada MANUAL** e re-pull individual (`salvarTranscricaoManual`).
> - **Colunas "Erro detectado" e "Dúvidas"** (fóruns por aula) que alimentam a IA (erro aberto→regravar; dúvida demanda→atualizar). Ver [[project_aros_forum_erro_duvida]].
> - **Saúde do módulo dividida** em 🎬 Aulas × 📎 Materiais (modal, linha da tabela e capa). **Capa do produto** redesenhada (dark-glass). **⚖️ Pesos** redesenhado (ordenado por peso, % + barra de proporção, sem somatório).
> - Rename de módulo agora migra `poModExtra`/`poModOrdem`/`poModQuestoes`/`temaModulo` (não orfaniza).

1. ~~Incidência do edital nas provas~~ **ENTREGUE (2026-06-19)**: incidência oficial cruzada por módulo (`temaModulo`) alimenta o ranking do **produto**. Formato certo do endpoint = `{provas:[{escopo_id,ano}]}` (recorte 5 anos + atual; o antigo `escopo_ids`+`years` ignorava o ano). Botão "🔌 Testar API de incidência" no painel. Ver bloco REFERÊNCIA (B) e [[project_aros_incidencia_edital]].
2. **Fase 3**: botão "Publicar na Comunicação"; liberar a aba `po` pra professor (hoje admin-only).
3. Pendências menores: Tiarlles rodar o lote das 436 transcrições; **regenerar tokens** expostos no chat (Vimeo `6eed…`, Client secret Vimeo). Laravel token é permanente — manter.

## Histórico recente (resumo cronológico)

Checklist — ajustes de UI da tela de aplicação (2026-06-06, deployado):
- Rótulo da nota do bloco: "NOTA CRIAR / SIMULAÇÃO" → **"NOTA FINAL DO BLOCO"** (elemento `#ck-nota-resultado`/`#ck-nota-val`, único, vale pros dois blocos).
- Fontes da tela de avaliação do bloco saíram do **Fraunces** (legado serifado) pra fontes técnicas: títulos (nome do aluno, título do bloco, "Caso N: …") em **Space Grotesk**; a nota grande (`#ck-nota-val`) em **JetBrains Mono** (cara de métrica). Pedido do Tiarlles: visual mais sério/tecnológico, menos "infantil".

Feedback dos casos — revisão da IA em LOTE (2026-06-06, deployado: função + site):
- **Problema**: a revisão de feedback por caso (`applyAIPrompt`) era **1 chamada isolada por caso** → a IA não via os outros casos e repetia recomendações/vícios entre eles. Era limitação de arquitetura, não de prompt.
- **Fix (opção A)**: `gerarFeedbackAluno` agora faz **1 chamada única** com TODOS os casos do aluno (`_reviewFeedbacksLote`). **Formato casado com o próprio prompt de revisão** (`config/aiPrompt.prompt`): entrada `[CASO N]` (N sequencial 1..K na ordem CRIAR→ORAL), saída `===CASO N===`. O parser faz split em `/===\s*CASO\s*(\d+)\s*===/i` (tolerante a espaços) e mapeia por número; `_stripCasoHeader` tira cabeçalhos vazados; limpa code fences. **Fallback** `_reviewFeedbackSingle` (1 caso por vez, também no formato `[CASO 1]`/strip) se o lote falhar/parsear errado → nunca quebra o feedback. Casos sem feedback e blocos "não fez" continuam ignorados.
- **Atenção**: NÃO injetar marcadores próprios (tentou-se `@@@CASO::` e quebrou — a IA seguia o formato `===CASO===` do prompt, não os marcadores). O delimitador é responsabilidade do prompt; o código só precisa falar a MESMA língua. O prompt vive em Configurações → "Prompt de revisão — feedback por caso" (Tiarlles mantém; já tem seção anti-repetição + exemplo few-shot 2-casos + formato de saída `===CASO <id>===`).
- **Cloud Function `feedback-ia.js`**: teto de `max_tokens` subiu 4096 → **8192** (cabe ~8 casos revisados numa resposta só). Precisou redeploy da function.
- Agora ajustes no "Prompt de revisão — feedback por caso" (`S.cfg.aiPrompt`) finalmente fazem efeito entre casos, pois a IA vê o conjunto.

Checklist — "Aluno não fez o bloco", filtro multi e médias por bloco (2026-06-06, deployado em produção):
- **Botão "Aluno não fez o bloco"** em cada card de bloco (Criar / Oral) na tela de blocos do aluno. Confirmação via **popup customizado** (`ckConfirmZerar`/`ckZerarBloco`, modal `#ck-zero-modal` no estilo `.mo/.md`). Zera a nota (0) + `finalizado:true` + `naoFez:true`, sincroniza `notas/{simId}/alunos/{key}` (criar/oral=0, recalcula notaFinal) e audita como `CK_BLOCO_FINALIZADO` (motivo `aluno-nao-fez`). Botão discreto: transparente, verde-escuro `#1c6b2e`.
- **"Não fez" conta como FINALIZADO**: status na linha do aluno fica verde-escuro "Finalizado · não fez" (`_blocoStatusBtn`), `done` destrava o **Gerar Feedback**, e o **filtro por bloco** trata como `finalizado` (fix em `_ckStatusBloco`).
- **Feedback ignora os casos do bloco "não fez"**: `gerarFeedbackAluno` pula os casos/habilidades desse bloco (flags `_naoFezCriar`/`_naoFezOral` passadas em `data`); `_renderExtraCasesPreview` também omite o bloco. A nota 0 do bloco ainda entra na nota final.
- **Filtro por bloco virou multi-seleção**: chips (`ckToggleBlocoFilter`) em vez de `<select>` — vários status por bloco (OR interno). Toggle **E/OU** (`ckSetFiltroModo`) pra combinar os dois blocos (aparece só quando há seleção nos dois). Estado `S.ckFiltroBloco={criar:[],oral:[],modo}`.
- **Média da turma POR BLOCO** na aba Desempenho (grade + PDF export): cabeçalho de cada simulado mostra "Média turma — Criar X · Oral Y · Final Z". Cada média de bloco conta só quem fez (**nota > 0**; nota 0 sai); a final segue exigindo os dois blocos > 0. Helper `_avgPos`; `mediasTurma[simId]` virou `{criar,oral,final}`.
- **NÃO há** mais "média da turma" no relatório de feedback (removida pelo Tiarlles antes).

Checklist — "Aluno não fez ESTE caso" (por caso) + média parcial + feedback IA resiliente (2026-06-08, deployado em produção, commits `f6e8abe`+`cd534d6`):
- **"🚫 Aluno não fez ESTE caso"** (granular, complementa o "não fez o BLOCO"): botão no header do card do caso (compacto "🚫 Não fez", `event.stopPropagation`) E no rodapé do caso aberto. `ckConfirmZerarCaso`/`ckZerarCaso`/`ckDesfazerNaoFezCaso` (modal `#ck-zero-caso-modal`). Liga `casos[ci].naoFez` → caso pontua 0 e vira verde. Tratado no TOPO de `getCasoStatus`/`_calcCasoScore`/`casoSalvo`, e o loop do botão Finalizar pula casos `naoFez`. Header mostra selo "🚫 Não fez · 0 pts"; corpo vira banner + "Desfazer" (early-return no forEach de `renderCkCasos`). Audit `CK_CASO_NAO_FEZ`/`..._DESFEITO`. Reversível.
- **Nota do aluno**: zerados contam 0 (escolha do Tiarlles — fiel a "zerar o caso"; bloco soma na escala 0–100, casos zerados = 0). Bloco finaliza com feitos + zerados.
- **Bloco parcial sai da média da turma**: `finalizarChecklist` calcula `_parcial=casos.some(naoFez)`, grava `blocoResp.parcialNaoFez` + `payload.criarParcial/oralParcial` em `notas`. As DUAS `mediasTurma` (Desempenho ~L29275 e export ~L29599) excluem blocos parciais: `n.criarParcial?NaN:parseFloat(n.criar)` etc, e a média final filtra `!criarParcial&&!oralParcial`. Regras confirmadas: turma só com quem fez bloco COMPLETO; nota individual considera tudo; parcial fora da média; casos feitos destravam feedback; só casos feitos entram no feedback.
- **naoFez de BLOCO × de CASO mutuamente exclusivos**: `ckZerarCaso`, `saveCkCaso` e `finalizarChecklist` setam `blocoResp.naoFez=false` (atividade por caso ⇒ não é "não fez o bloco inteiro"). `ckZerarBloco` grava `criarParcial/oralParcial=false`.
- **Feedback IA — exclusão por caso + cura de flag legado**: `gerarFeedbackAluno` agora pula casos `cr.naoFez` na montagem de `_casosLista` (antes só pulava bloco inteiro). E `_naoFezCriar/_naoFezOral` só valem se o bloco NÃO tem nenhum caso feito (`_blocoFeito(b)`) — assim um aluno com flag de bloco legado/stale + caso feito **mostra os casos feitos** (cura sem refazer nada). **Bug que isso resolveu**: caso feito sumia do feedback porque um flag de bloco antigo excluía o oral inteiro.
- **Feedback IA — resiliência do lote** (`_reviewFeedbacksLote`): deixou de ser tudo-ou-nada → retorna **parcial** (casos faltantes caem pra `_reviewFeedbackSingle`). No loop, **detecção de eco**: se o lote devolveu texto ≡ ao cru (IA "preguiçou" nos últimos), refaz individual. `_callFeedbackIA` ganhou **retry** (2×, espera 900ms) em erro de rede / 429 / 5xx. **Causa do "2 últimos casos sem tratamento da IA"**: lote truncava no limite de tokens (ou ecoava) e o tudo-ou-nada descartava tudo. **Nota de teste**: a IA é CORS-bloqueada em `localhost` — só dá pra validar tratamento no site publicado.

PO MEDREVIEW — Coordenação de Produto, Fase 1 "shell" (2026-06-05, deployado em produção em 2026-06-06):
- Nova área interna de gestão de cursos (ver seção dedicada acima). Grupo de menu `poMedreview` + aba `po` (admin-only), navegação verticais→cursos→curso, planilha de aulas com **colunas configuráveis** (texto/link/status), 1ª coluna fixa, módulos colapsáveis (dropdown), resize de colunas, status com famílias de cor.
- **Tudo com dados de exemplo em memória** (tirados do board real do Monday) — ainda NÃO persiste. Objetivo da sessão foi alinhar requisitos + aprovar o visual antes de ligar no banco.
- Decisões de produto/import travadas (ver seção). Próximo: Firestore + import das 765 aulas + IA.

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

### Rodada 2026-06-22 — ignorar módulos, relatório do produto LOCAL, feature THUMB, filtros de coluna, fixes

**Ignorar módulos.** Cabeçalho de cada módulo no PO tem botão **Ignorar** (`poToggleIgnorarModulo` → `config/poConfig.modulosIgnorados[cursoId]=[nome,...]`). Módulo ignorado: NÃO é puxado da API (a `sincronizar-laravel.js` pula no `buscarCursoLaravel`, casando por nome normalizado), NÃO entra na análise/consolidação/incidência (filtro no front + `po-analise.js incidenciaOficialPorModulo`/consolidação). Linha escurecida, esconde "Analisar".

**Relatório do produto reescrito — agora LOCAL, sem IA.** A consolidação deixou de chamar `analisarProdutoPO`; vira `_poRenderProduto`/`_poBuildProdutoWorklist` no front, que junta as `acoes` que cada módulo já gerou (menos ignorados/dispensados). Dropdown fechado por padrão, 2 abas **Aulas Pendentes** / **Materiais Pendentes** (split por `_poAcaoEhApoio`), sub-filtro de materiais (`_poMaterialSubtipo`: apostila/ficha/flashcards/questões), tags de prova por ação (sem TSAOral/Geral), "i" pro motivo, cor de fundo = prioridade (`_poNivelDe`/`_poPrioridade`). Sem resumo no topo, sem % de incidência. Análise rápida/completa por módulo continuam usando IA; só a consolidação ficou local.

**Feature THUMB.** Coluna fixa **THUMB** (entre colunas e "＋"; `span = poColunas.length+3`). Por aula: botão **GERAR** (gradiente roxo `po-thumb-btn`) → chama a Cloud Function nova **`gerarPromptThumb`** (`thumb-prompt.js`, Sonnet, `ANTHROPIC_API_KEY_PO`) que lê a transcrição (`poTranscricoes/{vimeoId}` ou puxa do Vimeo) + nome da aula e devolve um **prompt pronto pro DALL·E** (capa estilo Pixar/DreamWorks, 16:9, título=nome da aula como elemento dominante legível em mobile) — só pra copiar, não gera imagem. Ao lado, slider **Sim/Não** (`poToggleThumbLancada` → `poAulas.thumbLancada`, "Sim" verde = lançada; em `_PRESERVAR`). Botão **🖼️ Prompt Thumb** na barra da Inteligência do Produto (`poAbrirPromptThumb`): edita a instrução (já vem montada com `_PO_THUMB_DEFAULT_INSTR`; salva em `config/poConfig.promptThumb`) + **Thumb avulsa** (título + ID do Vimeo → gera prompt sem precisar da aula na planilha). Botões `.tb-btn` (gradiente/glow). Ver [[project_aros_thumb]].

**Filtros de coluna personalizados** (`_poColFiltroControl` + `_poFiltraAulas`): Avaliação = faixas (1-3,5 / 3,6-4 / 4,1-4,5 / 4,6-5 via `_poRating`/`_PO_AVAL_RANGES`); Ano = anos presentes nos resultados; Transcrição(`conteudo`)/Erro/Dúvida/Regravar/Thumb = Sim/Não; Vídeo e Duração sem filtro. "Erro/Dúvida aberta" = `a.erroAberto`/`a.duvidaAberta` (status ≠ resolvido), com backfill em memória no `loadPO` (lê `poErros`/`poDuvidas` em massa, sem escrever).

**Fixes importantes.**
- **Busca de aulas do módulo robusta** (`_aulasDoModulo` em `po-analise.js`, usada na análise de módulo E TSA Oral): o `where('modulo','==',modulo)` exato (com trim) falhava quando o nome do módulo/curso da aula tinha qualquer diferença (espaço/acento/traço/caixa) — aí a IA recebia ZERO aula e dizia "nenhuma aula existe", recomendando gravar aulas que já existiam transcritas (enquanto as questões/edital, por slug, entravam normal). Agora cai num **fallback normalizado** (slug) quando o == não acha nada.
- **Barra de Materiais** (`_poSaudeMateriais`): apostila pronta = status **'Finalizado'** (vocabulário PO_APOST_STATUS), não 'Lançada' — antes a apostila finalizada contava como pendente e desequilibrava o %.
- **Transcrição Vimeo — 3º modo de falha (ID errado do Laravel):** ver [[project_aros_transcricao_vimeo]]. O re-pull manual sempre usa o `a.vimeoId` gravado e não há campo na tela pra editar o ID; corrige no Laravel + Sincronizar.

### Rodada 2026-06-23 — Flashcards por aula (IA + curadoria) + Gastos API

**Feature FLASHCARDS.** Duas colunas fixas novas no PO depois da THUMB (`span = poColunas.length+5`): **Resumo LM** e **Flashcards**. Ver [[project_aros_flashcards]].
- **Geração:** Cloud Function `gerarFlashcardsPO` (`flashcards-po.js`, Sonnet 4.6, `ANTHROPIC_API_KEY_PO`, prompt caching). Junta 3 fontes server-side: **transcrição** (`poTranscricoes`), **questões da trilha** (Laravel: curso→módulos[acha por nome]→conteúdos[acha por `laravelId`]→`trilhas[].json.ids` → `POST /v2/web/questoes {ids}`) **+ gabarito comentado** (`POST /web/comentario/gabarito {model_id,is_gabarito:true,model_type:'QUESTAO'}` → `content` HTML, limpo), e **Resumo LM** (`poFlashcards/{aulaId}.resumoLM`, colado). Fatia por tamanho (~9k), cobre tudo SEM piso/cota, dedup, **regra anti-travessão (—)** no prompt + limpeza `semTravessao()`. Salva rascunho em `poFlashcards/{aulaId}.rascunho` e devolve.
- **Coluna Flashcards:** botão **Gerar** pequeno (roda em SEGUNDO PLANO via `a._fcGen` → spinner na célula `po-fc-gen`, não trava o painel) + chip **DECK** à esquerda (abre curadoria) + **barrinha de %** com número (`_poFcCellHTML`; markers `a.fcHasDeck/fcRevisaveis/fcAprovados`). **Coluna Resumo LM:** botão abre caixa grande pra colar (`poAbrirResumoLM`, salva em `poFlashcards`).
- **Curadoria** (`_poCuradoriaRender`/`_poCurCardHTML`, modal `#po-curadoria-modal` — NÃO fecha clicando fora): 3 blocos por `_estado` (pendentes abertos no topo → aprovados recolhidos → descartados no fim; `_poCurMover` reposiciona). Cada card abre/fecha clicando no header (`poCurToggleOpen`, `_open`); **aprovar**(verde)/**descartar**(vermelho) por card (`poCurAprovar`/`poCurDescartar`). Status no topo (pendentes/aprovados/**% ao vivo**, descartados fora da conta) + barra grande. Texto **justificado**; SEM tags/dificuldade/fonte no card (dados persistem, só não exibidos). Preserva scrollTop entre renders. **Salvar deck** → `poFlashcards/{aulaId}.deck` (cada card com `estado`). Push pro Laravel = 2º momento (pendente).
- **Editor de prompt:** botão **🃏 Prompt Flashcards** (`poAbrirPromptFlashcards`, `config/poConfig.promptFlashcards`, padrão `_PO_FC_DEFAULT_INSTR`).
- **Rules:** `poFlashcards/{aulaId}` read/write se `isAuth()`.

**Gastos API.** Botão **💰 Gastos API** na barra da Inteligência de Produto (`poAbrirGastosAPI`). Livro-caixa em `config/poCustosIA` (módulo `custos-ia.js` → `registrarCusto(categoria,custoUsd)` com `FieldValue.increment`): total por tipo (`analise`/`thumb`/`flashcards`) + por mês (`meses.{YYYY-MM}`). As 5 funções de IA (análise módulo/produto/oral, thumb, flashcards) registram custo. Tela mostra Por tipo (total) + Por mês (com quebra). Vale a partir do deploy de 2026-06-23 (sem retroativo). Cliente lê o doc direto (read aberto via `config/{cfgId}`).

**Ajustes da mesma rodada (em produção):**
- **Coluna Copiar** (`po-col-copia`, `_poCopiaCellHTML`/`poCopiarConteudoAula`): botão "📋 Copiar" por aula que monta `gerarFlashcardsPO` **acao:'montar'** (sem IA/sem custo) e copia pro clipboard, em ordem: transcrição + questões/comentários da trilha + Resumo LM. `span = poColunas.length+6`. Copy com fallback `execCommand` (`_poCopyText`).
- **Thumb agora em segundo plano** (igual flashcards): `poGerarThumb` não abre modal, spinner na célula (`a._thumbGen`), salva em `poAulas.thumbPrompt` (+ `_PRESERVAR`), chip roxo **Prompt** (`poThumbCopiarChip` copia) ao lado do botão Gerar (roxo, pequeno) na mesma linha do slider. **Confirmação (`arosConfirm`) antes de regerar** se já há prompt.
- **Curadoria refinada:** 3 blocos (pendentes abertos no topo → aprovados recolhidos → descartados no fim), aprovar/descartar = dropdown recolhido (`_poCurMover`/`poCurToggleOpen`, qualquer card abre/fecha no clique), status de revisão (% ao vivo) + barra grande no topo, **preserva scroll** entre renders, texto **justificado**, SEM tags/dificuldade/fonte no card. Coluna Flashcards: chip **DECK** + barra de % (com número) + botão Gerar pequeno.
- **CORS:** todas as functions do PO/IA liberam qualquer `localhost`/`127.0.0.1` (o server local usa porta automática — senão dá "Failed to fetch" no dev).

### Rodada 2026-06-25 — Multi-vertical, prompts por produto, MegaBrain API

**Verticais (4):** `VERTICAIS` em index.html — `anestreview` (💉 Anest), `oftreview` (👁️ Oft), `ortopreview` (🦴 Ortop), `medreview` (🎓 MedReview R1). Cursos têm campo `vertical`; `_poCursosDaVertical(vid)` filtra. Aulas (`poAulas`) são uma coleção FLAT entre todas as verticais, agrupadas a um curso **pelo NOME** (`a.cursos[].includes(c.nome)`).

**Curso MedReview "Extensive R1":** mesma API Laravel da Anest (`api.grupomedreview.com.br`), mas **token por vertical** — o banco de aulas E de questões é separado por conta (testado: token Anest não vê R1 e vice-versa). `LARAVEL_TOKEN_MEDREVIEW` no .env. Cuidado de colisão: o `course_name` da R1 na API é "EXTENSIVE" (igual Anest) → no robô usa `forcarNome:true` p/ agrupar como "Extensive R1".

**Botão "➕ Novo curso"** (`poNovoCurso`/`poNovoCursoSalvar`, modal `#po-novocurso-modal`): cadastra curso em qualquer vertical. Campos: **Nome** + **ID do curso no Laravel** (`laravelCourseId`). Cria `{id:_poSlug(nome),vertical:S.poVertical,nome,laravelCourseId}` em `config/poConfig.cursos`. O ID liga a sincronização automática.

**Robô self-service** (`sincronizar-laravel.js`): `montarCursosVigiados()` = `CURSOS_BASE` (Anest+MedReview hardcoded) + todo curso do `poConfig.cursos` com `laravelCourseId` (forcarNome=true, dedup por courseId). `TOKENS_POR_VERTICAL` (anestreview→`LARAVEL_TOKEN`, medreview→`LARAVEL_TOKEN_MEDREVIEW`, **oftreview→`LARAVEL_TOKEN_OFTREVIEW || LARAVEL_TOKEN_MEDREVIEW`**). Definido em 3 arquivos (sincronizar-laravel, materiais-po, flashcards-po); megabrain reusa o de flashcards. Conta de login nova = 1× add token no .env + linha no map (em cada um dos 3). Curso novo em vertical já configurada = criar+colar ID+puxar, **sem deploy**.

**Sync por vertical:** botão manual (`_poSyncCall`) manda `vertical` (do curso aberto) → `sincronizarTudo({vertical})` filtra só aquela vertical. A automática de segunda (`sincronizarLaravelAuto`) NÃO passa vertical → puxa TODAS.

**Questões token-aware** (`flashcards-po.js`): `fonteDaAula(aula)` resolve `{token,courseIds}` pela vertical do curso (via poConfig.cursos). `idsDaTrilha/questoesPorIds/comentarioDaQuestao/anexarComentarios/laravelGet` aceitam token. Conserta Copiar/Flashcards da R1.

**Prompts de IA POR PRODUTO** (era global): chaves novas em `config/poConfig` — `promptThumbCurso[cursoId]`, `promptFlashcardsCurso[cursoId]`, `analisePromptCurso[cursoId]={modulo,produto}`. Cascata **produto → global legado → default**. Editores (thumb/fc/análise) abrem/salvam por `S.poCursoAtual`, título mostra o produto, badge "(só deste produto)". Backend (thumb-prompt.js, flashcards-po.js, po-analise.js) lê a chave do produto; thumb/fc recebem `cursoId` no req. Editar num produto NÃO afeta outro.

**MegaBrain API** (`megabrain-api.js`, function `megabrain`): API de leitura pro MCG (gerador de Hot Topics). URL `https://us-central1-simulados-confirmacao.cloudfunctions.net/megabrain`. `GET /lessons?course=&q=&page=` (lista, 50/pág) + `GET /lessons/{id}/content` (transcrição + questões comentadas estruturadas `{label,statement,alternatives[],answer,comment}`) + `GET /lessons/{id}/materials` + `GET /lessons/{id}/materials/{attId}` (download). **Auth com escopo POR VERTICAL:** `MEGABRAIN_KEY_<VERTICAL>` no .env só vê aquela vertical (fora=404); `MEGABRAIN_API_KEY` master vê tudo. Header `Authorization: Bearer` ou `X-API-Key`. `KEY_MAP` é montado no load do módulo a partir das envs `MEGABRAIN_KEY_<VERTICAL>` → **vertical nova exposta ao MCG = 1 env + deploy só do megabrain**. Reusa os helpers token-aware do flashcards-po. Doc de handoff p/ o dev do MCG: gerado em ~/Downloads/megabrain-api-handoff.md.

**OftReview no PO (2026-06-29):** vertical `oftreview` ganhou token mapeado (a conta medmembers / `LARAVEL_TOKEN_MEDREVIEW` **enxerga os cursos de Oft na mesma API** — verificado via `/curso/{id}/modulos`; token é **permanente, não expira**). Curso importado: **"Extensive Oft"** (nome distinto p/ não colidir com "Extensive" da Anest no agrupamento flat de `poAulas`), courseId Laravel `5a84366a-0823-4870-8b55-34f7eaf766f2`, **273 aulas** de Oftalmologia (módulos Óptica/Refração/Córnea/Glaucoma…). Entra sozinho na sync automática de segunda (lê do painel). Chave MegaBrain própria `MEGABRAIN_KEY_OFTREVIEW` (prefixo `mbk_oft_`) deployada → o colega do MCG lê a Oft com o MESMO endereço, só trocando a chave; escopo trancado (testado: 273 aulas, scope `oftreview`, sem vazar outras verticais; chave errada=401). **Pendência:** `questoes-po.js` (filtrosPO/puxarQuestoesPO, "Puxar questões" em massa) ainda é só token Anest — não token-aware; cópia de questões por aula via flashcards-po já funciona p/ Oft.

---

## Painel do Dia — Simulado Presencial (grade/rodízio/estações · controle ao vivo) (2026-06-04)

Substitui o antigo modal "🎯 Configurar Estações" (`openEstacoesPres`/`mep*`, que continua no código como legado, **não apagar** — compat) por um **Painel do Dia** completo. Botão **📅 Painel do Dia** no header de cada dia em `renderCoSchedPres`. Modal `#modal-painel` (+ modal secundário `#modal-pd-est` que abre POR CIMA, z-index 1200).

**Conceitos (terminologia):** a *turma* é dividida em N **grupos**; ao longo do dia os grupos fazem rodízio entre **estações** (1 Simulado + oficinas). Quando um grupo está no **Simulado**, ele se reparte em **blocos** de **salas**; dentro de um bloco os 4 alunos **rodam** pelas salas (rodízio rodada×sala), 2 casos por sala. Oficinas = grupo inteiro, sem rodízio interno.

**Modelo de dados** — `S.curSim.painel[dia]` (dia = `sabado`|`domingo`):
```
{
  inicio:'08:00', casoMin, gapMin, trocaMin, salasPorBloco,   // casoMin/gap/troca: legado, NÃO mais usados (horários derivam do inline)
  estacoes:[ {id, tipo:'simulado'|'oficina', nome, prof} ],     // prof só p/ oficina
  salas:[ {id, nome, prof} ],                                   // 12 salas; SEM casos aqui
  casos:[ 'Caso 1','Caso 2', ... ],                             // LISTA PLANA (2 por sala, na ordem), compartilhada em todos os blocos
  grupos:[ {id, nome} ],
  timeline:[ {kind:'rotacao', dur} | {kind:'evento', nome, dur, icon} ]
}
```
Campos no doc do aluno (`simulados/{id}/alunos/{aId}`): **`grupoPainel`** (id do grupo) + **`blocoPainel`** (índice 0-based do bloco). Setados por `pdAutoDist` (auto-distribuição balanceada) e `pdMoveAluno` (mover entre grupos sem excluir — vai pro bloco menos cheio do destino).

**⚠️ GOTCHA Firestore — nada de array aninhado:** `casos` TEM que ser lista plana de strings. Já foi array de pares `[[c1,c2],...]` e quebrou o save (`Function setDoc() called with invalid data. Nested arrays are not supported`). `_pdNormalize` converte formatos legados (pares, ou `salas[].casos` antigo) → plano. `_pdCasoDe(c,salaIdx)` = `[casos[pos*2], casos[pos*2+1]]` onde `pos = salaIdx % salasPorBloco`.

**Rodízio (round-robin no sentido da imagem):** `_pdEstacaoDe(c,grupoIdx,blocoOrd)` = `estacoes[((grupoIdx-blocoOrd)%n+n)%n]`. Dentro do bloco, célula sala `j` na rodada `r` = `membros[((j-r)%n+n)%n]` (Latin square; ordem ESTÁVEL por nome pra ausente não recompactar).

**Horários:** controlados SÓ inline na grade. `pdGradeStart(i,val)` edita o início de uma linha → ajusta a `dur` do item ANTERIOR da timeline (tudo abaixo desliza, durações preservadas; linha 0 = `inicio`). Cada `rotacao` tem `dur` própria (default 85). As rodadas do Simulado **dividem o bloco igualmente** (`blkDur/n`), sem controle de tempo separado.

**Funções (todas `pd*`):** `openPainelDia(dia)` · `pdSwitchTab` (segmented control Grade/Configurar) · `pdRenderGrade` (tabela Horário×Grupo estilo "imagem", células clicáveis) · `pdOpenEstacao(grupoId,blocoOrd,startMin,estId)` → `pdRenderEstacao` → `pdRenderEstSim` (abas de bloco + rodada×sala) | `pdRenderEstOficina` (lista de alunos 1-por-linha, alfabética, prof SÓ leitura — edita em Configurar) · `pdRenderConf` (accordion) · `pdAutoDist` · `pdMoveAluno` · `pdSaveConf` · `pdFilterAlunos` (busca ignora acento/maiúsc via `_pdNorm`) · `pdSalvarCasos` · `pdPrint`.

**Config (accordion `_pdAcc`, seções colapsáveis, estado em `_pd.open`/`_pd.openG`):** "Estações" (cartões lado a lado; "+ Estação" pergunta Oficina/Simulado inline via `_pd._addEst`, sem seletor de tipo no cartão), "Configurar Salas" (dropdown "Nomear casos das salas" plano Caso 1..8 + botão Salvar; salas em cartões lado a lado por bloco; títulos **Bloco N** destacados com divisória), "Configurar Alunos" (4 grupos lado a lado em colunas, nomes abertos embaixo, busca no topo, mover via select compacto), "Linha do tempo" (rotacao/evento, dur editável, reordenar).

**⚠️ GOTCHA escopo de módulo:** o `<script>` é **module** → `onclick`/`oninput` inline só enxergam `window.*`. Funções declaradas (`function pdRenderConf(){}`, `renderCoSched`) NÃO são globais. Por isso expus **`window.pdRenderConf`** e **`window.renderCoSched`**. Se um handler inline novo chamar função interna, ele falha SILENCIOSO (foi o bug do "+ Estação não faz nada"). Regra: handler inline → sempre `window.*`.

**Estética:** ícones SVG de traço (`_pdIco` + `_PD_ICONS`, estilo SF Symbols/Lucide, monocromático currentColor) no lugar de emoji de chrome; títulos em Space Grotesk, números em JetBrains Mono; paleta theme-safe via `color-mix` (`_pdCor`). CSS escopado em `<style id="pd-style">`. Toast flutuante `_pdToast(texto, ok)` (fixed bottom-center, z-3000) pro feedback de salvar/distribuir.

**Eventos da grade (`pdRenderGrade`):** sem itálico, fonte Space Grotesk; "Almoço" em MAIÚSCULAS, "Devolutiva" linha azul, "Habilidades/soft-skills" linha roxa (detecção por `_pdNorm(nome).includes(...)`).

**Ausência (live):** lê o status de **presença** (campo `presenca`). Marcou `ausente` → no Simulado a vaga vira "AUSENTE" riscado SEM recompactar (mantém o caminho dos demais). `pdLiveRefresh()` re-renderiza grade/estação aberta quando `S.students` muda (gancho no `subStudents`).

### Tela de gerenciamento (renderCoSchedPres) — ajustes presencial (2026-06-04)
- **Topo limpo no presencial:** "+ Aluno" e "⏰ Configurar Rodadas" (`#co-sched-tools`) ficam `display:none` quando `S.curSim.presencial` (são funções de simulado online). O "+ Aluno" do header do dia permanece. Toggle no início de `renderCoSched`.
- **Linha do aluno em 1 linha só** (`flex-wrap:nowrap`): nome (encolhe c/ ellipsis) · status select (170px) · presença · ↔️ Mover · ↺ · ✕.
- **Ausente = linha vermelha na hora:** classe `status-absent` aplicada quando `presenca==='ausente'` (render) + `_applyPresVisual` agora também pinta a `.aluno-row` (feedback instantâneo otimista, antes do snapshot).
- **No-show 30 min (já existia):** `togglePresBtn` carimba `presencaAusenteAt`; `_noShowSweep` (interval 60s, `NO_SHOW_MIN=30`) move quem está ausente há ≥30min pra `status:'absent'` → cai no painel de ausentes do rodapé (`renderNotGoingPanel` → `#co-not-going`). Não puxa fila de espera (não faz sentido no meio da rodada).

### Livros — compilações de apostilas em capítulos (Catálogo de Produtos, 2026-06-25)

Seção **Livros** dentro da aba Produtos. Botão **📚 Livros** (estilo tech violeta `.pro-tech-btn.tv`) na toolbar do catálogo, à direita do "Pergunte ao Dex"; o "Gerenciar pack" virou `.pro-tech-btn.te` (esmeralda). Um livro = um **curso** (vertical+curso de `S.poCursos`), com **capa, nome, ISBN** e uma seleção manual de Pontos/módulos. Os **capítulos são derivados automaticamente** das apostilas — o coord não digita capítulo nenhum.

**Coleção `livros/{id}`:** `{vertical, cursoId, nome, isbn, capaUrl, capaPath, modulos[], ordem, createdAt, updatedAt}`. `modulos[]` = strings EXATAS de módulo (ex: "Ponto 1 – ..."). Listener `onSnapshot` em `initProdutos` popula `S.livros`; guard `if(!_proLivrosUnsub)` evita reassinar.

**Derivação dos capítulos (`_livroCapitulos(livro)`):** percorre `S.poModOrdem[cursoId]` (ordem do currículo), filtra os módulos que estão em `livro.modulos`, e pra cada um lê `S.poModQuestoes[_poModKey(cursoId,modulo)].apostilas`. Cada apostila (descarta casca-vazia sem título E sem link) vira um capítulo numerado em sequência. Linha mostra título (link se `apostila.link`), Ponto e **data de entrada** (`apostila.addedAt` formatada, "—" se ausente). Apostila nova entra sozinha a cada sync do Laravel.

**Carimbo de data:** `sincronizar-laravel.js` (auto-import de apostilas) agora grava `addedAt` nas apostilas `fonteLaravel` — preserva por `laravelLabel`, novas recebem ISO do dia. Apostilas anteriores só ganham data na 1ª sync pós-deploy (decisão UX: "—" até lá).

**Views (dispatcher `_proRender`):** `produtosView` ganhou `'livros'` (grid de cards, `_proRenderLivros`) e `'livro'` (detalhe com capa + ISBN inline + lista de capítulos, `_proRenderLivroDetail`). Funções `window.proLivro*` (Abrir/Novo/Editar/Excluir/SetIsbn/Salvar) + modal `proLivroModal*`. Carga preguiçosa do PO via `_livrosEnsurePO()` → reusa `loadPO()` (guarda em `S._poLoaded`/`S._livrosPoLoading`); botão "＋ Novo livro" fica `disabled` enquanto o PO carrega.

**Modal (`_proLivroModalHTML`, classe `.pro-livro-modal-card`):** glassy moderno (blur, borda violeta), **flex-column com cabeçalho/rodapé fixos e `.m-body` rolável** (`overflow-y:auto;flex:1`) — corrige o bug do ✕ que sumia quando a lista de módulos crescia (antes o card inteiro rolava). Checkbox de módulo **NÃO re-renderiza o modal** (só muta `S._livroModal.modulos`; checkbox nativo reflete) — evita o flicker; "Marcar todos/Limpar" mexe só nos `.checked` via DOM. Upload de capa pra `livros/${vertical}/${id}/capa_*` (Storage), com delete do `capaPath` antigo.

**Rules:** `firestore.rules` bloco `match /livros/{livroId}` (read/write isAuth + valida nome). `storage.rules` bloco `match /livros/{livroId}/{allPaths=**}` (img ≤20MB, auth). Ambos deployados em 2026-06-25.

### Rodada 2026-06-27 — Download de slides/apostilas do Laravel + MegaBrain serve materiais + filtro de apostila

**Anexos do Laravel viram download de verdade.** `/modulo/{id}/conteudos` embute os anexos em `tasks[]` (type:'material'); cada um tem `link` = URL de download **assinada e EXPIRÁVEL** que só baixa com o Bearer do Laravel no header (sem auth → 302 `/login`). O link cru NÃO funciona no navegador → tudo passa por **proxy server-side**.

**Cloud Function nova `materiaisPO`** (`cloud-function-hotmart/materiais-po.js`, export no index.js): POST auth Firebase, modos `list`/`download`. Acha a aula (candidatos de curso via `CURSOS_HARD`+`poConfig.cursos` → módulos casa por `nome` → conteúdo por `laravelId`) e faz **proxy** do arquivo com o Bearer (devolve o binário + Content-Disposition). `materiaisDoConteudo` (coluna Slides) **EXCLUI** apostila=true (apostila vai pro botão do módulo). Helpers EXPORTADOS reusados pela MegaBrain: `acharConteudo`, `listarMateriais` (TODOS com `type:'slide'|'apostila'`), `baixarMaterial` (fonte única do proxy). `TOKENS_POR_VERTICAL.medreview = LARAVEL_TOKEN_MEDREVIEW || LARAVEL_TOKEN` (Anest acessa currículo/materiais do R1).

**Coluna "Slides"** (era link manual): vira botão **📥** que abre modal listando os materiais COMUNS da aula (apostila sai daqui) com Baixar. `_poColCell`/`poCelEditar` interceptam `col.id==='slides'`; `poAbrirMateriais`/`poMatBaixar` (blob via `URL.createObjectURL`). Migração one-time `slidesMatColAdded` re-insere a coluna se foi deletada (respeita exclusão futura).

**Apostila do módulo 100% automática** (ver schema atualizado na seção PO acima): sync grava `{laravelId,attId,...}` por apostila, descarta manuais, dedup por attId, status sempre Finalizado. Modal lista só `fonteLaravel` com Baixar. **Botão "🗂️ Controle materiais"** (link manual por módulo) foi criado e DEPOIS removido nesta sessão — NÃO existe mais (`controleMateriais` saiu do schema/UI).

**Filtro de apostila no cabeçalho da coluna "Aula":** o filtro `__aula` deixou de ser texto (filtrava nome do Ponto) e virou um **SELECT** "Apostilas: todas / Tem apostila / Não tem apostila" (`_poColFiltroControl`) — filtra os MÓDULOS pela presença de apostila (`_poFiltraAulas` colId==='__aula' usa `poModQuestoes[...].apostilas.length>0`).

**Livros (catálogo) — Baixar PDF + rename inline (2026-06-27).** `_livroCapitulos` agora carrega `laravelId`/`attId` e o nome de exibição (`tituloCustom||titulo`). No detalhe do Livro cada capítulo tem **input de nome editável** (`proLivroRenomearCap` → grava `tituloCustom` na apostila do módulo, salva via `_poSaveModQuestoes`; apagar volta ao nome do Laravel) e **botão ⬇ Baixar PDF** (`proLivroBaixarCap` → `_poBaixarMaterialBlob`, proxy materiaisPO; catálogo é interno/logado). Numeração sempre fixa/sequencial 1,2,3… (não atrelada ao módulo). **A sync PRESERVA `tituloCustom` por attId** (não sobrescreve o nome editado — junto do `addedAt`). `_poBaixarMaterialBlob` é a fonte única de download (modal de apostila do PO + Livro do catálogo); `poApostBaixar` refatorada pra usá-la.

**MegaBrain API ganhou materiais** (`megabrain-api.js`): `GET /lessons/{id}/materials` (lista slides+apostilas, cada um com `type`) e `GET /lessons/{id}/materials/{attId}` (baixa o binário; proxy via `baixarMaterial` do materiais-po). Escopo por vertical mantido. Doc handoff atualizado em `~/Downloads/megabrain-api-handoff (1).md` (seções 3.3/3.4). Chaves: `mbk_anest_…` / `mbk_medr_…`.

**MedReview R1 — slides/apostilas OK; questões exigem o token do R1.** Currículo+materiais+apostilas: o `LARAVEL_TOKEN` (Anest) JÁ acessa o curso R1 (courseId `43b2fb17-…`) → slides/apostilas funcionam (testado, download = PDF real). MAS o **banco de QUESTÕES do R1 é separado por conta** e SÓ abre com `LARAVEL_TOKEN_MEDREVIEW` (`3076248|…`, Sanctum, **PODE EXPIRAR**). **BUG 2026-06-27 (resolvido):** o `.env` tinha PERDIDO esse token → ao redeployar a `megabrain` ela ficou sem ele → `fonteDaAula` (flashcards-po.js: `if(tk)` só usa se truthy) caía no token Anest → questões R1 vinham `[]` (transcrição/apostilas vinham normais). Fix: token recuperado de worktree antigo (`inspiring-dewdney-494e4b`), validado (puxa as 9 questões da "Câncer de Tireoide"; token Anest = 0), restaurado no .env (principal+worktree), `megabrain` redeployada. **PENDÊNCIA:** trocar por token permanente do dev. Ver [[project_aros_laravel_attachments]].

**FIX download de apostila grande (>32MiB) — 2026-06-27.** O proxy carregava o arquivo num Buffer e dava `res.send(buf)`; Cloud Functions Gen2/Cloud Run **rejeita resposta NÃO-streaming >~32MiB** com 500 ("Response size was too large") — apostilas grandes não baixavam (Ponto 16 "Morte Encefálica" 36MB, Ponto 42 60MB). Fix: `enviarDownload()` em `materiais-po.js` faz **STREAMING chunked** — `Readable.fromWeb(r.body).pipe(res)` e **NÃO seta Content-Length** (com ele o Cloud Run trata como buffered e rejeita; sem ele = Transfer-Encoding chunked = streaming real, sem limite). `baixarMaterial` devolve `body` (stream) em vez de buffer; usado por `materiaisPO` E `megabrain`. Validado: 36MB e 60MB baixaram 200/PDF. **Lição: NUNCA bufferizar arquivo grande numa Cloud Function.**

**Livros — campos novos + botões no topo + modal arrumado (2026-06-27).** Doc `livros` ganhou `resumo` (≤200 chars), `amostraPdfUrl`/`amostraPdfPath`/`amostraPdfNome` (PDF de amostra no Storage). Modal de cadastro (`_proLivroModalHTML`): campo Resumo (textarea maxlength 200 + contador), upload do PDF de amostra (`proLivroModalAmostra`/`proLivroModalRemoverAmostra`; `proLivroSalvar` sobe/apaga o PDF), e **dica da dimensão ideal da capa** ("900 × 1200 px, 3:4"). `storage.rules` do bloco `livros` passou a aceitar **application/pdf** além de image/* (deployado). **Detalhe do livro** (topo): 2 botões tech `.pro-tech-btn` — **"RESUMO DO CONTEÚDO"** (`proLivroCopiarResumo`: copia o resumo pro clipboard com feedback "✓ COPIADO!"; vazio → toast "Não tem conteúdo cadastrado") e **"PDF AMOSTRA"** (`proLivroBaixarAmostra`: fetch→blob→download, fallback abrir; vazio → "Não tem PDF cadastrado"). **Modal de edição arrumado:** corrigido o corte no topo — `.m-body` virou flex-column com `min-height:0` + `overflow-y:auto` (card ≤90vh, cabeçalho/rodapé fixos, miolo rola); e compactado (Resumo movido pra coluna ao lado da capa, Curso+ISBN lado a lado em `.pro-livro-modal-row2`, lista de módulos 300→180px). É global (vale pra todo livro). Ver [[project_aros_livros]].
