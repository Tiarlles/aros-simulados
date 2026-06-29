// Cloud Function (Firebase Gen 2) — Gerador de FLASHCARDS de uma aula do PO
//
// Recebe {aulaId} e monta os cards a partir de 3 fontes (todas server-side):
//   1. TRANSCRIÇÃO da aula (poTranscricoes/{vimeoId} ou puxa do Vimeo)
//   2. QUESTÕES da aula    (trilha do Laravel → IDs → busca o conteúdo por ID)
//   3. RESUMO DO LIVRO     (poFlashcards/{aulaId}.resumoLM — colado pela coord)
//
// Estratégia (adaptada do motor portátil "flashcard-engine"): fatia cada fonte em
// pedaços por tamanho, gera cards de cada pedaço com Claude (prompt + few-shot +
// prompt caching), junta tudo e remove repetidos. A QUANTIDADE segue a COBERTURA do
// conteúdo — sem piso e sem encher linguiça (a IA gera só o que o trecho sustenta).
//
// NÃO grava o deck final — devolve um RASCUNHO (e salva em poFlashcards/{aulaId}.rascunho)
// pra passar pela CURADORIA humana antes de virar deck. Depois o deck vai pro Laravel.
//
// Auth: exige Firebase ID token. Chave: ANTHROPIC_API_KEY_PO (mesma do resto do PO).
// Token Laravel server-side em LARAVEL_TOKEN.

const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const Anthropic = require('@anthropic-ai/sdk').default;
const { obterTranscricao } = require('./vimeo-transcricao');
const { _adaptarQuestao, _stripHtml } = require('./questoes-po');
const { registrarCusto } = require('./custos-ia');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY_PO || '';
const LARAVEL_TOKEN = process.env.LARAVEL_TOKEN || '';
const LARAVEL_TOKEN_MEDREVIEW = process.env.LARAVEL_TOKEN_MEDREVIEW || '';
// OftReview vive na mesma conta medmembers (o token MedReview enxerga os cursos de Oft).
const LARAVEL_TOKEN_OFTREVIEW = process.env.LARAVEL_TOKEN_OFTREVIEW || '';
const LARAVEL_API = 'https://api.grupomedreview.com.br/api';
const MODEL = 'claude-sonnet-4-6';

// Curso (nome no PO → courseId no Laravel). Fallback p/ Anest quando a aula não casa no poConfig.
const CURSOS = [{ courseId: '3df5bb00-db83-49a3-a334-f55af33b48f4', nome: 'Extensive' }];

// Token Laravel POR VERTICAL — o banco de questões/trilhas é separado por conta:
// o token da Anest NÃO enxerga as questões da R1 e vice-versa (testado).
const TOKENS_POR_VERTICAL = { anestreview: LARAVEL_TOKEN, medreview: LARAVEL_TOKEN_MEDREVIEW, oftreview: LARAVEL_TOKEN_OFTREVIEW || LARAVEL_TOKEN_MEDREVIEW };

// Resolve a "fonte" da aula (token + courseIds no Laravel) pela vertical do seu curso.
// Lê config/poConfig.cursos (nome → {vertical, laravelCourseId}); cai na Anest se não casar.
async function fonteDaAula(aula) {
  let token = LARAVEL_TOKEN, courseIds = CURSOS.map(c => c.courseId); // fallback Anest
  try {
    const nomes = Array.isArray(aula.cursos) ? aula.cursos : [];
    const cfg = (await admin.firestore().collection('config').doc('poConfig').get()).data() || {};
    const cursos = Array.isArray(cfg.cursos) ? cfg.cursos : [];
    const match = cursos.find(c => nomes.includes(c.nome));
    if (match) {
      const tk = TOKENS_POR_VERTICAL[match.vertical];
      if (tk) token = tk;
      const cid = String(match.laravelCourseId || '').trim();
      if (cid) courseIds = [cid];
    }
  } catch (e) { console.warn('fonteDaAula: leitura poConfig falhou', e?.message || e); }
  return { token, apiBase: LARAVEL_API, courseIds };
}

const MAX_CHUNK_CHARS = 9000;     // tamanho-alvo de cada pedaço de transcrição/livro
const OVERLAP_CHARS = 600;        // sobreposição entre pedaços (preserva contexto)
const MIN_CHUNK_CHARS = 200;      // ignora pedaço minúsculo (lixo)
const TRANSC_CAP = 300000;        // teto de chars de transcrição (chunkada de qualquer jeito)
const MAX_TOKENS_OUT = 8192;      // saída por chamada (cabe ~40 cards densos)
const CONCORRENCIA = 4;           // pedaços processados em paralelo
const TETO_CARDS = 600;           // trava de segurança (não é cota; só evita runaway)

// Preços por milhão de tokens (USD) — Claude Sonnet. Confira em https://www.claude.com/pricing
const PRICING = { input: 3.0 / 1e6, cache_write: 3.75 / 1e6, cache_read: 0.3 / 1e6, output: 15.0 / 1e6 };

// ── Prompt PADRÃO (adaptado do motor do flashcard-engine, já no padrão MED-REVIEW).
// Editável em config/poConfig.promptFlashcards; se vazio, usa este. acao:'default' devolve ele.
const DEFAULT_PROMPT_FLASHCARDS = `Você é um especialista em criar flashcards de estudo de anestesiologia pro padrão MED-REVIEW.

Seu trabalho: dado um trecho de material de uma aula (transcrição, questões de prova ou resumo de livro), gerar flashcards no formato pergunta-resposta direta (estilo Anki).

REGRAS DURAS:
1. Use SOMENTE o conteúdo do trecho fornecido. NUNCA invente fatos, doses, exemplos, fórmulas, mecanismos ou referências que não estejam no texto.
2. A QUANTIDADE segue a COBERTURA: gere quantos cards forem necessários para cobrir o que há de relevante NESTE trecho. Não há número mínimo nem máximo. NÃO encha linguiça, NÃO repita o mesmo ponto, NÃO crie cards triviais só pra aumentar o número. Trecho raso, poucos cards. Trecho denso, muitos.
3. Frente: pergunta direta, 1-3 linhas. Verso: resposta concisa, 2-8 linhas.
4. Use português brasileiro coloquial e didático, sem floreios.
5. Use formatos variados conforme o conteúdo pede (definição, lista numerada, V/F, fill-in-the-blank, mecanismo "por que X", caso clínico, fórmula aplicada).
6. Use setas Unicode (→) pra processos sequenciais quando fizer sentido.
7. Liste no máx. 1-3 tags por flashcard (lowercase, sem acento, separadas por hífen se composta).
8. Dificuldade: 1=trivial / 2=básico / 3=padrão / 4=detalhe nuance / 5=integração avançada.
9. NUNCA use travessão (—) nem meia-risca (–) na frente nem no verso. Para pausas, aposições ou explicações, use vírgula, dois-pontos, parênteses ou ponto final. Travessão deixa o texto com cara de IA, evite sempre.

FEW-SHOT — exemplos do estilo desejado:

Exemplo A (definição simples):
{ "frente": "O que é a farmacocinética?", "verso": "É o estudo do movimento (cinética) do fármaco desde o momento em que ele entra no corpo até sua saída.\\nAbsorção → Distribuição → Metabolização → Excreção.", "tags": ["farmacocinetica", "conceito"], "dificuldade": 1 }

Exemplo B (lista numerada):
{ "frente": "Quais características de um fármaco facilitam sua passagem pela membrana plasmática? (4)", "verso": "Um fármaco passa mais facilmente pela membrana quando é:\\n1.Pequeno em tamanho;\\n2.Lipofílico (lipossolúvel);\\n3.Apolar (não ionizado) e,\\n4.Não ligado a proteínas plasmáticas.", "tags": ["membrana", "farmacocinetica"], "dificuldade": 2 }

Exemplo C (V/F):
{ "frente": "VERDADEIRO OU FALSO\\nA via sublingual consegue evitar o metabolismo de primeira passagem.", "verso": "VERDADEIRO\\nNa via sublingual, o fármaco é absorvido pela mucosa sob a língua, cujas veias drenam direto pra veia cava superior, alcançando o coração sem passar pelo fígado.", "tags": ["via-sublingual", "primeira-passagem"], "dificuldade": 2 }

Exemplo D (fill-in-the-blank):
{ "frente": "A via ___________ é considerada a referência para biodisponibilidade de 100%.", "verso": "A via intravenosa é considerada a referência para biodisponibilidade de 100%.", "tags": ["biodisponibilidade", "via-intravenosa"], "dificuldade": 1 }

Exemplo E (cálculo aplicado):
{ "frente": "Dose oral de 1g, sendo absorvidos 500mg na circulação sistêmica. Qual a biodisponibilidade?", "verso": "50%.\\nBiodisponibilidade = (quantidade que atinge a circulação / quantidade administrada) × 100\\n(500mg / 1000mg) × 100 = 50%.", "tags": ["biodisponibilidade", "calculo"], "dificuldade": 2 }

Exemplo F ("por que" / mecanismo):
{ "frente": "Por que fármacos não ionizados atravessam a membrana mais facilmente?", "verso": "Porque são apolares, estruturalmente similares aos lipídios da membrana, permitindo penetração fácil. Os ionizados (polares) são incompatíveis com a matriz lipídica e precisam de transportadores.", "tags": ["membrana", "ionizacao"], "dificuldade": 3 }

Exemplo G (caso clínico):
{ "frente": "Exemplo clínico do uso da via sublingual pra evitar primeira passagem na dor anginosa.", "verso": "Nitroglicerina. Pela via oral, +90% é perdida na primeira passagem. Sublingual evita o fígado e produz vasodilatação eficaz pro alívio da dor torácica.", "tags": ["nitroglicerina", "caso-clinico"], "dificuldade": 3 }

OUTPUT — retorne EXCLUSIVAMENTE JSON válido neste formato (sem markdown, sem texto antes/depois):
{ "flashcards": [ { "frente": "...", "verso": "...", "tags": [...], "dificuldade": 1-5 } ] }`;

const ALLOWED_ORIGINS = [
  'https://aros.anestreview.com.br',
  'http://localhost:8081', 'http://localhost:8080', 'http://localhost:8766',
  'http://localhost:8767', 'http://localhost:8765', 'http://localhost:8768',
  'http://127.0.0.1:8081', 'http://127.0.0.1:8080', 'http://127.0.0.1:8766',
  'http://127.0.0.1:8767', 'http://127.0.0.1:8765', 'http://127.0.0.1:8768',
];
function setCors(req, res) {
  const origin = req.get('Origin') || '';
  // Produção + qualquer localhost/127.0.0.1 (qualquer porta — o server local usa porta automática).
  const ok = ALLOWED_ORIGINS.includes(origin) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  if (ok) { res.set('Access-Control-Allow-Origin', origin); res.set('Vary', 'Origin'); }
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.set('Access-Control-Max-Age', '3600');
}

// ── Transcrição: salva (poTranscricoes/{vimeoId}) ou puxa do Vimeo na hora. '' se não rolar.
async function obterTextoTranscricao(vimeoId) {
  const vid = String(vimeoId || '').replace(/\D/g, '');
  if (!vid) return '';
  try {
    const snap = await admin.firestore().collection('poTranscricoes').doc(vid).get();
    if (snap.exists) { const t = String(snap.data()?.texto || '').trim(); if (t) return t; }
  } catch (e) { console.warn('flashcards: leitura poTranscricoes falhou', e?.message || e); }
  try {
    const r = await obterTranscricao(vid, '');
    if (r && r.ok) {
      const snap = await admin.firestore().collection('poTranscricoes').doc(vid).get();
      return String(snap.data()?.texto || '').trim();
    }
  } catch (e) { console.warn('flashcards: puxar do Vimeo falhou', e?.message || e); }
  return '';
}

// ── Laravel: GET simples + busca de questões por IDs (POST /v2/web/questoes {ids}, paginado).
async function laravelGet(path, token = LARAVEL_TOKEN) {
  const r = await fetch(`${LARAVEL_API}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`Laravel GET ${path} → ${r.status}`);
  return r.json();
}
async function questoesPorIds(ids, token = LARAVEL_TOKEN) {
  const want = ids.map(String);
  const out = [];
  let page = 1, total = Infinity, perdas = 0;
  while (out.length < total) {
    const r = await fetch(`${LARAVEL_API}/v2/web/questoes?page=${page}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: want }),
    });
    if (!r.ok) throw new Error(`Laravel questoes(ids) p${page} → ${r.status}`);
    const j = await r.json();
    total = Number(j.total || 0);
    const data = Array.isArray(j.data) ? j.data : [];
    if (!data.length) { if (++perdas > 1) break; } else perdas = 0;
    out.push(...data);
    page++;
    if (page > 200) break;
  }
  return out;
}

// ── Comentário (gabarito comentado) de uma questão. Texto rico do professor,
// ótimo insumo pros cards. Endpoint POST /web/comentario/gabarito {model_id, model_type:'QUESTAO'}.
const COMENTARIO_CAP = 6000; // chars por comentário (o bloco de questões é chunkado depois)
async function comentarioDaQuestao(id, token = LARAVEL_TOKEN) {
  try {
    const r = await fetch(`${LARAVEL_API}/web/comentario/gabarito`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model_id: Number(id), is_gabarito: true, model_type: 'QUESTAO' }),
    });
    if (!r.ok) return '';
    const j = await r.json();
    return _stripHtml(j && j.content || '').slice(0, COMENTARIO_CAP);
  } catch (e) { return ''; }
}
// Busca os comentários de várias questões em paralelo (lotes), anexa em q.comentario.
async function anexarComentarios(questoes, token = LARAVEL_TOKEN) {
  const LOTE = 6;
  for (let i = 0; i < questoes.length; i += LOTE) {
    const lote = questoes.slice(i, i + LOTE);
    const coms = await Promise.all(lote.map(q => comentarioDaQuestao(q.id, token)));
    lote.forEach((q, k) => { q.comentario = coms[k] || ''; });
  }
  return questoes;
}

// ── Acha os IDs de questão da trilha da aula no Laravel.
// Caminho: curso (pelo nome no PO) → módulos (acha pelo nome) → conteúdos (acha pelo laravelId)
// → trilhas[].json.ids. Devolve [] se a aula não tem trilha montada.
async function idsDaTrilha(aula, fonte = {}) {
  const laravelId = aula.laravelId;
  const modNome = String(aula.modulo || '').trim();
  if (!laravelId || !modNome) return [];
  const token = fonte.token || LARAVEL_TOKEN;
  const courseIds = (Array.isArray(fonte.courseIds) && fonte.courseIds.length) ? fonte.courseIds : CURSOS.map(c => c.courseId);

  for (const courseId of courseIds) {
    let modulos;
    try { modulos = await laravelGet(`/curso/${courseId}/modulos`, token); } catch (e) { continue; }
    const lista = Array.isArray(modulos) ? modulos : (modulos.data || []);
    const mod = lista.find(m => String(m.nome || m.name || m.title || '').trim() === modNome);
    if (!mod) continue;
    let cont;
    try { cont = await laravelGet(`/modulo/${mod.id}/conteudos`, token); } catch (e) { continue; }
    const arr = Array.isArray(cont) ? cont : (cont.data || []);
    const c = arr.find(x => String(x.id) === String(laravelId));
    if (!c || !Array.isArray(c.trilhas)) continue;
    const ids = [];
    for (const t of c.trilhas) {
      try {
        const j = typeof t.json === 'string' ? JSON.parse(t.json) : (t.json || {});
        if (Array.isArray(j.ids)) ids.push(...j.ids.map(String));
      } catch (e) { /* trilha sem json válido — ignora */ }
    }
    if (ids.length) return Array.from(new Set(ids));
  }
  return [];
}

// ── Chunking de texto corrido (transcrição/livro): fatia por tamanho com sobreposição.
function chunkarTexto(texto, tipo) {
  const t = String(texto || '').trim();
  if (t.length < MIN_CHUNK_CHARS) return [];
  const chunks = [];
  let pos = 0;
  while (pos < t.length) {
    const stop = Math.min(pos + MAX_CHUNK_CHARS, t.length);
    chunks.push({ tipo, texto: t.slice(pos, stop) });
    if (stop === t.length) break;
    pos = stop - OVERLAP_CHARS;
  }
  return chunks;
}

// ── Monta o bloco de texto das questões (enunciado + alternativas + gabarito + comentário).
function blocoQuestoes(qs) {
  return qs.map((q, i) => {
    const alts = (q.alternativas || []).map(a => `${a.letra}) ${a.texto}`).join('\n');
    const corr = (q.alternativas || []).find(a => a.letra === q.gabarito);
    const com = String(q.comentario || '').trim();
    return `QUESTÃO ${i + 1} (${q.escopo || '?'} ${q.ano || ''}):\n${q.enunciado}\n${alts}\nRESPOSTA CORRETA: ${q.gabarito}${corr ? ') ' + corr.texto : ''}${com ? `\nCOMENTÁRIO DO PROFESSOR (explicação do gabarito):\n${com}` : ''}`;
  }).join('\n\n———\n\n');
}

// ── Instrução específica por tipo de fonte (vai no fim da mensagem do usuário).
function diretrizPorTipo(tipo) {
  if (tipo === 'questoes') {
    return 'ESTAS SÃO QUESTÕES REAIS DE PROVA desta aula, cada uma com o COMENTÁRIO DO PROFESSOR explicando o gabarito. Para CADA questão, gere ao menos um flashcard que cobre exatamente o ponto cobrado, com a resposta correta no verso. EXTRAIA também os conceitos ensinados no comentário do professor (costuma ter o raciocínio detalhado) e os distratores relevantes, gerando cards adicionais quando agregarem valor. Use SOMENTE o que está nas questões e nos comentários.';
  }
  if (tipo === 'livro') {
    return 'Este é um RESUMO DE LIVRO (aprofundamento). Gere flashcards do conteúdo aqui, priorizando o que complementa/aprofunda a aula. Use SOMENTE este texto.';
  }
  return 'Este é a TRANSCRIÇÃO da aula. Gere flashcards cobrindo o conteúdo ensinado. Use SOMENTE este texto.';
}

function custoDe(u) {
  return (u.input_tokens ?? 0) * PRICING.input
    + (u.cache_creation_input_tokens ?? 0) * PRICING.cache_write
    + (u.cache_read_input_tokens ?? 0) * PRICING.cache_read
    + (u.output_tokens ?? 0) * PRICING.output;
}

// ── Tira travessão/meia-risca (—, –) do texto e troca por pontuação natural, pra não
// ter "cara de IA". Preserva a seta → (que a gente usa de propósito em sequências).
function semTravessao(s) {
  return String(s || '')
    .replace(/[ \t]*[—–][ \t]*/g, ', ') // "A — B" → "A, B" (preserva quebras de linha)
    .replace(/,\s*,/g, ',')             // colapsa vírgula dupla acidental
    .replace(/,\s*([.;:!?])/g, '$1')    // ", ." → "."
    .replace(/(^|\n)[ \t]*,[ \t]*/g, '$1') // tira vírgula sobrando no começo de cada linha
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

// ── Valida o JSON da IA (tolera ```json) e normaliza cada card.
function validarCards(textoBruto, tipo) {
  let s = String(textoBruto || '').trim().replace(/^```(?:json)?\n?/i, '').replace(/```$/i, '').trim();
  let raw;
  try { raw = JSON.parse(s); } catch (e) { return []; }
  const arr = Array.isArray(raw?.flashcards) ? raw.flashcards : (Array.isArray(raw) ? raw : []);
  const out = [];
  for (const it of arr) {
    if (!it || typeof it !== 'object') continue;
    const frente = typeof it.frente === 'string' ? semTravessao(it.frente) : '';
    const verso = typeof it.verso === 'string' ? semTravessao(it.verso) : '';
    if (!frente || !verso) continue;
    const tags = Array.isArray(it.tags) ? it.tags.filter(x => typeof x === 'string').slice(0, 3) : [];
    const dificuldade = (typeof it.dificuldade === 'number' && it.dificuldade >= 1 && it.dificuldade <= 5)
      ? Math.round(it.dificuldade) : 3;
    out.push({ frente, verso, tags, dificuldade, fonte: tipo });
  }
  return out;
}

// ── Gera os cards de UM pedaço.
async function gerarDoPedaco(client, systemPrompt, pedaco) {
  const userContent = `${pedaco.texto}\n\n${diretrizPorTipo(pedaco.tipo)}\n\nRetorne JSON.`;
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS_OUT,
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userContent }],
  });
  const block = resp.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
  return { cards: validarCards(block, pedaco.tipo), custo: custoDe(resp.usage || {}) };
}

// ── Dedup por frente normalizada (mantém o 1º; cards de questão têm prioridade pois entram antes).
function dedup(cards) {
  const vistos = new Set();
  const out = [];
  for (const c of cards) {
    const k = c.frente.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push(c);
  }
  return out;
}

exports.gerarFlashcardsPO = onRequest(
  { region: 'us-central1', invoker: 'public', cors: false, timeoutSeconds: 540, memory: '1GiB' },
  async (req, res) => {
    setCors(req, res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

    const authHeader = req.get('Authorization') || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) { res.status(401).json({ error: 'Faça login para gerar os flashcards' }); return; }
    let decoded;
    try { decoded = await admin.auth().verifyIdToken(idToken); }
    catch (e) { res.status(401).json({ error: 'Sessão expirada — faça login novamente' }); return; }

    // acao:'default' → devolve a instrução padrão (pro "restaurar padrão" da tela).
    if (req.body?.acao === 'default') { res.status(200).json({ ok: true, default: DEFAULT_PROMPT_FLASHCARDS }); return; }

    // acao:'montar' → só JUNTA o conteúdo (transcrição + questões/comentários + Resumo LM) e
    // devolve o texto pronto pra copiar. NÃO chama a IA (sem custo). Usado pelo botão "Copiar".
    if (req.body?.acao === 'montar') {
      const aulaId = String(req.body?.aulaId || '').trim();
      if (!aulaId) { res.status(400).json({ error: 'Informe a aula (aulaId).' }); return; }
      const db = admin.firestore();
      const aulaSnap = await db.collection('poAulas').doc(aulaId).get();
      if (!aulaSnap.exists) { res.status(404).json({ error: 'Aula não encontrada.' }); return; }
      const aula = aulaSnap.data() || {};
      const resumoLM = String(((await db.collection('poFlashcards').doc(aulaId).get()).data() || {}).resumoLM || '').trim();
      const transc = (await obterTextoTranscricao(aula.vimeoId)).slice(0, TRANSC_CAP);
      let questoes = [];
      try {
        const fonte = await fonteDaAula(aula);
        const ids = await idsDaTrilha(aula, fonte);
        if (ids.length) { questoes = (await questoesPorIds(ids, fonte.token)).map(_adaptarQuestao); await anexarComentarios(questoes, fonte.token); }
      } catch (e) { console.warn('montar: trilha/questões falhou', e?.message || e); }
      const partes = [`# AULA: ${aula.titulo || ''}`];
      if (transc) partes.push(`## TRANSCRIÇÃO\n\n${transc}`);
      if (questoes.length) partes.push(`## QUESTÕES DA TRILHA (com comentário do professor)\n\n${blocoQuestoes(questoes)}`);
      if (resumoLM) partes.push(`## RESUMO DO LIVRO (NotebookLM)\n\n${resumoLM}`);
      const texto = partes.join('\n\n———\n\n');
      const vazio = !(transc || questoes.length || resumoLM);
      res.status(200).json({ ok: true, texto, vazio, stats: { transcricaoChars: transc.length, questoes: questoes.length, resumoChars: resumoLM.length } });
      return;
    }

    if (!ANTHROPIC_API_KEY) { res.status(500).json({ error: 'IA não configurada no servidor (ANTHROPIC_API_KEY_PO).' }); return; }

    const aulaId = String(req.body?.aulaId || '').trim();
    let cursoId = String(req.body?.cursoId || '').trim();
    if (!aulaId) { res.status(400).json({ error: 'Informe a aula (aulaId).' }); return; }

    try {
      const db = admin.firestore();
      const aulaSnap = await db.collection('poAulas').doc(aulaId).get();
      if (!aulaSnap.exists) { res.status(404).json({ error: 'Aula não encontrada.' }); return; }
      const aula = aulaSnap.data() || {};
      // Reserva: se o frontend não mandou cursoId, deriva do 1º curso da aula (slug = id no PO).
      if (!cursoId && Array.isArray(aula.cursos) && aula.cursos[0]) {
        cursoId = String(aula.cursos[0]).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      }

      // Resumo do livro (colado na coluna Resumo LM) fica em poFlashcards/{aulaId}.resumoLM.
      const fcRef = db.collection('poFlashcards').doc(aulaId);
      const fcPrev = (await fcRef.get()).data() || {};
      const resumoLM = String(fcPrev.resumoLM || '').trim();

      // 1) Transcrição
      const transc = (await obterTextoTranscricao(aula.vimeoId)).slice(0, TRANSC_CAP);

      // 2) Questões da trilha (IDs no Laravel → conteúdo por ID → adapta)
      let questoes = [];
      try {
        const fonte = await fonteDaAula(aula);
        const ids = await idsDaTrilha(aula, fonte);
        if (ids.length) {
          const brutas = await questoesPorIds(ids, fonte.token);
          questoes = brutas.map(_adaptarQuestao);
          await anexarComentarios(questoes, fonte.token); // gabarito comentado do professor (insumo rico)
        }
      } catch (e) { console.warn('flashcards: trilha/questões falhou', e?.message || e); }

      // Monta os pedaços (cada fonte vira 1+ chunk). Questões entram PRIMEIRO (prioridade no dedup).
      const pedacos = [];
      if (questoes.length) {
        // bloco de questões pode ser grande — fatia também por tamanho
        const blocos = chunkarTexto(blocoQuestoes(questoes), 'questoes');
        pedacos.push(...blocos);
      }
      pedacos.push(...chunkarTexto(transc, 'transcricao'));
      pedacos.push(...chunkarTexto(resumoLM, 'livro'));

      if (!pedacos.length) {
        res.status(200).json({ ok: false, motivo: 'sem_insumos', detalhe: 'A aula não tem transcrição, nem questões na trilha, nem Resumo LM. Cole um resumo ou puxe a transcrição antes.' });
        return;
      }

      // Instrução editável, POR PRODUTO. Cascata: promptFlashcardsCurso[cursoId] →
      // promptFlashcards (global legado) → DEFAULT. Edição de um produto não afeta outro.
      let systemPrompt = DEFAULT_PROMPT_FLASHCARDS;
      try {
        const cfg = (await db.collection('config').doc('poConfig').get()).data() || {};
        const porCurso = cursoId && cfg.promptFlashcardsCurso && cfg.promptFlashcardsCurso[cursoId];
        if (porCurso && String(porCurso).trim()) systemPrompt = String(porCurso).trim();
        else if (cfg.promptFlashcards && String(cfg.promptFlashcards).trim()) systemPrompt = String(cfg.promptFlashcards).trim();
      } catch (e) { /* usa o padrão */ }

      // Gera em lotes (aproveita o prompt caching e respeita rate limit).
      const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
      let todos = [];
      let custoUsd = 0;
      const porFonte = { questoes: 0, transcricao: 0, livro: 0 };
      for (let i = 0; i < pedacos.length; i += CONCORRENCIA) {
        const lote = pedacos.slice(i, i + CONCORRENCIA);
        const r = await Promise.allSettled(lote.map(p => gerarDoPedaco(client, systemPrompt, p)));
        r.forEach((x, k) => {
          if (x.status === 'fulfilled') {
            todos.push(...x.value.cards);
            custoUsd += x.value.custo;
            porFonte[lote[k].tipo] = (porFonte[lote[k].tipo] || 0) + x.value.cards.length;
          } else {
            console.warn('flashcards: pedaço falhou (pulado):', x.reason?.message || x.reason);
          }
        });
        if (todos.length >= TETO_CARDS) { console.warn('flashcards: teto de segurança atingido', TETO_CARDS); break; }
      }

      registrarCusto('flashcards', custoUsd);
      const cards = dedup(todos).slice(0, TETO_CARDS).map((c, i) => ({ id: 'c' + i + '_' + Math.abs(hash(c.frente)), ...c, status: 'rascunho' }));
      if (!cards.length) { res.status(502).json({ error: 'A IA não devolveu cards válidos. Tente de novo.' }); return; }

      const stats = {
        total: cards.length, porFonte,
        questoesNaTrilha: questoes.length,
        transcricaoChars: transc.length,
        resumoChars: resumoLM.length,
        pedacos: pedacos.length,
        custoUsd: Number(custoUsd.toFixed(4)),
      };

      // Salva o rascunho (NÃO toca no deck curado, se existir).
      await fcRef.set({
        aulaId,
        rascunho: cards,
        rascunhoEm: new Date().toISOString(),
        rascunhoPor: decoded.email || decoded.uid,
        rascunhoStats: stats,
      }, { merge: true });

      console.log('flashcards gerados', { user: decoded.email || decoded.uid, aulaId, ...stats });
      res.status(200).json({ ok: true, cards, stats });
    } catch (err) {
      console.error('gerarFlashcardsPO erro:', err?.message || err);
      res.status(500).json({ error: 'Erro ao gerar os flashcards', detail: String(err?.message || err) });
    }
  }
);

// hash simples e estável pra compor id de card (não precisa ser criptográfico)
function hash(s) {
  let h = 0;
  const t = String(s || '');
  for (let i = 0; i < t.length; i++) { h = (h << 5) - h + t.charCodeAt(i); h |= 0; }
  return h;
}

// expõe o núcleo p/ teste local em node (sem Firebase)
exports._DEFAULT_PROMPT_FLASHCARDS = DEFAULT_PROMPT_FLASHCARDS;
exports._obterTextoTranscricao = obterTextoTranscricao;
exports._fonteDaAula = fonteDaAula;
exports._idsDaTrilha = idsDaTrilha;
exports._questoesPorIds = questoesPorIds;
exports._comentarioDaQuestao = comentarioDaQuestao;
exports._anexarComentarios = anexarComentarios;
exports._blocoQuestoes = blocoQuestoes;
exports._chunkarTexto = chunkarTexto;
exports._validarCards = validarCards;
exports._gerarDoPedaco = gerarDoPedaco;
exports._dedup = dedup;
