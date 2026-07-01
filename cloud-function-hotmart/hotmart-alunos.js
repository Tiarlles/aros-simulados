// Processa webhook Hotmart e atualiza a coleção `alunosAprovados` no Firestore.
// Roda em paralelo ao fluxo existente de `solicitacoesExtra` (mesma function).
//
// Estratégia: UPSERT por `chaveAluno` (= cpf || lower(email) || normalizedName).
// Cada doc tem um array `produtos[]` agregando todas as compras da pessoa.
// Eventos REFUNDED/CHARGEBACK/CANCELED atualizam o status do produto correspondente.

const admin = require('firebase-admin');

// Mapeamento produto → vertical (mesma lógica do export_pg.mjs e do MED-Review)
function deriveVertical(produtoNome) {
  if (!produtoNome) return null;
  const n = String(produtoNome).toLowerCase();
  if (n.includes('med-review-r1') || n.includes('medreview r1') || /\br1\b/.test(n)) return 'medreview';
  if (n.includes('anest')) return 'anestreview';
  if (n.includes('ortop')) return 'ortopreview';
  if (n.includes('oft')) return 'oftreview';
  return null;
}

// Normaliza nome removendo acentos, lowercase, trim, colapsa espaços
function normNome(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim().replace(/\s+/g, ' ');
}

// Limpa CPF (só dígitos)
function cleanCpf(s) {
  if (!s) return null;
  const d = String(s).replace(/\D/g, '').trim();
  return d.length >= 11 ? d : (d || null);
}

// Calcula chaveAluno usando precedência cpf > email > nomeNorm
function calcChaveAluno({ cpf, email, nome }) {
  const c = cleanCpf(cpf);
  if (c) return c;
  const e = String(email || '').toLowerCase().trim();
  if (e) return e;
  return normNome(nome);
}

// Mapeia evento Hotmart → status canônico armazenado no produto.
function eventToStatus(eventName) {
  const e = (eventName || '').toUpperCase();
  if (e.includes('APPROVED') || e.includes('COMPLETE')) return 'Completo';
  if (e.includes('REFUNDED')) return 'reembolsado';
  if (e.includes('CHARGEBACK')) return 'chargeback';
  if (e.includes('CANCEL')) return 'cancelado';
  return null;
}

// Extrai os dados relevantes do payload Hotmart (cobre v1.x e v2.x)
function extractAlunoData(body) {
  const purchase = body.data?.purchase || body.purchase || body;
  const buyer = body.data?.buyer || body.buyer || purchase.buyer || {};
  const product = body.data?.product || body.product || purchase.product || {};

  const nome = (
    buyer.name || buyer.full_name ||
    purchase.buyer?.name || purchase.client_name ||
    body.name || ''
  ).trim();

  const email = (
    buyer.email || purchase.buyer?.email || body.email || ''
  ).toLowerCase().trim();

  const cpfRaw =
    buyer.document || buyer.cpf || buyer.checkout_phone?.document ||
    purchase.buyer?.document || body.document || body.cpf || null;

  const telefone =
    buyer.checkout_phone?.phone_number || buyer.phone || buyer.phone_number ||
    purchase.buyer?.phone || body.phone || null;

  const produtoId = String(
    product.id || product.product_id || product.ucode || body.product_id || body.prod_id || ''
  ) || null;

  const produtoNome = (
    product.name || purchase.product?.name ||
    body.product_name || body.product || ''
  ).trim() || null;

  const transacao = String(
    purchase.transaction || purchase.order_ref ||
    body.transaction || body.order_ref || ''
  ) || null;

  const dataCompra = (() => {
    const t = purchase.approved_date || purchase.order_date || purchase.date ||
              body.date || body.purchase_date || null;
    if (!t) return new Date().toISOString();
    // Hotmart manda timestamp em ms ou ISO
    if (typeof t === 'number') return new Date(t).toISOString();
    try { return new Date(t).toISOString(); } catch (e) { return new Date().toISOString(); }
  })();

  return {
    nome, email, cpf: cleanCpf(cpfRaw), telefone,
    produtoId, produtoNome, transacao, dataCompra
  };
}

// UPSERT em alunosAprovados. Retorna {action: 'created'|'updated'|'skipped', chaveAluno, motivo?}
async function upsertAluno(body, eventName) {
  const db = admin.firestore();
  const data = extractAlunoData(body);

  // Precisa ao menos de nome OU email pra criar/atualizar algo útil
  if (!data.nome && !data.email && !data.cpf) {
    return { action: 'skipped', motivo: 'sem nome/email/cpf no payload' };
  }
  if (!data.produtoNome && !data.produtoId) {
    return { action: 'skipped', motivo: 'sem produto no payload' };
  }

  const chaveAluno = calcChaveAluno(data);
  if (!chaveAluno) {
    return { action: 'skipped', motivo: 'não conseguiu calcular chaveAluno' };
  }

  const status = eventToStatus(eventName) || 'Completo';
  const vertical = deriveVertical(data.produtoNome);
  const nowISO = new Date().toISOString();

  // Doc ID precisa ser limpo (sem caracteres especiais do Firestore)
  const docId = String(chaveAluno).replace(/[\/\.\[\]\*\#\$]/g, '_').slice(0, 1500);
  const ref = db.collection('alunosAprovados').doc(docId);

  const novoProduto = {
    produtoId: data.produtoId || null,
    produtoNome: data.produtoNome || null,
    vertical,
    transacao: data.transacao || null,
    status,
    evento: eventName || 'WEBHOOK',
    dataCompra: data.dataCompra,
  };

  return await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);

    if (!snap.exists) {
      // Doc novo
      const novoDoc = {
        chaveAluno,
        nome: data.nome,
        nomeNorm: normNome(data.nome),
        cpf: data.cpf,
        email: data.email || null,
        telefone: data.telefone || null,
        produtos: [novoProduto],
        primeiraCompra: data.dataCompra,
        ultimaCompra: data.dataCompra,
        criadoEm: nowISO,
        atualizadoEm: nowISO,
      };
      tx.set(ref, novoDoc);
      return { action: 'created', chaveAluno: docId };
    }

    // Doc existe — merge inteligente do array produtos
    const existing = snap.data() || {};
    const produtos = Array.isArray(existing.produtos) ? existing.produtos.slice() : [];

    // Procura produto existente pela transação (chave primária da compra) ou produtoId
    const idxExistente = produtos.findIndex(p => {
      if (novoProduto.transacao && p.transacao && p.transacao === novoProduto.transacao) return true;
      if (!novoProduto.transacao && novoProduto.produtoId && p.produtoId === novoProduto.produtoId && p.dataCompra === novoProduto.dataCompra) return true;
      return false;
    });

    if (idxExistente >= 0) {
      // Atualiza status do produto existente (ex: PURCHASE_REFUNDED chega depois de PURCHASE_APPROVED)
      produtos[idxExistente] = {
        ...produtos[idxExistente],
        status,
        evento: eventName || produtos[idxExistente].evento,
      };
    } else {
      // Adiciona nova compra ao array
      produtos.push(novoProduto);
    }

    // Atualiza dados pessoais SE vieram novos/melhores (preserva o que já tinha)
    const update = {
      produtos,
      atualizadoEm: nowISO,
      ultimaCompra: data.dataCompra > (existing.ultimaCompra || '') ? data.dataCompra : (existing.ultimaCompra || data.dataCompra),
    };
    // Preenche campos pessoais só se estavam vazios na base
    if (!existing.nome && data.nome) { update.nome = data.nome; update.nomeNorm = normNome(data.nome); }
    if (!existing.cpf && data.cpf) update.cpf = data.cpf;
    if (!existing.email && data.email) update.email = data.email;
    if (!existing.telefone && data.telefone) update.telefone = data.telefone;
    if (!existing.primeiraCompra || data.dataCompra < existing.primeiraCompra) update.primeiraCompra = data.dataCompra;

    tx.update(ref, update);
    return { action: 'updated', chaveAluno: docId };
  });
}

// ════════════════════════════════════════════════════════════════════════════
// POVOAMENTO AUTOMÁTICO DA LISTA DA TURMA (planilha de gerenciamento em `listas`)
// ────────────────────────────────────────────────────────────────────────────
// Diferente de `alunosAprovados` (base global de compradores). Aqui a compra de
// um produto específico entra como LINHA na lista de gerenciamento da turma, que
// a coordenação marcou como "povoar pela Hotmart". Modelo do doc listas/{id}:
//   { hotmart:{enabled:true, produtos:[{id:'2243298',presencial:true}, ...]},
//     colunas:[{id,label,tipo,auto?}],  // auto:'presencial'|'situacao'
//     alunos:[{matricula,nome,email,telefone,produtoId,origem,addedAt,campos:{colId:val}}] }
//
// APPROVED/COMPLETE → cria/atualiza a linha (dedup por e-mail), marca a coluna
//   auto 'presencial' (sim/nao conforme o produto) e 'situacao'='Ativo'.
// REFUNDED/CHARGEBACK/CANCEL → marca 'situacao'='Reembolsado'/'Cancelado' (NÃO
//   apaga a linha, pra preservar preenchimentos manuais da coordenação).
async function povoarListasTurma(body, eventName) {
  const db = admin.firestore();
  const data = extractAlunoData(body);

  if (!data.produtoId && !data.produtoNome) return { action: 'skipped', motivo: 'sem produto' };
  if (!data.email && !data.nome && !data.cpf) return { action: 'skipped', motivo: 'sem identidade' };

  const status = eventToStatus(eventName) || 'Completo';
  const isCancel = status === 'reembolsado' || status === 'chargeback' || status === 'cancelado';
  const situacaoCancel = status === 'reembolsado' ? 'Reembolsado' : 'Cancelado';
  const nowISO = new Date().toISOString();
  const emailLc = String(data.email || '').toLowerCase().trim();
  const cpf = data.cpf ? String(data.cpf) : '';
  const prodId = String(data.produtoId || '').trim();

  // Só listas com povoamento automático ligado
  const snap = await db.collection('listas').where('hotmart.enabled', '==', true).get();
  if (snap.empty) return { action: 'skipped', motivo: 'nenhuma lista Hotmart ativa' };

  const results = [];
  for (const docSnap of snap.docs) {
    const lista = docSnap.data() || {};
    const produtos = (lista.hotmart && Array.isArray(lista.hotmart.produtos)) ? lista.hotmart.produtos : [];
    // Produto da compra pertence a esta lista?
    const prod = produtos.find(p => {
      const pid = String((p && p.id) || '').trim();
      return pid && prodId && pid === prodId;
    });
    if (!prod) continue;

    const colunas = Array.isArray(lista.colunas) ? lista.colunas : [];
    const colPres = colunas.find(c => c && c.auto === 'presencial');
    const colSit = colunas.find(c => c && c.auto === 'situacao');

    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(docSnap.ref);
      if (!fresh.exists) return;
      const d = fresh.data() || {};
      const alunos = Array.isArray(d.alunos) ? d.alunos.map(a => ({ ...a })) : [];

      // Dedup: e-mail (preferencial) → cpf
      const idx = alunos.findIndex(a => {
        const ae = String((a && a.email) || '').toLowerCase().trim();
        if (emailLc && ae) return ae === emailLc;
        if (cpf && a && a.cpf) return String(a.cpf) === cpf;
        return false;
      });

      if (isCancel) {
        if (idx >= 0 && colSit) {
          alunos[idx].campos = alunos[idx].campos || {};
          alunos[idx].campos[colSit.id] = situacaoCancel;
          tx.update(docSnap.ref, { alunos, updatedAt: nowISO });
          results.push({ lista: docSnap.ref.id, action: 'situacao:' + situacaoCancel });
        }
        return; // reembolso de quem nunca entrou: ignora
      }

      // APPROVED/COMPLETE
      if (idx >= 0) {
        const a = alunos[idx];
        a.campos = a.campos || {};
        if (colPres) a.campos[colPres.id] = prod.presencial ? 'sim' : 'nao';
        if (colSit && !a.campos[colSit.id]) a.campos[colSit.id] = 'Ativo';
        if (!a.telefone && data.telefone) a.telefone = data.telefone;
        if (!a.email && data.email) a.email = data.email;
        if (!a.nome && data.nome) a.nome = data.nome;
        a.produtoId = prodId || a.produtoId || '';
        tx.update(docSnap.ref, { alunos, updatedAt: nowISO });
        results.push({ lista: docSnap.ref.id, action: 'atualizado' });
      } else {
        const campos = {};
        if (colPres) campos[colPres.id] = prod.presencial ? 'sim' : 'nao';
        if (colSit) campos[colSit.id] = 'Ativo';
        alunos.push({
          matricula: '',
          nome: data.nome || '',
          email: data.email || '',
          telefone: data.telefone || '',
          produtoId: prodId,
          origem: 'hotmart',
          addedAt: nowISO,
          campos,
        });
        tx.update(docSnap.ref, { alunos, updatedAt: nowISO });
        results.push({ lista: docSnap.ref.id, action: 'criado' });
      }
    });
  }

  return { action: results.length ? 'done' : 'skipped', results };
}

module.exports = { upsertAluno, extractAlunoData, calcChaveAluno, deriveVertical, normNome, povoarListasTurma };
