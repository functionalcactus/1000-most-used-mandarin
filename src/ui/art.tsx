/** Seal stamps (印章) and line icons. The seal is the app's one signature element:
 *  a finished day leaves a seal on the week strip; a finished run stamps 完. */

export function Seal({ char, size = 28, stamp = false, faded = false }: { char: string; size?: number; stamp?: boolean; faded?: boolean }) {
  return (
    <span
      class={`seal ${stamp ? 'seal-stamp' : ''} ${faded ? 'seal-faded' : ''}`}
      style={{ width: `${size}px`, height: `${size}px`, fontSize: `${size * 0.66}px` }}
      lang="zh-CN"
      aria-hidden="true"
    >
      {char}
    </span>
  )
}

type IconName = 'close' | 'speaker' | 'speakerOff' | 'today' | 'progress' | 'words' | 'settings' | 'check' | 'cross' | 'search' | 'chevron'

const PATHS: Record<IconName, string> = {
  close: 'M6 6l12 12M18 6L6 18',
  speaker: 'M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4zM15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11',
  speakerOff: 'M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4zM16 9.5l5 5M21 9.5l-5 5',
  today: 'M5 6.5h14v13H5zM5 10.5h14M9 4v4M15 4v4',
  progress: 'M5 5h5v5H5zM14 5h5v5h-5zM5 14h5v5H5zM14 14h5v5h-5z',
  words: 'M6 4.5h10.5a1.5 1.5 0 0 1 1.5 1.5v13.5H7.5A1.5 1.5 0 0 1 6 18zM6 18a1.5 1.5 0 0 1 1.5-1.5H18M9.5 8.5h5',
  settings: 'M5 7h9M18 7h1M5 17h3M12 17h7M14 5v4M8 15v4',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  cross: 'M7 7l10 10M17 7L7 17',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5L20 20',
  chevron: 'M9.5 6l6 6-6 6'
}

export function Icon({ name, size = 22, stroke = 1.8 }: { name: IconName; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" class="icon">
      <path d={PATHS[name]} fill="none" stroke="currentColor" stroke-width={stroke} stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  )
}
