// Cloud Function (Firebase Gen 2) — Sincronização Laravel → PO MEDREVIEW
// Lê o currículo dos cursos vigiados pela API do Laravel, compara com poAulas e:
//  - cria as aulas novas (com Trilha Questões/Flashcards, vídeo, avaliação, etc),
//  - atualiza as que mudaram (preservando campos editados à mão no PO),
//  - puxa a transcrição (Vimeo) das aulas novas que têm vídeo.
// NÃO deleta aulas que sumiram do Laravel (só loga).
//
// Duas exportações:
//  - sincronizarLaravel      (HTTP, exige Firebase ID token) — botão "Sincronizar agora" + preview
//  - sincronizarLaravelAuto  (agendada, semanal) — roda sozinha e notifica o Slack
//
// Auth Laravel: token Sanctum permanente em LARAVEL_TOKEN (.env, server-side).

const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const { obterTranscricao } = require('./vimeo-transcricao');
const { atualizarIncidenciaSalva } = require('./po-analise');

const LARAVEL_TOKEN = process.env.LARAVEL_TOKEN || '';
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK || '';
const LARAVEL_API = 'https://api.grupomedreview.com.br/api';

// Cursos vigiados (course_id do Laravel → nome do curso no PO). Comece pelo
// Extensive; adicione outros aqui conforme o Tiarlles for liberando.
const CURSOS_VIGIADOS = [
  { courseId: '3df5bb00-db83-49a3-a334-f55af33b48f4', nome: 'Extensive' },
];

// Os campos editados à mão no PO (status, prof, conteudo, marcadores de transcrição, etc)
// são preservados implicitamente: o update só toca nos CAMPOS_LARAVEL (definidos abaixo).

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

function _slug(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || '_';
}

// Normaliza nome de módulo p/ comparar com a lista de ignorados (casa com o _norm do po-analise/frontend).
function _norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

const _sleep = ms => new Promise(r => setTimeout(r, ms));

// GET com retry/backoff em 429 (rate limit) e 5xx transitórios. Respeita Retry-After.
async function laravelGet(path, tentativa = 0) {
  const resp = await fetch(`${LARAVEL_API}${path}`, {
    headers: { Authorization: `Bearer ${LARAVEL_TOKEN}`, Accept: 'application/json' },
  });
  if ((resp.status === 429 || resp.status >= 500) && tentativa < 5) {
    const ra = Number(resp.headers.get('retry-after')) || 0;
    const espera = ra > 0 ? Math.min(ra * 1000, 30000) : Math.min(1000 * Math.pow(2, tentativa), 15000);
    console.warn(`Laravel ${path} → ${resp.status}; retry em ${espera}ms (tentativa ${tentativa + 1}/5)`);
    await _sleep(espera);
    return laravelGet(path, tentativa + 1);
  }
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Laravel ${path} → ${resp.status} ${txt.slice(0, 120)}`);
  }
  return resp.json();
}

// Mapeia um conteúdo do Laravel pros campos da aula do PO (espelha _poParseLaravel).
function mapAula(c, cursoNomeDefault, ordemPO) {
  const title = String(c.title == null ? '' : c.title);
  let ordem = null, titulo = title;
  const m = title.match(/^\s*(\d+)\s*[-–]\s*(.+)$/);
  if (m) { ordem = Number(m[1]); titulo = m[2].trim(); }
  const cursoNome = c.course_name || cursoNomeDefault;
  const modulo = c.module_name || '(sem módulo)';
  const vimeoId = String(c.video_external_id == null ? '' : c.video_external_id);
  const ratingNum = (c.rating != null) ? Number(c.rating) : null;
  const ratingTotal = c.total_ratings || 0;
  const avaliacao = (c.rating != null && c.rating !== '')
    ? (String(c.rating) + (c.total_ratings ? (' (' + c.total_ratings + ')') : '')) : '';
  const publishedAt = c.published_at || '';
  const temTrilhaQ = Array.isArray(c.trilhas) && c.trilhas.length > 0;
  const temTrilhaFC = Array.isArray(c.trilhasFlashcard) && c.trilhasFlashcard.length > 0;
  return {
    laravelId: c.id,
    nomeOriginal: title,
    ordem, titulo, modulo,
    cursos: [cursoNome],
    video: vimeoId ? ('https://vimeo.com/' + vimeoId) : '',
    vimeoId,
    avaliacao, ratingNum, ratingTotal,
    duracao: c.video_duration || '',
    publishedAt,
    ano: String(publishedAt).slice(0, 4),
    tipoLaravel: c.type || '',
    ordemPO,
    questoes: temTrilhaQ ? 'Lançada' : 'Pendente',
    cards: temTrilhaFC ? 'Lançada' : 'Pendente',
  };
}

// Campos vindos do Laravel que comparamos pra detectar mudança numa aula já existente.
const CAMPOS_LARAVEL = ['titulo', 'nomeOriginal', 'ordem', 'modulo', 'video', 'vimeoId',
  'avaliacao', 'ratingNum', 'ratingTotal', 'duracao', 'publishedAt', 'ano', 'tipoLaravel',
  'questoes', 'cards', 'ordemPO'];

// Trilha Questões/Flashcards: o Laravel só sabe dizer 'Lançada' (tem trilha) ou
// 'Pendente' (não tem). Se o coord marcou à mão um estado que o Laravel NÃO produz
// (ex.: 'Não se aplica'), isso é uma decisão manual e a sync NÃO sobrescreve.
const TRILHA_CAMPOS = ['questoes', 'cards'];
const TRILHA_DO_LARAVEL = new Set(['Lançada', 'Pendente', '', null, undefined]);

// Apostilas anexadas a uma aula: itens de tasks[] type 'material' com flag apostila=true.
// O Laravel embute os anexos no array tasks[] de cada conteúdo (o campo `attachments`
// é só uma contagem). Devolve os títulos (label) das apostilas.
function apostilasDaAula(c) {
  return (Array.isArray(c.tasks) ? c.tasks : [])
    .filter(t => t && t.type === 'material' && t.apostila === true)
    .map(t => String(t.label || '').trim())
    .filter(Boolean);
}

// Busca todo o currículo de um curso no Laravel → lista de aulas mapeadas (+ ordem dos
// módulos + apostilas detectadas por módulo).
async function buscarCursoLaravel(courseId, nome) {
  // Módulos marcados como "ignorados" na tela do PO (config/poConfig.modulosIgnorados[cursoId]):
  // não puxa da API, não cria/atualiza aulas, não transcreve nem importa apostilas.
  const cursoId = _slug(nome);
  let ignorados = new Set();
  try {
    const cfg = (await admin.firestore().collection('config').doc('poConfig').get()).data() || {};
    const arr = (cfg.modulosIgnorados && cfg.modulosIgnorados[cursoId]) || [];
    if (Array.isArray(arr)) ignorados = new Set(arr.map(_norm));
  } catch (e) { console.warn('modulosIgnorados read falhou:', e?.message || e); }

  const modulos = await laravelGet(`/curso/${courseId}/modulos`);
  const lista = Array.isArray(modulos) ? modulos : (modulos.data || modulos.modulos || []);
  const aulas = [];
  const modOrdem = [];
  const apostilasPorModulo = {}; // {moduloNome: [labels]}
  const pulados = [];
  let ordemPO = 0;
  for (const mod of lista) {
    // Pula SEM nem buscar os conteúdos quando o nome do módulo na lista já bate com um ignorado.
    const nomeLista = _norm(mod.name || mod.title || mod.module_name || mod.nome);
    if (nomeLista && ignorados.has(nomeLista)) { pulados.push(mod.name || mod.title || nomeLista); continue; }
    await _sleep(120); // respiro entre módulos p/ não estourar o rate limit do Laravel
    const cont = await laravelGet(`/modulo/${mod.id}/conteudos`);
    const conteudos = Array.isArray(cont) ? cont : (cont.data || cont.conteudos || []);
    for (const c of conteudos) {
      // Defesa: se o nome da lista não casou mas o module_name da aula está ignorado, pula também.
      if (ignorados.has(_norm(c.module_name || '(sem módulo)'))) continue;
      const a = mapAula(c, nome, ordemPO++);
      if (!modOrdem.includes(a.modulo)) modOrdem.push(a.modulo);
      aulas.push(a);
      const aps = apostilasDaAula(c);
      if (aps.length) (apostilasPorModulo[a.modulo] = apostilasPorModulo[a.modulo] || []).push(...aps);
    }
  }
  if (pulados.length) console.log(`Sync ${nome}: ${pulados.length} módulo(s) ignorado(s) (não puxados):`, pulados.join(' · '));
  return { aulas, modOrdem, apostilasPorModulo };
}

// Sincroniza um curso. dryRun=true só calcula o diff (não escreve nem transcreve).
async function sincronizarCurso(courseId, nome, { dryRun }) {
  const db = admin.firestore();
  const { aulas, modOrdem, apostilasPorModulo } = await buscarCursoLaravel(courseId, nome);

  // índice das aulas existentes por laravelId
  const snap = await db.collection('poAulas').get();
  const existByLid = {};
  snap.forEach(d => { const a = d.data() || {}; if (a.laravelId != null) existByLid[a.laravelId] = { id: d.id, ...a }; });

  const novas = [], atualizadas = [];
  for (const a of aulas) {
    const prev = existByLid[a.laravelId];
    if (!prev) { novas.push(a); continue; }
    // monta patch só com os campos do Laravel que mudaram
    const patch = {};
    for (const k of CAMPOS_LARAVEL) {
      const nv = a[k], ov = prev[k];
      if (JSON.stringify(nv) !== JSON.stringify(ov === undefined ? null : ov) && !(nv == null && ov == null)) patch[k] = nv;
    }
    // Preserva trilha marcada à mão num estado que o Laravel não conhece (ex.: 'Não se aplica').
    for (const k of TRILHA_CAMPOS) { if (k in patch && !TRILHA_DO_LARAVEL.has(prev[k])) delete patch[k]; }
    // cursos: merge (não derrubar pertencimento a outros cursos)
    const cursosPrev = Array.isArray(prev.cursos) ? prev.cursos : [];
    if (!cursosPrev.includes(nome)) patch.cursos = Array.from(new Set([...cursosPrev, nome]));
    if (Object.keys(patch).length) atualizadas.push({ id: prev.id, prev, patch });
  }

  // aulas que ainda precisam de transcrição: tem vídeo e (é nova) OU (existe mas sem marcador).
  // Isso faz a sync RE-tentar nas próximas rodadas as que falharam (ex.: legenda do Vimeo
  // ainda não estava pronta) — não fica só nas "novas daquela rodada".
  const faltamTranscricao = aulas.filter(a => {
    if (!a.vimeoId) return false;
    const prev = existByLid[a.laravelId];
    return !prev || !prev.transcricaoPalavras;
  }).length;

  const resumo = {
    curso: nome,
    totalLaravel: aulas.length,
    novas: novas.length,
    atualizadas: atualizadas.length,
    novasTitulos: novas.slice(0, 50).map(a => a.nomeOriginal),
    atualizadasTitulos: atualizadas.slice(0, 50).map(x => x.prev.nomeOriginal || x.prev.titulo),
    transcricoesPendentes: faltamTranscricao,
    transcricoesNovas: 0, semLegenda: 0, errosTranscricao: 0,
    apostilasDetectadas: Object.values(apostilasPorModulo).reduce((s, arr) => s + new Set(arr).size, 0),
    apostilasModulos: Object.keys(apostilasPorModulo).length,
    dryRun: !!dryRun,
  };
  if (dryRun) return resumo;

  // grava criações + atualizações em lotes de 450
  const nowIso = new Date().toISOString();
  let op = 0, batch = db.batch();
  const flush = async () => { await batch.commit(); batch = db.batch(); op = 0; };
  const novasRefs = [];
  for (const a of novas) {
    const ref = db.collection('poAulas').doc();
    novasRefs.push({ ref, a });
    batch.set(ref, { ...a, status: '', conteudo: '', prof: '', dados: {}, criadoEm: nowIso, updatedAt: nowIso });
    if (++op >= 450) await flush();
  }
  for (const u of atualizadas) {
    batch.update(db.collection('poAulas').doc(u.id), { ...u.patch, updatedAt: nowIso });
    if (++op >= 450) await flush();
  }
  if (op > 0) await flush();

  // atualiza modOrdem no config (acrescenta módulos novos preservando a ordem do Laravel)
  try {
    const cursoId = _slug(nome);
    const cfgRef = db.collection('config').doc('poConfig');
    const cfg = (await cfgRef.get()).data() || {};
    const mo = cfg.modOrdem || {};
    const atual = Array.isArray(mo[cursoId]) ? mo[cursoId] : [];
    const merged = atual.slice();
    modOrdem.forEach(m => { if (!merged.includes(m)) merged.push(m); });
    if (merged.length !== atual.length) { mo[cursoId] = merged; await cfgRef.set({ modOrdem: mo }, { merge: true }); }
  } catch (e) { console.warn('modOrdem update falhou:', e?.message || e); }

  // AUTO-IMPORT de apostilas (apostila=true no Laravel) → poModQuestoes[modKey].apostilas.
  // Preserva as cadastradas à mão (sem fonteLaravel) e o status editado nas auto.
  // Processa TODOS os módulos do currículo p/ também REMOVER apostila auto que sumiu do Laravel.
  try {
    const cursoIdPO = _slug(nome);
    let importadas = 0;
    for (const modulo of modOrdem) {
      const labels = Array.from(new Set(apostilasPorModulo[modulo] || []));
      const modKey = _slug(cursoIdPO + '__' + modulo);
      const ref = db.collection('poModQuestoes').doc(modKey);
      const prev = (await ref.get()).data() || {};
      const prevApost = Array.isArray(prev.apostilas) ? prev.apostilas : [];
      // manuais com conteúdo (descarta cascas vazias: sem nome E sem link).
      const manuais = prevApost.filter(a => !a.fonteLaravel && (String(a.titulo || '').trim() || String(a.link || '').trim()));
      const statusPrev = {}; prevApost.filter(a => a.fonteLaravel).forEach(a => { if (a.laravelLabel) statusPrev[a.laravelLabel] = a.status; });
      const auto = labels.map(lbl => ({ titulo: lbl, link: '', status: statusPrev[lbl] || 'Finalizado', fonteLaravel: true, laravelLabel: lbl }));
      const novaLista = [...manuais, ...auto];
      // só escreve se mudou (evita writes à toa)
      if (JSON.stringify(novaLista) !== JSON.stringify(prevApost)) {
        await ref.set({ cursoId: cursoIdPO, modulo, apostilas: novaLista }, { merge: true });
      }
      importadas += auto.length;
    }
    resumo.apostilasImportadas = importadas;
  } catch (e) { console.warn('auto-import apostilas falhou:', e?.message || e); resumo.apostilasImportadas = -1; }

  // transcrição: TODA aula com vídeo que ainda não tem (novas + existentes sem marcador).
  // Cada item salva na hora, então se o run estourar o tempo, o próximo continua de onde parou.
  const aTranscrever = [];
  for (const { ref, a } of novasRefs) { if (a.vimeoId) aTranscrever.push({ docId: ref.id, vimeoId: String(a.vimeoId) }); }
  for (const a of aulas) {
    const prev = existByLid[a.laravelId];
    if (prev && a.vimeoId && !prev.transcricaoPalavras) aTranscrever.push({ docId: prev.id, vimeoId: String(a.vimeoId) });
  }
  for (const item of aTranscrever) {
    const aulaRef = db.collection('poAulas').doc(item.docId);
    try {
      const tdoc = await db.collection('poTranscricoes').doc(item.vimeoId).get();
      if (tdoc.exists) {
        const td = tdoc.data() || {};
        await aulaRef.update({ transcricaoPalavras: td.palavras || 0, transcricaoLang: td.lang || '', conteudoPreview: (td.texto || '').slice(0, 160), transcricaoEm: nowIso });
        resumo.transcricoesNovas++;
        continue;
      }
      const r = await obterTranscricao(item.vimeoId, item.docId);
      if (r && r.ok) {
        await aulaRef.update({ transcricaoPalavras: r.palavras, transcricaoLang: r.lang || '', conteudoPreview: r.preview || '', transcricaoEm: nowIso });
        resumo.transcricoesNovas++;
      } else { resumo.semLegenda++; }
    } catch (e) { resumo.errosTranscricao++; console.warn('transcrição falhou', item.vimeoId, e?.message || e); }
  }

  // Reatualiza a incidência salva do produto (sem IA) com os números ao vivo da API.
  try {
    resumo.incidencia = await atualizarIncidenciaSalva(_slug(nome));
  } catch (e) {
    console.warn('atualizar incidência salva falhou:', e?.message || e);
    resumo.incidencia = { atualizado: false, motivo: String(e?.message || e) };
  }

  return resumo;
}

async function sincronizarTudo({ dryRun, courseId }) {
  const alvos = courseId ? CURSOS_VIGIADOS.filter(c => c.courseId === courseId) : CURSOS_VIGIADOS;
  const resultados = [];
  for (const c of alvos) resultados.push(await sincronizarCurso(c.courseId, c.nome, { dryRun }));
  return resultados;
}

// ── HTTP: botão "Sincronizar agora" (+ preview) ──
exports.sincronizarLaravel = onRequest(
  { region: 'us-central1', invoker: 'public', cors: false, timeoutSeconds: 540, memory: '512MiB' },
  async (req, res) => {
    setCors(req, res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
    if (!LARAVEL_TOKEN) { res.status(500).json({ error: 'Integração Laravel não configurada no servidor' }); return; }

    const authHeader = req.get('Authorization') || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) { res.status(401).json({ error: 'Faça login para sincronizar' }); return; }
    try { await admin.auth().verifyIdToken(idToken); }
    catch (e) { res.status(401).json({ error: 'Sessão expirada — faça login novamente' }); return; }

    const dryRun = !!req.body?.dryRun;
    const courseId = req.body?.courseId ? String(req.body.courseId) : null;
    try {
      const resultados = await sincronizarTudo({ dryRun, courseId });
      res.status(200).json({ ok: true, dryRun, resultados });
    } catch (err) {
      console.error('sincronizarLaravel erro:', err?.message || err);
      res.status(500).json({ error: 'Erro na sincronização', detail: String(err?.message || err) });
    }
  }
);

// ── Agendada: roda sozinha 1×/semana (segunda 06:00 BRT) ──
exports.sincronizarLaravelAuto = onSchedule(
  { schedule: '0 6 * * 1', timeZone: 'America/Sao_Paulo', region: 'us-central1', timeoutSeconds: 540, memory: '512MiB' },
  async () => {
    if (!LARAVEL_TOKEN) { console.error('LARAVEL_TOKEN ausente — sync abortada'); return; }
    try {
      const resultados = await sincronizarTudo({ dryRun: false });
      const totNovas = resultados.reduce((s, r) => s + r.novas, 0);
      const totAtu = resultados.reduce((s, r) => s + r.atualizadas, 0);
      const totTrans = resultados.reduce((s, r) => s + r.transcricoesNovas, 0);
      console.log('Sync Laravel concluída:', JSON.stringify(resultados));
      if (SLACK_WEBHOOK && (totNovas || totAtu)) {
        const linhas = resultados.map(r => `• ${r.curso}: ${r.novas} nova(s), ${r.atualizadas} atualizada(s), ${r.transcricoesNovas} transcrição(ões), ${r.apostilasImportadas || 0} apostila(s)`).join('\n');
        await fetch(SLACK_WEBHOOK, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: `🔄 *Sincronização Laravel → PO* (automática)\n${linhas}` }),
        }).catch(() => {});
      }
    } catch (err) {
      console.error('sincronizarLaravelAuto erro:', err?.message || err);
      if (SLACK_WEBHOOK) {
        await fetch(SLACK_WEBHOOK, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: `⚠️ *Sync Laravel falhou:* ${String(err?.message || err).slice(0, 300)}` }),
        }).catch(() => {});
      }
    }
  }
);
