// Livro-caixa dos gastos com a API da Anthropic (Claude) no PO.
// Cada função de IA chama registrarCusto(categoria, custoUsd) depois de uma chamada.
// Acumula em config/poCustosIA: { <categoria>: {total, count}, atualizadoEm }.
// Categorias: 'analise' (módulo/produto/oral), 'thumb', 'flashcards'.
//
// Lido pela tela "Gastos API" da Inteligência de Produto (cliente lê o doc direto).
// Escrito via Admin SDK (ignora as rules). Tolerante a falha: nunca derruba a função-pai.

const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');

// Preços Claude Sonnet por milhão de tokens (USD). Confira em https://www.claude.com/pricing
const PRICING = { input: 3.0 / 1e6, cache_write: 3.75 / 1e6, cache_read: 0.3 / 1e6, output: 15.0 / 1e6 };

function calcCustoSonnet(u) {
  u = u || {};
  return (u.input_tokens || 0) * PRICING.input
    + (u.cache_creation_input_tokens || 0) * PRICING.cache_write
    + (u.cache_read_input_tokens || 0) * PRICING.cache_read
    + (u.output_tokens || 0) * PRICING.output;
}

async function registrarCusto(categoria, custoUsd) {
  try {
    const c = Number(custoUsd);
    if (!categoria || !isFinite(c) || c <= 0) return;
    const upd = { atualizadoEm: new Date().toISOString() };
    upd[categoria] = { total: FieldValue.increment(c), count: FieldValue.increment(1) };
    await admin.firestore().collection('config').doc('poCustosIA').set(upd, { merge: true });
  } catch (e) { console.warn('registrarCusto falhou', categoria, e && e.message); }
}

module.exports = { calcCustoSonnet, registrarCusto, PRICING };
