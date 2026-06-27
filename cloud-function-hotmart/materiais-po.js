// Cloud Function (Firebase Gen 2) — Materiais (Slides/anexos) de uma aula via API do Laravel.
// Os anexos vêm embutidos em tasks[] de cada conteúdo (type:'material'); cada um tem um
// `link` de download ASSINADO e EXPIRÁVEL que SÓ baixa com o Bearer do Laravel no header
// (sem auth → 302 /login). Por isso o navegador não baixa direto: este endpoint atua como
// proxy server-side (segura o token, busca o link fresco e devolve o arquivo).
//
// Endpoint único `materiaisPO` (POST, auth: Firebase ID token). Dois modos no body:
//   { mode:'list',     courseId, vertical, laravelId, modulo }      → JSON [{id,label,...}]
//   { mode:'download', courseId, vertical, laravelId, modulo, attId } → bytes do arquivo

const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

const LARAVEL_API = 'https://api.grupomedreview.com.br/api';
const LARAVEL_TOKEN = process.env.LARAVEL_TOKEN || '';
const LARAVEL_TOKEN_MEDREVIEW = process.env.LARAVEL_TOKEN_MEDREVIEW || '';
// MedReview usa o LARAVEL_TOKEN (Anest) — que já tem acesso ao curso do MedReview na mesma
// API — até existir um LARAVEL_TOKEN_MEDREVIEW próprio (que entra na frente se for definido).
const TOKENS_POR_VERTICAL = {
  anestreview: LARAVEL_TOKEN,
  medreview: LARAVEL_TOKEN_MEDREVIEW || LARAVEL_TOKEN,
};

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

const _norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

async function laravelGet(path, token) {
  const r = await fetch(`${LARAVEL_API}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`Laravel GET ${path} → ${r.status}`);
  return r.json();
}
const _arr = x => Array.isArray(x) ? x : (x && (x.data || x.modulos || x.conteudos)) || [];

// Cursos conhecidos por vertical (espelha sincronizar-laravel/flashcards-po) — fallback
// quando o front não souber o laravelCourseId da aula.
const CURSOS_HARD = {
  anestreview: ['3df5bb00-db83-49a3-a334-f55af33b48f4'],
  medreview: ['43b2fb17-b7c1-4770-bb0e-0fc11355dfdb'],
};
// Monta a lista de courseIds candidatos: o enviado pelo front (preferencial) + os conhecidos
// da vertical + os cadastrados em config/poConfig.cursos com laravelCourseId.
async function candidatosCurso({ courseId, vertical }) {
  const ids = [];
  const add = id => { id = String(id || '').trim(); if (id && !ids.includes(id)) ids.push(id); };
  if (courseId) add(courseId);
  (CURSOS_HARD[vertical] || []).forEach(add);
  try {
    const cfg = (await admin.firestore().collection('config').doc('poConfig').get()).data() || {};
    (cfg.cursos || []).forEach(c => { if (c && c.laravelCourseId && (!vertical || c.vertical === vertical)) add(c.laravelCourseId); });
  } catch (e) { /* sem config — segue com os hard/courseId */ }
  return ids;
}

// Acha o conteúdo (aula) no Laravel e devolve {conteudo, token}. Caminho:
// candidatos de curso → módulos (casa pelo nome do módulo; se não casar, varre todos) →
// conteúdo (pelo laravelId). Para no primeiro acerto.
async function acharConteudo(b) {
  const { vertical, laravelId, modulo } = b;
  const token = TOKENS_POR_VERTICAL[vertical] || LARAVEL_TOKEN;
  if (!token) throw new Error('Integração Laravel não configurada para esta vertical');
  if (!laravelId) throw new Error('Aula sem vínculo com o Laravel (sincronize o curso primeiro)');
  const cursos = await candidatosCurso(b);
  if (!cursos.length) throw new Error('Curso sem vínculo com o Laravel (sincronize o curso primeiro)');
  const alvoMod = _norm(modulo);
  for (const courseId of cursos) {
    let modulos;
    try { modulos = _arr(await laravelGet(`/curso/${courseId}/modulos`, token)); } catch (e) { continue; }
    // tenta primeiro o módulo cujo nome bate (rápido); senão varre todos do curso
    const ordenados = alvoMod
      ? modulos.slice().sort((a, b2) => {
          const an = _norm(a.name || a.title || a.module_name || a.nome) === alvoMod ? 0 : 1;
          const bn = _norm(b2.name || b2.title || b2.module_name || b2.nome) === alvoMod ? 0 : 1;
          return an - bn;
        })
      : modulos;
    for (const mod of ordenados) {
      let cont;
      try { cont = _arr(await laravelGet(`/modulo/${mod.id}/conteudos`, token)); } catch (e) { continue; }
      const c = cont.find(x => String(x.id) === String(laravelId));
      if (c) return { conteudo: c, token };
    }
  }
  return { conteudo: null, token };
}

// tasks[] type 'material' → metadados enxutos pro front (sem expor o link assinado).
// EXCLUI os materiais com tag apostila=true: esses vão pro botão de Apostila do módulo,
// não pra coluna Slides (separação combinada com o mantenedor).
function materiaisDoConteudo(c) {
  return (Array.isArray(c.tasks) ? c.tasks : [])
    .filter(t => t && t.type === 'material' && t.link && t.apostila !== true)
    .map(t => ({
      id: String(t.id),
      label: String(t.label || (t.data && t.data.metadata && t.data.metadata.original_name) || 'Material'),
      tamanho: String(t.subtitle || (t.data && t.data.metadata && t.data.metadata.file_size_formatted) || ''),
      bytes: Number((t.data && t.data.metadata && t.data.metadata.file_size) || 0) || null,
      apostila: t.apostila === true,
    }));
}

// extensão a partir do path do `file=` no link (default pdf), pra nomear o download.
function extDoLink(link) {
  try {
    const u = new URL(link);
    const f = decodeURIComponent(u.searchParams.get('file') || '');
    const m = f.match(/\.([a-z0-9]{1,5})$/i);
    return m ? m[1].toLowerCase() : 'pdf';
  } catch (e) { return 'pdf'; }
}
function nomeArquivo(t, ext) {
  const base = String((t.data && t.data.metadata && t.data.metadata.original_name) || t.label || 'material')
    .replace(/[\/\\:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'material';
  return base.toLowerCase().endsWith('.' + ext) ? base : `${base}.${ext}`;
}
const MIME = { pdf: 'application/pdf', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ppt: 'application/vnd.ms-powerpoint', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', zip: 'application/zip', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };

// TODOS os materiais (slides + apostilas) com um `type` ('slide'|'apostila') — usado pela
// MegaBrain API (o MCG quer slides E apostilas; o painel é que separa nos dois botões).
function listarMateriais(c) {
  return (Array.isArray(c.tasks) ? c.tasks : [])
    .filter(t => t && t.type === 'material' && t.link)
    .map(t => ({
      id: String(t.id),
      label: String(t.label || (t.data && t.data.metadata && t.data.metadata.original_name) || 'Material'),
      type: t.apostila === true ? 'apostila' : 'slide',
      tamanho: String(t.subtitle || (t.data && t.data.metadata && t.data.metadata.file_size_formatted) || ''),
      bytes: Number((t.data && t.data.metadata && t.data.metadata.file_size) || 0) || null,
    }));
}
// Baixa um material pelo attId (proxy server-side com o Bearer do Laravel). Fonte única de
// verdade do download — usada pelo handler materiaisPO E pela MegaBrain API.
// Devolve { ok, status?, error?, buffer?, filename?, contentType? }.
async function baixarMaterial(conteudo, attId, token) {
  const t = (Array.isArray(conteudo.tasks) ? conteudo.tasks : [])
    .find(x => x && x.type === 'material' && String(x.id) === String(attId) && x.link);
  if (!t) return { ok: false, status: 404, error: 'Material não encontrado nesta aula.' };
  const r = await fetch(t.link, { headers: { Authorization: `Bearer ${token}`, Accept: '*/*' } });
  if (!r.ok) return { ok: false, status: 502, error: `Falha ao baixar do Laravel (${r.status})` };
  const ext = extDoLink(t.link);
  const buffer = Buffer.from(await r.arrayBuffer());
  return { ok: true, buffer, filename: nomeArquivo(t, ext), contentType: MIME[ext] || r.headers.get('content-type') || 'application/octet-stream' };
}

// Helpers reutilizáveis pela MegaBrain API (megabrain-api.js).
exports.acharConteudo = acharConteudo;
exports.listarMateriais = listarMateriais;
exports.baixarMaterial = baixarMaterial;

exports.materiaisPO = onRequest(
  { region: 'us-central1', invoker: 'public', cors: false, timeoutSeconds: 120, memory: '512MiB' },
  async (req, res) => {
    setCors(req, res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Use POST' }); return; }
    if (!await exigeAuth(req, res)) return;

    const b = req.body || {};
    const mode = b.mode === 'download' ? 'download' : 'list';
    try {
      const { conteudo, token } = await acharConteudo(b);
      if (!conteudo) { res.status(404).json({ error: 'Aula não encontrada no Laravel (módulo pode ter sido renomeado/ignorado).' }); return; }

      if (mode === 'list') {
        res.status(200).json({ ok: true, materiais: materiaisDoConteudo(conteudo) });
        return;
      }

      // download: proxy do arquivo (com o Bearer) — fonte única em baixarMaterial().
      const d = await baixarMaterial(conteudo, b.attId, token);
      if (!d.ok) { res.status(d.status || 502).json({ error: d.error }); return; }
      res.set('Content-Type', d.contentType);
      res.set('Access-Control-Expose-Headers', 'Content-Disposition');
      res.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(d.filename)}`);
      res.set('Content-Length', String(d.buffer.length));
      res.status(200).send(d.buffer);
    } catch (err) {
      console.error('materiaisPO erro:', err?.message || err);
      res.status(502).json({ error: String(err?.message || err) });
    }
  }
);
