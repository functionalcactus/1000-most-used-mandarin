import { useEffect, useRef, useState } from 'preact/hooks'
import {
  buildRun, completeRunDay, dueCards, markGrammarTaught, PRODUCTION,
  type Drill, type RunPlan, type Settings, type Step
} from '../lib/session'
import { db } from '../lib/db'
import { gradeFrom, gradeFromLadder, newCard, review, Rating } from '../lib/srs'
import { DrillView, TeachGrammar, TeachWord, type Answer } from './drills'
import { Bao, type Mood } from './art'
import { gloss, type GlossLang } from '../lib/data'

type RunStep = Step | { type: 'retry'; drill: Drill }
type Stats = { done: number; correct: number; newWords: number; newGrammar: number; reviews: number }

export function Run({ settings, onExit }: { settings: Settings; onExit: () => void }) {
  const [plan, setPlan] = useState<RunPlan | null>(null)
  const [queue, setQueue] = useState<RunStep[]>([])
  const [i, setI] = useState(0)
  const [answered, setAnswered] = useState<Answer | null>(null)
  const [mood, setMood] = useState<Mood>('idle')
  const [finished, setFinished] = useState(false)
  const [stats, setStats] = useState<Stats>({ done: 0, correct: 0, newWords: 0, newGrammar: 0, reviews: 0 })
  const [elapsed, setElapsed] = useState(0)
  const started = useRef(Date.now())
  const mistakes = useRef(new Map<string, number>())
  const retried = useRef(new Set<number>())
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
    setAnswered(null)
    setMood('idle')
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
    setMood(a.correct ? 'cheer' : 'oops')
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
    if (a.correct) setTimeout(() => setMood('idle'), 900)
  }

  if (!plan) return <div class="screen center"><Bao mood="wave" /><p>Getting today's run ready…</p></div>
  if (finished) return <Wrap stats={stats} plan={plan} onExit={onExit} />

  const lang: GlossLang = settings.gloss
  const progress = Math.min(1, elapsed / budgetMs)

  return (
    <div class="screen run">
      <header class="run-top">
        <button class="icon-btn" onClick={() => (stats.done > 0 ? finish() : onExit())} aria-label="End run">
          ✕
        </button>
        <div class="timebar">
          <div class="timebar-fill" style={{ width: `${progress * 100}%` }} />
        </div>
        <div class="run-bao">
          <Bao mood={mood} size={44} />
        </div>
      </header>
      {timeUp && <div class="timeup">Time's up — finishing this one</div>}

      <main class="run-body" key={i}>
        {step.type === 'teach-word' && <TeachWord word={step.word} lang={lang} onNext={advance} />}
        {step.type === 'teach-grammar' && <TeachGrammar grammar={step.grammar} lang={lang} onNext={advance} />}
        {(step.type === 'review' || step.type === 'ladder' || step.type === 'challenge' || step.type === 'retry') && (
          <>
            {step.type === 'retry' && <p class="retry-tag">One more try</p>}
            {step.type === 'challenge' && <p class="retry-tag">Sentence challenge</p>}
            <DrillView drill={step.drill} lang={lang} onAnswer={onAnswer} answered={answered} />
          </>
        )}
      </main>

      {answered && (
        <footer class={`feedback ${answered.correct ? 'ok' : 'no'}`}>
          <div class="feedback-text">
            <strong>{answered.correct ? pickPraise() : answered.close ? 'So close' : 'Not quite'}</strong>
            {!answered.correct && 'drill' in step && <span>{answerLine(step.drill, lang)}</span>}
          </div>
          <button class="btn btn-continue" onClick={advance} autoFocus>
            Continue
          </button>
        </footer>
      )}
    </div>
  )
}

const PRAISE = ['Nice!', 'Yes!', '很好！', 'Correct', 'Got it', '对！']
const pickPraise = () => PRAISE[Math.floor(Math.random() * PRAISE.length)]

function answerLine(d: Drill, lang: GlossLang): string {
  switch (d.kind) {
    case 'meaning':
    case 'listen':
    case 'pinyin':
      return `${d.word.hanzi.replace(/（|）/g, '')} · ${d.word.pinyin} · ${gloss(d.word, lang)}`
    case 'cloze':
      return d.ex.zh
    case 'builder':
      return d.ex.zh
    case 'gchoice':
      return `${d.ex.focus} — ${d.ex.zh}`
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
      <Bao mood={empty ? 'sleep' : 'cheer'} size={120} />
      <h1>{empty ? 'Nothing due right now' : 'Run complete'}</h1>
      {empty ? (
        <p class="muted">Everything is learned for today. Come back tomorrow.</p>
      ) : (
        <div class="wrap-stats">
          <div><b>{stats.done}</b><span>answers</span></div>
          <div><b>{acc}%</b><span>correct</span></div>
          <div><b>{stats.newWords}</b><span>new words</span></div>
          {stats.newGrammar > 0 && <div><b>{stats.newGrammar}</b><span>grammar</span></div>}
        </div>
      )}
      {tomorrow !== null && <p class="muted">Tomorrow: about {tomorrow} reviews waiting.</p>}
      <button class="btn btn-primary" onClick={onExit}>
        Back to today
      </button>
    </div>
  )
}
