// Cloud Function (Firebase Gen 2) — Pergunte ao Dex
// Recebe pergunta do time de suporte/vendas/marketing, consulta o catálogo de
// produtos no Firestore e chama Claude Haiku 4.5 pra gerar resposta
// fundamentada APENAS no catálogo.
//
// Auth: exige Firebase ID token (Authorization: Bearer <token>). Login custom
// legado do AROS NÃO funciona — precisa estar logado via Firebase Auth
// (Google ou Email/Password).

const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const Anthropic = require('@anthropic-ai/sdk').default;

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = 'claude-haiku-4-5-20251001';

const ALLOWED_ORIGINS = [
  'https://aros.anestreview.com.br',
  'http://localhost:8081',
  'http://localhost:8080',
  'http://127.0.0.1:8081',
  'http://127.0.0.1:8080',
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

exports.perguntarDex = onRequest(
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
      console.error('ANTHROPIC_API_KEY ausente');
      res.status(500).json({ error: 'IA não configurada no servidor' });
      return;
    }

    // Auth: Firebase ID token obrigatório
    const authHeader = req.get('Authorization') || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) {
      res.status(401).json({ error: 'Faça login com Google ou Email para usar o Dex' });
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

    const pergunta = String(req.body?.pergunta || '').trim();
    if (!pergunta) {
      res.status(400).json({ error: 'Digite uma pergunta' });
      return;
    }
    if (pergunta.length > 2000) {
      res.status(400).json({ error: 'Pergunta muito longa (máx 2000 caracteres)' });
      return;
    }

    try {
      const db = admin.firestore();
      const snap = await db.collection('produtos').get();
      const produtos = [];
      snap.forEach(d => {
        const data = d.data() || {};
        if (data.status === 'descontinuado') return; // não inclui descontinuados
        produtos.push({ id: d.id, ...data });
      });

      if (produtos.length === 0) {
        res.status(200).json({
          resposta: 'O catálogo está vazio no momento. Não tenho produtos para consultar.',
        });
        return;
      }

      const catalogoFmt = produtos.map(p => formatarProduto(p, produtos)).join('\n\n---\n\n');

      const systemPrompt = buildSystemPrompt(catalogoFmt);

      const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
      const resp = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: [
          {
            type: 'text',
            text: systemPrompt,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [{ role: 'user', content: pergunta }],
      });

      const texto = resp.content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('\n')
        .trim();

      const usage = resp.usage || {};
      console.log('Dex OK', {
        user: decoded.email || decoded.uid,
        pergunta_len: pergunta.length,
        resposta_len: texto.length,
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cache_read: usage.cache_read_input_tokens || 0,
        cache_write: usage.cache_creation_input_tokens || 0,
      });

      res.status(200).json({
        resposta: texto,
        usage: {
          input: usage.input_tokens || 0,
          output: usage.output_tokens || 0,
          cache_read: usage.cache_read_input_tokens || 0,
          cache_write: usage.cache_creation_input_tokens || 0,
        },
      });
    } catch (err) {
      console.error('Erro Dex:', err);
      const msg = err?.message || 'Erro desconhecido';
      res.status(500).json({ error: 'Erro ao consultar o Dex', detail: msg });
    }
  }
);

function buildSystemPrompt(catalogoFmt) {
  return `Você é o Dex, assistente do **Catálogo de Produtos MedReview**.

Sua função: ajudar a equipe interna (suporte, vendas, marketing) a encontrar e entender os produtos disponíveis.

REGRAS RÍGIDAS:
1. Use APENAS as informações do catálogo abaixo. Não invente nada que não esteja escrito.
2. Se a informação pedida não está no catálogo, responda exatamente: "Não tenho essa informação no catálogo."
3. Quando mencionar um produto pelo nome, formate como link Markdown: [Nome do Produto](produto:ID_DO_PRODUTO) — use o ID exato que aparece no cabeçalho de cada produto no catálogo.
4. Seja direto e objetivo. Frases curtas. Português brasileiro.
5. Se a pergunta for ambígua, peça esclarecimento antes de responder.
6. Não invente preços, datas, links ou contatos que não estejam no catálogo.
7. Não responda perguntas fora do escopo do catálogo (dúvidas clínicas, opiniões pessoais, comparação com concorrentes não citados). Redirecione gentilmente.
8. Se citar listas de features ou argumentos, use marcadores Markdown ( - item ).

=== CATÁLOGO DE PRODUTOS MEDREVIEW ===

${catalogoFmt}

=== FIM DO CATÁLOGO ===`;
}

function formatarProduto(p, todosProdutos) {
  const linhas = [];
  linhas.push(`### ${p.nome || '(sem nome)'} (ID: ${p.id})`);
  if (p.status) linhas.push(`**Status:** ${p.status}`);

  const breve = p.breveDescricao || p.pitchCurto || '';
  if (breve) linhas.push(`**Descrição breve:** ${breve}`);

  const publicos = arr(p.publicoAlvo);
  if (publicos.length) linhas.push(`**Público-alvo:** ${publicos.join(', ')}`);

  const provas = arr(p.provasAlvo);
  if (provas.length) linhas.push(`**Provas-alvo:** ${provas.join(', ')}`);

  const responsaveis = arr(p.responsaveis).length ? arr(p.responsaveis) : arr(p.responsavel);
  if (responsaveis.length) linhas.push(`**Responsáveis:** ${responsaveis.join(', ')}`);

  if (Array.isArray(p.features) && p.features.length) {
    linhas.push('');
    linhas.push('**O que está incluído:**');
    p.features.forEach(f => linhas.push(formatarFeature(f)));
  }

  // Mentoria pode ser 'sim' (incluída), 'opcional' (compra à parte) ou 'nao'.
  // Compat: bool true→sim, false→nao.
  const ment = p.temMentoria;
  const mentStatus = (ment === 'sim' || ment === true) ? 'sim'
                   : (ment === 'opcional' ? 'opcional' : 'nao');
  if (mentStatus !== 'nao') {
    const label = mentStatus === 'opcional' ? '**Mentoria (opcional — compra à parte):**' : '**Mentoria inclusa:**';
    linhas.push('');
    linhas.push(label);
    const mentDesc = String(p.mentoriaDescricao || '').trim();
    if (mentDesc) linhas.push(mentDesc);
    if (Array.isArray(p.mentoriaFeatures) && p.mentoriaFeatures.length) {
      p.mentoriaFeatures.forEach(f => linhas.push(formatarFeature(f)));
    } else if (!mentDesc) {
      linhas.push(`(${mentStatus === 'opcional' ? 'opcional (compra à parte)' : 'sim'})`);
    }
  }

  // Bônus: produtos vinculados (cita pelo nome) + features bônus livres
  const bonusIds = Array.isArray(p.bonusProdutoIds) ? p.bonusProdutoIds : [];
  const bonusFeats = Array.isArray(p.bonusFeatures) ? p.bonusFeatures : [];
  if (bonusIds.length || bonusFeats.length) {
    linhas.push('');
    linhas.push('**Bônus inclusos:**');
    if (bonusIds.length) {
      bonusIds.forEach(bid => {
        const bp = (todosProdutos || []).find(x => x.id === bid);
        if (bp) {
          linhas.push(`- Produto vinculado: ${bp.nome || '(sem nome)'} (id: ${bid})`);
        } else {
          linhas.push(`- Produto vinculado (id: ${bid} — referência não encontrada no catálogo atual)`);
        }
      });
    }
    if (bonusFeats.length) {
      bonusFeats.forEach(f => linhas.push(formatarFeature(f)));
    }
  }

  if (Array.isArray(p.argumentosVenda) && p.argumentosVenda.length) {
    linhas.push('');
    linhas.push('**Argumentos de venda:**');
    p.argumentosVenda.forEach(a => linhas.push(`- ${a}`));
  }

  if (Array.isArray(p.objecoes) && p.objecoes.length) {
    linhas.push('');
    linhas.push('**Objeções frequentes:**');
    p.objecoes.forEach(o => {
      linhas.push(`- Pergunta: ${o.pergunta}`);
      linhas.push(`  Resposta: ${o.resposta}`);
    });
  }

  if (Array.isArray(p.duvidas) && p.duvidas.length) {
    linhas.push('');
    linhas.push('**Dúvidas frequentes (FAQ):**');
    p.duvidas.forEach(d => {
      linhas.push(`- ❓ ${d.pergunta}`);
      linhas.push(`  R: ${d.resposta}`);
    });
  }

  if (Array.isArray(p.links) && p.links.length) {
    linhas.push('');
    linhas.push('**Links úteis:**');
    p.links.forEach(l => linhas.push(`- ${l.label || 'Link'}: ${l.url}`));
  }

  return linhas.join('\n');
}

function formatarFeature(f) {
  // disponivel pode ser string ('sim'|'nao'|'construcao') no modelo novo, ou
  // boolean (true/false) em docs antigos. Sempre normaliza.
  let disp = '';
  const d = f.disponivel;
  if (d === 'nao' || d === false) disp = ' (NÃO incluído)';
  else if (d === 'construcao') disp = ' (EM CONSTRUÇÃO — ainda não disponível)';
  const num = f.numeroChave ? ` — ${f.numeroChave}` : '';
  // Diferenciais vem como HTML rico — converte pra texto plano antes de mandar pro LLM
  const difTxt = stripHtml(f.diferenciais || '');
  const dif = difTxt ? `\n    Diferenciais: ${difTxt}` : '';
  const link = f.linkUrl ? `\n    Link${f.linkLabel ? ` (${f.linkLabel})` : ''}: ${f.linkUrl}` : '';
  const pdf = f.pdfUrl ? `\n    PDF anexo${f.pdfLabel ? ` (${f.pdfLabel})` : ''}: ${f.pdfUrl}` : '';
  return `- ${f.titulo || '(sem título)'}${num}${disp}${dif}${link}${pdf}`;
}

function stripHtml(s) {
  return String(s || '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n  - ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function arr(v) {
  if (Array.isArray(v)) return v.filter(Boolean);
  if (typeof v === 'string' && v.trim()) return [v.trim()];
  return [];
}
