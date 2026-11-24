import json,re,jieba,logging
jieba.setLogLevel(logging.ERROR)
from pypinyin import pinyin, Style
import os
W=json.load(open(os.path.join(os.path.dirname(__file__),'..','data','hsk1-3_words.json'),encoding='utf-8'))
PROPER={'北京':'Běijīng','上海':'Shànghǎi','小明':'Xiǎomíng','小白':'Xiǎobái','杯':'bēi'}
PUNCT=set('，。？！、：；“”‘’（）…—· ')
def forms(h):
    if '（' in h: return {re.sub(r'（[^）]*）','',h), h.replace('（','').replace('）','')}
    return {h}
lex={}
for w in W:
    for f in forms(w['hanzi']):
        p=w['pinyin']
        if '(' in p: p=re.sub(r'[()]','',p) if f==w['hanzi'].replace('（','').replace('）','') else re.sub(r'\([^)]*\)','',p)
        if f not in lex or w['level']<lex[f][0]: lex[f]=(w['level'],p)
_inited=None
def init(maxlvl):
    global _inited
    if _inited==maxlvl: return
    for f in lex: jieba.add_word(f,freq=2000000 if lex[f][0]<=maxlvl else 5)
    for f in PROPER: jieba.add_word(f,freq=2000000)
    _inited=maxlvl
def ok_token(t,maxlvl):
    if t in PROPER: return True
    if t in lex and lex[t][0]<=maxlvl: return True
    if re.fullmatch(r'\d+',t): return True
    if all(c in '一二三四五六七八九十百千零两' for c in t): return True
    return False
def split_ok(t,maxlvl):
    n=len(t); best=[None]*(n+1); best[0]=[]
    for i in range(n):
        if best[i] is None: continue
        for j in range(i+1,n+1):
            if best[j] is None and ok_token(t[i:j],maxlvl): best[j]=best[i]+[t[i:j]]
    return best[n]
def tokenize(zh,maxlvl):
    init(maxlvl); toks=[]
    for t in jieba.cut(zh):
        if all(c in PUNCT for c in t): toks.append({'t':t}); continue
        if ok_token(t,maxlvl): toks.append({'t':t}); continue
        sp=split_ok(t,maxlvl)
        if sp: toks+=[{'t':s} for s in sp]; continue
        toks.append({'t':t,'bad':1})
    for x in toks:
        t=x['t']
        if t in lex: x['py']=lex[t][1]
        elif t in PROPER: x['py']=PROPER[t]
        elif not all(c in PUNCT for c in t): x['py']=''.join(p[0] for p in pinyin(t,style=Style.TONE))
    return toks
