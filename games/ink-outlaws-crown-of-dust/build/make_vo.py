#!/usr/bin/env python3
"""Crown of Dust - narration for the guide video.

Reads trailer/guide_script.json and speaks every line with Piper (offline neural TTS) into build/guide/vo/<id>.wav,
then writes build/guide/vo/durations.json, which trailer/guide.js uses to time its shots.

Setup (once, outside the repo):
    python3 -m venv piper-venv && piper-venv/bin/pip install piper-tts
    curl -LO https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/norman/medium/en_US-norman-medium.onnx
    curl -LO https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/norman/medium/en_US-norman-medium.onnx.json
The "norman" voice is trained on LibriVox public-domain recordings (see its MODEL_CARD), so the narration can be used anywhere.

Run:  python3 build/make_vo.py --piper piper-venv/bin/piper --model en_US-norman-medium.onnx
"""
import argparse, json, os, subprocess, wave

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--piper', required=True); ap.add_argument('--model', required=True)
    a = ap.parse_args()
    script = json.load(open(os.path.join(ROOT, 'trailer', 'guide_script.json'), encoding='utf-8'))
    out = os.path.join(ROOT, 'build', 'guide', 'vo'); os.makedirs(out, exist_ok=True)
    dur = {}
    for line in script['lines']:
        wav = os.path.join(out, line['id'] + '.wav')
        subprocess.run([a.piper, '-m', a.model, '--length-scale', str(script.get('lengthScale', 1.0)), '--sentence-silence', '0.28', '-f', wav],
                       input=line['text'].encode('utf-8'), check=True, capture_output=True)
        with wave.open(wav) as w: dur[line['id']] = round(w.getnframes() / w.getframerate(), 3)
        print('%-4s %5.2fs  %s' % (line['id'], dur[line['id']], line['text'][:70]))
    json.dump(dur, open(os.path.join(out, 'durations.json'), 'w'), indent=1)
    for cut in ('yt', 'tt'):
        print(cut, 'narration total %.1fs' % sum(v for k, v in dur.items() if k[0] == cut[0]))

if __name__ == '__main__':
    main()
