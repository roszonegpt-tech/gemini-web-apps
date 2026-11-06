#!/usr/bin/env bash
# Builds a trailer with a synthesized soundtrack (1080p). Needs Node + Playwright (Chromium) and ffmpeg.
#   tools/trailer/make.sh          -> build/trailer/get-em-billy-trailer.mp4   (~69 s, every mode)
#   tools/trailer/make.sh billy    -> build/trailer-billy/billy-trailer.mp4    (~55 s, Billy + his theme)
#   tools/trailer/make.sh dogs     -> build/trailer-dogs/dogs-trailer.mp4      (~60 s, the ten farm dogs + their theme)
#   tools/trailer/make.sh billy tiktok | dogs tiktok | main tiktok
#                                  -> build/trailer-billy-tiktok/billy-trailer-tiktok.mp4 (1080x1920 portrait, 9:16, 30 fps,
#                                     H.264 + AAC; the game is recorded in a portrait window so the picture is laid out for it)
set -euo pipefail
cd "$(dirname "$0")/../.."
WHICH="${1:-main}"
FMT="${2:-}"
if [ "$WHICH" = "billy" ]; then OUT=build/trailer-billy; NAME=billy-trailer.mp4
elif [ "$WHICH" = "dogs" ]; then OUT=build/trailer-dogs; NAME=dogs-trailer.mp4
else OUT=build/trailer; NAME=get-em-billy-trailer.mp4; fi
EXTRA=""
if [ "$FMT" = "tiktok" ]; then OUT="$OUT-tiktok"; NAME="${NAME%.mp4}-tiktok.mp4"; EXTRA="-profile:v high -level 4.2"; fi
mkdir -p "$OUT"
node tools/trailer/record.js "$OUT" "$WHICH" "$FMT"
node tools/trailer/render_audio.js "$OUT" "$WHICH"
read START TOTAL < <(python3 -c "import json;d=json.load(open('$OUT/trailer_cut.json'));print(d['start'],d['total'])")
FO=$(python3 -c "print($TOTAL-1.0)")
ffmpeg -v error -y -ss "$START" -i "$OUT/trailer_raw.webm" -i "$OUT/trailer_audio.wav" -t "$TOTAL" -map 0:v -map 1:a \
  -vf "fps=30,fade=t=in:st=0:d=0.4,fade=t=out:st=$FO:d=1.0" \
  -af "afade=t=in:st=0:d=0.3,afade=t=out:st=$FO:d=1.0,loudnorm=I=-14:TP=-1.5:LRA=11" \
  -c:v libx264 $EXTRA -preset slow -crf 20 -pix_fmt yuv420p -c:a aac -b:a 192k -ar 44100 -movflags +faststart \
  "$OUT/$NAME"
echo "Trailer: $OUT/$NAME"
