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

# ---- what the speech voice should say for each word ----
# A lone polyphonic character (还 hái / huán) is a guess for the voice, and it often guesses wrong.
# For those words, voice a stand-in character with ONE reading and the same sound and tone (还 hái -> 孩).
from pypinyin.pinyin_dict import pinyin_dict  # noqa: E402

def readings(ch):
    return pinyin_dict.get(ord(ch), '').split(',') if ord(ch) in pinyin_dict else []

# character frequencies from jieba's dictionary: stand-ins must be everyday characters
import jieba  # noqa: E402
freq = {}  # how often each character appears across all words in the dictionary
for line in open(os.path.join(os.path.dirname(jieba.__file__), 'dict.txt'), encoding='utf-8'):
    parts = line.split()
    if len(parts) >= 2:
        for ch in parts[0]:
            freq[ch] = freq.get(ch, 0) + int(parts[1])
TOP = 3000  # stand-ins come from the 3,000 most common characters
monophonic = {}
for ch, _ in sorted(freq.items(), key=lambda kv: -kv[1])[:TOP]:
    r = readings(ch)
    if len(r) == 1 and r[0] not in monophonic:
        monophonic[r[0]] = ch

NEUTRAL_SAY = {'de': '的'}  # 地 / 得 read as the particle de
say_for = {}
for w in words:
    h = re.sub(r'（[^）]*）', '', w['hanzi'])
    if len(h) != 1 or len(readings(h)) < 2:
        continue
    target = w['pinyin'].split('/')[0].strip()
    stand_in = monophonic.get(target) or NEUTRAL_SAY.get(target)
    if stand_in and stand_in != h:
        say_for[w['id']] = stand_in

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
    if w['id'] in say_for:
        o['say'] = say_for[w['id']]
    out_words.append(o)

os.makedirs(os.path.join(ROOT, 'src', 'data'), exist_ok=True)
json.dump(out_words, open(os.path.join(ROOT, 'src', 'data', 'words.json'), 'w', encoding='utf-8'),
          ensure_ascii=False, separators=(',', ':'))
json.dump(grammar, open(os.path.join(ROOT, 'src', 'data', 'grammar.json'), 'w', encoding='utf-8'),
          ensure_ascii=False, separators=(',', ':'))
full = sum(1 for w in out_words if 'ex' in w)
gfull = sum(1 for g in grammar if 'ex' in g)
print(f'words: {len(out_words)} ({full} with Thai + examples) · grammar: {len(grammar)} ({gfull} written) · voice stand-ins: {len(say_for)}')
