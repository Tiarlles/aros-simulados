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
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const DEFAULT_MAX_TOKENS = 1024;
// Mapeia aliases curtos pra model IDs completos
const MODEL_MAP = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-7',
};

// Perfis suportados — cada um aponta pro campo correspondente em config/dexPrompt
// 'geral' é o default e fica no topo da lista
const PERFIS = ['geral', 'suporte', 'vendas', 'marketing'];
const DEFAULT_PERFIL = 'geral';
function perfilToField(perfil) {
  return 'template' + perfil.charAt(0).toUpperCase() + perfil.slice(1);
}

// Instruções padrão por perfil — usadas quando o admin não personalizou
const DEFAULT_INSTRUCTIONS = {
  geral: `Você é o Dex, assistente do catálogo da MedReview — modo **Geral**.

Seu trabalho: responder qualquer pergunta sobre o catálogo de produtos da MedReview de forma direta, precisa e útil, sem assumir um papel específico de suporte, vendas ou marketing.

REGRAS:
1. Use APENAS as informações da jornada do cliente e do catálogo abaixo. Não invente nada que não esteja escrito.
2. Sempre entregue o que você sabe primeiro. Só depois mencione o que falta.
3. Quando mencionar um produto pelo nome, formate como [Nome do Produto](produto:ID_DO_PRODUTO) usando o ID exato do catálogo.
4. Responda de forma direta e objetiva. Frases curtas. Português brasileiro.
5. Se a pergunta envolve comparar produtos, organize em tópicos com a diferença clara entre eles.
6. Se a pergunta for genuinamente ambígua, peça esclarecimento — mas se der pra inferir o sentido, responda.
7. Nunca invente preço, data, link ou contato que não esteja no catálogo.
8. Não dê opinião clínica/médica.
9. Se a informação não está no catálogo nem na jornada, diga claramente e sugira consultar a fonte oficial.`,

  suporte: `Você é o Dex, assistente do time de **Suporte** da MedReview.

Seu trabalho: ajudar quem está respondendo um ticket ou dúvida de cliente a entender rapidamente qual produto/recurso o cliente está mencionando e o que dizer.

REGRAS:
1. Resposta curta e objetiva. O suporte precisa de informação rápida pra repassar ao cliente.
2. Sempre que mencionar um produto, formate como [Nome do Produto](produto:ID_DO_PRODUTO) usando o ID exato do catálogo.
3. Para perguntas do tipo "tenho acesso ao X?" ou "isso está incluído?", responda com base estritamente no catálogo (em qual produto a feature está, se é incluída ou opcional, etc).
4. Para dúvidas técnicas (como acessar, login, suporte de uso): não invente — diga apenas o que está documentado no catálogo.
5. Nunca dê opinião clínica/médica. Limite-se ao escopo do catálogo.
6. Se a informação não está nem na jornada nem no catálogo, diga claramente que não tem e sugira consultar a fonte oficial (edital, suporte direto).
7. Português brasileiro, frases curtas.`,

  vendas: `Você é o Dex, assistente do time de **Vendas** da MedReview.

Seu trabalho: ajudar o vendedor a conectar a dor do cliente com a solução certa do catálogo, entregar argumentos prontos e ajudar a contornar objeções.

REGRAS:
1. Sempre que possível, primeiro entenda a situação do cliente (qual prova vai prestar, qual ano da residência, momento da jornada) — use a Jornada do Cliente como guia.
2. Recomende o produto mais aderente à situação. Cite o nome como link [Nome](produto:ID).
3. Se houver mais de uma opção válida, apresente as 2-3 melhores com a diferença clara entre elas.
4. Entregue argumentos de venda do produto recomendado, puxando da seção "Argumentos de venda" do catálogo.
5. Se o cliente apresenta uma objeção (preço, tempo, dúvida), busque no catálogo a resposta documentada pra essa objeção e use ela como base.
6. Tom: profissional e consultivo. Ajudar o cliente a escolher certo, não empurrar.
7. Nunca invente preço, desconto ou condição que não esteja no catálogo.
8. Português brasileiro.`,

  marketing: `Você é o Dex, assistente do time de **Marketing** da MedReview.

Seu trabalho: ajudar o marketing a entender posicionamento, diferenciais e público-alvo de cada produto pra produzir copy, anúncios e campanhas.

REGRAS:
1. Quando perguntarem sobre um produto, traga de forma estruturada: público-alvo, prova-alvo, principais features, diferenciais (puxe da seção "Diferenciais") e argumentos de venda.
2. Se perguntarem "qual gancho de copy usar pra X?", combine os argumentos de venda do catálogo com a dor correspondente na jornada do cliente.
3. Cite produtos como [Nome](produto:ID).
4. Quando relevante, sugira qual momento da jornada do cliente o produto atinge melhor.
5. Tom: estratégico e estruturado. Resposta organizada — use tópicos quando fizer sentido.
6. Nunca compare diretamente com concorrentes que não estejam citados no catálogo.
7. Não invente fatos de mercado, estatísticas ou dados que não estejam no catálogo.
8. Português brasileiro.`,
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
    // Perfil de quem está perguntando — escolhe o template apropriado
    const perfilRaw = String(req.body?.perfil || '').toLowerCase();
    const perfil = PERFIS.includes(perfilRaw) ? perfilRaw : DEFAULT_PERFIL;

    // Histórico de conversa (turnos anteriores) — array de {role, content}.
    // Limitado a 20 mensagens (10 turnos user+assistant) por defesa.
    const historicoRaw = Array.isArray(req.body?.historico) ? req.body.historico : [];
    const historico = historicoRaw
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-20)
      .map(m => ({ role: m.role, content: String(m.content).trim() }));

    // Vertical do catálogo — define qual conjunto de configs e produtos consultar
    const VERTICAIS_VALIDAS = ['anestreview', 'oftreview', 'ortopreview', 'medreview'];
    const verticalRaw = String(req.body?.vertical || '').toLowerCase();
    const vertical = VERTICAIS_VALIDAS.includes(verticalRaw) ? verticalRaw : 'anestreview';
    // AnestReview usa docs sem sufixo (legado preservado). Outras verticais usam sufixo.
    const verticalDoc = (baseDoc) => vertical === 'anestreview' ? baseDoc : `${baseDoc}_${vertical}`;
    // Avatar do assistente por vertical
    const VERTICAL_AVATAR = {
      anestreview: 'Dex',
      oftreview: 'Íris',
      ortopreview: 'Thor',
      medreview: 'Lux',
    };
    const VERTICAL_NOME = {
      anestreview: 'AnestReview',
      oftreview: 'OftReview',
      ortopreview: 'OrtopReview',
      medreview: 'MedReview',
    };
    const avatarNome = VERTICAL_AVATAR[vertical];
    const verticalNomeFmt = VERTICAL_NOME[vertical];

    try {
      const db = admin.firestore();
      // Lê produtos + jornada + dexPrompt + editais (todos da vertical correspondente)
      const [snap, jornadaSnap, dexCfgSnap, editaisSnap] = await Promise.all([
        db.collection('produtos').get(),
        db.collection('config').doc(verticalDoc('jornadaCliente')).get(),
        db.collection('config').doc(verticalDoc('dexPrompt')).get(),
        db.collection('config').doc(verticalDoc('editais')).get(),
      ]);
      // Filtra produtos pela vertical (produtos sem campo `vertical` são anestreview por compat)
      const produtos = [];
      snap.forEach(d => {
        const data = d.data() || {};
        if (data.status === 'descontinuado') return;
        const pv = data.vertical || 'anestreview';
        if (pv !== vertical) return;
        produtos.push({ id: d.id, ...data });
      });

      if (produtos.length === 0) {
        res.status(200).json({
          resposta: `O catálogo da vertical ${verticalNomeFmt} está vazio no momento. Não tenho produtos para consultar.`,
        });
        return;
      }

      const catalogoFmt = produtos.map(p => formatarProduto(p, produtos)).join('\n\n---\n\n');
      const jornadaTxt = jornadaSnap.exists ? stripHtml(jornadaSnap.data()?.texto || '') : '';
      // Editais cadastrados — formata com ano destacado pra IA distinguir atual vs anteriores
      const editaisLista = editaisSnap.exists ? (Array.isArray(editaisSnap.data()?.lista) ? editaisSnap.data().lista : []) : [];
      const editaisFmt = formatarEditais(editaisLista);

      // Lê config editável (templates por perfil, modelo, maxTokens, pdfs)
      const dexCfg = dexCfgSnap.exists ? (dexCfgSnap.data() || {}) : {};
      // Pega o template do perfil escolhido. Fallback: template legado (campo 'template')
      // e por fim o exemplo embutido do perfil.
      const perfilField = perfilToField(perfil);
      const customInstructions =
        String(dexCfg[perfilField] || '').trim() ||
        String(dexCfg.template || '').trim() ||
        DEFAULT_INSTRUCTIONS[perfil];
      // Jornada, Editais e Catálogo SEMPRE anexados automaticamente.
      const systemPrompt = buildSystemPromptFromInstructions(customInstructions, catalogoFmt, jornadaTxt, editaisFmt, { avatarNome, verticalNome: verticalNomeFmt });

      // PDFs anexados pra este perfil — viram blocos `document` no user message
      const pdfsField = 'pdfs' + perfil.charAt(0).toUpperCase() + perfil.slice(1);
      const pdfs = Array.isArray(dexCfg[pdfsField]) ? dexCfg[pdfsField].filter(p => p && p.url) : [];

      // Resolve modelo: aceita alias curto ('haiku', 'sonnet', 'opus') ou ID completo
      const modeloRaw = String(dexCfg.modelo || '').trim().toLowerCase();
      const modelo = MODEL_MAP[modeloRaw] || (modeloRaw.startsWith('claude-') ? modeloRaw : DEFAULT_MODEL);
      // Resolve max_tokens (entre 256 e 4096, default 1024)
      let maxTokens = Number(dexCfg.maxTokens);
      if (!Number.isFinite(maxTokens) || maxTokens < 256) maxTokens = DEFAULT_MAX_TOKENS;
      if (maxTokens > 4096) maxTokens = 4096;

      // Monta blocos `document` dos PDFs com cache_control no último
      // (cacheia o prefixo system + docs por ~5min na API).
      const pdfBlocks = pdfs.map((p, i) => {
        const block = {
          type: 'document',
          source: { type: 'url', url: String(p.url) },
        };
        if (p.label || p.name) {
          block.title = String(p.label || p.name).slice(0, 120);
        }
        if (i === pdfs.length - 1) {
          block.cache_control = { type: 'ephemeral' };
        }
        return block;
      });

      // Monta o array de mensagens:
      // - Se NÃO há histórico: 1 user message com [PDFs + texto da pergunta]
      // - Se há histórico: PDFs vão no PRIMEIRO user message do histórico
      //   (ou seja, anexados ao content do primeiro user), depois o resto do
      //   histórico segue como está, e por fim a nova pergunta como user.
      const messages = [];
      if (historico.length > 0) {
        // Encontra o primeiro user no histórico — anexa PDFs no content dele
        let firstUserIdx = historico.findIndex(m => m.role === 'user');
        if (firstUserIdx < 0) firstUserIdx = 0; // fallback (não deveria acontecer)
        historico.forEach((m, i) => {
          if (i === firstUserIdx && pdfBlocks.length > 0) {
            messages.push({
              role: m.role,
              content: [...pdfBlocks, { type: 'text', text: m.content }],
            });
          } else {
            messages.push({ role: m.role, content: m.content });
          }
        });
        messages.push({ role: 'user', content: pergunta });
      } else {
        // Sem histórico — primeira pergunta carrega os PDFs
        const userContent = pdfBlocks.length > 0
          ? [...pdfBlocks, { type: 'text', text: pergunta }]
          : pergunta;
        messages.push({ role: 'user', content: userContent });
      }

      const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
      const resp = await client.messages.create({
        model: modelo,
        max_tokens: maxTokens,
        system: [
          {
            type: 'text',
            text: systemPrompt,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages,
      });

      const texto = resp.content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('\n')
        .trim();

      const usage = resp.usage || {};
      console.log('Dex OK', {
        user: decoded.email || decoded.uid,
        vertical,
        avatar: avatarNome,
        perfil,
        modelo,
        max_tokens: maxTokens,
        prompt_custom: !!String(dexCfg[perfilField] || '').trim(),
        pdfs_count: pdfs.length,
        historico_msgs: historico.length,
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

// Regras de estilo universais — aplicadas a TODO perfil, mesmo se o admin
// customizou o template. Ficam no system prompt antes dos dados pra serem
// percebidas como restrição global de escrita.
const ESTILO_UNIVERSAL = `## REGRAS DE ESTILO (sempre aplicadas)
- Nunca use travessões (— ou –) nas respostas. Substitua por vírgulas, pontos, dois-pontos ou parênteses conforme o sentido.
- Nunca use hífen entre espaços como pontuação ( - ). Se precisar separar trechos, use vírgula ou ponto.
- Português brasileiro natural, sem afetação ou tom literário.
- **Nunca devolva perguntas pro usuário.** Responda diretamente com o que você sabe. Não termine respostas com "Quer saber mais?", "Posso te ajudar com mais alguma coisa?", "Em que mais posso ajudar?" ou variações. Não pergunte de volta "você quer dizer X ou Y?" — escolha a interpretação mais provável e responda.
- Se realmente faltar informação crítica pra responder, diga objetivamente o que falta numa frase curta no final (ex: "Faltam detalhes sobre o ano da prova"), sem formato de pergunta.
- **Editais de anos anteriores:** se a resposta usar informação de um edital de ano ANTERIOR ao ano atual (informado no bloco EDITAIS CADASTRADOS), comece a resposta deixando isso explícito (ex: "Com base no edital de 2025 (ainda não há edital atualizado para o ano vigente)..."). Não responda como se a informação fosse necessariamente válida pro ano atual.`;

// Monta o system prompt anexando Jornada + Editais + Catálogo às instruções
// customizadas do usuário. Sempre coloca os blocos de dados no final pra otimizar
// prompt caching: instruções (que mudam pouco) vêm primeiro, dados (que mudam mais)
// depois. Como o cache é por prefixo, isso mantém o cache válido por mais tempo.
function buildSystemPromptFromInstructions(instructions, catalogoFmt, jornadaTxt, editaisFmt, ctx) {
  const c = ctx || {};
  const avatarNome = c.avatarNome || 'Dex';
  const verticalNome = c.verticalNome || 'MedReview';
  const headerVertical = `## IDENTIDADE\nVocê é ${avatarNome}, assistente do catálogo da vertical **${verticalNome}** do grupo MedReview. Só responda sobre produtos, jornada do cliente e editais desta vertical específica — não misture com outras verticais.\n\n`;
  const jornadaSec = jornadaTxt
    ? `=== JORNADA DO CLIENTE (${verticalNome}) ===\n\nContexto sobre o perfil do cliente, dores, jornada de compra e gatilhos.\n\n${jornadaTxt}\n\n=== FIM DA JORNADA ===\n\n`
    : '';
  const editaisSec = editaisFmt
    ? `=== EDITAIS CADASTRADOS (${verticalNome}) ===\n\nInformações de editais de prova publicados. Cada edital traz o ano em que foi publicado. **Ano atual de referência: ${new Date().getFullYear()}.** Se for usar informação de um edital de ano ANTERIOR ao atual pra responder, comece a resposta deixando claro que o dado é do edital daquele ano (ex: "Segundo o edital de XXXX..."), porque pode haver mudanças no edital atual.\n\n${editaisFmt}\n\n=== FIM DOS EDITAIS ===\n\n`
    : '';
  return `${headerVertical}${instructions}\n\n${ESTILO_UNIVERSAL}\n\n${jornadaSec}${editaisSec}=== CATÁLOGO DE PRODUTOS ${verticalNome.toUpperCase()} ===\n\n${catalogoFmt}\n\n=== FIM DO CATÁLOGO ===`;
}

// Formata a lista de editais como texto plano pra incluir no prompt da IA.
// Cada edital: nome + ano + info (HTML strippado pra texto).
function formatarEditais(lista) {
  if (!Array.isArray(lista) || !lista.length) return '';
  // Ordena por ano descendente (mais recente primeiro)
  const ord = lista.slice().sort((a, b) => {
    const ya = parseInt(a.ano, 10) || 0;
    const yb = parseInt(b.ano, 10) || 0;
    return yb - ya;
  });
  return ord.map(e => {
    const nome = String(e.nomeProva || '').trim() || '(sem nome)';
    const ano = String(e.ano || '').trim() || '(sem ano)';
    const info = stripHtml(e.info || '').trim();
    return `### ${nome} — Ano: ${ano}\n${info || '(sem informações cadastradas)'}`;
  }).join('\n\n---\n\n');
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

  const tempoTeste = String(p.tempoTesteRecomendado || '').trim();
  if (tempoTeste) linhas.push(`**Tempo de teste recomendado:** ${tempoTeste}`);

  // Tempo de acesso do produto (ex: 6 meses, 12 meses)
  const tempos = arr(p.temposAcesso);
  if (tempos.length) {
    const obsTempos = String(p.temposAcessoObs || '').trim();
    linhas.push(`**Tempo de acesso:** ${tempos.join(', ')}${obsTempos ? ' — ' + obsTempos : ''}`);
  }

  // Sazonalidade: se o produto tem janela de vendas restrita
  if (p.sazonal) {
    const sazDesc = String(p.sazonalidadeDescricao || '').trim();
    const ini = String(p.janelaVendasInicio || '').trim();
    const fim = String(p.janelaVendasFim || '').trim();
    const partes = [];
    if (sazDesc) partes.push(sazDesc);
    if (ini || fim) partes.push(`janela de vendas: ${ini || '?'} até ${fim || '?'}`);
    linhas.push(`**⚠️ Produto sazonal:** ${partes.length ? partes.join(' · ') : 'sim (sem detalhes)'}`);
  }

  // Vagas limitadas
  if (p.vagasLimitadas) {
    const vagasDesc = String(p.vagasLimitacaoDescricao || '').trim();
    linhas.push(`**🎫 Vagas limitadas:** ${vagasDesc || 'sim (sem detalhes)'}`);
  }

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
    // Coordenadores/responsáveis da mentoria — campo dedicado, separado dos
    // responsáveis gerais do produto
    const mentResps = arr(p.mentoriaResponsaveis);
    if (mentResps.length) linhas.push(`Coordenação da mentoria: ${mentResps.join(', ')}`);
    // Sazonalidade da mentoria (pode ser diferente do produto)
    if (p.mentoriaSazonal) {
      const mentSazDesc = String(p.mentoriaSazonalidadeDescricao || '').trim();
      linhas.push(`Mentoria sazonal: ${mentSazDesc || 'sim (sem detalhes)'}`);
    }
    if (Array.isArray(p.mentoriaFeatures) && p.mentoriaFeatures.length) {
      p.mentoriaFeatures.forEach(f => linhas.push(formatarFeature(f)));
    } else if (!mentDesc && !mentResps.length) {
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

  // Concorrentes: nome + features deles + nosso diferencial em cada feature
  if (Array.isArray(p.concorrentes) && p.concorrentes.length) {
    linhas.push('');
    linhas.push('**Concorrentes diretos:**');
    p.concorrentes.forEach(c => {
      const nome = String(c.nome || '').trim() || '(sem nome)';
      linhas.push(`- Concorrente: ${nome}`);
      const feats = Array.isArray(c.features) ? c.features : [];
      if (feats.length) {
        feats.forEach(f => {
          const titulo = String(f.titulo || '').trim() || '(sem título)';
          const dif = stripHtml(f.nossoDiferencial || '').trim();
          linhas.push(`  - Feature deles: ${titulo}`);
          if (dif) linhas.push(`    Nosso diferencial: ${dif}`);
        });
      }
    });
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
  // Descrição: campo de texto curto (legado mas ainda em uso em produtos cadastrados)
  const descTxt = stripHtml(f.descricao || '').trim();
  const desc = descTxt ? `\n    Descrição: ${descTxt}` : '';
  // Diferenciais vem como HTML rico — converte pra texto plano antes de mandar pro LLM
  const difTxt = stripHtml(f.diferenciais || '');
  const dif = difTxt ? `\n    Diferenciais: ${difTxt}` : '';
  const link = f.linkUrl ? `\n    Link${f.linkLabel ? ` (${f.linkLabel})` : ''}: ${f.linkUrl}` : '';
  const pdf = f.pdfUrl ? `\n    PDF anexo${f.pdfLabel ? ` (${f.pdfLabel})` : ''}: ${f.pdfUrl}` : '';
  return `- ${f.titulo || '(sem título)'}${num}${disp}${desc}${dif}${link}${pdf}`;
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
