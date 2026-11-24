import { db, getKV, setKV, type CardRow } from './db'
import {
  GRAMMAR_BY_ID, TEACH_ORDER, TEACHABLE_GRAMMAR, WORDS, WORD_BY_ID, pick, shuffle,
  type Example, type Grammar, type GrammarExample, type GlossLang, type Word
} from './data'
import { newCard, cardId } from './srs'

// ---------- settings ----------
export type Budget = 5 | 10 | 15 | 20
export type Settings = { budget: Budget; gloss: GlossLang; retention: number; sound: boolean }
export const DEFAULT_SETTINGS: Settings = { budget: 5, gloss: 'both', retention: 0.9, sound: true }
export const getSettings = async () => ({ ...DEFAULT_SETTINGS, ...(await getKV<Partial<Settings>>('settings', {})) })
export const saveSettings = (s: Settings) => setKV('settings', s)

export const PLAN: Record<Budget, { newWords: number; grammarEvery: number; cap: number; challenge: number }> = {
  5: { newWords: 3, grammarEvery: 4, cap: 35, challenge: 0 },
  10: { newWords: 6, grammarEvery: 3, cap: 70, challenge: 2 },
  15: { newWords: 9, grammarEvery: 2, cap: 100, challenge: 3 },
  20: { newWords: 12, grammarEvery: 1, cap: 130, challenge: 3 }
}

export const today = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b + 'T00:00').getTime() - new Date(a + 'T00:00').getTime()) / 86_400_000)

// ---------- drills ----------
export type Drill =
  | { kind: 'meaning'; word: Word; options: Word[] }
  | { kind: 'listen'; word: Word; options: Word[] }
  | { kind: 'pinyin'; word: Word }
  | { kind: 'cloze'; word: Word; ex: Example; options: string[] }
  | { kind: 'builder'; ex: Example; tiles: string[]; word?: Word; grammar?: Grammar }
  | { kind: 'gchoice'; grammar: Grammar; ex: GrammarExample; options: string[] }

export const PRODUCTION: Drill['kind'][] = ['pinyin', 'builder']

export type Step =
  | { type: 'review'; card: CardRow; drill: Drill }
  | { type: 'teach-word'; word: Word }
  | { type: 'teach-grammar'; grammar: Grammar }
  | { type: 'ladder'; item: string; drill: Drill; last: boolean }
  | { type: 'challenge'; drill: Drill }

export type RunPlan = { steps: Step[]; dueCount: number; newWords: Word[]; newGrammar: Grammar | null; catchUp: boolean }

// ---------- helpers ----------
const soundOf = (w: Word) => w.pinyin.toLowerCase().replace(/[\s'’()]/g, '')

function distractorWords(w: Word, n = 3, differentSound = false): Word[] {
  const firstPos = w.pos_en.split(',')[0]
  const pool = WORDS.filter(
    (x) =>
      x.id !== w.id && x.level <= Math.max(w.level, 1) + 1 && x.en !== w.en && x.hanzi !== w.hanzi &&
      (!differentSound || soundOf(x) !== soundOf(w))
  )
  const samePos = shuffle(pool.filter((x) => x.pos_en.split(',')[0] === firstPos))
  const out: Word[] = []
  for (const x of [...samePos, ...shuffle(pool)]) {
    if (out.length >= n) break
    if (!out.includes(x)) out.push(x)
  }
  return out
}

/** Examples where the word is a whole token (so it can be blanked cleanly). */
const clozeExamples = (w: Word) =>
  (w.ex || []).filter((e) => e.tk.some((t) => t.k && t.k[0] === 0 && t.k[1] === [...t.t].length))

export function tilesFor(ex: Example): string[] {
  return ex.tk.filter((t) => !/^[，。？！、：；“”‘’…—·\s]+$/.test(t.t)).map((t) => t.t)
}

function builderDrill(ex: Example, extra: Partial<Extract<Drill, { kind: 'builder' }>> = {}): Drill | null {
  const tiles = tilesFor(ex)
  if (tiles.length < 3 || tiles.length > 9) return null
  let shuffled = shuffle(tiles)
  for (let i = 0; i < 5 && shuffled.join('') === tiles.join(''); i++) shuffled = shuffle(tiles)
  return { kind: 'builder', ex, tiles: shuffled, ...extra }
}

export function meaningDrill(w: Word): Drill {
  return { kind: 'meaning', word: w, options: shuffle([w, ...distractorWords(w)]) }
}
function listenDrill(w: Word): Drill {
  // never offer a word that sounds the same (是 / 事): it couldn't be told apart by ear
  return { kind: 'listen', word: w, options: shuffle([w, ...distractorWords(w, 3, true)]) }
}
function clozeDrill(w: Word): Drill | null {
  const exs = clozeExamples(w)
  if (!exs.length) return null
  const ex = pick(exs)
  const opts = distractorWords(w).map((x) => x.hanzi.replace(/（|）/g, ''))
  const target = ex.tk.find((t) => t.k)!.t
  return { kind: 'cloze', word: w, ex, options: shuffle([target, ...opts]) }
}
function grammarDrill(g: Grammar): Drill {
  const ex = pick(g.ex!)
  if (Math.random() < 0.5) {
    const b = builderDrill(ex, { grammar: g })
    if (b) return b
  }
  return { kind: 'gchoice', grammar: g, ex, options: shuffle([ex.focus, ...ex.dis]) }
}

export function drillForCard(card: CardRow): Drill {
  if (card.facet === 'gram') return grammarDrill(GRAMMAR_BY_ID.get(card.item.slice(1))!)
  const w = WORD_BY_ID.get(Number(card.item.slice(1)))!
  if (card.facet === 'lis') return listenDrill(w) // shown as audio, or as pinyin when sound is off
  if (card.facet === 'pro') return { kind: 'pinyin', word: w }
  if (card.stability >= 7 && Math.random() < 0.4) return clozeDrill(w) || meaningDrill(w)
  return meaningDrill(w)
}

/** Open the listening and production cards once recognition is stable enough. */
export async function syncUnlocks() {
  const rec = await db.cards.where('facet').equals('rec').toArray()
  const existing = new Set((await db.cards.where('facet').anyOf('lis', 'pro').primaryKeys()) as string[])
  const add: CardRow[] = []
  const now = Date.now()
  for (const c of rec) {
    if (c.stability >= 2 && !existing.has(cardId(c.item, 'lis'))) add.push(newCard(c.item, 'lis', now))
    if (c.stability >= 4 && !existing.has(cardId(c.item, 'pro'))) add.push(newCard(c.item, 'pro', now))
  }
  if (add.length) await db.cards.bulkPut(add)
}

export async function dueCards(now = Date.now()): Promise<CardRow[]> {
  return db.cards.where('due').belowOrEqual(now).toArray()
}

// ---------- the plan for today's run ----------
export async function buildRun(settings: Settings): Promise<RunPlan> {
  await syncUnlocks()
  const plan = PLAN[settings.budget]
  const due = (await dueCards()).sort((a, b) => a.due - b.due)

  // one card per item per run (sibling spacing)
  const seen = new Set<string>()
  const reviews: CardRow[] = []
  for (const c of due) {
    if (seen.has(c.item)) continue
    seen.add(c.item)
    reviews.push(c)
    if (reviews.length >= plan.cap) break
  }
  const catchUp = due.length > plan.cap

  // new words: next in teaching order without a recognition card
  const taught = new Set((await db.cards.where('facet').equals('rec').toArray()).map((c) => c.item))
  const newWords = catchUp ? [] : TEACH_ORDER.filter((w) => !taught.has('w' + w.id)).slice(0, plan.newWords)

  // new grammar: every N days, next written pattern not yet taught
  let newGrammar: Grammar | null = null
  if (!catchUp) {
    const last = await getKV<string | null>('lastGrammarDay', null)
    if (!last || daysBetween(last, today()) >= plan.grammarEvery) {
      const gTaught = new Set((await db.cards.where('facet').equals('gram').toArray()).map((c) => c.item))
      newGrammar = TEACHABLE_GRAMMAR.find((g) => !gTaught.has('g' + g.id)) || null
    }
  }

  const steps: Step[] = []
  for (const c of shuffle(reviews)) steps.push({ type: 'review', card: c, drill: drillForCard(c) })

  for (const w of newWords) {
    const item = 'w' + w.id
    steps.push({ type: 'teach-word', word: w })
    const ladder: Drill[] = [meaningDrill(w), { kind: 'pinyin', word: w }]
    const cz = clozeDrill(w)
    if (cz) ladder.push(cz)
    ladder.forEach((d, i) => steps.push({ type: 'ladder', item, drill: d, last: i === ladder.length - 1 }))
  }

  if (newGrammar) {
    const item = 'g' + newGrammar.id
    steps.push({ type: 'teach-grammar', grammar: newGrammar })
    const exs = shuffle(newGrammar.ex!)
    const d1: Drill = { kind: 'gchoice', grammar: newGrammar, ex: exs[0], options: shuffle([exs[0].focus, ...exs[0].dis]) }
    const d2 = builderDrill(exs[1] || exs[0], { grammar: newGrammar }) || d1
    steps.push({ type: 'ladder', item, drill: d1, last: false })
    steps.push({ type: 'ladder', item, drill: d2, last: true })
  }

  const chEx = shuffle(newWords.flatMap((w) => (w.ex || []).map((ex) => ({ ex, w }))))
  for (const { ex, w } of chEx.slice(0, plan.challenge)) {
    const d = builderDrill(ex, { word: w })
    if (d) steps.push({ type: 'challenge', drill: d })
  }

  return { steps, dueCount: due.length, newWords, newGrammar, catchUp }
}

/** Record that new items were taught today. */
export async function markGrammarTaught() {
  await setKV('lastGrammarDay', today())
}

// ---------- streak ----------
export type Streak = { count: number; last: string | null; freezes: number; freezeWeek: string | null }
const weekKey = (d = new Date()) => {
  const t = new Date(d)
  t.setDate(t.getDate() - ((t.getDay() + 6) % 7))
  return today(t)
}
export async function getStreak(): Promise<Streak> {
  const s = await getKV<Streak>('streak', { count: 0, last: null, freezes: 1, freezeWeek: weekKey() })
  if (s.freezeWeek !== weekKey()) {
    s.freezes = 1
    s.freezeWeek = weekKey()
  }
  // show a broken streak as 0 if more than one day was missed and no freeze covers it
  if (s.last) {
    const gap = daysBetween(s.last, today())
    if (gap > 2 || (gap === 2 && s.freezes < 1)) return { ...s, count: 0 }
  }
  return s
}
/** Days with a finished run (YYYY-MM-DD), newest last. */
export const getDaysDone = () => getKV<string[]>('daysDone', [])

/** The current week, Monday first, with whether each day has a finished run. */
export async function weekStrip() {
  const done = new Set(await getDaysDone())
  const now = new Date()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  return ['一', '二', '三', '四', '五', '六', '日'].map((label, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    const key = today(d)
    return { label, key, done: done.has(key), isToday: key === today(now), future: d > now && key !== today(now) }
  })
}

export async function completeRunDay() {
  const s = await getStreak()
  const t = today()
  const days = await getDaysDone()
  if (!days.includes(t)) await setKV('daysDone', [...days, t].slice(-120))
  if (s.last === t) return s
  const gap = s.last ? daysBetween(s.last, t) : 1
  let count = s.count
  if (gap === 1) count += 1
  else if (gap === 2 && s.freezes > 0) {
    count += 1
    s.freezes -= 1
  } else count = 1
  const next = { ...s, count, last: t }
  await setKV('streak', next)
  return next
}
