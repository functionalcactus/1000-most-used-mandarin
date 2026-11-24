import syllablesJson from '../data/syllables.json'

const SYLLABLES = new Set(syllablesJson as string[])

const MARKS: Record<string, [string, number]> = {}
const TABLE: [string, string][] = [
  ['a', 'āáǎà'], ['e', 'ēéěè'], ['i', 'īíǐì'], ['o', 'ōóǒò'], ['u', 'ūúǔù'], ['ü', 'ǖǘǚǜ']
]
for (const [base, marked] of TABLE) {
  ;[...marked].forEach((ch, i) => (MARKS[ch] = [base, i + 1]))
}

export type Syllable = { text: string; base: string; tone: number } // tone 5 = neutral

/** Split a tone-marked pinyin string (e.g. "diànyǐngyuàn", "bú kèqi") into syllables. */
export function syllabify(pinyin: string): Syllable[] {
  const out: Syllable[] = []
  for (const chunk of pinyin.split(/[\s'’·\-]+/).filter(Boolean)) {
    const chars = [...chunk]
    const bases = chars.map((c) => {
      const lower = c.toLowerCase()
      return MARKS[lower] ? MARKS[lower][0] : lower === 'v' ? 'ü' : lower
    })
    const n = chars.length
    // DP: best[i] = list of cut points covering chars[0..i)
    const best: (number[] | null)[] = Array(n + 1).fill(null)
    best[0] = []
    for (let i = 0; i < n; i++) {
      if (!best[i]) continue
      for (let j = Math.min(n, i + 7); j > i; j--) {
        const s = bases.slice(i, j).join('')
        const ok = SYLLABLES.has(s) || (s.endsWith('r') && SYLLABLES.has(s.slice(0, -1))) || s === 'r'
        if (ok && (!best[j] || best[j]!.length > best[i]!.length + 1)) best[j] = [...best[i]!, j]
      }
    }
    const cuts = best[n]
    if (!cuts) {
      out.push({ text: chunk, base: bases.join(''), tone: toneOf(chars) })
      continue
    }
    let start = 0
    for (const end of cuts) {
      const part = chars.slice(start, end)
      out.push({ text: part.join(''), base: bases.slice(start, end).join(''), tone: toneOf(part) })
      start = end
    }
  }
  return out
}

function toneOf(chars: string[]): number {
  for (const c of chars) {
    const m = MARKS[c.toLowerCase()]
    if (m) return m[1]
  }
  return 5
}

/** Map each hanzi character to a tone (for colouring), handling erhua 儿. */
export function hanziTones(hanzi: string, pinyin: string): number[] {
  const chars = [...hanzi.replace(/（|）|\(|\)/g, '')]
  const syl = syllabify(pinyin.replace(/[()]/g, ''))
  const tones: number[] = []
  let s = 0
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]
    if (c === '儿' && s > 0 && syl.length < chars.length && syl[s - 1]?.base.endsWith('r') && tones.length >= s) {
      tones.push(syl[s - 1].tone)
      continue
    }
    tones.push(syl[s]?.tone ?? 5)
    s++
  }
  return tones
}

type Parsed = { letters: string; tones: number[] }

/** Parse what the learner typed: tone numbers (ni3hao3) or tone marks (nǐhǎo). */
function parseInput(input: string): Parsed {
  const s = input.trim().toLowerCase().replace(/u:/g, 'ü').replace(/v/g, 'ü')
  const tones: number[] = []
  let letters = ''
  for (const ch of [...s]) {
    if (/[1-4]/.test(ch)) tones.push(Number(ch))
    else if (ch === '5' || ch === '0') continue
    else if (MARKS[ch]) {
      letters += MARKS[ch][0]
      tones.push(MARKS[ch][1])
    } else if (/[a-zü]/.test(ch)) letters += ch
  }
  return { letters, tones }
}

export type PinyinResult = 'correct' | 'tones' | 'wrong'

/**
 * Compare typed pinyin with the answer. Neutral tones may be left out.
 * 不 and 一 accept their dictionary tone or their changed tone.
 */
export function checkPinyin(input: string, answer: string): PinyinResult {
  // alternative readings, e.g. 谁 shéi/shuí: accept any of them
  if (answer.includes('/')) {
    const results = answer.split('/').map((a) => checkOne(input, a.trim()))
    return results.includes('correct') ? 'correct' : results.includes('tones') ? 'tones' : 'wrong'
  }
  return checkOne(input, answer)
}

function checkOne(input: string, answer: string): PinyinResult {
  const syl = syllabify(answer.replace(/[()]/g, ''))
  const target = syl.map((x) => x.base).join('')
  const got = parseInput(input)
  if (got.letters !== target) {
    // also accept the answer without optional bracketed part, e.g. 没(有)
    const alt = syllabify(answer.replace(/\([^)]*\)/g, ''))
    if (alt.map((x) => x.base).join('') !== got.letters) return 'wrong'
    return compareTones(got.tones, alt)
  }
  return compareTones(got.tones, syl)
}

function compareTones(tones: number[], syl: Syllable[]): PinyinResult {
  const toned = syl.filter((x) => x.tone !== 5)
  if (tones.length !== toned.length) return 'tones'
  for (let i = 0; i < toned.length; i++) {
    const t = toned[i]
    if (tones[i] === t.tone) continue
    if ((t.base === 'bu' || t.base === 'yi') && [1, 2, 4].includes(tones[i])) continue
    return 'tones'
  }
  return 'correct'
}
