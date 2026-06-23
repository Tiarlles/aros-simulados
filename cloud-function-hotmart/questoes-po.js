// Cloud Function (Firebase Gen 2) — Questões do PO via API do Laravel
// Dois endpoints (auth: Firebase ID token; token Laravel server-side em LARAVEL_TOKEN):
//  - filtrosPO        → GET /api/filtros (temas/categorias com incidência+peso, tipos, anos)
//  - puxarQuestoesPO  → POST /api/v2/web/questoes por categoria(s), últimos 5 anos
//                       (sem o atual), adapta o formato, separa por escopo (TEA/TSA/MEs/Outras)
//                       e grava em poModQuestoes/{cursoId__modulo}.

const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

const LARAVEL_TOKEN = process.env.LARAVEL_TOKEN || '';
const LARAVEL_API = 'https://api.grupomedreview.com.br/api';

const ALLOWED_ORIGINS = [
  'https://aros.anestreview.com.br',
  'http://localhost:8081', 'http://localhost:8080', 'http://localhost:8766',
  'http://localhost:8767', 'http://localhost:8765',
  'http://127.0.0.1:8081', 'http://127.0.0.1:8080', 'http://127.0.0.1:8766',
  'http://127.0.0.1:8767', 'http://127.0.0.1:8765',
];
function setCors(req, res) {
  const origin = req.get('Origin') || '';
  if (ALLOWED_ORIGINS.includes(origin) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) { res.set('Access-Control-Allow-Origin', origin); res.set('Vary', 'Origin'); }
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.set('Access-Control-Max-Age', '3600');
}
async function exigeAuth(req, res) {
  const authHeader = req.get('Authorization') || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!idToken) { res.status(401).json({ error: 'Faça login' }); return false; }
  try { await admin.auth().verifyIdToken(idToken); return true; }
  catch (e) { res.status(401).json({ error: 'Sessão expirada — faça login novamente' }); return false; }
}

function _slug(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || '_';
}
// 5 anos mais recentes SEM o ano atual (nem futuros). Ex.: 2026 → [2025..2021].
function anosRecentes(n = 5) {
  const atual = new Date().getFullYear();
  const out = [];
  for (let i = 1; i <= n; i++) out.push(atual - i);
  return out;
}
// Entidades HTML mais comuns em PT (case-sensitive); o resto vai pelo decode numérico.
const _ENT = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  acirc: 'â', ecirc: 'ê', ocirc: 'ô', Acirc: 'Â', Ecirc: 'Ê', Ocirc: 'Ô',
  atilde: 'ã', otilde: 'õ', Atilde: 'Ã', Otilde: 'Õ',
  agrave: 'à', Agrave: 'À', ccedil: 'ç', Ccedil: 'Ç', ntilde: 'ñ', uuml: 'ü', Uuml: 'Ü',
  ordm: 'º', ordf: 'ª', deg: '°', hellip: '…', ndash: '–', mdash: '—',
  rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”',
  middot: '·', times: '×', plusmn: '±', micro: 'µ', frac12: '½', frac14: '¼',
};
function decodeEntities(s) {
  return String(s || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch (e) { return _; } })
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(parseInt(n, 10)); } catch (e) { return _; } })
    .replace(/&([A-Za-z][A-Za-z0-9]+);/g, (m, name) => Object.prototype.hasOwnProperty.call(_ENT, name) ? _ENT[name] : m);
}
function stripHtml(s) {
  let t = String(s || '')
    .replace(/<img\b[^>]*>/gi, ' ')
    .replace(/data:image\/[a-z+]+;base64,[A-Za-z0-9+/=\s]+/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  t = decodeEntities(t);
  return t.replace(/\s+/g, ' ').trim();
}
const _LETRAS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
// Adapta a questão da API → formato que o PO/IA lê.
function adaptarQuestao(q) {
  const alts = (q.alternativas || []).slice().sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  let gabarito = '';
  const alternativas = alts.map((a, i) => {
    const letra = _LETRAS[i] || String(i + 1);
    if (a.isResposta) gabarito = letra;
    return { letra, texto: stripHtml(a.descricao || '') };
  });
  return { id: q.id, enunciado: stripHtml(q.descricao || ''), gabarito, alternativas, ano: q.ano, escopo: (q.escopo && q.escopo.alias) || '' };
}
// escopo (alias) → balde do módulo
function baldeDoEscopo(alias) {
  const a = String(alias || '').toUpperCase();
  if (a === 'TEA') return 'TEA';
  if (a === 'TSA') return 'TSA';
  if (a.startsWith('ME')) return 'MEs';
  return 'Outras';
}

async function laravelGet(path) {
  const r = await fetch(`${LARAVEL_API}${path}`, { headers: { Authorization: `Bearer ${LARAVEL_TOKEN}`, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`Laravel GET ${path} → ${r.status}`);
  return r.json();
}
async function questoesPagina(body, page) {
  const r = await fetch(`${LARAVEL_API}/v2/web/questoes?page=${page}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${LARAVEL_TOKEN}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Laravel questoes p${page} → ${r.status}`);
  return r.json();
}
// Puxa TODAS as questões de uma categoria/ano (paginado).
async function puxarTodas(categorias, anos) {
  const body = { categorias, anos };
  const todas = []; let page = 1, total = Infinity, perdas = 0;
  while (todas.length < total) {
    const j = await questoesPagina(body, page);
    total = Number(j.total || 0);
    const data = Array.isArray(j.data) ? j.data : [];
    if (!data.length) { if (++perdas > 1) break; } else perdas = 0;
    todas.push(...data);
    page++;
    if (page > 1000) break; // trava de segurança
  }
  return { todas, total };
}
// Núcleo reutilizável: puxa + adapta + separa por balde para um conjunto de categorias.
async function coletarPorCategorias(categorias) {
  const anos = anosRecentes(5);
  const { todas } = await puxarTodas(categorias, anos);
  // dedup por id
  const vistos = new Set();
  const buckets = { TEA: [], TSA: [], MEs: [], Outras: [] };
  for (const q of todas) {
    if (vistos.has(q.id)) continue; vistos.add(q.id);
    const a = adaptarQuestao(q);
    buckets[baldeDoEscopo(a.escopo)].push(a);
  }
  return { buckets, anos, totalUnicas: vistos.size };
}

// ── filtrosPO: devolve categorias (com incidência/peso), tipos e anos ──
exports.filtrosPO = onRequest(
  { region: 'us-central1', invoker: 'public', cors: false, timeoutSeconds: 60, memory: '256MiB' },
  async (req, res) => {
    setCors(req, res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (!LARAVEL_TOKEN) { res.status(500).json({ error: 'Integração Laravel não configurada' }); return; }
    if (!await exigeAuth(req, res)) return;
    try {
      const f = await laravelGet('/filtros');
      // achata categorias (pai + sub) com os campos úteis pra auto-match e p/ a IA
      const cats = [];
      (f.categorias || []).forEach(c => {
        cats.push({ id: c.id, desc: c.desc, parent_id: c.parent_id || null, taxa_incidencia: c.taxa_incidencia, peso: c.weigth });
        (c.sub_categorias || []).forEach(s => cats.push({ id: s.id, desc: s.desc, parent_id: s.parent_id || c.id, taxa_incidencia: s.taxa_incidencia, peso: s.weigth }));
      });
      res.status(200).json({ ok: true, categorias: cats, tipos: f.tipo_de_provas || [], anos: f.anos || [] });
    } catch (err) {
      console.error('filtrosPO erro:', err?.message || err);
      res.status(502).json({ error: 'Erro ao buscar filtros', detail: String(err?.message || err) });
    }
  }
);

// ── puxarQuestoesPO: puxa as questões do(s) tema(s) e grava no módulo ──
exports.puxarQuestoesPO = onRequest(
  { region: 'us-central1', invoker: 'public', cors: false, timeoutSeconds: 300, memory: '512MiB' },
  async (req, res) => {
    setCors(req, res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
    if (!LARAVEL_TOKEN) { res.status(500).json({ error: 'Integração Laravel não configurada' }); return; }
    if (!await exigeAuth(req, res)) return;

    const cursoId = String(req.body?.cursoId || '').trim();
    const modulo = String(req.body?.modulo || '').trim();
    const categorias = Array.isArray(req.body?.categorias) ? req.body.categorias.map(Number).filter(Boolean) : [];
    if (!cursoId || !modulo) { res.status(400).json({ error: 'cursoId/modulo ausentes' }); return; }
    if (!categorias.length) { res.status(400).json({ error: 'Nenhum tema (categoria) informado' }); return; }

    try {
      const { buckets, anos, totalUnicas } = await coletarPorCategorias(categorias);
      // grava no módulo preservando pedidos/apostilas
      const key = _slug(cursoId + '__' + modulo);
      const ref = admin.firestore().collection('poModQuestoes').doc(key);
      const prev = (await ref.get()).data() || {};
      await ref.set({
        cursoId, modulo,
        TEA: buckets.TEA, TSA: buckets.TSA, MEs: buckets.MEs, Outras: buckets.Outras,
        pedidos: Array.isArray(prev.pedidos) ? prev.pedidos : [],
        apostilas: Array.isArray(prev.apostilas) ? prev.apostilas : [],
        questoesFonte: 'api', questoesCategorias: categorias, questoesAnos: anos,
        questoesAtualizadoEm: new Date().toISOString(),
      }, { merge: true });
      res.status(200).json({
        ok: true, anos, totalUnicas,
        porTipo: { TEA: buckets.TEA.length, TSA: buckets.TSA.length, MEs: buckets.MEs.length, Outras: buckets.Outras.length },
      });
    } catch (err) {
      console.error('puxarQuestoesPO erro:', err?.message || err);
      res.status(502).json({ error: 'Erro ao puxar questões', detail: String(err?.message || err) });
    }
  }
);

// expõe o núcleo p/ teste local em node (sem Firebase)
exports._coletarPorCategorias = coletarPorCategorias;
exports._adaptarQuestao = adaptarQuestao;
exports._anosRecentes = anosRecentes;
exports._stripHtml = stripHtml;
