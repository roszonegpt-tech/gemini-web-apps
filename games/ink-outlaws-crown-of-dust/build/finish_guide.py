#!/usr/bin/env python3
"""Crown of Dust - finish the guide renders: set the soundtrack to -14 LUFS with a peak ceiling, remux it into each master,
and make small web previews (YouTube 720p, TikTok 1080x1920) for the showcase page. Run after tests/render_trailer.cjs --film guide."""
import os, re, subprocess
D = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'build', 'guide'); os.chdir(D)
def run(a):
    r = subprocess.run(a, capture_output=True, text=True)
    if r.returncode: raise SystemExit('ffmpeg failed: ' + r.stderr[-400:])
    return r
def meas(af, src):
    e = run(['ffmpeg', '-hide_banner', '-nostats', '-i', src, '-af', af + ',ebur128=peak=true', '-f', 'null', '-']).stderr
    return float(re.findall(r'I:\s+(-?[\d.]+) LUFS', e)[-1]), float(re.findall(r'Peak:\s+(-?[\d.]+) dBFS', e)[-1])
chain = lambda g: 'alimiter=limit=0.5:level=false:attack=3:release=60,volume=%.2fdB,alimiter=limit=0.62:level=false:attack=1:release=40' % g
for fmt, name in [('yt', 'Crown_of_Dust_Guide_YouTube_1080p'), ('tt', 'Crown_of_Dust_Guide_TikTok_1080x1920')]:
    master, wav = name + '.mp4', 'soundtrack_%s.wav' % fmt
    if not os.path.exists(master): continue
    g = 0.0
    for _ in range(5):
        I, P = meas(chain(g), wav)
        if abs(I + 14) < 0.2: break
        g += (-14 - I) * 1.05
    run(['ffmpeg', '-y', '-loglevel', 'error', '-i', master, '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-af', chain(g), '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', 'tmp.mp4']); os.replace('tmp.mp4', master)
    web, vf, br = name + '_web.mp4', (['-vf', 'scale=1280:720:flags=lanczos'] if fmt == 'yt' else []), ('400k' if fmt == 'yt' else '1800k')
    run(['ffmpeg', '-y', '-loglevel', 'error', '-i', master, '-map', '0:v'] + vf + ['-c:v', 'libx264', '-preset', 'slow', '-b:v', br, '-pass', '1', '-passlogfile', 'x264_' + fmt, '-pix_fmt', 'yuv420p', '-an', '-f', 'mp4', '/dev/null'])
    run(['ffmpeg', '-y', '-loglevel', 'error', '-i', master, '-map', '0:v', '-map', '0:a'] + vf + ['-c:v', 'libx264', '-preset', 'slow', '-b:v', br, '-pass', '2', '-passlogfile', 'x264_' + fmt, '-pix_fmt', 'yuv420p', '-af', 'volume=-3dB', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', web])
    for f in (master, web):
        I, P = meas('anull', f); print('%-48s %6.2f MB  %.1f LUFS  peak %.1f dBFS' % (f, os.path.getsize(f) / 1e6, I, P))
for f in os.listdir('.'):
    if f.startswith('x264_'): os.remove(f)
