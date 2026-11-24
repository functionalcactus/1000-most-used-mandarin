"""Rebuild public/fonts/kai.woff2: LXGW WenKai (OFL), cut down to the characters the app uses.

Run after adding content with new characters:
  npm pack lxgw-wenkai-webfont@1.7.0 && tar xzf lxgw-wenkai-webfont-1.7.0.tgz   (in a temp folder)
  pip install fonttools brotli
  python3 scripts/build_font.py <path to the unpacked 'package' folder>
"""
import glob, os, re, sys
from fontTools.ttLib import TTFont
from fontTools import subset
from fontTools.merge import Merger

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
PKG = sys.argv[1]

chars = set('完今日学千字')
for f in glob.glob(os.path.join(ROOT, 'src', '**', '*.*'), recursive=True):
    if f.endswith(('.json', '.ts', '.tsx')):
        chars |= set(open(f, encoding='utf-8').read())
text = ''.join(sorted(c for c in chars if '　' <= c <= '鿿' or '＀' <= c <= '￯'))

css = open(os.path.join(PKG, 'lxgwwenkai-regular.css'), encoding='utf-8').read()
parts = []
for i, block in enumerate(re.findall(r'@font-face\s*\{(.*?)\}', css, re.S)):
    src = re.search(r"url\('\./files/([^']+)'", block).group(1)
    font = TTFont(os.path.join(PKG, 'files', src))
    cmap = font.getBestCmap()
    have = ''.join(c for c in text if ord(c) in cmap)
    if not have:
        continue
    opts = subset.Options()
    opts.layout_features = ['*']
    opts.notdef_outline = True
    s = subset.Subsetter(opts)
    s.populate(text=have)
    s.subset(font)
    font.flavor = None
    p = f'/tmp/kai-part{i}.ttf'
    font.save(p)
    parts.append(p)

merged = Merger().merge(parts)
merged.flavor = 'woff2'
out = os.path.join(ROOT, 'public', 'fonts', 'kai.woff2')
merged.save(out)
missing = [c for c in text if ord(c) not in merged.getBestCmap()]
print(f'{len(text)} characters, {os.path.getsize(out) // 1024} KB, missing: {"".join(missing) or "none"}')
