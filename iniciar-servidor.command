#!/bin/bash
# AROS — servidor local pra testar antes de subir pra produção.
# Duplo-clique neste arquivo no Finder pra ligar.
# Fecha a janela do Terminal pra desligar.

cd "$(dirname "$0")"
echo ""
echo "════════════════════════════════════════"
echo "  AROS · servidor local de teste"
echo "════════════════════════════════════════"
echo ""
echo "  URL: http://localhost:8080/index.html"
echo "  Coord: http://localhost:8080/index.html#admin"
echo ""
echo "  Pra parar: feche esta janela ou Ctrl+C"
echo ""
echo "════════════════════════════════════════"
echo ""

# Abre o navegador automaticamente após 1 segundo
(sleep 1 && open "http://localhost:8080/index.html#admin") &

# Inicia o servidor (fica rodando até você fechar)
python3 -m http.server 8080
