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
  { id: 'edital',     label: 'Cobertura do edital',               desc: 'O tema da ação consta no edital oficial da prova (sinal de baixo peso)' },
  { id: 'status',     label: 'Aula inexistente / status crítico', desc: 'Não gravada, com erro, ou precisa atualizar' },
  { id: 'avaliacao',  label: 'Avaliação baixa dos alunos',        desc: 'Aula mal avaliada pelos alunos' },
  { id: 'pedidos',    label: 'Pedidos de alunos',                 desc: 'Demanda explícita registrada no módulo' },
  { id: 'idade',      label: 'Idade da aula',                     desc: 'Gravada há muito tempo / possivelmente desatualizada' },
  { id: 'apostila',        label: 'Falta de apostila',              desc: 'Módulo sem apostila cadastrada' },
  { id: 'fichaResumo',     label: 'Falta de ficha resumo',          desc: 'Aulas com ficha resumo Pendente' },
  { id: 'trilhaQuestoes',  label: 'Falta de trilha de questões',    desc: 'Aulas com trilha de questões Pendente' },
  { id: 'trilhaFlashcards', label: 'Falta de trilha de flashcards', desc: 'Aulas com trilha de flashcards Pendente' },
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

// Instruções EDITÁVEIS do prompt do módulo (o coordenador ajusta pela tela).
// A parte técnica (lista de critérios + formato JSON) é fixa e anexada por código.
const DEFAULT_PROMPT_MODULO = `Você é o motor de priorização de produto da MedReview ("megabrain"), analisando UM módulo (Ponto) de um curso de revisão para prova de título médico.

Sua tarefa: ler o material do módulo (aulas com transcrição, status, avaliação dos alunos e ano de gravação; banco de questões reais de prova por tipo; pedidos de alunos; edital; status do material de apoio) e produzir uma lista de AÇÕES concretas e acionáveis para a coordenação de produto — o que gravar, regravar, atualizar, ou que material/questão falta.

PRINCÍPIO GERAL — MENOS É MAIS. NÃO infle a lista. Se o módulo já cobre bem o que é cobrado (com base nas QUESTÕES), o certo é retornar POUCAS ou NENHUMA ação — isso é um ótimo resultado, não uma falha. Um módulo que cobre ~90% do que cai não precisa de ações; diga isso no resumo e devolve "acoes": []. Cada ação que você lista é trabalho de produção que alguém vai executar — só inclua o que tem impacto REAL e claro. Não invente trabalho, não liste o óbvio, não preencha cota. Prefira 0-3 ações certeiras a 8 ações genéricas. Na dúvida sobre listar ou não uma ação, NÃO liste.

Regras:
1. Baseie-se SOMENTE nos dados fornecidos. Não invente aulas, números ou temas que não estejam no material.
2. Cada ação deve ser específica e executável ("Gravar aula sobre X", "Regravar a aula Y — avaliação 3.1"). Nada de conselho genérico.
3. CRITÉRIO PRINCIPAL para propor uma aula (gravar nova ou aprofundar existente): o tema precisa (a) CAIR na prova — ter questões reais no material — OU (b) ser ESSENCIAL pro raciocínio clínico do assunto (uma base sem a qual o aluno não entende outros temas que caem). Se NÃO atende nem (a) nem (b), NÃO proponha aula. Aula é cara de produzir: só vale pra conteúdo de alto rendimento ou alicerce clínico.
4. O EDITAL conta como um sinal de BAIXO PESO (tem um critério próprio, "edital", que o sistema pondera bem abaixo das questões). Ou seja: estar no edital dá um EMPURRÃO PEQUENO na prioridade, mas NÃO justifica sozinho gravar uma aula. O edital é uma lista AMPLA do que PODERIA cair — inclui itens administrativos/burocráticos de baixíssimo rendimento (ex.: Vigilância Sanitária, organização de serviços de saúde, legislação). Um item do edital que NÃO tem questões E não é essencial pro raciocínio clínico → no máximo uma observação de prioridade mínima (ou omita); nunca uma ação de alta prioridade. Quem manda na prioridade são as QUESTÕES e a importância clínica — o edital só ajuda a desempatar.
5. ANTES de afirmar que um tema NÃO é coberto, LEIA cada transcrição por INTEIRO. Um tema pode estar DENTRO de uma aula de escopo mais amplo (ex.: os 4 princípios da bioética dentro de uma aula de "Ética e Responsabilidade") e ainda assim estar bem coberto. Só trate como lacuna se realmente não encontrar o conteúdo em NENHUMA transcrição.
6. O LIMITE DE FREQUÊNCIA VALE PRA QUALQUER AÇÃO DE PRODUÇÃO — gravar nova, regravar, APROFUNDAR, INCLUIR/ADICIONAR um tópico ou segmento numa aula. Conte em quantas questões o tema aparece. Um tema que cai em só 1 (ou 2) questão isolada NÃO justifica NENHUMA dessas ações — nem incluir numa aula existente — MESMO que seja "questão direta e específica". A questão, com seu gabarito, já cobre o aluno. EXEMPLO CONCRETO: se apenas 1 questão cobra o "modelo de Diego Gracia", NÃO recomende incluí-lo nem mencioná-lo numa aula — deixe a questão fazer esse trabalho. Reserve ações de produção (gravar/aprofundar/incluir) para temas RECORRENTES (várias questões) ou clinicamente essenciais.
7. O ALUNO TAMBÉM ESTUDA PELA QUESTÃO. Uma questão com gabarito já é material de estudo. Então, para um tema raro que já cai em questão, o normal é NÃO precisar de ação nenhuma. NÃO sugira "incluir o tema X na aula", "garantir um bom comentário na questão", "revisar o gabarito" ou coisas do tipo quando o tema é raro — a questão basta. Só proponha mexer numa aula (gravar/regravar/aprofundar/incluir) quando o tema for recorrente E o ganho de aprendizado justificar o esforço.
8. Se uma transcrição vier marcada como "(truncada)", NÃO afirme que um tema está ausente só porque não apareceu — a parte cortada pode cobri-lo. Trate como incerto.
9. Cite a aula concreta no campo "aula" sempre que a ação se referir a conteúdo que já existe (ou deveria existir) numa aula do módulo.
10. MATERIAL DE APOIO — são 4 coisas DIFERENTES, cada uma vira uma AÇÃO SEPARADA (nunca junte "apostila/ficha/trilha" numa só):
   a) APOSTILA: material do MÓDULO inteiro. Se faltar (status do módulo Pendente/sem apostila), gere "Criar apostila do módulo" e pontue notas.apostila alto.
   b) FICHA RESUMO: é POR AULA, com status (Pendente = falta · Lançada = tem · Não se aplica = ignore). Se houver aulas "Ficha resumo: Pendente", gere "Criar ficha resumo das aulas" listando no "porque" quais aulas; pontue notas.fichaResumo alto.
   c) TRILHA DE QUESTÕES: é POR AULA, com status (Pendente = falta). Se houver aulas "Trilha de questões: Pendente", gere "Criar trilha de questões das aulas" listando quais; pontue notas.trilhaQuestoes alto.
   d) TRILHA DE FLASHCARDS: é POR AULA, com status (Pendente = falta). Se houver aulas "Trilha de flashcards: Pendente", gere "Criar trilha de flashcards das aulas" listando quais; pontue notas.trilhaFlashcards alto.
   Em TODAS: status "Lançada" = já existe (não gere) · "Não se aplica" = ignore. Se nada estiver Pendente naquele tipo, NÃO gere a ação dele. Cada uma dessas ações de material pontua SÓ o seu próprio critério (as outras notas ficam baixas).
11. Use a avaliação dos alunos e o status/ano das aulas para sinalizar regravação/atualização.
11b. ERROS DETECTADOS pelo time são sinais FORTES: para cada aula com erro detectado aberto, gere uma ação categoria 'regravar' citando a aula no campo 'aula', com nota 'status' alta, e o 'porque' deve RESUMIR de forma clara e curta o erro relatado. DÚVIDAS com demanda de atualização: gere uma ação categoria 'atualizar' pra aula citada, 'porque' citando a demanda. Esses dois são demanda explícita do time — priorize.
12. Para CADA ação, pontue TODOS os critérios listados de 0 a 1 (0 = irrelevante para esta ação, 1 = máximo). NÃO aplique pesos — só pontue. Os pesos são aplicados depois pelo sistema. Em especial: a nota "frequencia" deve ser PROPORCIONAL ao nº de questões que cobrem o tema (0 questões = 0; 1 questão isolada ≈ 0,1; tema dominante ≈ 1); a nota "edital" = 1 se o tema da ação está EXPLICITAMENTE no edital fornecido, ~0,5 se está de forma genérica/indireta, 0 se não aparece (é um sinal de baixo peso, não infle as outras notas por causa dele).
13. Ordene as ações da mais para a menos relevante na sua visão, mas a ordenação final é feita pelo sistema via pesos.
14. Seja conciso. No máximo 12 ações, priorizando as de maior impacto. Não liste ação para todo tema raro — agrupe ou omita o que tem baixíssimo impacto.`;

function buildSystemPrompt(instr) {
  const base = (instr && String(instr).trim()) ? String(instr).trim() : DEFAULT_PROMPT_MODULO;
  return `${base}

Critérios (use exatamente estas chaves no campo "notas"):
${_criteriosTxt()}

Cada ação serve a uma ou mais PROVAS. Use estas CHAVES exatas no campo "provas":
- "MEs" = prova ME · "TEA" = TEA · "TSA" = TSA 1ª fase (questões de múltipla escolha) · "TSAOral" = TSA Oral (prova oral, sem questões — vem da lista de TEMAS COBRADOS) · "Geral" = transversal/sem prova específica.
Liste as provas a que a ação se refere (ex.: ["TSA"] se só cai na 1ª fase; ["TEA","TSA"] se cai nas duas; ["TSAOral"] se for tema da prova oral). Use ["Geral"] só quando não couber em nenhuma prova específica.

FORMATAÇÃO do campo "porque": quando precisar LISTAR várias aulas ou itens, NÃO escreva em série separada por vírgula. Coloque uma frase de introdução e, em seguida, CADA item em uma LINHA NOVA começando com "- " (hífen + espaço). Use quebras de linha reais (\\n) dentro da string. Exemplo: "As seguintes aulas têm ficha resumo Pendente:\\n- PANI\\n- PAI Sistema de Medida\\n- Oxímetro de Pulso".

Responda SOMENTE com JSON válido (sem markdown, sem cercas de código), neste formato exato:
{
  "resumo": "2 a 4 frases sobre o estado geral do módulo e onde está o maior risco.",
  "acoes": [
    {
      "titulo": "ação curta e acionável",
      "categoria": "gravar | regravar | atualizar | material | questoes | edital",
      "provas": ["MEs" | "TEA" | "TSA" | "TSAOral" | "Geral"],
      "aula": "título da aula alvo, ou null se for aula nova/ausente",
      "porque": "1-2 frases justificando com base nos dados",
      "notas": { ${CRIT_IDS.map(id => `"${id}": 0.0`).join(', ')} }
    }
  ]
}`;
}

function buildUserPrompt(ctx) {
  const { cursoNome, modulo, edital, aulas, questoes, pedidos } = ctx;
  const oralTemas = ctx.oralTemas || [];
  const linhas = [];
  linhas.push(`CURSO: ${cursoNome}`);
  linhas.push(`MÓDULO (Ponto): ${modulo}`);
  linhas.push('');

  // Edital sem corte rígido (guarda alta só pra evitar prompt gigante por engano).
  const editalHdr = ctx.editalFonte === 'módulo'
    ? '=== EDITAL DESTE MÓDULO ==='
    : '=== EDITAL (do curso; pode cobrir vários módulos) ===';
  linhas.push(editalHdr);
  linhas.push(edital ? edital.slice(0, 60000) : '(edital não cadastrado)');
  linhas.push('');

  linhas.push(`=== AULAS DO MÓDULO (${aulas.length}) ===`);
  if (!aulas.length) linhas.push('(nenhuma aula cadastrada neste módulo)');
  aulas.forEach((a, i) => {
    const av = a.aval.nota != null ? `${a.aval.nota}${a.aval.n ? ` (${a.aval.n} avaliações)` : ''}` : 'sem avaliação';
    linhas.push(`--- Aula ${i + 1}: ${a.titulo} ---`);
    linhas.push(`Status: ${a.status || '(sem status)'} · Ano: ${a.ano || '?'} · Avaliação: ${av} · Trilha de questões: ${a.questoes || '?'} · Trilha de flashcards: ${a.cards || '?'} · Ficha resumo: ${a.fichaResumo}`);
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

  linhas.push(`=== APOSTILA DO MÓDULO (material único do módulo inteiro) ===`);
  linhas.push(ctx.apostilaStatus || '(sem apostila cadastrada)');
  linhas.push('(A FICHA RESUMO é diferente: é POR AULA — veja "Ficha resumo: sim/NÃO" em cada aula acima.)');
  linhas.push('');

  linhas.push(`=== QUESTÕES REAIS DE PROVA (banco do módulo, por prova) ===`);
  const tipos = [['MEs', 'ME'], ['TEA', 'TEA'], ['TSA', 'TSA 1ª fase'], ['Outras', 'Outras']];
  let temQ = false;
  tipos.forEach(([t, lbl]) => {
    const arr = questoes[t] || [];
    if (!arr.length) return;
    temQ = true;
    linhas.push(`-- ${lbl} [chave ${t === 'MEs' ? 'MEs' : t}] (${arr.length} questões; mostrando até ${QUESTOES_CAP}) --`);
    arr.slice(0, QUESTOES_CAP).forEach((q, i) => linhas.push(`${i + 1}. ${q}`));
    linhas.push('');
  });
  if (!temQ) linhas.push('(nenhuma questão puxada para este módulo)');
  linhas.push('');

  linhas.push(`=== TSA ORAL — TEMAS COBRADOS (prova oral; NÃO são questões) [chave TSAOral] ===`);
  linhas.push(oralTemas.length ? oralTemas.map((t, i) => `${i + 1}. ${t}`).join('\n') : '(nenhum tema do TSA Oral cadastrado)');
  linhas.push('');

  if (ctx.atualizacaoConteudo) {
    linhas.push(`=== ATUALIZAÇÃO / NOVA DIRETRIZ (texto colado pela coordenação) ===`);
    linhas.push('Compare este texto com o conteúdo das aulas. Se alguma aula ensina algo que MUDOU/foi superado por esta atualização, recomende ATUALIZAR essa aula (cite a aula e o que mudou). Se nada conflita, não gere ação por isso.');
    linhas.push(ctx.atualizacaoConteudo.slice(0, 12000));
    linhas.push('');
  }
  if (ctx.transcricaoAvulsa) {
    linhas.push(`=== TRANSCRIÇÃO DE AULA AVULSA (conteúdo extra a considerar como JÁ COBERTO) ===`);
    linhas.push('Considere este conteúdo como já existente ao avaliar lacunas — NÃO recomende criar/gravar algo que esta transcrição avulsa já cobre.');
    linhas.push(ctx.transcricaoAvulsa.slice(0, 30000));
    linhas.push('');
  }

  linhas.push(`=== PEDIDOS DE ALUNOS ===`);
  linhas.push(pedidos.length ? pedidos.map((p, i) => `${i + 1}. ${p}`).join('\n') : '(nenhum pedido registrado)');
  linhas.push('');

  const erros = ctx.erros || [];
  linhas.push(`=== ERROS DETECTADOS PELO TIME (cada um JUSTIFICA uma ação de REGRAVAR a aula citada) ===`);
  linhas.push(erros.length ? erros.map((e, i) => `${i + 1}. Aula "${e.aula}": ${e.resumo}`).join('\n') : '(nenhum)');
  linhas.push('');

  const duvDem = ctx.duvidasDemanda || [];
  linhas.push(`=== DÚVIDAS COM DEMANDA DE ATUALIZAÇÃO (justificam ATUALIZAR a aula citada) ===`);
  linhas.push(duvDem.length ? duvDem.map((d, i) => `${i + 1}. Aula "${d.aula}": ${d.texto}`).join('\n') : '(nenhum)');
  linhas.push('');

  const disp = ctx.dispensadas || [];
  if (disp.length) {
    linhas.push(`=== RECOMENDAÇÕES JÁ DISPENSADAS PELO COORDENADOR (NÃO proponha de novo — nem reformuladas/com outro título) ===`);
    disp.forEach((d, i) => linhas.push(`${i + 1}. ${d}`));
  }

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

    // Modo "defaults": devolve os textos-padrão dos prompts pra tela de edição (sem chamar IA).
    if (String(req.body?.acao || '') === 'defaults') {
      res.status(200).json({ ok: true, defaults: { modulo: DEFAULT_PROMPT_MODULO, produto: DEFAULT_PROMPT_PRODUTO } });
      return;
    }

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
          fichaResumo: String(a.fichaResumo || '').trim() || 'Pendente',  // status da ficha resumo (por aula): Pendente/Lançada/Não se aplica
          aval: _parseAval(a),
          conteudo: String(a.conteudo || '').trim(),
          transcricao: trunc ? full.slice(0, capPorAula) : full,
          transChars: full.length, transTrunc: trunc,
        };
      });

      // 2b) Fórum por aula: erros detectados (poErros) + dúvidas (poDuvidas).
      // Doc id = aulaId (= doc id de poAulas). Só vira insumo o que está EM ABERTO
      // (erro status='aberto' com mensagens) ou DEMANDA (post status='demanda').
      const erros = [];          // {aula, resumo}  → cada um justifica REGRAVAR
      const duvidasDemanda = []; // {aula, texto}   → cada um justifica ATUALIZAR
      await Promise.all(aulasRaw.map(async (a, i) => {
        const aulaId = a.id;
        const titulo = aulas[i].titulo;
        try {
          const eSnap = await db.collection('poErros').doc(aulaId).get();
          if (eSnap.exists) {
            const ed = eSnap.data() || {};
            // Modelo novo: erros:[{texto,status}]. Só os 'aberto' viram insumo (regravar).
            let abertos = [];
            if (Array.isArray(ed.erros)) abertos = ed.erros.filter(e => e && e.status === 'aberto').map(e => String(e.texto || '').trim());
            else if (Array.isArray(ed.mensagens) && ed.status === 'aberto') abertos = ed.mensagens.map(m => String(m && m.texto || '').trim()); // compat modelo antigo
            const resumo = abertos.filter(Boolean).join(' · ').slice(0, 600);
            if (resumo) erros.push({ aula: titulo, resumo });
          }
        } catch (_) {}
        try {
          const dSnap = await db.collection('poDuvidas').doc(aulaId).get();
          if (dSnap.exists) {
            const dd = dSnap.data() || {};
            const posts = Array.isArray(dd.posts) ? dd.posts : [];
            posts.forEach(p => {
              if (p && p.status === 'demanda') {
                const texto = String(p.texto || '').trim().slice(0, 400);
                if (texto) duvidasDemanda.push({ aula: titulo, texto });
              }
            });
          }
        } catch (_) {}
      }));

      // 3) Questões + pedidos + apostilas do módulo.
      const modKey = _modKey(cursoId, modulo);
      const modSnap = await db.collection('poModQuestoes').doc(modKey).get();
      const md = modSnap.exists ? (modSnap.data() || {}) : {};
      const enun = q => _stripImagens(q.enunciado || q.enunciado_html || '').slice(0, 600);
      const questoes = {};
      ['TEA', 'TSA', 'MEs', 'Outras'].forEach(t => { questoes[t] = (Array.isArray(md[t]) ? md[t] : []).map(enun).filter(Boolean); });
      const pedidos = Array.isArray(md.pedidos) ? md.pedidos.map(p => String(p).trim()).filter(Boolean) : [];
      const oralTemas = Array.isArray(md.oralTemas) ? md.oralTemas.map(t => String(t).trim()).filter(Boolean) : [];
      const atualizacaoConteudo = String(md.atualizacaoConteudo || '').trim();
      const transcricaoAvulsa = String(md.transcricaoAvulsa || '').trim();
      const apostilas = Array.isArray(md.apostilas) ? md.apostilas : [];
      const apostilaStatus = apostilas.length
        ? apostilas.map(ap => `- ${ap.titulo || '(sem título)'}: ${ap.status || 'Pendente'}`).join('\n')
        : '';
      // Recomendações que o coordenador já dispensou — a IA não deve propô-las de novo.
      const dispensadas = Array.isArray(md.analiseDismissed) ? md.analiseDismissed.map(d => String(d).trim()).filter(Boolean) : [];

      // 4) Edital + prompt customizado (editável pela tela). Edital POR MÓDULO
      // (md.editalModulo) tem prioridade; se vazio, cai no edital geral do curso.
      const cfgSnap = await db.collection('config').doc('poConfig').get();
      const cfg = cfgSnap.exists ? (cfgSnap.data() || {}) : {};
      const editais = cfg.editais || {};
      const editalCurso = String(editais[cursoId] || '').trim();
      const editalModulo = String(md.editalModulo || '').trim();
      const edital = editalModulo || editalCurso;
      const editalFonte = editalModulo ? 'módulo' : (editalCurso ? 'curso' : '');
      const promptCustom = cfg.analisePrompt && cfg.analisePrompt.modulo;

      const ctx = { cursoNome, modulo, edital, editalFonte, aulas, questoes, pedidos, oralTemas, atualizacaoConteudo, transcricaoAvulsa, apostilaStatus, dispensadas, erros, duvidasDemanda };
      const systemPrompt = buildSystemPrompt(promptCustom);
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

      // Normaliza rótulo de prova vindo da IA (tolera ME/ME1/mes/tsa/tsa oral…).
      const _normProva = (p) => {
        const s = String(p || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
        if (s === 'TSAORAL' || s === 'ORAL' || s.includes('ORAL')) return 'TSAOral';
        if (s === 'TEA') return 'TEA';
        if (s === 'TSA' || s.startsWith('TSA')) return 'TSA';
        if (s === 'ME' || s === 'MES' || s.startsWith('ME')) return 'MEs';
        if (s === 'GERAL') return 'Geral';
        return null;
      };
      // Sanitiza as notas: garante todas as chaves, clampa 0..1.
      const acoes = parsed.acoes.slice(0, 20).map(a => {
        const notas = {};
        CRIT_IDS.forEach(id => { let v = Number(a.notas?.[id]); if (!Number.isFinite(v)) v = 0; notas[id] = Math.max(0, Math.min(1, v)); });
        let provas = Array.isArray(a.provas) ? [...new Set(a.provas.map(_normProva).filter(Boolean))] : [];
        if (!provas.length) provas = ['Geral'];
        return {
          titulo: String(a.titulo || '').trim() || '(sem título)',
          categoria: String(a.categoria || '').trim().toLowerCase(),
          provas,
          aula: a.aula ? String(a.aula).trim() : null,
          porque: String(a.porque || '').trim(),
          notas,
        };
      });

      // Contagem por prova (sinal de incidência usado no produto). TSA Oral = nº de temas.
      const porProva = { TEA: (questoes.TEA || []).length, TSA: (questoes.TSA || []).length, MEs: (questoes.MEs || []).length, TSAOral: oralTemas.length, Outras: (questoes.Outras || []).length };

      const resultado = {
        resumo: String(parsed.resumo || '').trim(),
        acoes,
        meta: {
          cursoId, cursoNome, modulo,
          nAulas: aulas.length,
          nTranscricoes: aulas.filter(a => a.transcricao).length,
          nQuestoes: Object.values(questoes).reduce((s, arr) => s + arr.length, 0),
          porProva,
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

// ──────────────────────────────────────────────────────────────────────────
// Análise do PRODUTO inteiro — consolida as análises JÁ SALVAS de cada módulo.
// A IA NÃO reprocessa transcrições/questões: recebe só os resumos+ações+
// incidência de cada módulo e produz, POR PROVA (TEA/TSA/MEs), um ranking de
// módulos (priorizando maior incidência na prova) + panorama + resumo geral.
// ──────────────────────────────────────────────────────────────────────────
const PROVAS_PRODUTO = ['MEs', 'TEA', 'TSA', 'TSAOral'];

// ── Incidência OFICIAL dos temas nas provas (API Laravel /analise-provas) ──
// Substitui a contagem crua de questões por um sinal forte: o % das questões de
// cada tipo de prova que o(s) tema(s) do módulo cobrem, nos últimos 5 anos + o
// atual. Cruza config/poConfig.temaModulo[curso][modulo]=[pcodeIds] com a árvore
// de incidência (os ids dos temas-pai batem 1:1 com os nós do topo da árvore).
const LARAVEL_TOKEN = process.env.LARAVEL_TOKEN || '';
const LARAVEL_API = 'https://api.grupomedreview.com.br/api';
// Escopos (tipos de prova) por chave do PO. ME = anuais + quadrimestrais.
const ESCOPOS_PROVA = {
  TEA: [9],
  TSA: [8],
  MEs: [10, 11, 12, 136, 137, 138, 139, 140, 141, 142, 143, 144],
};
// Últimos 5 anos + o atual. Ex.: 2026 → [2021..2026].
function anosIncidencia() {
  const atual = new Date().getFullYear();
  const out = [];
  for (let i = 5; i >= 0; i--) out.push(atual - i);
  return out;
}
const _sleep = ms => new Promise(r => setTimeout(r, ms));
// Uma chamada à API → mapa pcodeId → {q: total_questoes, pct: percentual}.
// Com retry/backoff em 429 (rate limit) e 5xx transitórios.
async function incidenciaTree(escopoIds, anos, tentativa = 0) {
  const provas = [];
  escopoIds.forEach(e => anos.forEach(a => provas.push({ escopo_id: e, ano: a })));
  const r = await fetch(`${LARAVEL_API}/analise-provas/incidencia`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${LARAVEL_TOKEN}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ provas }),
  });
  if ((r.status === 429 || r.status >= 500) && tentativa < 4) {
    const ra = Number(r.headers.get('retry-after')) || 0;
    await _sleep(ra > 0 ? Math.min(ra * 1000, 30000) : Math.min(1000 * Math.pow(2, tentativa), 12000));
    return incidenciaTree(escopoIds, anos, tentativa + 1);
  }
  if (!r.ok) throw new Error(`incidencia → ${r.status}`);
  const j = await r.json();
  const map = {};
  const walk = nodes => (Array.isArray(nodes) ? nodes : []).forEach(n => {
    if (n && n.id != null) map[n.id] = { q: Number(n.total_questoes) || 0, pct: Number(n.percentual) || 0 };
    if (n && Array.isArray(n.children)) walk(n.children);
  });
  walk(j.data);
  return map;
}
// Cruza o temaModulo de UM curso × incidência oficial → {modulo: {TEA:{q,pct}, TSA, MEs}}.
// Retorna null se não dá pra calcular (sem token ou sem mapeamento de temas).
async function incidenciaOficialPorModulo(temaModuloCurso) {
  if (!LARAVEL_TOKEN || !temaModuloCurso || !Object.keys(temaModuloCurso).length) return null;
  const anos = anosIncidencia();
  const trees = {};
  for (const prova of Object.keys(ESCOPOS_PROVA)) {
    try { trees[prova] = await incidenciaTree(ESCOPOS_PROVA[prova], anos); }
    catch (e) { console.warn('incidencia', prova, e.message); trees[prova] = {}; }
  }
  const porMod = {};
  Object.entries(temaModuloCurso).forEach(([modulo, pcodes]) => {
    const ids = (Array.isArray(pcodes) ? pcodes : []).map(Number).filter(Boolean);
    const rec = {};
    Object.keys(ESCOPOS_PROVA).forEach(prova => {
      let q = 0, pct = 0;
      ids.forEach(id => { const v = trees[prova][id]; if (v) { q += v.q; pct += v.pct; } });
      rec[prova] = { q, pct: Math.round(Math.min(pct, 100) * 10) / 10 };
    });
    porMod[modulo] = rec;
  });
  return { porMod, anos };
}

// Reatualiza SÓ os números de incidência no ranking JÁ SALVO do produto, sem chamar
// a IA. Lê config/poConfig.analiseProduto[cursoId] + temaModulo[cursoId], rebusca a
// incidência ao vivo e regrava incidencia/incLabel/incQ de cada linha (nível, porquê
// e ordem da IA ficam intactos). Usado pela sincronização Laravel.
async function atualizarIncidenciaSalva(cursoId) {
  const db = admin.firestore();
  const cfgRef = db.collection('config').doc('poConfig');
  const cfg = (await cfgRef.get()).data() || {};
  const analise = cfg.analiseProduto && cfg.analiseProduto[cursoId];
  if (!analise || !analise.porProva) return { cursoId, atualizado: false, motivo: 'sem análise salva' };
  const tmCurso = cfg.temaModulo && cfg.temaModulo[cursoId];
  const incOf = await incidenciaOficialPorModulo(tmCurso);
  if (!incOf) return { cursoId, atualizado: false, motivo: 'sem incidência (token/temas)' };
  const _norm = t => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const incOfPorMod = {};
  Object.entries(incOf.porMod).forEach(([mod, rec]) => { incOfPorMod[_norm(mod)] = rec; });
  let linhas = 0;
  ['MEs', 'TEA', 'TSA'].forEach(prova => {
    const blk = analise.porProva[prova];
    if (!blk || !Array.isArray(blk.ranking)) return;
    blk.ranking.forEach(r => {
      const of = incOfPorMod[_norm(r.modulo)];
      if (of && of[prova]) {
        r.incidencia = of[prova].pct;
        r.incQ = of[prova].q;
        r.incLabel = `${String(of[prova].pct).replace('.', ',')}%`;
        linhas++;
      }
    });
  });
  // TSA Oral fica como está (nº de temas, não vem da API de incidência).
  analise.meta = analise.meta || {};
  analise.meta.incidenciaOficial = true;
  analise.meta.incidenciaAnos = incOf.anos;
  analise.meta.incidenciaAtualizadaEm = new Date().toISOString();
  await cfgRef.set({ analiseProduto: { [cursoId]: analise } }, { merge: true });
  return { cursoId, atualizado: true, linhas };
}

// Instruções EDITÁVEIS do prompt do produto. Formato JSON fixo é anexado por código.
const DEFAULT_PROMPT_PRODUTO = `Você está consolidando a análise de um PRODUTO (curso de revisão para provas de título médico) inteiro, a partir das análises JÁ FEITAS de cada módulo.

IMPORTANTE: você NÃO recebe transcrições nem questões — recebe apenas, de cada módulo já analisado: o resumo, a lista de ações recomendadas (com categoria e provas) e a INCIDÊNCIA por prova. As provas são: ME, TEA, TSA 1ª fase (chave TSA) e TSA Oral (chave TSAOral; incidência = nº de temas cobrados, não questões). Para ME/TEA/TSA a incidência é o % OFICIAL das questões daquele tipo de prova (últimos 5 anos + o atual) que os temas do módulo cobrem — quanto maior o %, mais a prova cobra esse módulo. Trabalhe só com isso.

Sua tarefa: para CADA prova (ME, TEA, TSA 1ªF, TSA Oral), produza um RANKING dos módulos do mais para o menos prioritário, e um panorama curto.

Como priorizar dentro de cada prova:
1. INCIDÊNCIA primeiro: módulos com MAIOR % (ou mais temas, no TSA Oral) naquela prova são mais importantes — é por onde o aluno mais perde/ganha ponto. Dê mais peso a eles.
2. Gravidade das ações: módulos com ações fortes (lacuna real, aula a gravar/regravar, avaliação baixa) sobem.
3. Um módulo com altíssima incidência e ações sérias é prioridade máxima naquela prova.
Atribua a cada módulo um nível: "alta", "media" ou "baixa".
Só inclua no ranking de uma prova os módulos que têm incidência > 0 OU ações relevantes para aquela prova.`;

function buildProdutoSystemPrompt(instr) {
  const base = (instr && String(instr).trim()) ? String(instr).trim() : DEFAULT_PROMPT_PRODUTO;
  return `${base}

Responda SOMENTE com JSON válido (sem markdown, sem cercas), neste formato exato (use as chaves MEs/TEA/TSA/TSAOral):
{
  "resumoGeral": "3 a 5 frases: estado geral do produto, onde focar primeiro, padrões que se repetem entre módulos.",
  "porProva": {
    "MEs": { "panorama": "2-3 frases sobre o cenário desta prova no produto.", "ranking": [ { "modulo": "nome exato do módulo", "nivel": "alta|media|baixa", "porque": "1 frase: por que essa posição (cite incidência e/ou ação)." } ] },
    "TEA": { "panorama": "...", "ranking": [ ... ] },
    "TSA": { "panorama": "...", "ranking": [ ... ] },
    "TSAOral": { "panorama": "...", "ranking": [ ... ] }
  }
}`;
}

function buildProdutoUserPrompt(cursoNome, mods) {
  const linhas = [`PRODUTO: ${cursoNome}`, `Módulos já analisados: ${mods.length}`, ''];
  mods.forEach((m, i) => {
    const inc = m.porProva || {};
    const of = m.incOficial;
    linhas.push(`### Módulo ${i + 1}: ${m.modulo}`);
    if (of) {
      linhas.push(`Incidência oficial nas provas (% das questões do tipo nos últimos 5 anos + o atual): ME ${of.MEs.pct}% (${of.MEs.q}q) · TEA ${of.TEA.pct}% (${of.TEA.q}q) · TSA 1ªF ${of.TSA.pct}% (${of.TSA.q}q) · TSA Oral ${inc.TSAOral || 0} temas`);
    } else {
      linhas.push(`Incidência: ME ${inc.MEs || 0} · TEA ${inc.TEA || 0} · TSA 1ªF ${inc.TSA || 0} · TSA Oral ${inc.TSAOral || 0} temas`);
    }
    if (m.resumo) linhas.push(`Resumo: ${m.resumo}`);
    const acoes = (m.acoes || []).slice(0, 8);
    if (acoes.length) {
      linhas.push('Ações:');
      acoes.forEach(a => linhas.push(`  - [${a.categoria || '?'} | ${(a.provas || []).join(',') || 'Geral'}] ${a.titulo}${a.porque ? ' — ' + a.porque : ''}`));
    }
    linhas.push('');
  });
  return linhas.join('\n');
}

exports.analisarProdutoPO = onRequest(
  { region: 'us-central1', invoker: 'public', cors: false, timeoutSeconds: 180, memory: '512MiB' },
  async (req, res) => {
    setCors(req, res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
    if (!ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY_PO ausente'); res.status(500).json({ error: 'IA de análise não configurada no servidor (falta ANTHROPIC_API_KEY_PO)' }); return; }

    const decoded = await exigeAuth(req, res);
    if (!decoded) return;

    // Teste de conexão da API de incidência (sem IA, sem precisar de curso/temas).
    if (req.body?.pingIncidencia === true) {
      if (!LARAVEL_TOKEN) { res.status(500).json({ error: 'Token do Laravel não configurado no servidor.' }); return; }
      const anos = anosIncidencia();
      try {
        const tree = await incidenciaTree([8], anos); // amostra: TSA 1ªF
        const nTemas = Object.keys(tree).length;
        const totalQ = Object.values(tree).reduce((s, v) => s + (v.q || 0), 0);
        console.log('IA PO ping incidência', { user: decoded.email || decoded.uid, nTemas, totalQ, anos: anos.join(',') });
        res.status(200).json({ ok: true, pingIncidencia: true, nTemas, totalQ, anos });
      } catch (e) {
        res.status(502).json({ error: 'A API de incidência não respondeu: ' + (e.message || String(e)) });
      }
      return;
    }

    const cursoId = String(req.body?.cursoId || '').trim();
    const cursoNome = String(req.body?.cursoNome || '').trim();
    if (!cursoId || !cursoNome) { res.status(400).json({ error: 'Faltam cursoId ou cursoNome' }); return; }

    try {
      const db = admin.firestore();
      // Prompt customizado do produto (editável pela tela).
      const cfgSnap = await db.collection('config').doc('poConfig').get();
      const promptCustom = cfgSnap.exists && cfgSnap.data().analisePrompt && cfgSnap.data().analisePrompt.produto;

      // ── Atalho "só incidência": busca a incidência oficial por módulo SEM chamar
      // a IA (custo de crédito = 0). Só precisa dos temas mapeados (temaModulo).
      if (req.body?.soIncidencia === true) {
        const tmCurso = (cfgSnap.exists && cfgSnap.data().temaModulo && cfgSnap.data().temaModulo[cursoId]) || null;
        if (!tmCurso || !Object.keys(tmCurso).length) {
          res.status(200).json({ ok: true, soIncidencia: true, incidencia: null, motivo: 'Nenhum módulo deste produto tem temas mapeados (🧩 Temas dos módulos).' });
          return;
        }
        const incOf = await incidenciaOficialPorModulo(tmCurso);
        if (!incOf) { res.status(502).json({ error: 'Não consegui buscar a incidência (API indisponível ou token ausente).' }); return; }
        console.log('IA PO incidência (sem IA)', { user: decoded.email || decoded.uid, curso: cursoNome || cursoId, n_modulos: Object.keys(incOf.porMod).length, anos: incOf.anos.join(',') });
        res.status(200).json({ ok: true, soIncidencia: true, incidencia: incOf });
        return;
      }
      // Lê os módulos do curso que já têm análise salva.
      const snap = await db.collection('poModQuestoes').where('cursoId', '==', cursoId).get();
      const mods = [];
      const _norm = t => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
      snap.forEach(d => {
        const x = d.data() || {};
        const an = x.analise;
        if (!an || !Array.isArray(an.acoes)) return;
        const porProva = (an.meta && an.meta.porProva) || { TEA: (x.TEA || []).length, TSA: (x.TSA || []).length, MEs: (x.MEs || []).length };
        // Ignora ações que o coordenador dispensou.
        const disp = new Set((Array.isArray(x.analiseDismissed) ? x.analiseDismissed : []).map(_norm));
        const acoes = an.acoes.filter(a => !disp.has(_norm(a.titulo)));
        mods.push({ modulo: x.modulo || an.meta?.modulo || '(módulo)', resumo: an.resumo || '', acoes, porProva });
      });

      if (!mods.length) {
        res.status(200).json({ ok: true, analise: { resumoGeral: 'Nenhum módulo deste produto foi analisado ainda. Analise os módulos individualmente primeiro — a análise do produto consolida esses resultados.', porProva: {}, meta: { cursoId, cursoNome, nModulos: 0, em: new Date().toISOString() } } });
        return;
      }

      // Incidência OFICIAL por módulo (% das questões de cada prova, 5 anos + atual),
      // cruzando o mapeamento de temas do curso. Se não der, cai na contagem crua.
      const temaModuloCurso = (cfgSnap.exists && cfgSnap.data().temaModulo && cfgSnap.data().temaModulo[cursoId]) || null;
      let incOf = null;
      try { incOf = await incidenciaOficialPorModulo(temaModuloCurso); }
      catch (e) { console.warn('IA PO produto: incidência oficial falhou', e.message); }
      if (incOf) mods.forEach(m => { m.incOficial = incOf.porMod[m.modulo] || null; });

      // Ordena por incidência total (só pra deixar o prompt mais legível). Usa o %
      // oficial quando disponível; senão, a contagem crua de questões.
      const _incTot = m => m.incOficial
        ? (m.incOficial.TEA.pct + m.incOficial.TSA.pct + m.incOficial.MEs.pct)
        : ((m.porProva.TEA || 0) + (m.porProva.TSA || 0) + (m.porProva.MEs || 0));
      mods.sort((a, b) => _incTot(b) - _incTot(a));

      const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
      const resp = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: [{ type: 'text', text: buildProdutoSystemPrompt(promptCustom), cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: buildProdutoUserPrompt(cursoNome, mods) }],
      });

      const texto = resp.content.filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
      const limpo = texto.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
      let parsed;
      try { parsed = JSON.parse(limpo); }
      catch (e) { const m = limpo.match(/\{[\s\S]*\}/); if (m) { try { parsed = JSON.parse(m[0]); } catch (_) {} } }
      if (!parsed || !parsed.porProva) {
        console.error('IA PO produto: resposta não-JSON', texto.slice(0, 500));
        res.status(502).json({ error: 'A IA não devolveu um panorama válido. Tente de novo.' });
        return;
      }

      // Mapa de incidência por módulo p/ enriquecer o ranking com números confiáveis.
      // Indexa por nome normalizado: a IA às vezes devolve o nome com capitalização/
      // espaços diferentes do salvo no Firestore.
      const incPorMod = {};
      const incOfPorMod = {};
      mods.forEach(m => { incPorMod[_norm(m.modulo)] = m.porProva; if (m.incOficial) incOfPorMod[_norm(m.modulo)] = m.incOficial; });
      const NIVEIS = new Set(['alta', 'media', 'baixa']);
      const porProva = {};
      PROVAS_PRODUTO.forEach(prova => {
        const blk = parsed.porProva[prova] || {};
        const ranking = (Array.isArray(blk.ranking) ? blk.ranking : []).map(r => {
          const modulo = String(r.modulo || '').trim();
          let nivel = String(r.nivel || '').trim().toLowerCase();
          if (!NIVEIS.has(nivel)) nivel = 'media';
          const inc = incPorMod[_norm(modulo)] || {};
          const of = incOfPorMod[_norm(modulo)];
          let incidencia, incLabel, incQ = 0;
          if (prova === 'TSAOral') {
            incidencia = Number(inc.TSAOral || 0);
            incLabel = `${incidencia} tema${incidencia === 1 ? '' : 's'}`;
          } else if (of && of[prova]) {
            incidencia = of[prova].pct; incQ = of[prova].q;
            incLabel = `${String(incidencia).replace('.', ',')}%`;
          } else {
            incidencia = Number(inc[prova] || 0);
            incLabel = `${incidencia}q`;
          }
          return { modulo, nivel, porque: String(r.porque || '').trim(), incidencia, incLabel, incQ };
        }).filter(r => r.modulo);
        porProva[prova] = { panorama: String(blk.panorama || '').trim(), ranking };
      });

      const resultado = {
        resumoGeral: String(parsed.resumoGeral || '').trim(),
        porProva,
        meta: {
          cursoId, cursoNome,
          nModulos: mods.length,
          incidenciaOficial: !!incOf,
          incidenciaAnos: incOf ? incOf.anos : null,
          modelo: MODEL,
          em: new Date().toISOString(),
          por: decoded.email || decoded.uid,
        },
      };

      const usage = resp.usage || {};
      console.log('IA PO produto OK', {
        user: decoded.email || decoded.uid, curso: cursoNome, n_modulos: mods.length,
        input_tokens: usage.input_tokens, output_tokens: usage.output_tokens,
        cache_read: usage.cache_read_input_tokens || 0, cache_write: usage.cache_creation_input_tokens || 0,
      });

      res.status(200).json({ ok: true, analise: resultado, usage });
    } catch (e) {
      console.error('IA PO produto erro:', e);
      res.status(500).json({ error: 'Erro ao analisar o produto: ' + (e.message || String(e)) });
    }
  }
);

// Exposto p/ a sincronização Laravel reatualizar a incidência salva (sem IA).
exports.atualizarIncidenciaSalva = atualizarIncidenciaSalva;
