import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { Drill } from '../lib/session'
import { tilesFor } from '../lib/session'
import { WORDS, exGloss, gloss, plainHanzi, sayWord, type GlossLang, type Grammar, type Word } from '../lib/data'
import { checkPinyin } from '../lib/pinyin'
import { hasChineseVoice, speakAuto } from '../lib/audio'
import { ExampleBlock, Hanzi, Pinyin, Sentence, SpeakButton } from './bits'

/** close = right letters, wrong tones (counts as a miss, graded Hard on reviews) */
export type Answer = { correct: boolean; close?: boolean; ms: number }
type Props = { drill: Drill; lang: GlossLang; onAnswer: (a: Answer) => void; answered: Answer | null; sound: boolean }

export function DrillView(p: Props) {
  const d = p.drill
  switch (d.kind) {
    case 'meaning':
      return <MeaningPick {...p} drill={d} />
    case 'listen':
      return <ListenPick {...p} drill={d} />
    case 'pinyin':
      return <PinyinType {...p} drill={d} />
    case 'cloze':
      return <Cloze {...p} drill={d} />
    case 'builder':
      return <Builder {...p} drill={d} />
    case 'gchoice':
      return <GrammarChoice {...p} drill={d} />
  }
}

function useTimer() {
  const start = useRef(performance.now())
  return () => Math.round(performance.now() - start.current)
}

function Options<T>({
  items, render, isRight, onPick, answered, chosen, cols = 1
}: {
  items: T[]
  render: (x: T) => preact.ComponentChildren
  isRight: (x: T) => boolean
  onPick: (x: T) => void
  answered: boolean
  chosen: T | null
  cols?: 1 | 2
}) {
  return (
    <div class={`options cols-${cols}`}>
      {items.map((x) => {
        let cls = 'option'
        if (answered && isRight(x)) cls += ' right'
        else if (answered && chosen === x) cls += ' wrong'
        return (
          <button class={cls} disabled={answered} onClick={() => onPick(x)}>
            {render(x)}
          </button>
        )
      })}
    </div>
  )
}

function MeaningPick({ drill, lang, onAnswer, answered }: Props & { drill: Extract<Drill, { kind: 'meaning' }> }) {
  const ms = useTimer()
  const [chosen, setChosen] = useState<Word | null>(null)
  return (
    <div class="drill">
      <p class="prompt-label">Choose the meaning</p>
      <div class="prompt-hanzi">
        <Hanzi word={drill.word} />
        {answered && <Pinyin text={drill.word.pinyin} />}
      </div>
      <Options
        items={drill.options}
        render={(w) => gloss(w, lang)}
        isRight={(w) => w.id === drill.word.id}
        answered={!!answered}
        chosen={chosen}
        onPick={(w) => {
          setChosen(w)
          speakAuto(sayWord(drill.word))
          onAnswer({ correct: w.id === drill.word.id, ms: ms() })
        }}
      />
    </div>
  )
}

function ListenPick({ drill, onAnswer, answered, sound }: Props & { drill: Extract<Drill, { kind: 'listen' }> }) {
  const ms = useTimer()
  const [chosen, setChosen] = useState<Word | null>(null)
  // sound off or no Chinese voice: show the pinyin instead of playing it
  const byEar = sound && hasChineseVoice()
  useEffect(() => {
    if (!byEar) return
    const t = setTimeout(() => speakAuto(sayWord(drill.word)), 250)
    return () => clearTimeout(t)
  }, [drill, byEar])
  return (
    <div class="drill">
      <p class="prompt-label">{byEar ? 'Choose the word you hear' : 'Choose the characters for this pinyin'}</p>
      {byEar ? (
        <div class="prompt-audio">
          <SpeakButton text={sayWord(drill.word)} big />
        </div>
      ) : (
        <div class="prompt-pinyin">
          <Pinyin text={drill.word.pinyin} />
        </div>
      )}
      <Options
        cols={2}
        items={drill.options}
        render={(w) => (
          <span class="opt-hanzi" lang="zh-CN">
            {plainHanzi(w)}
          </span>
        )}
        isRight={(w) => w.id === drill.word.id}
        answered={!!answered}
        chosen={chosen}
        onPick={(w) => {
          setChosen(w)
          onAnswer({ correct: w.id === drill.word.id, ms: ms() })
        }}
      />
    </div>
  )
}

function PinyinType({ drill, lang, onAnswer, answered }: Props & { drill: Extract<Drill, { kind: 'pinyin' }> }) {
  const ms = useTimer()
  const [value, setValue] = useState('')
  const [result, setResult] = useState<'correct' | 'tones' | 'wrong' | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const w = drill.word
  // words that share the same English meaning are also accepted
  const twins = useMemo(() => WORDS.filter((x) => x.en === w.en), [w])
  const chars = [...plainHanzi(w)].length
  useEffect(() => {
    input.current?.focus()
  }, [drill])
  const submit = (e: Event) => {
    e.preventDefault()
    if (answered || !value.trim()) return
    let best: 'correct' | 'tones' | 'wrong' = 'wrong'
    for (const t of twins) {
      const r = checkPinyin(value, t.pinyin)
      if (r === 'correct') {
        best = 'correct'
        break
      }
      if (r === 'tones') best = 'tones'
    }
    setResult(best)
    speakAuto(sayWord(w))
    onAnswer({ correct: best === 'correct', close: best === 'tones', ms: ms() })
  }
  return (
    <form class="drill" onSubmit={submit}>
      <p class="prompt-label">Type the pinyin, with tones</p>
      <div class="prompt-meaning">{gloss(w, lang)}</div>
      <p class="prompt-hint">
        {w.pos_en}, {chars} character{chars > 1 ? 's' : ''}
      </p>
      <input
        ref={input}
        class={`pinyin-input ${result ? 'is-' + result : ''}`}
        value={value}
        onInput={(e) => setValue((e.target as HTMLInputElement).value)}
        placeholder="e.g. ni3 hao3"
        autocomplete="off"
        autocapitalize="off"
        spellcheck={false}
        {...{ autocorrect: 'off' }}
        disabled={!!answered}
        enterkeyhint="done"
      />
      {result === 'tones' && <p class="notice">The sounds are right. Check the tones.</p>}
      {answered ? (
        <div class="reveal">
          <Hanzi word={w} size="lg" /> <Pinyin text={w.pinyin} />
        </div>
      ) : (
        <button class="btn btn-primary" type="submit" disabled={!value.trim()}>
          Check
        </button>
      )}
      <p class="prompt-hint small">Tone numbers: 1 ā, 2 á, 3 ǎ, 4 à. No number for neutral. Type ü as v.</p>
    </form>
  )
}

function Cloze({ drill, lang, onAnswer, answered }: Props & { drill: Extract<Drill, { kind: 'cloze' }> }) {
  const ms = useTimer()
  const [chosen, setChosen] = useState<string | null>(null)
  const idx = drill.ex.tk.findIndex((t) => t.k)
  const target = drill.ex.tk[idx].t
  return (
    <div class="drill">
      <p class="prompt-label">Fill the gap</p>
      <div class="prompt-sentence">
        {answered ? <Sentence ex={drill.ex} /> : <Sentence ex={drill.ex} blank={[idx, 0, [...target].length]} showPinyin={false} />}
      </div>
      <p class="prompt-translation">{exGloss(drill.ex, lang)}</p>
      <Options
        cols={2}
        items={drill.options}
        render={(o) => (
          <span class="opt-hanzi" lang="zh-CN">
            {o}
          </span>
        )}
        isRight={(o) => o === target}
        answered={!!answered}
        chosen={chosen}
        onPick={(o) => {
          setChosen(o)
          speakAuto(drill.ex.zh)
          onAnswer({ correct: o === target, ms: ms() })
        }}
      />
    </div>
  )
}

function GrammarChoice({ drill, lang, onAnswer, answered }: Props & { drill: Extract<Drill, { kind: 'gchoice' }> }) {
  const ms = useTimer()
  const [chosen, setChosen] = useState<string | null>(null)
  const { ex, grammar } = drill
  const at = ex.zh.indexOf(ex.focus)
  const masked = ex.zh.slice(0, at) + '＿＿' + ex.zh.slice(at + ex.focus.length)
  return (
    <div class="drill">
      <p class="prompt-label">{grammar.title}</p>
      <div class="prompt-sentence" lang="zh-CN">
        {answered ? <Sentence ex={ex} /> : <span class="sentence">{masked}</span>}
      </div>
      <p class="prompt-translation">{exGloss(ex, lang)}</p>
      <Options
        cols={2}
        items={drill.options}
        render={(o) => (
          <span class="opt-hanzi" lang="zh-CN">
            {o}
          </span>
        )}
        isRight={(o) => o === ex.focus}
        answered={!!answered}
        chosen={chosen}
        onPick={(o) => {
          setChosen(o)
          speakAuto(ex.zh)
          onAnswer({ correct: o === ex.focus, ms: ms() })
        }}
      />
    </div>
  )
}

function Builder({ drill, lang, onAnswer, answered }: Props & { drill: Extract<Drill, { kind: 'builder' }> }) {
  const ms = useTimer()
  // track tiles by index so repeated words work
  const [placed, setPlaced] = useState<number[]>([])
  const correctOrder = tilesFor(drill.ex)
  const full = placed.length === drill.tiles.length
  const built = placed.map((i) => drill.tiles[i]).join('')
  const ok = built === correctOrder.join('')
  const check = () => {
    speakAuto(drill.ex.zh)
    onAnswer({ correct: ok, ms: ms() })
  }
  return (
    <div class="drill">
      <p class="prompt-label">{drill.grammar ? drill.grammar.title : 'Build the sentence'}</p>
      <p class="prompt-translation big">{exGloss(drill.ex, lang)}</p>
      <div class={`build-line ${answered ? (answered.correct ? 'is-correct' : 'is-wrong') : ''}`} lang="zh-CN">
        {placed.length === 0 && <span class="build-placeholder">Tap the words in order</span>}
        {placed.map((i) => (
          <button class="tile placed" disabled={!!answered} onClick={() => setPlaced(placed.filter((x) => x !== i))}>
            {drill.tiles[i]}
          </button>
        ))}
      </div>
      <div class="tile-pool" lang="zh-CN">
        {drill.tiles.map((t, i) => (
          <button class={`tile ${placed.includes(i) ? 'used' : ''}`} disabled={placed.includes(i) || !!answered} onClick={() => setPlaced([...placed, i])}>
            {t}
          </button>
        ))}
      </div>
      {answered ? (
        !answered.correct && (
          <div class="reveal">
            <Sentence ex={drill.ex} />
          </div>
        )
      ) : (
        <button class="btn btn-primary" disabled={!full} onClick={check}>
          Check
        </button>
      )}
    </div>
  )
}

// ---------- teaching cards ----------
export function TeachWord({ word, lang, onNext }: { word: Word; lang: GlossLang; onNext: () => void }) {
  useEffect(() => {
    const t = setTimeout(() => speakAuto(sayWord(word)), 300)
    return () => clearTimeout(t)
  }, [word])
  return (
    <div class="drill teach">
      <p class="prompt-label">New word</p>
      <div class="teach-head">
        <Hanzi word={word} />
        <div class="teach-py">
          <Pinyin text={word.pinyin} />
          <SpeakButton text={sayWord(word)} />
        </div>
        <div class="teach-gloss">{word.en}</div>
        {word.th && lang !== 'en' && <div class="teach-gloss th">{word.th}</div>}
        <div class="teach-pos">{word.pos_en}</div>
      </div>
      {(word.ex || []).map((ex) => (
        <ExampleBlock ex={ex} lang={lang} />
      ))}
      <button class="btn btn-primary" onClick={onNext}>
        Got it
      </button>
    </div>
  )
}

export function TeachGrammar({ grammar, lang, onNext }: { grammar: Grammar; lang: GlossLang; onNext: () => void }) {
  return (
    <div class="drill teach">
      <p class="prompt-label">New grammar, HSK {grammar.level}</p>
      <h2 class="g-title">{grammar.title}</h2>
      <div class="g-pattern" lang="zh-CN">
        {grammar.pattern}
      </div>
      {lang !== 'th' && grammar.note_en && <p class="g-note">{grammar.note_en}</p>}
      {lang !== 'en' && grammar.note_th && <p class="g-note th">{grammar.note_th}</p>}
      {(grammar.ex || []).slice(0, 3).map((ex) => (
        <ExampleBlock ex={ex} lang={lang} />
      ))}
      <button class="btn btn-primary" onClick={onNext}>
        Got it
      </button>
    </div>
  )
}
