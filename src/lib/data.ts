import wordsJson from '../data/words.json'
import grammarJson from '../data/grammar.json'

export type Token = { t: string; py?: string; k?: [number, number] }
export type Example = { zh: string; en: string; th: string; tk: Token[] }
export type Word = {
  id: number
  level: number
  hanzi: string
  pinyin: string
  pos_en: string
  en: string
  sense?: string
  th?: string
  theme?: string
  ex?: Example[]
}
export type GrammarExample = Example & { focus: string; dis: string[] }
export type Grammar = {
  id: string
  level: number
  group: string
  title: string
  pattern: string
  note_en?: string
  note_th?: string
  ex?: GrammarExample[]
}

export const WORDS = wordsJson as Word[]
export const GRAMMAR = grammarJson as Grammar[]
export const WORD_BY_ID = new Map(WORDS.map((w) => [w.id, w]))
export const GRAMMAR_BY_ID = new Map(GRAMMAR.map((g) => [g.id, g]))

/** Hanzi as shown: optional parts in brackets are dropped (没（有） → 没有 shown as 没(有)). */
export const showHanzi = (w: Word) => w.hanzi.replace(/（/g, '(').replace(/）/g, ')')
export const plainHanzi = (w: Word) => w.hanzi.replace(/（|）/g, '')

/** Teaching order: HSK 1 by theme (useful clusters first), then HSK 2 and 3 in list order. */
const THEME_ORDER = [
  'phrases', 'people', 'numbers', 'function', 'question', 'time', 'food', 'places',
  'actions', 'describe', 'home', 'school', 'work', 'travel', 'shopping', 'things',
  'health', 'weather'
]
export const TEACH_ORDER: Word[] = [...WORDS].sort((a, b) => {
  if (a.level !== b.level) return a.level - b.level
  const ta = a.theme ? THEME_ORDER.indexOf(a.theme) : 99
  const tb = b.theme ? THEME_ORDER.indexOf(b.theme) : 99
  const ra = ta < 0 ? 98 : ta
  const rb = tb < 0 ? 98 : tb
  return ra - rb || a.id - b.id
})

/** Grammar patterns that have written content (teachable now). */
export const TEACHABLE_GRAMMAR = GRAMMAR.filter((g) => g.ex && g.ex.length > 0)

export type GlossLang = 'en' | 'th' | 'both'
export function gloss(w: Word, lang: GlossLang): string {
  if (lang === 'th') return w.th || w.en
  if (lang === 'both' && w.th) return `${w.en} · ${w.th}`
  return w.en
}
export function exGloss(e: { en: string; th: string }, lang: GlossLang): string {
  if (lang === 'th') return e.th || e.en
  if (lang === 'both') return `${e.en}\n${e.th}`
  return e.en
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
export const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]
