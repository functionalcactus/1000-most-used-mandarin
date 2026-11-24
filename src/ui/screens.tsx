import { useEffect, useMemo, useState } from 'preact/hooks'
import { db, exportAll, importAll, resetAll, type CardRow } from '../lib/db'
import { PLAN, dueCards, getStreak, saveSettings, syncUnlocks, today, weekStrip, type Budget, type Settings, type Streak } from '../lib/session'
import { TEACH_ORDER, WORDS, GRAMMAR, gloss, plainHanzi, type GlossLang, type Word } from '../lib/data'
import { hasChineseVoice, speak } from '../lib/audio'
import { setRetention } from '../lib/srs'
import { Icon, Seal } from './art'
import { ExampleBlock, Hanzi, LevelBadge, Pinyin, SpeakButton } from './bits'

// ---------- shared: word memory state ----------
export type MemState = 'unseen' | 'learning' | 'young' | 'mature'
const MEM_LABEL: Record<MemState, string> = { unseen: 'not started', learning: 'learning', young: 'getting there', mature: 'known' }
export function memState(c?: CardRow): MemState {
  if (!c) return 'unseen'
  if (c.stability >= 21) return 'mature'
  if (c.stability >= 7) return 'young'
  return 'learning'
}
export function useRecCards() {
  const [cards, setCards] = useState<Map<string, CardRow> | null>(null)
  useEffect(() => {
    db.cards.where('facet').equals('rec').toArray().then((rows) => setCards(new Map(rows.map((r) => [r.item, r]))))
  }, [])
  return cards
}

// ---------- Today ----------
type Day = Awaited<ReturnType<typeof weekStrip>>[number]

export function Today({ settings, onStart, onSettings }: { settings: Settings; onStart: (b: Budget) => void; onSettings: (s: Settings) => void }) {
  const [due, setDue] = useState<number | null>(null)
  const [streak, setStreak] = useState<Streak | null>(null)
  const [week, setWeek] = useState<Day[]>([])
  const [noVoice, setNoVoice] = useState(false)
  const cards = useRecCards()
  useEffect(() => {
    // voices load asynchronously on some browsers: check after a moment
    const t = setTimeout(() => setNoVoice(!hasChineseVoice()), 1500)
    syncUnlocks().then(() => dueCards().then((d) => setDue(new Set(d.map((c) => c.item)).size)))
    getStreak().then(setStreak)
    weekStrip().then(setWeek)
    return () => clearTimeout(t)
  }, [])
  const plan = PLAN[settings.budget]
  const catchUp = due !== null && due > plan.cap
  const nextWords = cards ? TEACH_ORDER.filter((w) => !cards.has('w' + w.id)).slice(0, catchUp ? 0 : plan.newWords) : []
  const first = nextWords[0]
  const doneToday = streak?.last === today()
  const known = (l: number) => (cards ? WORDS.filter((w) => w.level === l && isKnown(cards.get('w' + w.id))).length : 0)
  const totals = [1, 2, 3].map((l) => ({ level: l, known: known(l), all: WORDS.filter((w) => w.level === l).length }))
  const knownAll = totals.reduce((a, t) => a + t.known, 0)
  const dateLine = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div class="screen today">
      <header class="large-title">
        <p class="date-line">{dateLine}</p>
        <h1>Today</h1>
      </header>

      <section class="hero" aria-label="Today’s run">
        {doneToday ? (
          <div class="hero-word">
            <Seal char="完" size={72} />
            <p class="hero-meaning">Today’s run is done. Come back tomorrow, or practise a little more.</p>
          </div>
        ) : first ? (
          <div class="hero-word">
            <p class="hero-hanzi" lang="zh-CN">{plainHanzi(first)}</p>
            <p class="hero-meaning">
              <span class="hero-py">{first.pinyin}</span> {gloss(first, settings.gloss)}
            </p>
          </div>
        ) : (
          <div class="hero-word">
            <p class="hero-count">{due ?? 0}</p>
            <p class="hero-meaning">{catchUp ? 'reviews waiting. Today is a catch-up day: no new words until the pile is down.' : 'reviews waiting'}</p>
          </div>
        )}
        <p class="hero-plan">
          {nextWords.length} new {nextWords.length === 1 ? 'word' : 'words'}, {due ?? 0} {due === 1 ? 'review' : 'reviews'}
        </p>

        <div class="segmented" role="radiogroup" aria-label="Daily time">
          {([5, 10, 15, 20] as Budget[]).map((b) => (
            <button
              role="radio"
              aria-checked={settings.budget === b}
              class={settings.budget === b ? 'on' : ''}
              onClick={async () => {
                const s = { ...settings, budget: b }
                await saveSettings(s)
                onSettings(s)
              }}
            >
              {b} min
            </button>
          ))}
        </div>
        <button class={`btn ${doneToday ? 'btn-secondary' : 'btn-primary'} btn-block`} onClick={() => onStart(settings.budget)}>
          {doneToday ? 'Practise again' : 'Start today’s run'}
        </button>
      </section>

      <section class="group">
        <div class="group-head">
          <h2>This week</h2>
          <span class="muted">{streak?.count ? `${streak.count}-day streak` : 'No streak yet'}</span>
        </div>
        <ol class="week">
          {week.map((d) => (
            <li class={`${d.isToday ? 'is-today' : ''} ${d.future ? 'is-future' : ''}`} aria-label={`${d.key}${d.done ? ', done' : ''}`}>
              {d.done ? <Seal char={d.label} size={34} /> : <span class="day-empty" lang="zh-CN">{d.label}</span>}
            </li>
          ))}
        </ol>
      </section>

      <section class="group">
        <div class="group-head">
          <h2>Words known</h2>
          <span class="muted">{knownAll} of 1,000</span>
        </div>
        <ul class="levels">
          {totals.map((t) => (
            <li>
              <span>HSK {t.level}</span>
              <div class="meter" aria-hidden="true"><div style={{ width: `${(t.known / t.all) * 100}%` }} /></div>
              <span class="muted num">{t.known}/{t.all}</span>
            </li>
          ))}
        </ul>
      </section>

      {noVoice && (
        <p class="notice">
          No Chinese voice is installed, so listening drills are swapped for reading. To add one on iPhone: Settings, Accessibility, Spoken
          Content, Voices, Chinese.
        </p>
      )}
    </div>
  )
}

/** Counts as known: started and past the first few days, or marked known by placement. */
const isKnown = (c?: CardRow) => !!c && (c.stability >= 7 || !!c.seeded)

// ---------- Map ----------
export function MapView({ lang }: { lang: GlossLang }) {
  const cards = useRecCards()
  const [open, setOpen] = useState<Word | null>(null)
  if (!cards) return <div class="screen" />
  const count = (l: number, s: MemState) => WORDS.filter((w) => w.level === l && memState(cards.get('w' + w.id)) === s).length
  return (
    <div class="screen map">
      <header class="large-title"><h1>Progress</h1></header>
      <p class="muted">Each square is one word. Tap a square to open it.</p>
      <div class="legend">
        <span><i class="m-unseen" />not yet</span>
        <span><i class="m-learning" />learning</span>
        <span><i class="m-young" />getting there</span>
        <span><i class="m-mature" />known for 3+ weeks</span>
      </div>
      {[1, 2, 3].map((l) => (
        <section class="map-level">
          <h2>
            HSK {l} <small>{count(l, 'mature')} known, {count(l, 'young') + count(l, 'learning')} in progress</small>
          </h2>
          <div class="grid">
            {TEACH_ORDER.filter((w) => w.level === l).map((w) => (
              <button class={`cell m-${memState(cards.get('w' + w.id))}`} title={plainHanzi(w)} onClick={() => setOpen(w)} aria-label={plainHanzi(w)} />
            ))}
          </div>
        </section>
      ))}
      {open && <WordSheet word={open} lang={lang} card={cards.get('w' + open.id)} onClose={() => setOpen(null)} />}
    </div>
  )
}

// ---------- Library ----------
export function Library({ lang }: { lang: GlossLang }) {
  const cards = useRecCards()
  const [q, setQ] = useState('')
  const [level, setLevel] = useState(0)
  const [tab, setTab] = useState<'words' | 'grammar'>('words')
  const [open, setOpen] = useState<Word | null>(null)
  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return WORDS.filter(
      (w) =>
        (!level || w.level === level) &&
        (!s ||
          w.hanzi.includes(s) ||
          w.pinyin.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s/g, '').includes(s.replace(/\s/g, '')) ||
          w.en.toLowerCase().includes(s) ||
          (w.th || '').includes(s))
    )
  }, [q, level])
  return (
    <div class="screen library">
      <header class="large-title"><h1>Words</h1></header>
      <div class="seg">
        <button class={tab === 'words' ? 'on' : ''} onClick={() => setTab('words')}>Words</button>
        <button class={tab === 'grammar' ? 'on' : ''} onClick={() => setTab('grammar')}>Grammar</button>
      </div>
      {tab === 'words' ? (
        <>
          <input class="search" aria-label="Search words" placeholder="Search hanzi, pinyin, English or Thai" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
          <div class="chips small">
            {[0, 1, 2, 3].map((l) => (
              <button class={`chip ${level === l ? 'on' : ''}`} onClick={() => setLevel(l)}>
                {l ? `HSK ${l}` : 'All'}
              </button>
            ))}
          </div>
          <ul class="word-list">
            {list.slice(0, 300).map((w) => (
              <li>
                <button onClick={() => setOpen(w)}>
                  <i class={`dot m-${memState(cards?.get('w' + w.id))}`} />
                  <span class="wl-hanzi" lang="zh-CN">{plainHanzi(w)}</span>
                  <span class="wl-py">{w.pinyin}</span>
                  <span class="wl-gloss">{gloss(w, lang)}</span>
                </button>
              </li>
            ))}
            {list.length > 300 && <li class="muted">Showing 300 of {list.length}. Search to narrow down.</li>}
          </ul>
        </>
      ) : (
        <GrammarList lang={lang} />
      )}
      {open && <WordSheet word={open} lang={lang} card={cards?.get('w' + open.id)} onClose={() => setOpen(null)} />}
    </div>
  )
}

function GrammarList({ lang }: { lang: GlossLang }) {
  const [openId, setOpenId] = useState<string | null>(null)
  return (
    <ul class="grammar-list">
      {GRAMMAR.map((g) => (
        <li class={g.ex ? '' : 'later'}>
          <button onClick={() => g.ex && setOpenId(openId === g.id ? null : g.id)}>
            <LevelBadge level={g.level} />
            <span class="gl-title">{g.title}</span>
            {!g.ex && <span class="muted small">coming soon</span>}
          </button>
          {openId === g.id && (
            <div class="gl-body">
              <div class="g-pattern" lang="zh-CN">{g.pattern}</div>
              {lang !== 'th' && <p class="g-note">{g.note_en}</p>}
              {lang !== 'en' && <p class="g-note th">{g.note_th}</p>}
              {g.ex!.map((ex) => <ExampleBlock ex={ex} lang={lang} />)}
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

export function WordSheet({ word, lang, card, onClose }: { word: Word; lang: GlossLang; card?: CardRow; onClose: () => void }) {
  useEffect(() => speak(plainHanzi(word)), [word])
  const due = card ? new Date(card.due) : null
  return (
    <div class="sheet-backdrop" onClick={onClose}>
      <div class="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button class="icon-btn sheet-close" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
        <div class="teach-head">
          <Hanzi word={word} />
          <div class="teach-py">
            <Pinyin text={word.pinyin} />
            <SpeakButton text={plainHanzi(word)} />
          </div>
          <div class="teach-gloss">{word.en}</div>
          {word.th && <div class="teach-gloss th">{word.th}</div>}
          <div class="teach-pos">
            <LevelBadge level={word.level} /> {word.pos_en}
          </div>
        </div>
        {(word.ex || []).map((ex) => <ExampleBlock ex={ex} lang={lang} />)}
        {!word.ex && <p class="muted">Example sentences for HSK {word.level} are coming in a later update.</p>}
        <p class="muted small">
          {card ? `Memory: ${MEM_LABEL[memState(card)]}. Next review ${due!.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}.` : 'Not started yet.'}
        </p>
      </div>
    </div>
  )
}

// ---------- Settings ----------
export function SettingsView({ settings, onSettings, onRetakePlacement }: { settings: Settings; onSettings: (s: Settings) => void; onRetakePlacement: () => void }) {
  const [msg, setMsg] = useState('')
  const set = async (patch: Partial<Settings>) => {
    const s = { ...settings, ...patch }
    await saveSettings(s)
    if (patch.retention) setRetention(patch.retention)
    onSettings(s)
  }
  const doExport = async () => {
    const blob = new Blob([await exportAll()], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `qian-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    setMsg('Backup saved. Keep it in Files or iCloud Drive.')
  }
  const doImport = async (e: Event) => {
    const f = (e.target as HTMLInputElement).files?.[0]
    if (!f) return
    try {
      await importAll(await f.text())
      setMsg('Backup restored. Reloading…')
      setTimeout(() => location.reload(), 800)
    } catch (err) {
      setMsg(String((err as Error).message))
    }
  }
  return (
    <div class="screen settings">
      <header class="large-title"><h1>Settings</h1></header>
      <section>
        <h2>Daily time</h2>
        <div class="chips">
          {([5, 10, 15, 20] as Budget[]).map((b) => (
            <button class={`chip ${settings.budget === b ? 'on' : ''}`} onClick={() => set({ budget: b })}>{b} min</button>
          ))}
        </div>
        <p class="muted small">
          {PLAN[settings.budget].newWords} new words a day, a grammar pattern every {PLAN[settings.budget].grammarEvery === 1 ? 'day' : `${PLAN[settings.budget].grammarEvery} days`}, up to {PLAN[settings.budget].cap} reviews.
        </p>
      </section>
      <section>
        <h2>Meanings</h2>
        <div class="chips">
          {(['en', 'th', 'both'] as GlossLang[]).map((l) => (
            <button class={`chip ${settings.gloss === l ? 'on' : ''}`} onClick={() => set({ gloss: l })}>
              {l === 'en' ? 'English' : l === 'th' ? 'ไทย' : 'Both'}
            </button>
          ))}
        </div>
        <p class="muted small">Thai meanings are available for HSK 1 so far; other levels show English.</p>
      </section>
      <section>
        <h2>Memory target</h2>
        <div class="chips">
          {[0.85, 0.9, 0.95].map((r) => (
            <button class={`chip ${settings.retention === r ? 'on' : ''}`} onClick={() => set({ retention: r })}>{Math.round(r * 100)}%</button>
          ))}
        </div>
        <p class="muted small">Higher means more reviews and better recall. 90% is the usual sweet spot.</p>
      </section>
      <section>
        <h2>Audio</h2>
        <button class="btn btn-secondary" onClick={() => speak('你好，我们开始学习吧！')}>Test the voice</button>
      </section>
      <section>
        <h2>Backup</h2>
        <p class="muted small">Your progress lives only on this phone. Save a backup now and then.</p>
        <div class="row">
          <button class="btn btn-secondary" onClick={doExport}>Save backup</button>
          <label class="btn btn-secondary">
            Restore
            <input type="file" accept="application/json,.json" hidden onChange={doImport} />
          </label>
        </div>
      </section>
      <section>
        <h2>Start over</h2>
        <div class="row">
          <button class="btn btn-ghost" onClick={onRetakePlacement}>Retake placement</button>
          <button
            class="btn btn-ghost danger"
            onClick={async () => {
              if (confirm('Erase all progress on this phone? This cannot be undone.')) {
                await resetAll()
                location.reload()
              }
            }}
          >
            Erase everything
          </button>
        </div>
      </section>
      {msg && <p class="note">{msg}</p>}
      <p class="muted small credits">Word list from the official HSK 3.0 syllabus, levels 1–3. Chinese typeface: LXGW WenKai (SIL Open Font License).<br />Version {__BUILD__}</p>
    </div>
  )
}
