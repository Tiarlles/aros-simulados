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

// Escolhe a melhor faixa de legenda: prefere legenda humana sobre autogerada,
// e dentro de cada grupo a marcada como active.
function escolherFaixa(tracks) {
  const list = Array.isArray(tracks) ? tracks.filter(t => t && t.link) : [];
  if (!list.length) return null;
  const isAuto = t => /-x-autogen$/i.test(t.language || '');
  const humanas = list.filter(t => !isAuto(t));
  const grupo = humanas.length ? humanas : list;
  return grupo.find(t => t.active) || grupo[0];
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
      // 1) lista de faixas de legenda do vídeo
      const ttResp = await fetch(`https://api.vimeo.com/videos/${vimeoId}/texttracks`, {
        headers: { Authorization: `Bearer ${VIMEO_TOKEN}`, 'Content-Type': 'application/json' },
      });
      if (ttResp.status === 404) {
        res.status(200).json({ ok: false, motivo: 'video_nao_encontrado' });
        return;
      }
      if (!ttResp.ok) {
        const txt = await ttResp.text();
        console.warn('Vimeo texttracks falhou', vimeoId, ttResp.status, txt.slice(0, 200));
        res.status(502).json({ ok: false, motivo: 'erro_vimeo', status: ttResp.status });
        return;
      }
      const ttJson = await ttResp.json();
      const faixa = escolherFaixa(ttJson.data);
      if (!faixa) {
        res.status(200).json({ ok: false, motivo: 'sem_legenda' });
        return;
      }

      // 2) baixa o VTT da faixa escolhida (link assinado, válido na hora)
      const vttResp = await fetch(faixa.link);
      if (!vttResp.ok) {
        res.status(502).json({ ok: false, motivo: 'erro_download_vtt', status: vttResp.status });
        return;
      }
      const vtt = await vttResp.text();
      const texto = vttParaTexto(vtt);
      if (!texto) { res.status(200).json({ ok: false, motivo: 'legenda_vazia' }); return; }

      const palavras = texto.split(/\s+/).filter(Boolean).length;
      const lang = faixa.language || '';
      const autogerada = /-x-autogen$/i.test(lang);

      // 3) grava a transcrição completa em doc separado (carregado sob demanda),
      //    chaveado pelo VIMEO ID (estável entre re-imports do Laravel, e
      //    compartilhado quando o mesmo vídeo aparece em vários cursos).
      //    Admin SDK ignora as rules — frontend só precisa de read.
      await admin.firestore().collection('poTranscricoes').doc(vimeoId).set({
        texto,
        vimeoId,
        aulaId: aulaId || '',
        lang,
        autogerada,
        chars: texto.length,
        palavras,
        fonte: 'vimeo',
        updatedAt: new Date().toISOString(),
      });

      res.status(200).json({
        ok: true,
        vimeoId,
        lang,
        autogerada,
        chars: texto.length,
        palavras,
        preview: texto.slice(0, 160),
      });
    } catch (err) {
      console.error('vimeoTranscricao erro:', err?.message || err);
      res.status(500).json({ error: 'Erro ao buscar transcrição', detail: String(err?.message || err) });
    }
  }
);
