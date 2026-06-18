// Cloud Function (Firebase Gen 2) — IA de análise do PO ("megabrain")
// Recebe {cursoId, cursoNome, modulo}, lê TODO o insumo do módulo direto do
// Firestore via Admin SDK (aulas + transcrições + questões + pedidos + edital),
// chama Claude Sonnet e devolve um conjunto de AÇÕES priorizadas. Cada ação vem
// com uma nota 0-1 por critério; o FRONTEND aplica os pesos (poPesos) — assim
// mexer num peso re-ordena a lista SEM chamar a IA de novo.
//
// Auth: exige Firebase ID token (Authorization: Bearer <token>).
// Chave da Anthropic: ANTHROPIC_API_KEY_PO (separada de propósito p/ isolar custo).

const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const Anthropic = require('@anthropic-ai/sdk').default;

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY_PO || '';
const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 4096;

// Orçamento TOTAL de transcrição (chars) distribuído entre as aulas do módulo.
// Sonnet tem ~200k tokens de contexto; ~360k chars ≈ 90k tokens deixa folga pro
// resto do prompt. Uma transcrição inteira tem ~31k chars, então módulos normais
// (poucas aulas) vão INTEIROS, sem corte. Só módulos gigantes são reduzidos.
const TRANSC_TOTAL_CAP = 360000;
const TRANSC_MAX_POR_AULA = 90000; // teto por aula (uma aula inteira ~31k chars)
// Quantas questões por tipo entram no prompt (enunciado puro, sem imagens).
const QUESTOES_CAP = 40;

// Critérios da priorização — DEVEM bater com PO_CRITERIOS no index.html.
// A IA pontua cada um de 0 a 1 por ação; o código aplica os pesos.
const CRITERIOS = [
  { id: 'lacuna',     label: 'Lacuna de conteúdo',                desc: 'Tema cai na prova/edital e falta (ou está raso) na aula' },
  { id: 'frequencia', label: 'Frequência do tema nas provas',     desc: 'Quanto mais o tema é cobrado, mais urgente' },
  { id: 'status',     label: 'Aula inexistente / status crítico', desc: 'Não gravada, com erro, ou precisa atualizar' },
  { id: 'avaliacao',  label: 'Avaliação baixa dos alunos',        desc: 'Aula mal avaliada pelos alunos' },
  { id: 'pedidos',    label: 'Pedidos de alunos',                 desc: 'Demanda explícita registrada no módulo' },
  { id: 'idade',      label: 'Idade da aula',                     desc: 'Gravada há muito tempo / possivelmente desatualizada' },
  { id: 'material',   label: 'Falta de apostila/ficha/trilha',    desc: 'Material de apoio ausente' },
];
const CRIT_IDS = CRITERIOS.map(c => c.id);

const ALLOWED_ORIGINS = [
  'https://aros.anestreview.com.br',
  'http://localhost:8081', 'http://localhost:8080', 'http://localhost:8766',
  'http://localhost:8767', 'http://localhost:8765',
  'http://127.0.0.1:8081', 'http://127.0.0.1:8080', 'http://127.0.0.1:8766',
  'http://127.0.0.1:8767', 'http://127.0.0.1:8765',
];
function setCors(req, res) {
  const origin = req.get('Origin') || '';
  if (ALLOWED_ORIGINS.includes(origin)) { res.set('Access-Control-Allow-Origin', origin); res.set('Vary', 'Origin'); }
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.set('Access-Control-Max-Age', '3600');
}

// Mesmo slug do frontend (_poSlug) e do questoes-po.js (_slug) — chave do poModQuestoes.
function _slug(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || '_';
}
function _modKey(cursoId, modulo) { return _slug(cursoId + '__' + modulo); }

// Remove tags/base64 de um enunciado_html, devolve texto puro enxuto.
function _stripImagens(s) {
  return String(s || '')
    .replace(/<img[^>]*>/gi, ' ')
    .replace(/data:image\/[^\s")]+/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// "4.87 (78)" → {nota:4.87, n:78}. Aceita campos numéricos também.
function _parseAval(a) {
  const num = a.ratingNum != null ? Number(a.ratingNum) : null;
  if (num != null && Number.isFinite(num)) return { nota: num, n: Number(a.ratingTotal) || 0 };
  const m = String(a.avaliacao || '').match(/([\d.,]+)\s*(?:\((\d+)\))?/);
  if (m) return { nota: parseFloat(m[1].replace(',', '.')), n: m[2] ? +m[2] : 0 };
  return { nota: null, n: 0 };
}

async function exigeAuth(req, res) {
  const authHeader = req.get('Authorization') || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!idToken) { res.status(401).json({ error: 'Faça login com Google ou Email' }); return null; }
  try { return await admin.auth().verifyIdToken(idToken); }
  catch (e) { res.status(401).json({ error: 'Sessão expirada — faça login novamente' }); return null; }
}

function _criteriosTxt() {
  return CRITERIOS.map(c => `- "${c.id}" — ${c.label}: ${c.desc}`).join('\n');
}

function buildSystemPrompt() {
  return `Você é o motor de priorização de produto da MedReview ("megabrain"), analisando UM módulo (Ponto) de um curso de revisão para prova de título médico.

Sua tarefa: ler o material do módulo (aulas com transcrição, status, avaliação dos alunos e ano de gravação; banco de questões reais de prova por tipo; pedidos de alunos; edital; status do material de apoio) e produzir uma lista de AÇÕES concretas e acionáveis para a coordenação de produto — o que gravar, regravar, atualizar, ou que material/questão falta.

Regras:
1. Baseie-se SOMENTE nos dados fornecidos. Não invente aulas, números ou temas que não estejam no material.
2. Cada ação deve ser específica e executável ("Gravar aula sobre X", "Regravar a aula Y — avaliação 3.1", "Cobrir tema Z do edital, ausente nas transcrições"). Nada de conselho genérico.
3. Cruze o EDITAL e as QUESTÕES com o CONTEÚDO das transcrições: tema que cai (edital/questões) e não aparece nas aulas = lacuna forte.
4. ANTES de afirmar que um tema NÃO é coberto, LEIA cada transcrição por INTEIRO. Um tema pode estar DENTRO de uma aula de escopo mais amplo (ex.: os 4 princípios da bioética dentro de uma aula de "Ética e Responsabilidade") e ainda assim estar bem coberto. Só trate como lacuna se realmente não encontrar o conteúdo em NENHUMA transcrição. Quando o tema EXISTE mas está raso/incompleto, prefira "Aprofundar/expandir na aula X" em vez de "Gravar aula nova".
5. DOSE PELA FREQUÊNCIA. Conte em quantas questões o tema realmente aparece. Tema que cai em UMA questão isolada NÃO justifica aula dedicada — dá frequência baixa (perto de 0). Reserve "Gravar aula nova" para temas RECORRENTES (várias questões e/ou presença clara no edital). Quanto mais raro o tema, mais leve a ação — e, se o impacto for baixíssimo, simplesmente NÃO liste ação para ele.
6. O ALUNO TAMBÉM ESTUDA PELA QUESTÃO. Uma questão com gabarito já é material de estudo. Então, para um tema raro que já cai em questão, o normal é NÃO precisar de ação nenhuma. NÃO sugira "garantir um bom comentário na questão", "revisar o gabarito" ou coisas do tipo — isso já é praxe padrão da equipe e soa óbvio. Só proponha aula nova (ou aprofundar uma existente) quando o tema for recorrente E o ganho de aprendizado justificar o esforço de produção.
7. Se uma transcrição vier marcada como "(truncada)", NÃO afirme que um tema está ausente só porque não apareceu — a parte cortada pode cobri-lo. Trate como incerto.
8. Cite a aula concreta no campo "aula" sempre que a ação se referir a conteúdo que já existe (ou deveria existir) numa aula do módulo.
9. Use a avaliação dos alunos e o status/ano das aulas para sinalizar regravação/atualização.
10. Para CADA ação, pontue os 7 critérios de 0 a 1 (0 = irrelevante para esta ação, 1 = máximo). NÃO aplique pesos — só pontue. Os pesos são aplicados depois pelo sistema. Em especial, a nota "frequencia" deve ser PROPORCIONAL ao nº de questões que cobrem o tema (1 questão isolada ≈ 0,1; tema dominante ≈ 1).
11. Ordene as ações da mais para a menos relevante na sua visão, mas a ordenação final é feita pelo sistema via pesos.
12. Seja conciso. No máximo 12 ações, priorizando as de maior impacto. Não liste ação para todo tema raro — agrupe ou omita o que tem baixíssimo impacto.

Critérios (use exatamente estas chaves no campo "notas"):
${_criteriosTxt()}

Responda SOMENTE com JSON válido (sem markdown, sem cercas de código), neste formato exato:
{
  "resumo": "2 a 4 frases sobre o estado geral do módulo e onde está o maior risco.",
  "acoes": [
    {
      "titulo": "ação curta e acionável",
      "categoria": "gravar | regravar | atualizar | material | questoes | edital",
      "aula": "título da aula alvo, ou null se for aula nova/ausente",
      "porque": "1-2 frases justificando com base nos dados",
      "notas": { ${CRIT_IDS.map(id => `"${id}": 0.0`).join(', ')} }
    }
  ]
}`;
}

function buildUserPrompt(ctx) {
  const { cursoNome, modulo, edital, aulas, questoes, pedidos } = ctx;
  const linhas = [];
  linhas.push(`CURSO: ${cursoNome}`);
  linhas.push(`MÓDULO (Ponto): ${modulo}`);
  linhas.push('');

  linhas.push(`=== EDITAL (do curso; pode cobrir vários módulos) ===`);
  linhas.push(edital ? edital.slice(0, 8000) : '(edital não cadastrado)');
  linhas.push('');

  linhas.push(`=== AULAS DO MÓDULO (${aulas.length}) ===`);
  if (!aulas.length) linhas.push('(nenhuma aula cadastrada neste módulo)');
  aulas.forEach((a, i) => {
    const av = a.aval.nota != null ? `${a.aval.nota}${a.aval.n ? ` (${a.aval.n} avaliações)` : ''}` : 'sem avaliação';
    linhas.push(`--- Aula ${i + 1}: ${a.titulo} ---`);
    linhas.push(`Status: ${a.status || '(sem status)'} · Ano: ${a.ano || '?'} · Avaliação: ${av} · Trilha de questões: ${a.questoes || '?'} · Trilha de flashcards: ${a.cards || '?'}`);
    if (a.transcricao) {
      linhas.push(`Transcrição (${a.transChars} chars${a.transTrunc ? ', truncada' : ''}):`);
      linhas.push(a.transcricao);
    } else if (a.conteudo) {
      linhas.push(`Conteúdo (manual): ${a.conteudo.slice(0, 4000)}`);
    } else {
      linhas.push('(sem transcrição nem conteúdo cadastrado — não dá pra avaliar o que a aula cobre)');
    }
    linhas.push('');
  });

  linhas.push(`=== APOSTILA / MATERIAL DO MÓDULO ===`);
  linhas.push(ctx.apostilaStatus || '(sem apostila cadastrada)');
  linhas.push('');

  linhas.push(`=== QUESTÕES REAIS DE PROVA (banco do módulo, por tipo) ===`);
  const tipos = ['TEA', 'TSA', 'MEs', 'Outras'];
  let temQ = false;
  tipos.forEach(t => {
    const arr = questoes[t] || [];
    if (!arr.length) return;
    temQ = true;
    linhas.push(`-- ${t} (${arr.length} questões; mostrando até ${QUESTOES_CAP}) --`);
    arr.slice(0, QUESTOES_CAP).forEach((q, i) => linhas.push(`${i + 1}. ${q}`));
    linhas.push('');
  });
  if (!temQ) linhas.push('(nenhuma questão puxada para este módulo)');
  linhas.push('');

  linhas.push(`=== PEDIDOS DE ALUNOS ===`);
  linhas.push(pedidos.length ? pedidos.map((p, i) => `${i + 1}. ${p}`).join('\n') : '(nenhum pedido registrado)');

  return linhas.join('\n');
}

exports.analisarModuloPO = onRequest(
  { region: 'us-central1', invoker: 'public', cors: false, timeoutSeconds: 180, memory: '512MiB' },
  async (req, res) => {
    setCors(req, res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
    if (!ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY_PO ausente'); res.status(500).json({ error: 'IA de análise não configurada no servidor (falta ANTHROPIC_API_KEY_PO)' }); return; }

    const decoded = await exigeAuth(req, res);
    if (!decoded) return;

    const cursoId = String(req.body?.cursoId || '').trim();
    const cursoNome = String(req.body?.cursoNome || '').trim();
    const modulo = String(req.body?.modulo || '').trim();
    if (!cursoId || !cursoNome || !modulo) { res.status(400).json({ error: 'Faltam cursoId, cursoNome ou modulo' }); return; }

    try {
      const db = admin.firestore();

      // 1) Aulas do módulo: pega as que têm esse `modulo` e pertencem ao curso (por nome).
      const aulasSnap = await db.collection('poAulas').where('modulo', '==', modulo).get();
      let aulasRaw = [];
      aulasSnap.forEach(d => {
        const a = d.data() || {};
        if (Array.isArray(a.cursos) && a.cursos.includes(cursoNome)) aulasRaw.push({ id: d.id, ...a });
      });
      // ordena por ordemPO (fallback ordem)
      aulasRaw.sort((x, y) => (Number(x.ordemPO ?? x.ordem ?? 0)) - (Number(y.ordemPO ?? y.ordem ?? 0)));

      // 2) Transcrições (poTranscricoes/{vimeoId}) das aulas com vídeo — em paralelo.
      const vimeoIds = [...new Set(aulasRaw.map(a => String(a.vimeoId || '')).filter(Boolean))];
      const transMap = {};
      await Promise.all(vimeoIds.map(async vid => {
        try { const s = await db.collection('poTranscricoes').doc(vid).get(); if (s.exists) transMap[vid] = String(s.data()?.texto || ''); }
        catch (_) {}
      }));

      // Orçamento de transcrição distribuído entre as aulas COM transcrição:
      // módulos normais (poucas aulas) mandam tudo inteiro; só os gigantes cortam.
      const fulls = aulasRaw.map(a => { const vid = String(a.vimeoId || ''); return vid && transMap[vid] ? transMap[vid] : ''; });
      const nComTrans = fulls.filter(Boolean).length;
      const capPorAula = Math.min(TRANSC_MAX_POR_AULA, nComTrans ? Math.floor(TRANSC_TOTAL_CAP / nComTrans) : TRANSC_TOTAL_CAP);
      const aulas = aulasRaw.map((a, i) => {
        const full = fulls[i];
        const trunc = full.length > capPorAula;
        return {
          titulo: a.titulo || a.nomeOriginal || '(sem título)',
          status: a.status || '', ano: a.ano || '',
          questoes: a.questoes || '', cards: a.cards || '',
          aval: _parseAval(a),
          conteudo: String(a.conteudo || '').trim(),
          transcricao: trunc ? full.slice(0, capPorAula) : full,
          transChars: full.length, transTrunc: trunc,
        };
      });

      // 3) Questões + pedidos + apostilas do módulo.
      const modKey = _modKey(cursoId, modulo);
      const modSnap = await db.collection('poModQuestoes').doc(modKey).get();
      const md = modSnap.exists ? (modSnap.data() || {}) : {};
      const enun = q => _stripImagens(q.enunciado || q.enunciado_html || '').slice(0, 600);
      const questoes = {};
      ['TEA', 'TSA', 'MEs', 'Outras'].forEach(t => { questoes[t] = (Array.isArray(md[t]) ? md[t] : []).map(enun).filter(Boolean); });
      const pedidos = Array.isArray(md.pedidos) ? md.pedidos.map(p => String(p).trim()).filter(Boolean) : [];
      const apostilas = Array.isArray(md.apostilas) ? md.apostilas : [];
      const apostilaStatus = apostilas.length
        ? apostilas.map(ap => `- ${ap.titulo || '(sem título)'}: ${ap.status || 'Pendente'}`).join('\n')
        : '';

      // 4) Edital do curso.
      const cfgSnap = await db.collection('config').doc('poConfig').get();
      const editais = cfgSnap.exists ? (cfgSnap.data()?.editais || {}) : {};
      const edital = String(editais[cursoId] || '').trim();

      const ctx = { cursoNome, modulo, edital, aulas, questoes, pedidos, apostilaStatus };
      const systemPrompt = buildSystemPrompt();
      const userPrompt = buildUserPrompt(ctx);

      const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
      const resp = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: userPrompt }],
      });

      const texto = resp.content.filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
      // Tolera cercas de código eventuais.
      const limpo = texto.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
      let parsed;
      try { parsed = JSON.parse(limpo); }
      catch (e) {
        const m = limpo.match(/\{[\s\S]*\}/);
        if (m) { try { parsed = JSON.parse(m[0]); } catch (_) {} }
      }
      if (!parsed || !Array.isArray(parsed.acoes)) {
        console.error('IA PO: resposta não-JSON', texto.slice(0, 500));
        res.status(502).json({ error: 'A IA não devolveu um relatório válido. Tente de novo.' });
        return;
      }

      // Sanitiza as notas: garante todas as chaves, clampa 0..1.
      const acoes = parsed.acoes.slice(0, 20).map(a => {
        const notas = {};
        CRIT_IDS.forEach(id => { let v = Number(a.notas?.[id]); if (!Number.isFinite(v)) v = 0; notas[id] = Math.max(0, Math.min(1, v)); });
        return {
          titulo: String(a.titulo || '').trim() || '(sem título)',
          categoria: String(a.categoria || '').trim().toLowerCase(),
          aula: a.aula ? String(a.aula).trim() : null,
          porque: String(a.porque || '').trim(),
          notas,
        };
      });

      const resultado = {
        resumo: String(parsed.resumo || '').trim(),
        acoes,
        meta: {
          cursoId, cursoNome, modulo,
          nAulas: aulas.length,
          nTranscricoes: aulas.filter(a => a.transcricao).length,
          nQuestoes: Object.values(questoes).reduce((s, arr) => s + arr.length, 0),
          nPedidos: pedidos.length,
          temEdital: !!edital,
          modelo: MODEL,
          em: new Date().toISOString(),
          por: decoded.email || decoded.uid,
        },
      };

      // Persiste no doc do módulo p/ a aba de Produto agregar (incremental).
      try { await db.collection('poModQuestoes').doc(modKey).set({ analise: resultado }, { merge: true }); }
      catch (e) { console.warn('PO análise: falha ao persistir', e.message); }

      const usage = resp.usage || {};
      console.log('IA PO OK', {
        user: decoded.email || decoded.uid, curso: cursoNome, modulo,
        n_aulas: aulas.length, n_transc: resultado.meta.nTranscricoes, n_questoes: resultado.meta.nQuestoes,
        n_acoes: acoes.length,
        input_tokens: usage.input_tokens, output_tokens: usage.output_tokens,
        cache_read: usage.cache_read_input_tokens || 0, cache_write: usage.cache_creation_input_tokens || 0,
      });

      res.status(200).json({ ok: true, analise: resultado, usage });
    } catch (e) {
      console.error('IA PO erro:', e);
      res.status(500).json({ error: 'Erro ao analisar: ' + (e.message || String(e)) });
    }
  }
);
