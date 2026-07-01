// Cloud Function (Firebase Gen 2) — Trilhas de Casos Clínicos (TSA) via API do Laravel.
//
// A API do aluno lista os "simulados de casos clínicos" (= trilhas). Cada trilha tem
// N casos clínicos e N problemas (total_itens). Cada problema tem pergunta, gabarito e
// comentário (gabarito_comentado). O navegador NÃO pode chamar direto (token secreto +
// CORS), então esta função atua server-side: puxa todas as páginas com show_content=true,
// soma os caracteres (pergunta+gabarito+comentário, sem HTML) e conta multimídia por trilha,
// e grava só os TOTAIS em cronoTrilhas/{id} (o tempo é calculado na tela com ritmo ajustável).
//
// Endpoint `sincronizarTrilhasCasos` (POST, auth: Firebase ID token). Sem body obrigatório.
// Retorna { ok, count, trilhas:[...] } e persiste em Firestore cronoTrilhas.

const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

const LARAVEL_API = 'https://api.grupomedreview.com.br/api';
const LARAVEL_TOKEN = process.env.LARAVEL_TOKEN || '';

const ALLOWED_ORIGINS = [
  'https://aros.anestreview.com.br',
  'http://localhost:8081', 'http://localhost:8080', 'http://localhost:8766',
  'http://localhost:8767', 'http://localhost:8765', 'http://localhost:8777',
  'http://127.0.0.1:8081', 'http://127.0.0.1:8080', 'http://127.0.0.1:8777',
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

// Remove HTML/entidades e normaliza espaços — pra contar caracteres "de leitura" reais.
const _strip = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z0-9#]+;/gi, ' ').replace(/\s+/g, ' ').trim();

const _sleep = ms => new Promise(r => setTimeout(r, ms));

// A API dá erro 500 quando o payload fica grande (algumas trilhas passam de 30 MB de
// conteúdo sozinhas). Por isso puxamos de 1 em 1 (per_page=1) com retry — assim cada
// requisição carrega só uma trilha e nunca estoura o limite do servidor.
async function laravelPost(path, token, body, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${LARAVEL_API}${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (r.ok) return r.json();
      lastErr = new Error(`Laravel POST ${path} → ${r.status}`);
      // 429 = rate limit da plataforma → espera bem mais antes de tentar de novo.
      if (r.status === 429) { await _sleep(5000 * (i + 1)); continue; }
    } catch (e) { lastErr = e; }
    await _sleep(500 * (i + 1));
  }
  throw lastErr;
}

exports.sincronizarTrilhasCasos = onRequest({ region: 'us-central1', memory: '1GiB', timeoutSeconds: 540 }, async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Use POST' }); return; }
  if (!(await exigeAuth(req, res))) return;
  if (!LARAVEL_TOKEN) { res.status(500).json({ error: 'LARAVEL_TOKEN ausente no ambiente da função' }); return; }

  try {
    const db = admin.firestore();
    const perPage = 1; // 1 trilha por requisição — evita o 500 do payload grande
    const bodyBase = { show_simulados_tsa_tea: false, tipo_simulado: 'shared', per_page: perPage };
    let page = 1, last = null;
    const trilhas = [];
    const contentErrors = []; // trilhas cujo conteúdo a API não entrega (500) — vêm só com metadados

    while (true) {
      let j = null, contentError = false;
      try {
        j = await laravelPost(`/aluno/simulados-casos-clinicos?page=${page}`, LARAVEL_TOKEN, { ...bodyBase, show_content: true }, 2);
      } catch (e) {
        // Conteúdo dá 500 no servidor pra essa trilha específica → pega só os metadados (leve).
        try {
          j = await laravelPost(`/aluno/simulados-casos-clinicos?page=${page}`, LARAVEL_TOKEN, { ...bodyBase, show_content: false }, 2);
          contentError = true;
        } catch (e2) { j = null; }
      }
      if (j) {
        if (last === null) last = (j.meta && j.meta.last_page) || 1;
        const data = Array.isArray(j.data) ? j.data : [];
        for (const t of data) {
          const itens = Array.isArray(t.itens) ? t.itens : [];
          let chars = 0, media = 0;
          for (const it of itens) {
            chars += _strip(it.questao).length + _strip(it.gabarito).length;
            const gcs = Array.isArray(it.gabarito_comentado) ? it.gabarito_comentado : [];
            for (const gc of gcs) chars += _strip(gc && gc.content).length;
            if (it.tem_imagem) media++;
            if (it.tem_audio) media++;
          }
          trilhas.push({
            id: t.id,
            titulo: t.titulo || '',
            totalCasos: Number(t.total_casos) || 0,
            totalProblemas: Number(t.total_itens) || itens.length,
            totalChars: chars,
            mediaCount: media,
            contentError,
            escopo: (t.escopo && t.escopo.nome) || '',
            produtor: (t.produtor && t.produtor.nome) || '',
          });
          if (contentError) contentErrors.push({ id: t.id, titulo: t.titulo || '' });
        }
      } else {
        contentErrors.push({ page, titulo: '(página inacessível)' });
      }
      if (last !== null && page >= last) break;
      if (last === null && page >= 6) break; // não estabeleceu paginação — aborta cedo
      if (page >= 200) break;
      page++;
      await _sleep(650); // respiro entre as chamadas — evita o 429 (rate limit) da plataforma
    }

    // Persiste os totais (o conteúdo pesado não é guardado).
    const nowIso = new Date().toISOString();
    let b = db.batch(), n = 0;
    for (const tr of trilhas) {
      b.set(db.collection('cronoTrilhas').doc(String(tr.id)), { ...tr, updatedAt: nowIso }, { merge: true });
      if (++n >= 450) { await b.commit(); b = db.batch(); n = 0; }
    }
    if (n > 0) await b.commit();

    res.json({ ok: true, count: trilhas.length, contentErrors, syncedAt: nowIso, trilhas });
  } catch (e) {
    console.error('sincronizarTrilhasCasos:', e);
    res.status(500).json({ error: String((e && e.message) || e) });
  }
});
