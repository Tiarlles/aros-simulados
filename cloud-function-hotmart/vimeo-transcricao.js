// Cloud Function (Firebase Gen 2) — Transcrição via Vimeo
// Recebe um vimeoId (+ aulaId), busca as legendas (text tracks) do vídeo na API
// do Vimeo, baixa o VTT da melhor faixa, limpa pra texto puro e grava em
// poTranscricoes/{aulaId}. Retorna metadados (chars/palavras/lang/preview).
//
// Auth: exige Firebase ID token (Authorization: Bearer <token>) — só coord/prof
// logado. O token do Vimeo (VIMEO_TOKEN) fica server-side, nunca vai pro browser.

const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

const VIMEO_TOKEN = process.env.VIMEO_TOKEN || '';

const ALLOWED_ORIGINS = [
  'https://aros.anestreview.com.br',
  'http://localhost:8081',
  'http://localhost:8080',
  'http://localhost:8766',
  'http://localhost:8767',
  'http://localhost:8765',
  'http://127.0.0.1:8081',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:8766',
  'http://127.0.0.1:8767',
  'http://127.0.0.1:8765',
];

function setCors(req, res) {
  const origin = req.get('Origin') || '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
  }
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.set('Access-Control-Max-Age', '3600');
}

// Ordena as faixas de legenda por preferência: humana antes de autogerada e,
// dentro de cada grupo, a marcada como active primeiro. Devolve a LISTA inteira
// (não só a melhor) pra dar pra tentar as outras se o download de uma falhar —
// às vezes a faixa "active" está quebrada no Vimeo (404) e a inativa funciona.
function ordenarFaixas(tracks) {
  const list = Array.isArray(tracks) ? tracks.filter(t => t && t.link) : [];
  const isAuto = t => /-x-autogen$/i.test(t.language || '');
  const rank = t => (isAuto(t) ? 2 : 0) + (t.active ? 0 : 1);
  return list.slice().sort((a, b) => rank(a) - rank(b));
}

// Converte VTT em texto corrido limpo (sem timestamps, índices, cabeçalho ou tags).
function vttParaTexto(vtt) {
  const linhas = String(vtt || '').split(/\r?\n/);
  const out = [];
  let ultima = '';
  for (let l of linhas) {
    const t = l.trim();
    if (!t) continue;
    if (/^WEBVTT/i.test(t)) continue;
    if (/^NOTE\b/i.test(t)) continue;
    if (/^\d+$/.test(t)) continue;           // índice do cue
    if (/-->/.test(t)) continue;             // linha de tempo
    // remove tags tipo <c>, <00:00:00.000>, &nbsp; etc
    const limpo = t.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
    if (!limpo) continue;
    if (limpo === ultima) continue;          // dedup de linhas repetidas (comum em autogen)
    out.push(limpo);
    ultima = limpo;
  }
  return out.join(' ').replace(/\s+/g, ' ').trim();
}

exports.vimeoTranscricao = onRequest(
  {
    region: 'us-central1',
    invoker: 'public',
    cors: false,
    timeoutSeconds: 120,
    memory: '512MiB',
  },
  async (req, res) => {
    setCors(req, res);

    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

    if (!VIMEO_TOKEN) {
      console.error('VIMEO_TOKEN ausente');
      res.status(500).json({ error: 'Integração Vimeo não configurada no servidor' });
      return;
    }

    // Auth obrigatória (coord/prof logado)
    const authHeader = req.get('Authorization') || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) { res.status(401).json({ error: 'Faça login para usar a transcrição' }); return; }
    try {
      await admin.auth().verifyIdToken(idToken);
    } catch (e) {
      res.status(401).json({ error: 'Sessão expirada — faça login novamente' });
      return;
    }

    const vimeoId = String(req.body?.vimeoId || '').trim().replace(/\D/g, '');
    const aulaId = String(req.body?.aulaId || '').trim();
    if (!vimeoId) { res.status(400).json({ error: 'vimeoId ausente' }); return; }

    try {
      const r = await obterTranscricao(vimeoId, aulaId);
      // motivos de "não deu" devolvem 200 com ok:false pra o lote continuar
      res.status(200).json(r);
    } catch (err) {
      console.error('vimeoTranscricao erro:', err?.message || err);
      res.status(500).json({ error: 'Erro ao buscar transcrição', detail: String(err?.message || err) });
    }
  }
);

// Núcleo reutilizável: busca a legenda do vídeo no Vimeo, limpa e grava em
// poTranscricoes/{vimeoId}. Usado pela function HTTP e pela sincronização Laravel.
// Retorna {ok:true, palavras, chars, lang, autogerada, preview} ou {ok:false, motivo}.
async function obterTranscricao(vimeoIdRaw, aulaId) {
  const vimeoId = String(vimeoIdRaw || '').trim().replace(/\D/g, '');
  if (!vimeoId) return { ok: false, motivo: 'sem_vimeo_id' };
  if (!VIMEO_TOKEN) throw new Error('VIMEO_TOKEN ausente');

  const ttResp = await fetch(`https://api.vimeo.com/videos/${vimeoId}/texttracks`, {
    headers: { Authorization: `Bearer ${VIMEO_TOKEN}`, 'Content-Type': 'application/json' },
  });
  if (ttResp.status === 404) return { ok: false, motivo: 'video_nao_encontrado' };
  if (!ttResp.ok) {
    const txt = await ttResp.text();
    console.warn('Vimeo texttracks falhou', vimeoId, ttResp.status, txt.slice(0, 200));
    return { ok: false, motivo: 'erro_vimeo', status: ttResp.status };
  }
  const ttJson = await ttResp.json();
  const faixas = ordenarFaixas(ttJson.data);
  if (!faixas.length) return { ok: false, motivo: 'sem_legenda' };

  // Tenta cada faixa em ordem de preferência até uma baixar com texto de verdade.
  // (A faixa "active" às vezes 404 no CDN do Vimeo enquanto a inativa funciona.)
  let texto = '', faixaUsada = null, ultimoMotivo = 'sem_legenda';
  for (const faixa of faixas) {
    try {
      const vttResp = await fetch(faixa.link);
      if (!vttResp.ok) { ultimoMotivo = 'erro_download_vtt'; console.warn('VTT download falhou', vimeoId, faixa.language, vttResp.status); continue; }
      const t = vttParaTexto(await vttResp.text());
      if (!t) { ultimoMotivo = 'legenda_vazia'; continue; }
      texto = t; faixaUsada = faixa; break;
    } catch (e) { ultimoMotivo = 'erro_download_vtt'; console.warn('VTT erro', vimeoId, e?.message || e); }
  }
  if (!texto) return { ok: false, motivo: ultimoMotivo };

  const palavras = texto.split(/\s+/).filter(Boolean).length;
  const lang = faixaUsada.language || '';
  const autogerada = /-x-autogen$/i.test(lang);

  await admin.firestore().collection('poTranscricoes').doc(vimeoId).set({
    texto, vimeoId, aulaId: aulaId || '', lang, autogerada,
    chars: texto.length, palavras, fonte: 'vimeo',
    updatedAt: new Date().toISOString(),
  });

  return { ok: true, vimeoId, lang, autogerada, chars: texto.length, palavras, preview: texto.slice(0, 160) };
}

exports.obterTranscricao = obterTranscricao;

// ── Transcrição MANUAL: coord cola o texto à mão (ex.: vídeo fora do nosso Vimeo,
// ou legenda quebrada). Grava em poTranscricoes/{vimeoId} com fonte:'manual'. ──
exports.salvarTranscricaoManual = onRequest(
  { region: 'us-central1', invoker: 'public', cors: false, timeoutSeconds: 60, memory: '256MiB' },
  async (req, res) => {
    setCors(req, res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

    const authHeader = req.get('Authorization') || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) { res.status(401).json({ error: 'Faça login' }); return; }
    try { await admin.auth().verifyIdToken(idToken); }
    catch (e) { res.status(401).json({ error: 'Sessão expirada — faça login novamente' }); return; }

    const vimeoId = String(req.body?.vimeoId || '').trim().replace(/\D/g, '');
    const aulaId = String(req.body?.aulaId || '').trim();
    const texto = String(req.body?.texto || '').replace(/\s+/g, ' ').trim();
    const docId = vimeoId || (aulaId ? 'aula_' + aulaId : '');
    if (!docId) { res.status(400).json({ error: 'Informe o vídeo (vimeoId) ou a aula' }); return; }
    if (!texto) { res.status(400).json({ error: 'Cole a transcrição (texto vazio)' }); return; }

    try {
      const palavras = texto.split(/\s+/).filter(Boolean).length;
      await admin.firestore().collection('poTranscricoes').doc(docId).set({
        texto, vimeoId, aulaId: aulaId || '', lang: 'manual', autogerada: false,
        chars: texto.length, palavras, fonte: 'manual', updatedAt: new Date().toISOString(),
      });
      res.status(200).json({ ok: true, vimeoId: docId, palavras, chars: texto.length, lang: 'manual', preview: texto.slice(0, 160) });
    } catch (err) {
      console.error('salvarTranscricaoManual erro:', err?.message || err);
      res.status(500).json({ error: 'Erro ao salvar transcrição', detail: String(err?.message || err) });
    }
  }
);
