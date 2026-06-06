// ════════════════════════════════════════════════════════════════════════════
// gerarFeedbackIA — endpoint de IA pros feedbacks dos casos e Feedback Geral.
//
// Recebe POST { prompt, content, maxTokens?, mode? } com Authorization: Bearer
// <Firebase ID token>. Chama Claude (Sonnet 4.6 por padrão) com o `prompt` como
// system (cacheado) e o `content` como mensagem do usuário. Retorna { texto, usage }.
//
// A chave da Anthropic fica SÓ no servidor (.env ANTHROPIC_API_KEY) — nunca é
// exposta no cliente. Auth: exige Firebase Auth (Google/Email). Login custom
// legado (só senha) NÃO funciona aqui.
// ════════════════════════════════════════════════════════════════════════════
const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const Anthropic = require('@anthropic-ai/sdk').default;

// Chave DEDICADA pros feedbacks — separada da do Dex (ANTHROPIC_API_KEY) pra
// permitir estimar/isolar o custo no console da Anthropic. Definir no .env como
// ANTHROPIC_API_KEY_FEEDBACK. Sem fallback de propósito: se não estiver setada, a
// função falha com mensagem clara em vez de gastar na chave compartilhada.
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY_FEEDBACK;

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const MODEL_MAP = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-7',
};

const ALLOWED_ORIGINS = [
  'https://aros.anestreview.com.br',
  'http://localhost:8081',
  'http://localhost:8080',
  'http://localhost:8765',
  'http://127.0.0.1:8081',
  'http://127.0.0.1:8080',
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

exports.gerarFeedbackIA = onRequest(
  {
    region: 'us-central1',
    invoker: 'public',
    cors: false,
    timeoutSeconds: 60,
    memory: '512MiB',
  },
  async (req, res) => {
    setCors(req, res);

    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    if (!ANTHROPIC_API_KEY) {
      console.error('ANTHROPIC_API_KEY_FEEDBACK ausente no .env');
      res.status(500).json({ error: 'IA dos feedbacks não configurada no servidor (falta ANTHROPIC_API_KEY_FEEDBACK)' });
      return;
    }

    // Auth: Firebase ID token obrigatório
    const authHeader = req.get('Authorization') || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) {
      res.status(401).json({ error: 'Faça login com Google ou Email para usar a IA' });
      return;
    }
    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(idToken);
    } catch (e) {
      console.warn('Token inválido:', e.message);
      res.status(401).json({ error: 'Sessão expirada — faça login novamente' });
      return;
    }

    const mode = String(req.body?.mode || 'revisar');

    // Modo teste: ping rápido pra validar a conexão sem gastar muito.
    if (mode === 'test') {
      try {
        const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
        const t0 = Date.now();
        const resp = await client.messages.create({
          model: DEFAULT_MODEL,
          max_tokens: 16,
          messages: [{ role: 'user', content: 'Responda apenas "OK" se você está funcionando.' }],
        });
        const ms = Date.now() - t0;
        const texto = resp.content.filter(c => c.type === 'text').map(c => c.text).join('').trim();
        res.status(200).json({ texto: texto || 'OK', ms, modelo: DEFAULT_MODEL });
      } catch (err) {
        console.error('Erro teste IA:', err);
        res.status(500).json({ error: 'Falha no teste', detail: err?.message || 'Erro desconhecido' });
      }
      return;
    }

    const prompt = String(req.body?.prompt || '').trim();
    const content = String(req.body?.content || '').trim();
    if (!prompt) {
      res.status(400).json({ error: 'Prompt não configurado' });
      return;
    }
    if (!content) {
      res.status(400).json({ error: 'Sem conteúdo para processar' });
      return;
    }
    if (content.length > 40000) {
      res.status(400).json({ error: 'Conteúdo muito longo (máx 40000 caracteres)' });
      return;
    }

    // Resolve modelo (alias curto ou ID completo). Default Sonnet 4.6.
    const modeloRaw = String(req.body?.model || '').trim().toLowerCase();
    const modelo = MODEL_MAP[modeloRaw] || (modeloRaw.startsWith('claude-') ? modeloRaw : DEFAULT_MODEL);
    // max_tokens entre 256 e 8192 (default 1500). Teto 8192 acomoda a revisão em
    // LOTE (vários feedbacks de casos do mesmo aluno numa resposta só).
    let maxTokens = parseInt(req.body?.maxTokens, 10);
    if (!Number.isFinite(maxTokens)) maxTokens = 1500;
    maxTokens = Math.max(256, Math.min(8192, maxTokens));

    try {
      const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
      const resp = await client.messages.create({
        model: modelo,
        max_tokens: maxTokens,
        system: [
          { type: 'text', text: prompt, cache_control: { type: 'ephemeral' } },
        ],
        messages: [{ role: 'user', content }],
      });

      const texto = resp.content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('\n')
        .trim();

      const usage = resp.usage || {};
      console.log('FeedbackIA OK', {
        user: decoded.email || decoded.uid,
        mode,
        modelo,
        max_tokens: maxTokens,
        content_len: content.length,
        resposta_len: texto.length,
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cache_read: usage.cache_read_input_tokens || 0,
        cache_write: usage.cache_creation_input_tokens || 0,
      });

      res.status(200).json({
        texto,
        usage: {
          input: usage.input_tokens || 0,
          output: usage.output_tokens || 0,
          cache_read: usage.cache_read_input_tokens || 0,
          cache_write: usage.cache_creation_input_tokens || 0,
        },
      });
    } catch (err) {
      console.error('Erro FeedbackIA:', err);
      res.status(500).json({ error: 'Erro ao gerar com IA', detail: err?.message || 'Erro desconhecido' });
    }
  }
);
