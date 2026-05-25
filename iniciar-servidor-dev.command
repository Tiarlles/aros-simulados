#!/bin/bash
# AROS — servidor local DEV (testa mudanças em andamento do Claude).
# Duplo-clique no Finder pra ligar.
# Fecha a janela do Terminal pra desligar.
#
# Auto-detecta a worktree mais recente com mudanças não-commitadas e serve dela.
# Se não houver worktree ativa, serve da pasta principal (mesmo comportamento do
# iniciar-servidor.command).

cd "$(dirname "$0")"
ROOT_DIR="$(pwd)"

SERVE_DIR="$ROOT_DIR"
SOURCE_LABEL="pasta principal (main)"

# Procura a worktree mais recente com index.html modificado
if [ -d ".claude/worktrees" ]; then
  LATEST_WORKTREE=""
  LATEST_MTIME=0
  for WT in .claude/worktrees/*/; do
    [ -d "$WT" ] || continue
    [ -f "$WT/index.html" ] || continue
    # Pega mtime do index.html da worktree
    MTIME=$(stat -f %m "$WT/index.html" 2>/dev/null || echo 0)
    if [ "$MTIME" -gt "$LATEST_MTIME" ]; then
      LATEST_MTIME=$MTIME
      LATEST_WORKTREE="$WT"
    fi
  done

  if [ -n "$LATEST_WORKTREE" ]; then
    # Compara com mtime do index.html da pasta principal
    MAIN_MTIME=$(stat -f %m "$ROOT_DIR/index.html" 2>/dev/null || echo 0)
    if [ "$LATEST_MTIME" -gt "$MAIN_MTIME" ]; then
      SERVE_DIR="$ROOT_DIR/$LATEST_WORKTREE"
      WT_NAME=$(basename "$LATEST_WORKTREE")
      SOURCE_LABEL="worktree: $WT_NAME"
    fi
  fi
fi

cd "$SERVE_DIR"

echo ""
echo "════════════════════════════════════════"
echo "  AROS · servidor local DEV"
echo "════════════════════════════════════════"
echo ""
echo "  Servindo: $SOURCE_LABEL"
echo "  URL: http://localhost:8081/index.html"
echo "  Coord: http://localhost:8081/index.html#admin"
echo ""
echo "  Pra parar: feche esta janela ou Ctrl+C"
echo ""
echo "════════════════════════════════════════"
echo ""

# Abre o navegador automaticamente após 1 segundo
(sleep 1 && open "http://localhost:8081/index.html#admin") &

# Porta 8081 pra não conflitar com o iniciar-servidor.command (porta 8080).
# Assim você pode rodar os dois ao mesmo tempo e comparar.
python3 -m http.server 8081
