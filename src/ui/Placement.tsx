import { useMemo, useState } from 'preact/hooks'
import { WORDS, TEACHABLE_GRAMMAR, gloss, sayWord, shuffle, type GlossLang, type Word } from '../lib/data'
import { db, setKV } from '../lib/db'
import { seededCard } from '../lib/srs'
import { meaningDrill } from '../lib/session'
import { speakAuto } from '../lib/audio'
import { Seal } from './art'
import { Hanzi, Pinyin } from './bits'

/**
 * Placement: for each level, rate a sample of 20 words, then a quick check on some you said you know.
 *  - mostly known and checks pass → the whole level counts as known
 *  - mostly unknown → stop here; this level and above are taught from scratch
 *  - in between → go through the rest of this level word by word
 */
const SAMPLE = 20
const CHECKS = 6

type Phase =
  | { kind: 'intro' }
  | { kind: 'sample'; level: number; words: Word[]; i: number; known: Word[] }
  | { kind: 'check'; level: number; queue: Word[]; i: number; known: Word[]; passed: number; failed: Word[] }
  | { kind: 'triage'; level: number; words: Word[]; i: number; known: Word[]; sinceCheck: number }
  | { kind: 'spot'; level: number; word: Word; resume: Extract<Phase, { kind: 'triage' }> }
  | { kind: 'done' }

export function Placement({ lang, onDone }: { lang: GlossLang; onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'intro' })
  const [result, setResult] = useState<Record<number, number>>({}) // level -> known count
  const knownAll = useMemo(() => new Set<number>(), [])

  const levelWords = (l: number) => WORDS.filter((w) => w.level === l)

  function startLevel(level: number) {
    if (level > 3) return finishAll()
    setPhase({ kind: 'sample', level, words: shuffle(levelWords(level)).slice(0, SAMPLE), i: 0, known: [] })
  }

  async function finishAll() {
    const now = Date.now()
    const rows = [...knownAll].map((id) => seededCard('w' + id, 'rec', now))
    // grammar at levels fully known is seeded too
    const fullLevels = [1, 2, 3].filter((l) => levelWords(l).filter((w) => knownAll.has(w.id)).length >= levelWords(l).length * 0.85)
    for (const g of TEACHABLE_GRAMMAR) if (fullLevels.includes(g.level)) rows.push(seededCard('g' + g.id, 'gram', now))
    // never overwrite real progress when the test is retaken
    const existing = new Set((await db.cards.toCollection().primaryKeys()) as string[])
    await db.cards.bulkPut(rows.filter((r) => !existing.has(r.id)))
    await setKV('placementDone', true)
    setPhase({ kind: 'done' })
  }

  function markLevelKnown(level: number, except: Word[] = []) {
    const skip = new Set(except.map((w) => w.id))
    let n = 0
    for (const w of levelWords(level)) if (!skip.has(w.id)) {
      knownAll.add(w.id)
      n++
    }
    setResult((r) => ({ ...r, [level]: n }))
  }

  // ---------- views ----------
  if (phase.kind === 'intro')
    return (
      <div class="screen center placement">
        <p class="kai-hero" lang="zh-CN" aria-hidden="true">水平</p>
        <h1>Find your level</h1>
        <p class="muted">
          Takes 5–8 minutes. Tap I know it only when you know the meaning without guessing. Words you know come back as light
          reviews over the next few weeks, so nothing is skipped for good.
        </p>
        <button class="btn btn-primary" onClick={() => startLevel(1)}>
          Start
        </button>
        <button class="btn btn-ghost" onClick={async () => { await setKV('placementDone', true); onDone() }}>
          Skip, I’m starting from zero
        </button>
      </div>
    )

  if (phase.kind === 'sample') {
    const w = phase.words[phase.i]
    const rate = (k: boolean) => {
      const known = k ? [...phase.known, w] : phase.known
      if (phase.i + 1 < phase.words.length) return setPhase({ ...phase, i: phase.i + 1, known })
      if (known.length === 0) return endAt(phase.level, [])
      setPhase({ kind: 'check', level: phase.level, queue: shuffle(known).slice(0, CHECKS), i: 0, known, passed: 0, failed: [] })
    }
    return (
      <RateCard
        title={`HSK ${phase.level}`}
        progress={`${phase.i + 1} / ${phase.words.length}`}
        word={w}
        onRate={rate}
      />
    )
  }

  if (phase.kind === 'check') {
    const w = phase.queue[phase.i]
    return (
      <CheckCard
        key={`${phase.level}-${phase.i}`}
        title={`HSK ${phase.level} check`}
        word={w}
        lang={lang}
        onResult={(ok) => {
          const passed = phase.passed + (ok ? 1 : 0)
          const failed = ok ? phase.failed : [...phase.failed, w]
          if (phase.i + 1 < phase.queue.length) return setPhase({ ...phase, i: phase.i + 1, passed, failed })
          const estimate = (phase.known.length / SAMPLE) * (passed / phase.queue.length)
          const knownChecked = phase.known.filter((k) => !failed.includes(k))
          if (estimate >= 0.85) {
            markLevelKnown(phase.level, failed)
            startLevel(phase.level + 1)
          } else if (estimate <= 0.3) {
            endAt(phase.level, knownChecked)
          } else {
            knownChecked.forEach((k) => knownAll.add(k.id))
            const sampled = new Set(phase.known.map((k) => k.id).concat(failed.map((f) => f.id)))
            const rest = levelWords(phase.level).filter((x) => !sampled.has(x.id))
            if (rest.length === 0) endAt(phase.level, knownChecked)
            else setPhase({ kind: 'triage', level: phase.level, words: rest, i: 0, known: knownChecked, sinceCheck: 0 })
          }
        }}
      />
    )
  }

  if (phase.kind === 'triage') {
    const w = phase.words[phase.i]
    const done = (known: Word[]) => {
      known.forEach((k) => knownAll.add(k.id))
      setResult((r) => ({ ...r, [phase.level]: known.length }))
      const share = known.length / levelWords(phase.level).length
      if (share >= 0.6) startLevel(phase.level + 1)
      else finishAll()
    }
    return (
      <RateCard
        title={`HSK ${phase.level}, the rest`}
        progress={`${phase.i + 1} / ${phase.words.length}`}
        word={w}
        onRate={(k) => {
          const known = k ? [...phase.known, w] : phase.known
          const next = { ...phase, i: phase.i + 1, known, sinceCheck: k ? phase.sinceCheck + 1 : phase.sinceCheck }
          // every 10th "known" gets a quick meaning check
          if (k && next.sinceCheck >= 10) return setPhase({ kind: 'spot', level: phase.level, word: w, resume: { ...next, sinceCheck: 0 } })
          if (next.i >= phase.words.length) return done(known)
          setPhase(next)
        }}
        onStop={() => done(phase.known)}
      />
    )
  }

  if (phase.kind === 'spot')
    return (
      <CheckCard
        key={'spot' + phase.word.id}
        title={`HSK ${phase.level} check`}
        word={phase.word}
        lang={lang}
        onResult={(ok) => {
          const r = phase.resume
          const known = ok ? r.known : r.known.filter((k) => k.id !== phase.word.id)
          if (r.i >= r.words.length) {
            known.forEach((k) => knownAll.add(k.id))
            setResult((x) => ({ ...x, [phase.level]: known.length }))
            finishAll()
          } else setPhase({ ...r, known })
        }}
      />
    )

  // done
  const total = Object.values(result).reduce((a, b) => a + b, 0)
  return (
    <div class="screen center placement">
      <Seal char="定" size={88} stamp />
      <h1>Your starting point is set</h1>
      <p class="muted">
        {total > 0
          ? `You know about ${total} of the 1,000 words. They’ll come back as light reviews over the next few weeks.`
          : 'Starting from the first words of HSK 1.'}
      </p>
      <dl class="wrap-stats">
        {[1, 2, 3].map((l) => (
          <div><dt>HSK {l}</dt><dd>{result[l] || 0}</dd></div>
        ))}
      </dl>
      <button class="btn btn-primary" onClick={onDone}>
        Start learning
      </button>
    </div>
  )

  function endAt(level: number, known: Word[]) {
    known.forEach((k) => knownAll.add(k.id))
    setResult((r) => ({ ...r, [level]: known.length }))
    finishAll()
  }
}

function RateCard({ title, progress, word, onRate, onStop }: { title: string; progress: string; word: Word; onRate: (k: boolean) => void; onStop?: () => void }) {
  return (
    <div class="screen placement">
      <header class="pl-top">
        <span>{title}</span>
        <span class="muted">{progress}</span>
      </header>
      <div class="pl-word">
        <Hanzi word={word} />
      </div>
      <div class="pl-buttons">
        <button class="btn btn-secondary" onClick={() => onRate(false)}>
          Not yet
        </button>
        <button class="btn btn-primary" onClick={() => onRate(true)}>
          I know it
        </button>
      </div>
      {onStop && (
        <button class="btn btn-ghost" onClick={onStop}>
          Stop sorting and teach me the rest
        </button>
      )}
    </div>
  )
}

function CheckCard({ title, word, lang, onResult }: { title: string; word: Word; lang: GlossLang; onResult: (ok: boolean) => void }) {
  const drill = useMemo(() => meaningDrill(word) as Extract<ReturnType<typeof meaningDrill>, { kind: 'meaning' }>, [word])
  const [chosen, setChosen] = useState<Word | null>(null)
  return (
    <div class="screen placement">
      <header class="pl-top">
        <span>{title}</span>
      </header>
      <div class="pl-word">
        <Hanzi word={word} />
        {chosen && <Pinyin text={word.pinyin} />}
      </div>
      <div class="options cols-1">
        {drill.options.map((o) => {
          let cls = 'option'
          if (chosen && o.id === word.id) cls += ' right'
          else if (chosen === o) cls += ' wrong'
          return (
            <button
              class={cls}
              disabled={!!chosen}
              onClick={() => {
                setChosen(o)
                speakAuto(sayWord(word))
                setTimeout(() => onResult(o.id === word.id), 900)
              }}
            >
              {gloss(o, lang)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
