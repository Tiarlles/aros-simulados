// Cloud Function (Firebase Gen 2) — Gerador de PROMPT de THUMB (capa da aula)
// Recebe {titulo, vimeoId, aulaId}, lê a transcrição da aula (poTranscricoes/{vimeoId}
// ou puxa do Vimeo se faltar) e chama Claude pra devolver UM prompt pronto pro DALL·E 3
// gerar a capa (thumbnail) da aula. NÃO gera a imagem — só o prompt, pra copiar.
//
// O texto-instrução é editável pela tela (config/poConfig.promptThumb); se vazio, usa o
// DEFAULT abaixo. acao:'default' devolve o texto-padrão (pro botão "restaurar padrão").
//
// Auth: exige Firebase ID token. Chave: ANTHROPIC_API_KEY_PO (mesma do resto do PO).

const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const Anthropic = require('@anthropic-ai/sdk').default;
const { obterTranscricao } = require('./vimeo-transcricao');
const { calcCustoSonnet, registrarCusto } = require('./custos-ia');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY_PO || '';
const MODEL = 'claude-sonnet-4-6';
const TRANSC_CAP = 120000; // chars de transcrição que entram no prompt (uma aula ~31k)

// Instrução PADRÃO (afinada com o Tiarlles em 2026-06-22). Editável em config/poConfig.promptThumb.
const DEFAULT_PROMPT_THUMB = `Você é diretor de arte de um curso de anestesiologia. Vou te dar o NOME de uma aula e a TRANSCRIÇÃO dela. Crie UM prompt pronto para o DALL·E 3 gerar a CAPA (thumbnail) dessa aula.

REGRA DO TÍTULO (a mais importante): o texto da capa deve ser o NOME DA AULA fornecido (não invente nem parafraseie; no máximo ajuste capitalização). Esse título tem que ser o ELEMENTO VISUAL DOMINANTE da capa:
- MUITO GRANDE e em NEGRITO pesado, ocupando uma faixa larga (cerca de 1/4 a 1/3 da altura da imagem), em no máximo 2 linhas.
- EMBUTIDO na arte, dentro de um banner/painel horizontal de fundo sólido ou semitransparente de ALTO CONTRASTE (letra clara sobre fundo escuro ou vice-versa), com contorno/sombra para destacar.
- Posicionado numa área LIMPA (topo ou faixa) com margem livre — os personagens e elementos da cena NÃO podem invadir, cobrir ou competir com o título.
- Deve permanecer NÍTIDO e perfeitamente LEGÍVEL mesmo quando a imagem é vista PEQUENA, em um celular (thumbnail reduzida). Priorize legibilidade do título acima de qualquer detalhe.

A TRANSCRIÇÃO é SECUNDÁRIA — use apenas para entender o tema e compor a cena/ilustração ao redor do título.

A capa deve:
- Ser uma ILUSTRAÇÃO 3D no estilo de filme de animação da Pixar / DreamWorks: personagens expressivos e carismáticos, iluminação cinematográfica quente, cores vivas, acabamento premium.
- Representar de forma criativa e clara o tema central da aula.
- Ter composição WIDESCREEN 16:9 (1920x1080).
- Ser apropriada e amigável: nada gráfico, sangrento ou perturbador.

Responda SOMENTE com o prompt final para o DALL·E, em português, sem comentários nem aspas nem "Prompt:". Seja detalhado na cena, personagens, paleta, iluminação, enquadramento 16:9 e — com ênfase — no tamanho, posição e legibilidade mobile do título (o nome da aula).`;

const ALLOWED_ORIGINS = [
  'https://aros.anestreview.com.br',
  'http://localhost:8081', 'http://localhost:8080', 'http://localhost:8766',
  'http://localhost:8767', 'http://localhost:8765', 'http://localhost:8768',
  'http://127.0.0.1:8081', 'http://127.0.0.1:8080', 'http://127.0.0.1:8766',
  'http://127.0.0.1:8767', 'http://127.0.0.1:8765', 'http://127.0.0.1:8768',
];
function setCors(req, res) {
  const origin = req.get('Origin') || '';
  if (ALLOWED_ORIGINS.includes(origin) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) { res.set('Access-Control-Allow-Origin', origin); res.set('Vary', 'Origin'); }
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.set('Access-Control-Max-Age', '3600');
}

// Pega a transcrição: primeiro o que já está salvo (poTranscricoes/{vimeoId}); se não tem,
// tenta puxar do Vimeo na hora (obterTranscricao grava lá também). Devolve '' se não rolar.
async function obterTextoTranscricao(vimeoId) {
  const vid = String(vimeoId || '').replace(/\D/g, '');
  if (!vid) return '';
  try {
    const snap = await admin.firestore().collection('poTranscricoes').doc(vid).get();
    if (snap.exists) { const t = String(snap.data()?.texto || '').trim(); if (t) return t; }
  } catch (e) { console.warn('thumb: leitura poTranscricoes falhou', e?.message || e); }
  try {
    const r = await obterTranscricao(vid, '');
    if (r && r.ok) {
      const snap = await admin.firestore().collection('poTranscricoes').doc(vid).get();
      return String(snap.data()?.texto || '').trim();
    }
  } catch (e) { console.warn('thumb: puxar do Vimeo falhou', e?.message || e); }
  return '';
}

exports.gerarPromptThumb = onRequest(
  { region: 'us-central1', invoker: 'public', cors: false, timeoutSeconds: 120, memory: '512MiB' },
  async (req, res) => {
    setCors(req, res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

    const authHeader = req.get('Authorization') || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) { res.status(401).json({ error: 'Faça login para gerar a thumb' }); return; }
    let decoded;
    try { decoded = await admin.auth().verifyIdToken(idToken); }
    catch (e) { res.status(401).json({ error: 'Sessão expirada — faça login novamente' }); return; }

    // acao:'default' → devolve a instrução padrão (pro "restaurar padrão" da tela).
    if (req.body?.acao === 'default') { res.status(200).json({ ok: true, default: DEFAULT_PROMPT_THUMB }); return; }

    if (!ANTHROPIC_API_KEY) { res.status(500).json({ error: 'IA não configurada no servidor (ANTHROPIC_API_KEY_PO).' }); return; }

    const titulo = String(req.body?.titulo || '').trim();
    const vimeoId = String(req.body?.vimeoId || '').replace(/\D/g, '');
    const cursoId = String(req.body?.cursoId || '').trim();
    if (!titulo) { res.status(400).json({ error: 'Informe o título da aula.' }); return; }
    if (!vimeoId) { res.status(400).json({ error: 'Informe o ID do vídeo no Vimeo.' }); return; }

    try {
      const transc = await obterTextoTranscricao(vimeoId);
      if (!transc) { res.status(200).json({ ok: false, motivo: 'sem_transcricao' }); return; }

      // Instrução editável, POR PRODUTO. Cascata: promptThumbCurso[cursoId] →
      // promptThumb (global legado) → DEFAULT. Edição de um produto não afeta outro.
      let instr = DEFAULT_PROMPT_THUMB;
      try {
        const cfg = (await admin.firestore().collection('config').doc('poConfig').get()).data() || {};
        const porCurso = cursoId && cfg.promptThumbCurso && cfg.promptThumbCurso[cursoId];
        if (porCurso && String(porCurso).trim()) instr = String(porCurso).trim();
        else if (cfg.promptThumb && String(cfg.promptThumb).trim()) instr = String(cfg.promptThumb).trim();
      } catch (e) { /* usa o padrão */ }

      const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
      const resp = await client.messages.create({
        model: MODEL,
        max_tokens: 1200,
        system: instr,
        messages: [{ role: 'user', content: `NOME DA AULA: ${titulo}\n\nTRANSCRIÇÃO (apoio):\n${transc.slice(0, TRANSC_CAP)}` }],
      });
      const prompt = resp.content.filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
      if (!prompt) { res.status(502).json({ error: 'A IA não devolveu um prompt. Tente de novo.' }); return; }
      registrarCusto('thumb', calcCustoSonnet(resp.usage));

      console.log('thumb prompt', { user: decoded.email || decoded.uid, titulo, vimeoId, palavrasTransc: transc.split(/\s+/).filter(Boolean).length });
      res.status(200).json({ ok: true, prompt, titulo, vimeoId });
    } catch (err) {
      console.error('gerarPromptThumb erro:', err?.message || err);
      res.status(500).json({ error: 'Erro ao gerar o prompt da thumb', detail: String(err?.message || err) });
    }
  }
);
