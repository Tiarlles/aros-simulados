// ════════════════════════════════════════════════════════════════════════════
// criarAcessoConvite — cria (se preciso) a conta no Firebase Auth do convidado e
// gera um LINK de definição de senha, pra pessoa criar a própria senha pelo email.
//
// Recebe POST { email } com Authorization: Bearer <Firebase ID token do admin>.
// Valida que o chamador é ADMIN (tipo=adm / role=admin no doc usuarios, ou email do
// dono). Garante a conta Auth do convidado e retorna { link, criado }.
//
// O navegador NÃO pode criar conta de outra pessoa sem senha — por isso é server-side
// (Admin SDK). Reaproveita a mesma infra das outras functions.
// ════════════════════════════════════════════════════════════════════════════
const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

// Emails que são sempre admin (fallback de segurança pra não travar o dono).
const OWNER_EMAILS = ['tiarllesmiller@gmail.com'];

// Pra onde o link redireciona depois que a pessoa define a senha.
const CONTINUE_URL = 'https://aros.anestreview.com.br/#coord';

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

// Confere se o email do chamador é de um admin (usuarios tipo=adm/role=admin, ativo) ou dono.
async function _isAdmin(email) {
  const e = String(email || '').toLowerCase();
  if (!e) return false;
  if (OWNER_EMAILS.includes(e)) return true;
  try {
    const snap = await admin.firestore().collection('usuarios').where('email', '==', e).get();
    let ok = false;
    snap.forEach(d => {
      const u = d.data() || {};
      if (u.inativo) return;
      if (u.tipo === 'adm' || u.role === 'admin') ok = true;
    });
    return ok;
  } catch (err) {
    console.error('isAdmin check falhou:', err);
    return false;
  }
}

exports.criarAcessoConvite = onRequest(
  {
    region: 'us-central1',
    invoker: 'public',
    cors: false,
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  async (req, res) => {
    setCors(req, res);

    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

    // Auth do chamador
    const authHeader = req.get('Authorization') || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) { res.status(401).json({ error: 'Faça login com Google ou Email para enviar convites' }); return; }
    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(idToken);
    } catch (e) {
      res.status(401).json({ error: 'Sessão expirada — faça login novamente' });
      return;
    }

    // Só admin pode criar acessos
    if (!(await _isAdmin(decoded.email))) {
      res.status(403).json({ error: 'Apenas administradores podem enviar convites de acesso' });
      return;
    }

    // Email do convidado
    const email = String(req.body?.email || '').trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) { res.status(400).json({ error: 'Email do convidado inválido' }); return; }

    try {
      // 1. Garante a conta no Firebase Auth
      let criado = false;
      try {
        await admin.auth().getUserByEmail(email);
      } catch (e) {
        if (e && e.code === 'auth/user-not-found') {
          await admin.auth().createUser({ email });
          criado = true;
        } else {
          throw e;
        }
      }

      // 2. Gera o link pra pessoa DEFINIR a própria senha (reset = set, pra conta nova)
      const link = await admin.auth().generatePasswordResetLink(email, {
        url: CONTINUE_URL,
        handleCodeInApp: false,
      });

      console.log('criarAcessoConvite OK', { por: decoded.email, convidado: email, criado });
      res.status(200).json({ link, criado });
    } catch (err) {
      console.error('Erro criarAcessoConvite:', err);
      res.status(500).json({ error: 'Erro ao gerar o acesso', detail: err?.message || 'Erro desconhecido' });
    }
  }
);
