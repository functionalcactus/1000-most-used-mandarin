"""Build the app's data files from the sources in content/ and data/.

Usage: python3 scripts/build_data.py
Needs: pip install jieba pypinyin

Checks that every example sentence uses only words at or below its level,
then writes src/data/words.json and src/data/grammar.json.
Exits with an error if any sentence fails the check.
"""
import glob, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
sys.path.insert(0, HERE)
from hsklex import tokenize, forms  # noqa: E402

words = json.load(open(os.path.join(ROOT, 'data', 'hsk1-3_words.json'), encoding='utf-8'))
gindex = json.load(open(os.path.join(ROOT, 'data', 'grammar_index.json'), encoding='utf-8'))
by_id = {w['id']: w for w in words}
problems = []


def mark_target(tokens, word):
    """Mark where the practised word sits: k = [char offset, length] inside a token.
    Exact token match first; otherwise the word may sit inside a longer token (天 in 天气)."""
    fs = sorted(forms(word['hanzi']), key=len, reverse=True)
    for t in tokens:
        if t['t'] in fs:
            t['k'] = [0, len(t['t'])]
            return True
    for t in tokens:
        for f in fs:
            i = t['t'].find(f)
            if i >= 0:
                t['k'] = [i, len(f)]
                return True
    return False


# ---- word content: content/hsk{level}_*.txt ----
# line: id|en_short|th|theme|zh1|en1|th1|zh2|en2|th2
for path in sorted(glob.glob(os.path.join(ROOT, 'content', 'hsk[0-9]_*.txt'))):
    level = int(re.search(r'hsk(\d)_', path).group(1))
    for ln, line in enumerate(open(path, encoding='utf-8'), 1):
        line = line.strip()
        if not line:
            continue
        p = line.split('|')
        if len(p) != 10:
            problems.append((path, ln, 'expected 10 fields'))
            continue
        w = by_id[int(p[0])]
        w['en_short'], w['th'], w['theme'] = p[1], p[2], p[3]
        w['ex'] = []
        for zh, en, th in ((p[4], p[5], p[6]), (p[7], p[8], p[9])):
            toks = tokenize(zh, level)
            bad = [t['t'] for t in toks if t.get('bad')]
            if bad:
                problems.append((w['id'], zh, 'above level', bad))
            if not mark_target(toks, w):
                problems.append((w['id'], zh, 'target word not found as a token'))
            for t in toks:
                t.pop('bad', None)
            w['ex'].append({'zh': zh, 'en': en, 'th': th, 'tk': toks})

# ---- grammar content: content/grammar{level}.txt ----
# '#id|note_en|note_th' then 'ex|id|zh|en|th|focus|distractor1,distractor2'
gcontent = {}
for path in sorted(glob.glob(os.path.join(ROOT, 'content', 'grammar[0-9].txt'))):
    level = int(re.search(r'grammar(\d)', path).group(1))
    for line in open(path, encoding='utf-8'):
        line = line.rstrip('\n')
        if not line:
            continue
        if line.startswith('#'):
            gid, en, th = line[1:].split('|')
            gcontent[gid] = {'note_en': en, 'note_th': th, 'ex': []}
            continue
        _, gid, zh, en, th, focus, dis = line.split('|')
        toks = tokenize(zh, level)
        bad = [t['t'] for t in toks if t.get('bad')]
        if bad:
            problems.append((gid, zh, 'above level', bad))
        if focus not in zh:
            problems.append((gid, zh, 'focus missing', focus))
        for t in toks:
            t.pop('bad', None)
        gcontent[gid]['ex'].append({'zh': zh, 'en': en, 'th': th, 'focus': focus,
                                    'dis': dis.split(','), 'tk': toks})

grammar = []
for g in gindex:
    item = dict(g)
    if g['id'] in gcontent:
        item.update(gcontent[g['id']])
    grammar.append(item)

if problems:
    for p in problems:
        print('PROBLEM', p)
    sys.exit(f'{len(problems)} problems: fix the content before building')

out_words = []
for w in words:
    o = {k: w[k] for k in ('id', 'level', 'hanzi', 'pinyin', 'pos_en') }
    o['en'] = w.get('en_short') or w['en']
    for k in ('sense', 'th', 'theme', 'ex'):
        if w.get(k):
            o[k] = w[k]
    out_words.append(o)

os.makedirs(os.path.join(ROOT, 'src', 'data'), exist_ok=True)
json.dump(out_words, open(os.path.join(ROOT, 'src', 'data', 'words.json'), 'w', encoding='utf-8'),
          ensure_ascii=False, separators=(',', ':'))
json.dump(grammar, open(os.path.join(ROOT, 'src', 'data', 'grammar.json'), 'w', encoding='utf-8'),
          ensure_ascii=False, separators=(',', ':'))
full = sum(1 for w in out_words if 'ex' in w)
gfull = sum(1 for g in grammar if 'ex' in g)
print(f'words: {len(out_words)} ({full} with Thai + examples) · grammar: {len(grammar)} ({gfull} written)')
