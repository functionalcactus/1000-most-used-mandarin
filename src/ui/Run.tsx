import { useEffect, useRef, useState } from 'preact/hooks'
import {
  buildRun, completeRunDay, dueCards, markGrammarTaught, PRODUCTION,
  type Drill, type RunPlan, type Settings, type Step
} from '../lib/session'
import { db } from '../lib/db'
import { gradeFrom, gradeFromLadder, newCard, review, Rating } from '../lib/srs'
import { DrillView, TeachGrammar, TeachWord, type Answer } from './drills'
import { Icon, Seal } from './art'
import { gloss, type GlossLang } from '../lib/data'

type RunStep = Step | { type: 'retry'; drill: Drill }
type Stats = { done: number; correct: number; newWords: number; newGrammar: number; reviews: number }

export function Run({ settings, onExit, onSettings }: { settings: Settings; onExit: () => void; onSettings: (s: Settings) => void }) {
  const [plan, setPlan] = useState<RunPlan | null>(null)
  const [queue, setQueue] = useState<RunStep[]>([])
  const [i, setI] = useState(0)
  const [answered, setAnswered] = useState<Answer | null>(null)
  const [finished, setFinished] = useState(false)
  const [stats, setStats] = useState<Stats>({ done: 0, correct: 0, newWords: 0, newGrammar: 0, reviews: 0 })
  const [elapsed, setElapsed] = useState(0)
  const started = useRef(Date.now())
  const mistakes = useRef(new Map<string, number>())
  const retried = useRef(new Set<number>())
  const autoNext = useRef<ReturnType<typeof setTimeout> | null>(null)
  const budgetMs = settings.budget * 60_000

  useEffect(() => {
    buildRun(settings).then((p) => {
      setPlan(p)
      setQueue(p.steps)
      if (p.steps.length === 0) setFinished(true)
    })
    const t = setInterval(() => setElapsed(Date.now() - started.current), 1000)
    return () => clearInterval(t)
  }, [])

  const step = queue[i]
  const timeUp = elapsed >= budgetMs

  async function advance() {
    if (autoNext.current) clearTimeout(autoNext.current)
    autoNext.current = null
    setAnswered(null)
    let next = i + 1
    const over = Date.now() - started.current >= budgetMs
    // when time is up, finish the word being taught, then stop
    if (over && queue[next]?.type !== 'ladder') {
      await finish()
      return
    }
    if (next >= queue.length) {
      await finish()
      return
    }
    setI(next)
  }

  async function finish() {
    setFinished(true)
    await completeRunDay()
  }

  async function onAnswer(a: Answer) {
    setAnswered(a)
    const s = step
    setStats((st) => ({ ...st, done: st.done + 1, correct: st.correct + (a.correct ? 1 : 0) }))

    if (s.type === 'review') {
      const production = PRODUCTION.includes(s.drill.kind)
      const grade = a.close ? Rating.Hard : gradeFrom(a.correct, a.ms, production)
      await review(s.card, grade, s.drill.kind, a.ms, a.correct)
      setStats((st) => ({ ...st, reviews: st.reviews + 1 }))
    }
    if (s.type === 'ladder') {
      if (!a.correct) mistakes.current.set(s.item, (mistakes.current.get(s.item) || 0) + 1)
      if (s.last) {
        const facet = s.item.startsWith('w') ? 'rec' : 'gram'
        const card = newCard(s.item, facet)
        await db.cards.put(card)
        await review(card, gradeFromLadder(mistakes.current.get(s.item) || 0), 'ladder', a.ms, a.correct)
        if (facet === 'gram') {
          await markGrammarTaught()
          setStats((st) => ({ ...st, newGrammar: st.newGrammar + 1 }))
        } else setStats((st) => ({ ...st, newWords: st.newWords + 1 }))
      }
    }
    // a missed review or challenge comes back once at the end (not graded again)
    if (!a.correct && (s.type === 'review' || s.type === 'challenge') && !retried.current.has(i)) {
      retried.current.add(i)
      setQueue((q) => [...q, { type: 'retry', drill: s.drill }])
    }
    // right answers move on by themselves; misses wait for Continue so you can read the answer
    if (a.correct) autoNext.current = setTimeout(() => advanceRef.current(), 850)
  }
  const advanceRef = useRef(advance)
  advanceRef.current = advance

  if (!plan) return <div class="screen center"><p class="muted">Preparing today’s run…</p></div>
  if (finished) return <Wrap stats={stats} plan={plan} onExit={onExit} />

  const lang: GlossLang = settings.gloss
  const progress = Math.min(1, elapsed / budgetMs)
  const left = Math.max(0, Math.ceil((budgetMs - elapsed) / 1000))
  const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`

  return (
    <div class="screen run">
      <header class="run-top">
        <button class="icon-btn" onClick={() => (stats.done > 0 ? finish() : onExit())} aria-label="End run">
          <Icon name="close" size={20} />
        </button>
        <div class="timebar" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Time used">
          <div class="timebar-fill" style={{ width: `${progress * 100}%` }} />
        </div>
        <span class="clock" aria-label="Time left">{clock}</span>
        <button
          class={`icon-btn ${settings.sound ? '' : 'is-off'}`}
          aria-pressed={settings.sound}
          aria-label={settings.sound ? 'Sound on. Tap to switch listening to pinyin' : 'Sound off. Tap to turn listening back on'}
          onClick={() => onSettings({ ...settings, sound: !settings.sound })}
        >
          <Icon name={settings.sound ? 'speaker' : 'speakerOff'} size={18} />
        </button>
      </header>
      {!settings.sound && <p class="sound-note">Sound off: listening shows pinyin instead</p>}
      {timeUp && <div class="timeup">Time’s up. Finishing this one.</div>}

      <main class="run-body" key={i}>
        {step.type === 'teach-word' && <TeachWord word={step.word} lang={lang} onNext={advance} />}
        {step.type === 'teach-grammar' && <TeachGrammar grammar={step.grammar} lang={lang} onNext={advance} />}
        {(step.type === 'review' || step.type === 'ladder' || step.type === 'challenge' || step.type === 'retry') && (
          <>
            {step.type === 'retry' && <p class="retry-tag">One more try</p>}
            <DrillView drill={step.drill} lang={lang} onAnswer={onAnswer} answered={answered} sound={settings.sound} />
          </>
        )}
      </main>

      {answered && (
        <footer class={`feedback ${answered.correct ? 'ok' : 'no'}`} aria-live="polite">
          <span class="feedback-icon"><Icon name={answered.correct ? 'check' : 'cross'} size={20} stroke={2.4} /></span>
          <div class="feedback-text">
            <strong>{answered.correct ? 'Correct' : answered.close ? 'Check the tones' : 'Not quite'}</strong>
            {!answered.correct && 'drill' in step && <span>{answerLine(step.drill, lang)}</span>}
          </div>
          {!answered.correct && (
            <button class="btn btn-continue" onClick={advance} autoFocus>
              Continue
            </button>
          )}
        </footer>
      )}
    </div>
  )
}

function answerLine(d: Drill, lang: GlossLang): string {
  switch (d.kind) {
    case 'meaning':
    case 'listen':
    case 'pinyin':
      return `${d.word.hanzi.replace(/（|）/g, '')}  ${d.word.pinyin}  ${gloss(d.word, lang)}`
    case 'cloze':
      return d.ex.zh
    case 'builder':
      return d.ex.zh
    case 'gchoice':
      return d.ex.zh
  }
}

function Wrap({ stats, plan, onExit }: { stats: Stats; plan: RunPlan; onExit: () => void }) {
  const [tomorrow, setTomorrow] = useState<number | null>(null)
  useEffect(() => {
    const end = new Date()
    end.setDate(end.getDate() + 1)
    end.setHours(23, 59, 59)
    dueCards(end.getTime()).then((c) => setTomorrow(c.length))
  }, [])
  const acc = stats.done ? Math.round((stats.correct / stats.done) * 100) : 0
  const empty = stats.done === 0 && plan.steps.length === 0
  return (
    <div class="screen center wrap">
      {empty ? <Seal char="休" size={88} faded /> : <Seal char="完" size={88} stamp />}
      <h1>{empty ? 'Nothing due right now' : 'Today’s run is done'}</h1>
      {empty ? (
        <p class="muted">Every card is up to date. New reviews arrive tomorrow.</p>
      ) : (
        <dl class="wrap-stats">
          <div><dt>Answers</dt><dd>{stats.done}</dd></div>
          <div><dt>Correct</dt><dd>{acc}%</dd></div>
          <div><dt>New words</dt><dd>{stats.newWords}</dd></div>
          {stats.newGrammar > 0 && <div><dt>Grammar</dt><dd>{stats.newGrammar}</dd></div>}
        </dl>
      )}
      {tomorrow !== null && <p class="muted">Tomorrow: about {tomorrow} reviews.</p>}
      <button class="btn btn-primary" onClick={onExit}>
        Done
      </button>
    </div>
  )
}
