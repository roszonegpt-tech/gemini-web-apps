#!/usr/bin/env python3
"""Crown of Dust - single-file build.

Inlines the stylesheet and every <script src> from index.html (in order) into one standalone HTML file:
    python3 build/build.py            -> build/Ink_Outlaws_Crown_of_Dust_v<version>.html
The output runs from anywhere (file://, email attachment, iPad Files app). The source tree stays the
deploy target for GitHub Pages; this file is the portable copy. Only the standard library is used.
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def read(rel):
    with open(os.path.join(ROOT, rel), encoding='utf-8') as f:
        return f.read()

def main():
    html = read('index.html')
    version = re.search(r"CD\.VERSION = '([^']+)'", read('src/core/util.js')).group(1)
    def css(m):
        return '<style>\n' + read(m.group(1)) + '\n</style>'
    def js(m):
        src = read(m.group(1)).replace('</script', '<\\/script')
        return '<script>\n/* ' + m.group(1) + ' */\n' + src + '\n</script>'
    html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', css, html)
    html = re.sub(r'<script src="([^"]+)"></script>', js, html)
    html = html.replace('<script>\n/* src/core/boot.js */', '<script>window.CD.SINGLE = true;</script>\n<script>\n/* src/core/boot.js */', 1)
    if 'src=' in re.sub(r'<script>.*?</script>', '', html, flags=re.S):
        sys.exit('build: an external reference was left behind')
    out = os.path.join(ROOT, 'build', 'Ink_Outlaws_Crown_of_Dust_v%s.html' % version)
    with open(out, 'w', encoding='utf-8') as f:
        f.write(html)
    print('wrote %s (%d KB)' % (os.path.relpath(out, ROOT), len(html.encode('utf-8')) // 1024))

if __name__ == '__main__':
    main()
