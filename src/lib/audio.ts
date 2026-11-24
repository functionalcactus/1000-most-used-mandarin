/** Mandarin text-to-speech using the device's own voice (works offline on iOS). */
let voice: SpeechSynthesisVoice | null = null

function chooseVoice() {
  const voices = speechSynthesis.getVoices()
  voice =
    voices.find((v) => v.lang === 'zh-CN' && /tingting|ting-ting|婷婷/i.test(v.name)) ||
    voices.find((v) => v.lang === 'zh-CN') ||
    voices.find((v) => v.lang.startsWith('zh')) ||
    null
}

export const ttsAvailable = () => typeof window !== 'undefined' && 'speechSynthesis' in window

if (ttsAvailable()) {
  chooseVoice()
  speechSynthesis.onvoiceschanged = chooseVoice
}

export function hasChineseVoice() {
  if (!ttsAvailable()) return false
  if (!voice) chooseVoice()
  return !!voice
}

let soundOn = true
/** Sound off: nothing plays by itself (taps on a speaker button still play). */
export function setSoundOn(on: boolean) {
  soundOn = on
  if (!on && ttsAvailable()) speechSynthesis.cancel()
}
export const isSoundOn = () => soundOn

/** Automatic playback (after answers, on new words): skipped when sound is off. */
export function speakAuto(text: string) {
  if (soundOn) speak(text)
}

/** Playback the learner asked for by tapping. */
export function speak(text: string, rate = 0.85) {
  if (!ttsAvailable()) return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text.replace(/（|）|\(|\)/g, ''))
  u.lang = 'zh-CN'
  if (voice) u.voice = voice
  u.rate = rate
  speechSynthesis.speak(u)
}
