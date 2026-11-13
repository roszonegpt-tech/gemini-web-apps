#!/usr/bin/env python3
"""Crown of Dust - single-file build.

Inlines the stylesheet and every <script src> from index.html (in order) into one standalone HTML file:
    python3 build/build.py            -> build/Ink_Outlaws_Crown_of_Dust_v<version>.html
    python3 build/build.py --artifact -> build/artifact/ink-outlaws-crown-of-dust.html (a page fragment for an Artifact)
The output runs from anywhere (file://, email attachment, iPad Files app). The source tree stays the
deploy target for GitHub Pages; this file is the portable copy. Only the standard library is used.
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def read(rel):
    with open(os.path.join(ROOT, rel), encoding='utf-8') as f:
        return f.read()

def inline(html):
    """Inline the stylesheet and every <script src> of index.html, in order."""
    def css(m):
        return '<style>\n' + read(m.group(1)) + '\n</style>'
    def js(m):
        src = read(m.group(1)).replace('</script', '<\\/script')
        return '<script>\n/* ' + m.group(1) + ' */\n' + src + '\n</script>'
    html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', css, html)
    html = re.sub(r'<script src="([^"]+)"></script>', js, html)
    return html.replace('<script>\n/* src/core/boot.js */', '<script>window.CD.SINGLE = true;</script>\n<script>\n/* src/core/boot.js */', 1)

def check(html):
    if 'src=' in re.sub(r'<script>.*?</script>', '', html, flags=re.S):
        sys.exit('build: an external reference was left behind')

def main():
    version = re.search(r"CD\.VERSION = '([^']+)'", read('src/core/util.js')).group(1)
    html = inline(read('index.html')); check(html)
    if '--artifact' in sys.argv:
        # An Artifact page is a fragment: the publish step adds <!doctype>, <head> and <body>. Keep the title, the style and everything in the body.
        title = re.search(r'<title>(.*?)</title>', html, re.S).group(1)
        style = re.search(r'<style>.*?</style>', html, re.S).group(0)
        body = re.search(r'<body>\s*(.*?)\s*</body>', html, re.S).group(1)
        frag = '<title>%s</title>\n%s\n%s\n' % (title, style, body)
        out = os.path.join(ROOT, 'build', 'artifact', 'ink-outlaws-crown-of-dust.html'); os.makedirs(os.path.dirname(out), exist_ok=True)
    else:
        frag, out = html, os.path.join(ROOT, 'build', 'Ink_Outlaws_Crown_of_Dust_v%s.html' % version)
    with open(out, 'w', encoding='utf-8') as f:
        f.write(frag)
    print('wrote %s (%d KB)' % (os.path.relpath(out, ROOT), len(frag.encode('utf-8')) // 1024))

if __name__ == '__main__':
    main()
