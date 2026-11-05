#!/usr/bin/env bash
# Builds build/trailer/get-em-billy-trailer.mp4 (1080p, ~65 s, with a synthesized soundtrack).
# Needs Node + Playwright (Chromium) and ffmpeg.
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT=build/trailer
mkdir -p "$OUT"
node tools/trailer/record.js "$OUT"
node tools/trailer/render_audio.js "$OUT"
read START TOTAL < <(python3 -c "import json;d=json.load(open('$OUT/trailer_cut.json'));print(d['start'],d['total'])")
FO=$(python3 -c "print($TOTAL-1.0)")
ffmpeg -v error -y -ss "$START" -i "$OUT/trailer_raw.webm" -i "$OUT/trailer_audio.wav" -t "$TOTAL" -map 0:v -map 1:a \
  -vf "fps=30,fade=t=in:st=0:d=0.4,fade=t=out:st=$FO:d=1.0" \
  -af "afade=t=in:st=0:d=0.3,afade=t=out:st=$FO:d=1.0,loudnorm=I=-14:TP=-1.5:LRA=11" \
  -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -c:a aac -b:a 192k -ar 44100 -movflags +faststart \
  "$OUT/get-em-billy-trailer.mp4"
echo "Trailer: $OUT/get-em-billy-trailer.mp4"
