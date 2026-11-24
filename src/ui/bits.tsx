import type { ComponentChildren } from 'preact'
import { hanziTones, syllabify } from '../lib/pinyin'
import { speak, ttsAvailable } from '../lib/audio'
import type { Example, GlossLang, Word } from '../lib/data'
import { exGloss, showHanzi } from '../lib/data'
import { Icon } from './art'

export function Hanzi({ word, size = 'xl' }: { word: Word; size?: 'xl' | 'lg' | 'md' }) {
  const text = showHanzi(word)
  const tones = hanziTones(word.hanzi, word.pinyin)
  let ti = 0
  return (
    <span class={`hanzi hanzi-${size}`} lang="zh-CN">
      {[...text].map((c) => {
        if (c === '(' || c === ')') return <span class="opt">{c}</span>
        const t = tones[ti++] ?? 5
        return <span class={`t${t}`}>{c}</span>
      })}
    </span>
  )
}

export function Pinyin({ text }: { text: string }) {
  return (
    <span class="pinyin">
      {syllabify(text.replace(/[()]/g, '')).map((s) => (
        <span class={`t${s.tone}`}>{s.text}</span>
      ))}
    </span>
  )
}

export function SpeakButton({ text, big }: { text: string; big?: boolean }) {
  if (!ttsAvailable()) return null
  return (
    <button class={`speak ${big ? 'speak-big' : ''}`} onClick={() => speak(text)} aria-label="Play audio">
      <Icon name="speaker" size={big ? 34 : 20} />
    </button>
  )
}

/** A sentence with each word's pinyin above it (ruby). */
export function Sentence({ ex, blank, showPinyin = true }: { ex: Example; blank?: [number, number, number]; showPinyin?: boolean }) {
  return (
    <span class="sentence" lang="zh-CN">
      {ex.tk.map((t, i) => {
        if (blank && blank[0] === i) {
          const before = t.t.slice(0, blank[1])
          const after = t.t.slice(blank[1] + blank[2])
          return (
            <span>
              {before}
              <span class="blank">＿＿</span>
              {after}
            </span>
          )
        }
        if (!t.py || !showPinyin) return <span>{t.t}</span>
        return (
          <ruby>
            {t.t}
            <rt>{t.py}</rt>
          </ruby>
        )
      })}
    </span>
  )
}

export function ExampleBlock({ ex, lang }: { ex: Example; lang: GlossLang }) {
  return (
    <div class="example">
      <div class="example-zh">
        <Sentence ex={ex} />
        <SpeakButton text={ex.zh} />
      </div>
      <div class="example-gloss">{exGloss(ex, lang)}</div>
    </div>
  )
}

export function Card({ children, class: cls = '' }: { children: ComponentChildren; class?: string }) {
  return <div class={`card ${cls}`}>{children}</div>
}

export function LevelBadge({ level }: { level: number }) {
  return <span class={`badge badge-l${level}`}>HSK {level}</span>
}
