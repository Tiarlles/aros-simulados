// Cloud Function (Gen 2) — API de leitura "MegaBrain" para o MCG (MED Content Generator).
// Expõe, autenticada por API key (server-to-server):
//   GET /lessons?course=&q=&page=         → lista de aulas (todas as verticais)
//   GET /lessons/{id}/content             → transcrição + questões comentadas (estruturadas)
// Reusa os helpers do PO (transcrição em poTranscricoes; questões/comentários da trilha no
// Laravel, com token POR VERTICAL via fonteDaAula).

const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { _obterTextoTranscricao, _fonteDaAula, _idsDaTrilha, _questoesPorIds, _anexarComentarios } = require('./flashcards-po');
const { _adaptarQuestao } = require('./questoes-po');

const MEGABRAIN_API_KEY = process.env.MEGABRAIN_API_KEY || '';
const PAGE_SIZE = 50;
const TRANSC_CAP = 250000;   // teto por documento (corte de segurança do MCG)

function setCors(res) {
  res.set('Access-Control-Allow-Origin', '*'); // server-to-server; sem cookies/credenciais
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Authorization, X-API-Key, Content-Type');
  res.set('Access-Control-Max-Age', '3600');
}
// API key via header Authorization: Bearer <key> OU X-API-Key: <key>.
function apiKeyOk(req) {
  if (!MEGABRAIN_API_KEY) return false;
  const auth = req.get('Authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const xkey = String(req.get('X-API-Key') || '').trim();
  return bearer === MEGABRAIN_API_KEY || xkey === MEGABRAIN_API_KEY;
}
const erro = (res, code, msg) => res.status(code).json({ error: msg });

// Mapeia um doc poAulas → item da listagem.
function toLessonListItem(id, a) {
  return {
    id,
    course: (Array.isArray(a.cursos) && a.cursos[0]) || '',
    module: a.modulo || '',
    area: a.modulo || '',            // p/ R1 o módulo já é a especialidade (CARDIOLOGIA, etc.)
    title: a.titulo || a.nomeOriginal || '',
    has_transcription: !!(a.transcricaoPalavras && Number(a.transcricaoPalavras) > 0),
    has_questions: String(a.questoes || '') === 'Lançada',
    updated_at: a.updatedAt || a.criadoEm || null,
  };
}

// Questão adaptada (+comentario) → formato do contrato MCG.
function toQuestionItem(q, i) {
  return {
    label: 'Q' + String(i + 1).padStart(2, '0'),
    statement: q.enunciado || '',
    alternatives: (q.alternativas || []).map(alt => `${alt.letra}) ${alt.texto}`),
    answer: q.gabarito || '',
    comment: q.comentario || '',
  };
}

async function listLessons(req, res) {
  const course = String(req.query.course || '').trim().toLowerCase();
  const q = String(req.query.q || '').trim().toLowerCase();
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);

  const snap = await admin.firestore().collection('poAulas').get();
  let itens = snap.docs.map(d => ({ id: d.id, a: d.data() || {} }));
  // filtros em memória (poAulas é pequeno o bastante)
  if (course) itens = itens.filter(({ a }) => (Array.isArray(a.cursos) ? a.cursos : []).some(c => String(c).toLowerCase().includes(course)));
  if (q) itens = itens.filter(({ a }) => `${a.titulo || ''} ${a.modulo || ''} ${a.nomeOriginal || ''}`.toLowerCase().includes(q));
  // ordena por título estável
  itens.sort((x, y) => String(x.a.titulo || '').localeCompare(String(y.a.titulo || ''), 'pt'));

  const total = itens.length;
  const start = (page - 1) * PAGE_SIZE;
  const pageItens = itens.slice(start, start + PAGE_SIZE).map(({ id, a }) => toLessonListItem(id, a));
  res.status(200).json({ data: pageItens, page, page_size: PAGE_SIZE, total, total_pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) });
}

async function lessonContent(req, res, lessonId) {
  const db = admin.firestore();
  const doc = await db.collection('poAulas').doc(lessonId).get();
  if (!doc.exists) return erro(res, 404, 'Aula não encontrada');
  const a = doc.data() || {};

  const transcription = (await _obterTextoTranscricao(a.vimeoId)).slice(0, TRANSC_CAP);
  let questions = [];
  try {
    const fonte = await _fonteDaAula(a);
    const ids = await _idsDaTrilha(a, fonte);
    if (ids.length) {
      const qs = (await _questoesPorIds(ids, fonte.token)).map(_adaptarQuestao);
      await _anexarComentarios(qs, fonte.token);
      questions = qs.map(toQuestionItem);
    }
  } catch (e) { console.warn('megabrain content: questões falharam', e?.message || e); }

  res.status(200).json({
    lesson_id: lessonId,
    title: a.titulo || a.nomeOriginal || '',
    area: a.modulo || '',
    module: a.modulo || '',
    course: (Array.isArray(a.cursos) && a.cursos[0]) || '',
    transcription,
    questions,
    updated_at: a.updatedAt || a.criadoEm || null,
  });
}

exports.megabrain = onRequest(
  { region: 'us-central1', invoker: 'public', cors: false, timeoutSeconds: 120, memory: '512MiB' },
  async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'GET') return erro(res, 405, 'Método não permitido');
    if (!MEGABRAIN_API_KEY) return erro(res, 500, 'API não configurada no servidor (MEGABRAIN_API_KEY)');
    if (!apiKeyOk(req)) return erro(res, 401, 'API key inválida ou ausente');

    // Roteamento por path. URL base: .../megabrain  → req.path começa em "/".
    const path = String(req.path || '/').replace(/\/+$/, '') || '/';
    try {
      const mContent = path.match(/^\/lessons\/([^/]+)\/content$/);
      if (mContent) return await lessonContent(req, res, decodeURIComponent(mContent[1]));
      if (path === '/lessons' || path === '/') return await listLessons(req, res);
      return erro(res, 404, 'Rota não encontrada. Use GET /lessons ou GET /lessons/{id}/content');
    } catch (err) {
      console.error('megabrain erro:', err?.message || err);
      return erro(res, 500, 'Erro interno: ' + String(err?.message || err));
    }
  }
);
