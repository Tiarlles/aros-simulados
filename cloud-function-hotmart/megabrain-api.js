// Cloud Function (Gen 2) — API de leitura "MegaBrain" para o MCG (MED Content Generator).
// Expõe, autenticada por API key (server-to-server):
//   GET /lessons?course=&q=&page=         → lista de aulas
//   GET /lessons/{id}/content             → transcrição + questões comentadas (estruturadas)
//
// Auth com ESCOPO POR VERTICAL:
//   - MEGABRAIN_KEY_<VERTICAL> (ex.: MEGABRAIN_KEY_MEDREVIEW) → chave que SÓ vê aquela vertical.
//   - MEGABRAIN_API_KEY (opcional) → chave "master" que vê todas as verticais.
// Reusa os helpers do PO (transcrição em poTranscricoes; questões/comentários da trilha no
// Laravel, com token POR VERTICAL via fonteDaAula).

const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { _obterTextoTranscricao, _fonteDaAula, _idsDaTrilha, _questoesPorIds, _anexarComentarios } = require('./flashcards-po');
const { _adaptarQuestao } = require('./questoes-po');

const MASTER_KEY = process.env.MEGABRAIN_API_KEY || '';
const PAGE_SIZE = 50;
const TRANSC_CAP = 250000;   // teto por documento (corte de segurança do MCG)

// Mapa { valor-da-chave → vertical } montado das envs MEGABRAIN_KEY_<VERTICAL>.
const KEY_MAP = (() => {
  const m = {};
  for (const k of Object.keys(process.env)) {
    const mm = k.match(/^MEGABRAIN_KEY_([A-Z0-9]+)$/);
    const val = String(process.env[k] || '').trim();
    if (mm && val) m[val] = mm[1].toLowerCase();
  }
  return m;
})();

function setCors(res) {
  res.set('Access-Control-Allow-Origin', '*'); // server-to-server; sem cookies/credenciais
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Authorization, X-API-Key, Content-Type');
  res.set('Access-Control-Max-Age', '3600');
}
// Resolve o escopo da chave: { all:true } (master) | { vertical } | null (inválida/ausente).
function resolveScope(req) {
  const auth = req.get('Authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const key = bearer || String(req.get('X-API-Key') || '').trim();
  if (!key) return null;
  if (MASTER_KEY && key === MASTER_KEY) return { all: true };
  if (KEY_MAP[key]) return { vertical: KEY_MAP[key] };
  return null;
}
const erro = (res, code, msg) => res.status(code).json({ error: msg });

// Mapa { nome-do-curso (lower) → vertical } a partir de config/poConfig.cursos.
async function mapaVerticalPorCurso() {
  try {
    const cfg = (await admin.firestore().collection('config').doc('poConfig').get()).data() || {};
    const cursos = Array.isArray(cfg.cursos) ? cfg.cursos : [];
    const m = {};
    for (const c of cursos) if (c && c.nome) m[String(c.nome).toLowerCase()] = c.vertical || 'anestreview';
    return m;
  } catch (e) { console.warn('mapaVerticalPorCurso falhou', e?.message || e); return {}; }
}
// Vertical de uma aula (pelo 1º curso). Sem match → anestreview (default legado).
function verticalDaAula(a, vmap) {
  const nome = (Array.isArray(a.cursos) && a.cursos[0]) || '';
  return vmap[String(nome).toLowerCase()] || 'anestreview';
}

function toLessonListItem(id, a, vertical) {
  return {
    id,
    vertical,
    course: (Array.isArray(a.cursos) && a.cursos[0]) || '',
    module: a.modulo || '',
    area: a.modulo || '',            // p/ R1 o módulo já é a especialidade (CARDIOLOGIA, etc.)
    title: a.titulo || a.nomeOriginal || '',
    has_transcription: !!(a.transcricaoPalavras && Number(a.transcricaoPalavras) > 0),
    has_questions: String(a.questoes || '') === 'Lançada',
    updated_at: a.updatedAt || a.criadoEm || null,
  };
}
function toQuestionItem(q, i) {
  return {
    label: 'Q' + String(i + 1).padStart(2, '0'),
    statement: q.enunciado || '',
    alternatives: (q.alternativas || []).map(alt => `${alt.letra}) ${alt.texto}`),
    answer: q.gabarito || '',
    comment: q.comentario || '',
  };
}

async function listLessons(req, res, scope) {
  const course = String(req.query.course || '').trim().toLowerCase();
  const q = String(req.query.q || '').trim().toLowerCase();
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);

  const [snap, vmap] = await Promise.all([admin.firestore().collection('poAulas').get(), mapaVerticalPorCurso()]);
  let itens = snap.docs.map(d => { const a = d.data() || {}; return { id: d.id, a, vertical: verticalDaAula(a, vmap) }; });

  if (!scope.all) itens = itens.filter(x => x.vertical === scope.vertical); // ESCOPO da chave
  if (course) itens = itens.filter(({ a }) => (Array.isArray(a.cursos) ? a.cursos : []).some(c => String(c).toLowerCase().includes(course)));
  if (q) itens = itens.filter(({ a }) => `${a.titulo || ''} ${a.modulo || ''} ${a.nomeOriginal || ''}`.toLowerCase().includes(q));
  itens.sort((x, y) => String(x.a.titulo || '').localeCompare(String(y.a.titulo || ''), 'pt'));

  const total = itens.length;
  const start = (page - 1) * PAGE_SIZE;
  const pageItens = itens.slice(start, start + PAGE_SIZE).map(({ id, a, vertical }) => toLessonListItem(id, a, vertical));
  res.status(200).json({ data: pageItens, page, page_size: PAGE_SIZE, total, total_pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), scope: scope.all ? 'all' : scope.vertical });
}

async function lessonContent(req, res, lessonId, scope) {
  const db = admin.firestore();
  const [doc, vmap] = await Promise.all([db.collection('poAulas').doc(lessonId).get(), mapaVerticalPorCurso()]);
  if (!doc.exists) return erro(res, 404, 'Aula não encontrada');
  const a = doc.data() || {};
  const vertical = verticalDaAula(a, vmap);
  // Fora do escopo da chave → 404 (não revela a existência da aula de outra vertical).
  if (!scope.all && vertical !== scope.vertical) return erro(res, 404, 'Aula não encontrada');

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
    vertical,
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
    const scope = resolveScope(req);
    if (!scope) return erro(res, 401, 'API key inválida ou ausente');

    const path = String(req.path || '/').replace(/\/+$/, '') || '/';
    try {
      const mContent = path.match(/^\/lessons\/([^/]+)\/content$/);
      if (mContent) return await lessonContent(req, res, decodeURIComponent(mContent[1]), scope);
      if (path === '/lessons' || path === '/') return await listLessons(req, res, scope);
      return erro(res, 404, 'Rota não encontrada. Use GET /lessons ou GET /lessons/{id}/content');
    } catch (err) {
      console.error('megabrain erro:', err?.message || err);
      return erro(res, 500, 'Erro interno: ' + String(err?.message || err));
    }
  }
);
