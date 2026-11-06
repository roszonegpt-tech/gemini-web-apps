#!/usr/bin/env bash
# Builds the free demo into build/demo/ (a complete static site, ready for itch.io or GitHub Pages).
#   tools/build_demo.sh
#   FULL_URL=https://store.example/get-em-billy tools/build_demo.sh   # adds a "GET THE FULL GAME" button
# The demo is the same index.html with DEMO switched on: 3 escort routes, 3 defend arenas, 8 defend waves,
# the first 3 breeds of each animal, and the other modes and the editor behind an upgrade screen.
# It saves under its own keys and cache name, so a demo and the full game can live on the same site.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=build/demo
URL="${FULL_URL:-}"
case "$URL" in
  "" | http://* | https://*) ;;
  *) echo "FULL_URL must start with http:// or https://" >&2; exit 1 ;;
esac
case "$URL" in *"'"* | *'\'* | *'"'*) echo "FULL_URL must not contain quotes or backslashes" >&2; exit 1 ;; esac
ESC=$(printf '%s' "$URL" | sed -e 's/[&|]/\\&/g')
RELAY="${RELAY_URL:-}"
case "$RELAY" in
  "" | http://* | https://*) ;;
  *) echo "RELAY_URL must start with http:// or https://" >&2; exit 1 ;;
esac
case "$RELAY" in *"'"* | *'\\'* | *'"'* | *' '*) echo "RELAY_URL must not contain quotes, spaces or backslashes" >&2; exit 1 ;; esac
RESC=$(printf '%s' "${RELAY%/}" | sed -e 's/[&|]/\\&/g')
rm -rf "$OUT"
mkdir -p "$OUT/assets/icons"
sed -e "s/^const DEMO = false;/const DEMO = true;/" \
    -e "s|^const FULL_GAME_URL = '';|const FULL_GAME_URL = '${ESC}';|" \
    -e "s|^const NET_RELAY = '';|const NET_RELAY = '${RESC}';|" \
    -e "s/goatGuardian/goatGuardianDemo/g" \
    -e "s|<title>Get em Billy</title>|<title>Get em Billy (Demo)</title>|" \
    -e 's|content="Get em Billy">|content="Get em Billy Demo">|' \
    index.html > "$OUT/index.html"
sed -e 's/"name": "Get em Billy"/"name": "Get em Billy (Demo)"/' -e 's/"short_name": "Get em Billy"/"short_name": "Billy Demo"/' manifest.webmanifest > "$OUT/manifest.webmanifest"
sed -e "s/get-em-billy-/get-em-billy-demo-/" sw.js > "$OUT/sw.js"
cp assets/icons/*.png "$OUT/assets/icons/"
touch "$OUT/.nojekyll"
grep -q "^const DEMO = true;" "$OUT/index.html" || { echo "demo flag was not set" >&2; exit 1; }
echo "Demo build: $OUT ($(du -h "$OUT/index.html" | cut -f1) page)"
