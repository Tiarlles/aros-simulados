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
  if (ALLOWED_ORIGINS.includes(origin)) { res.set('Access-Control-Allow-Origin', origin); res.set('Vary', 'Origin'); }
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.set('Access-Control-Max-Age', '3600');
}

function _slug(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || '_';
}

async function laravelGet(path) {
  const resp = await fetch(`${LARAVEL_API}${path}`, {
    headers: { Authorization: `Bearer ${LARAVEL_TOKEN}`, Accept: 'application/json' },
  });
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

// Busca todo o currículo de um curso no Laravel → lista de aulas mapeadas (+ ordem dos módulos).
async function buscarCursoLaravel(courseId, nome) {
  const modulos = await laravelGet(`/curso/${courseId}/modulos`);
  const lista = Array.isArray(modulos) ? modulos : (modulos.data || modulos.modulos || []);
  const aulas = [];
  const modOrdem = [];
  let ordemPO = 0;
  for (const mod of lista) {
    const cont = await laravelGet(`/modulo/${mod.id}/conteudos`);
    const conteudos = Array.isArray(cont) ? cont : (cont.data || cont.conteudos || []);
    for (const c of conteudos) {
      const a = mapAula(c, nome, ordemPO++);
      if (!modOrdem.includes(a.modulo)) modOrdem.push(a.modulo);
      aulas.push(a);
    }
  }
  return { aulas, modOrdem };
}

// Sincroniza um curso. dryRun=true só calcula o diff (não escreve nem transcreve).
async function sincronizarCurso(courseId, nome, { dryRun }) {
  const db = admin.firestore();
  const { aulas, modOrdem } = await buscarCursoLaravel(courseId, nome);

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
    // cursos: merge (não derrubar pertencimento a outros cursos)
    const cursosPrev = Array.isArray(prev.cursos) ? prev.cursos : [];
    if (!cursosPrev.includes(nome)) patch.cursos = Array.from(new Set([...cursosPrev, nome]));
    if (Object.keys(patch).length) atualizadas.push({ id: prev.id, prev, patch });
  }

  const resumo = {
    curso: nome,
    totalLaravel: aulas.length,
    novas: novas.length,
    atualizadas: atualizadas.length,
    novasTitulos: novas.slice(0, 50).map(a => a.nomeOriginal),
    atualizadasTitulos: atualizadas.slice(0, 50).map(x => x.prev.nomeOriginal || x.prev.titulo),
    transcricoesNovas: 0, semLegenda: 0, errosTranscricao: 0,
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

  // transcrição das aulas NOVAS com vídeo (pula as que já têm doc em poTranscricoes)
  for (const { ref, a } of novasRefs) {
    if (!a.vimeoId) continue;
    try {
      const tdoc = await db.collection('poTranscricoes').doc(String(a.vimeoId)).get();
      if (tdoc.exists) {
        const td = tdoc.data() || {};
        await ref.update({ transcricaoPalavras: td.palavras || 0, transcricaoLang: td.lang || '', conteudoPreview: (td.texto || '').slice(0, 160), transcricaoEm: nowIso });
        resumo.transcricoesNovas++;
        continue;
      }
      const r = await obterTranscricao(a.vimeoId, ref.id);
      if (r && r.ok) {
        await ref.update({ transcricaoPalavras: r.palavras, transcricaoLang: r.lang || '', conteudoPreview: r.preview || '', transcricaoEm: nowIso });
        resumo.transcricoesNovas++;
      } else { resumo.semLegenda++; }
    } catch (e) { resumo.errosTranscricao++; console.warn('transcrição falhou', a.vimeoId, e?.message || e); }
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
        const linhas = resultados.map(r => `• ${r.curso}: ${r.novas} nova(s), ${r.atualizadas} atualizada(s), ${r.transcricoesNovas} transcrição(ões)`).join('\n');
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
