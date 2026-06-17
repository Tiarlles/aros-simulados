// Cloud Function (Firebase Gen 2) — Webhook Hotmart → AROS
// Recebe notificação da Hotmart de compra aprovada/cancelada e atualiza
// solicitacoesExtra no Firestore.

const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

// Re-exporta a function do Dex (pergunta IA sobre catálogo de produtos)
exports.perguntarDex = require('./dex').perguntarDex;

// Re-exporta a function de IA dos feedbacks (revisa feedback de caso + Feedback Geral)
exports.gerarFeedbackIA = require('./feedback-ia').gerarFeedbackIA;

// Re-exporta a function de convite de acesso (cria conta Auth + link de definição de senha)
exports.criarAcessoConvite = require('./criar-acesso').criarAcessoConvite;

// Re-exporta a function de transcrição via Vimeo (legenda do vídeo → texto no PO)
exports.vimeoTranscricao = require('./vimeo-transcricao').vimeoTranscricao;

// Re-exporta a sincronização Laravel → PO (botão manual + rotina semanal)
exports.sincronizarLaravel = require('./sincronizar-laravel').sincronizarLaravel;
exports.sincronizarLaravelAuto = require('./sincronizar-laravel').sincronizarLaravelAuto;

// Re-exporta as functions de questões do PO via API (filtros + puxar por tema)
exports.filtrosPO = require('./questoes-po').filtrosPO;
exports.puxarQuestoesPO = require('./questoes-po').puxarQuestoesPO;

// Helper que faz UPSERT em alunosAprovados (Cruzar Lista) a partir do webhook Hotmart
const { upsertAluno } = require('./hotmart-alunos');

// Tokens lidos de variáveis de ambiente (definidas em .env ou via firebase functions:secrets:set)
const HOTMART_TOKEN = process.env.HOTMART_TOKEN || '';
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK || '';

exports.hotmartWebhook = onRequest(
  {
    region: 'us-central1',
    invoker: 'public', // permite chamadas sem autenticação Google (necessário pra webhook externo)
    cors: false,
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }

    // Validação de token (Hotmart envia em X-HOTMART-HOTTOK ou no body como hottok)
    if (HOTMART_TOKEN) {
      const token =
        req.get('X-HOTMART-HOTTOK') || req.body?.hottok || req.body?.token;
      if (token !== HOTMART_TOKEN) {
        console.warn('Token inválido recebido', { received: token });
        res.status(401).send('Unauthorized');
        return;
      }
    }

    const body = req.body || {};
    console.log('Webhook recebido:', JSON.stringify(body).slice(0, 1500));

    const event = body.event || body.id || '';
    const purchase = body.data?.purchase || body;

    // ════════════════════════════════════════════════════════════════════
    // ALUNOS APROVADOS (Cruzar Lista) — UPSERT na base de alunos.
    // Roda em paralelo ao fluxo de solicitacoesExtra. Falhas aqui NÃO
    // bloqueiam a resposta 200 pro Hotmart, pra não perder webhooks por
    // erro num dos dois caminhos. Logamos pra debug posterior.
    // ════════════════════════════════════════════════════════════════════
    try {
      const r = await upsertAluno(body, event);
      console.log('alunosAprovados:', r.action, r.chaveAluno || r.motivo || '');
    } catch (e) {
      console.error('alunosAprovados upsert falhou (não bloqueante):', e?.message || e);
    }

    // Tenta extrair xcod (id da solicitação) de vários campos possíveis
    const xcod =
      purchase.origin?.xcod ||           // formato Hotmart 2.0.0 (atual)
      purchase.tracking?.source ||
      purchase.tracking?.source_sck ||
      purchase.tracking_source ||
      purchase.source ||
      body.xcod ||
      body.SCK ||
      body.tracking_source ||
      extractXcodFromUrl(purchase.checkout_country?.code) ||
      null;

    if (!xcod) {
      console.warn('Sem xcod no payload — ignorando', { event });
      res.status(200).send('OK (sem xcod, ignorado)');
      return;
    }

    const eventName = (event || '').toUpperCase();
    let newStatus = null;
    if (eventName.includes('APPROVED') || eventName.includes('COMPLETE')) {
      newStatus = 'pago';
    } else if (
      eventName.includes('REFUNDED') ||
      eventName.includes('CHARGEBACK') ||
      eventName.includes('CANCEL')
    ) {
      newStatus = 'cancelada';
    }

    if (!newStatus) {
      console.log('Evento ignorado:', eventName);
      res.status(200).send('OK (evento ignorado)');
      return;
    }

    try {
      const ref = db.collection('solicitacoesExtra').doc(xcod);
      const snap = await ref.get();
      if (!snap.exists) {
        console.warn('Solicitação não encontrada:', xcod);
        res.status(200).send('OK (solicitação não encontrada)');
        return;
      }

      const update = {
        status: newStatus,
        updatedAt: new Date().toISOString(),
      };
      if (newStatus === 'pago') {
        update.paidAt = new Date().toISOString();
        update.paidVia = 'hotmart';
        update.hotmartTransaction = purchase.transaction || purchase.order_ref || '';
      }
      await ref.update(update);
      console.log('Solicitação atualizada:', xcod, newStatus);

      // Notifica Slack
      if (newStatus === 'pago' && SLACK_WEBHOOK) {
        const data = snap.data();
        const opcs = (data.opcoes || [])
          .map(o => `${o.dia} ${o.turno}`)
          .join(' · ');
        const text = `💰 *Pagamento confirmado · Simulado Extra* (via Hotmart)\n• Nome: *${data.nome}*\n• E-mail: ${data.email}\n• Opções: ${opcs}`;
        try {
          await fetch(SLACK_WEBHOOK, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
          });
        } catch (e) {
          console.warn('Slack falhou:', e.message);
        }
      }

      res.status(200).send('OK');
    } catch (err) {
      console.error('Erro ao processar:', err);
      res.status(500).send('Internal error');
    }
  }
);

function extractXcodFromUrl(s) {
  if (!s || typeof s !== 'string') return null;
  const m = s.match(/[?&]xcod=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
