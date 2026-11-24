/** Original artwork: "Bao", a steamed-bun mascot drawn in a 1930s rubber-hose style,
 *  and a soft watercolour hillside for the Today screen. */

export type Mood = 'idle' | 'cheer' | 'oops' | 'wave' | 'sleep'

export function Bao({ mood = 'idle', size = 96 }: { mood?: Mood; size?: number }) {
  const eyes =
    mood === 'sleep' ? (
      <g stroke="var(--ink)" stroke-width="3" fill="none" stroke-linecap="round">
        <path d="M38 62 q6 5 12 0" />
        <path d="M66 62 q6 5 12 0" />
      </g>
    ) : mood === 'oops' ? (
      <g stroke="var(--ink)" stroke-width="3.2" stroke-linecap="round">
        <path d="M39 57 l10 8 M49 57 l-10 8" />
        <path d="M67 57 l10 8 M77 57 l-10 8" />
      </g>
    ) : (
      <g>
        {/* pie-cut eyes */}
        <ellipse cx="44" cy="61" rx="5.5" ry="8" fill="var(--ink)" />
        <ellipse cx="72" cy="61" rx="5.5" ry="8" fill="var(--ink)" />
        <path d="M44 56 l3.5 -5 l-1 7 z" fill="var(--paper)" />
        <path d="M72 56 l3.5 -5 l-1 7 z" fill="var(--paper)" />
      </g>
    )
  const mouth =
    mood === 'cheer' ? (
      <path d="M48 74 q10 14 20 0 z" fill="var(--vermilion)" stroke="var(--ink)" stroke-width="2.5" stroke-linejoin="round" />
    ) : mood === 'oops' ? (
      <path d="M50 79 q8 -7 16 0" fill="none" stroke="var(--ink)" stroke-width="3" stroke-linecap="round" />
    ) : (
      <path d="M50 75 q8 8 16 0" fill="none" stroke="var(--ink)" stroke-width="3" stroke-linecap="round" />
    )
  const armL =
    mood === 'cheer' || mood === 'wave' ? 'M24 70 q-14 -10 -10 -30' : 'M24 74 q-14 6 -12 20'
  const armR = mood === 'cheer' ? 'M92 70 q14 -10 10 -30' : mood === 'wave' ? 'M92 70 q16 -6 14 -26' : 'M92 74 q14 6 12 20'
  const handL = mood === 'cheer' || mood === 'wave' ? [14, 38] : [12, 95]
  const handR = mood === 'cheer' ? [102, 38] : mood === 'wave' ? [106, 42] : [104, 95]
  return (
    <svg class={`bao bao-${mood}`} width={size} height={size} viewBox="0 0 116 116" aria-hidden="true">
      <g class="bao-body">
        <ellipse cx="58" cy="108" rx="30" ry="5" fill="var(--ink)" opacity=".12" />
        {/* rubber-hose arms */}
        <g fill="none" stroke="var(--ink)" stroke-width="3.2" stroke-linecap="round">
          <path class={mood === 'wave' ? 'bao-wave' : ''} d={armR} />
          <path d={armL} />
        </g>
        <circle cx={handL[0]} cy={handL[1]} r="5.5" fill="#fffdf6" stroke="var(--ink)" stroke-width="2.5" />
        <circle cx={handR[0]} cy={handR[1]} r="5.5" fill="#fffdf6" stroke="var(--ink)" stroke-width="2.5" />
        {/* bun */}
        <path
          d="M58 26 C 30 26 18 50 20 72 C 22 96 40 102 58 102 C 76 102 94 96 96 72 C 98 50 86 26 58 26 Z"
          fill="#fffaf0"
          stroke="var(--ink)"
          stroke-width="3.2"
        />
        {/* pleats on top */}
        <g fill="none" stroke="var(--ink)" stroke-width="2.4" stroke-linecap="round">
          <path d="M58 26 q-4 8 -12 10" />
          <path d="M58 26 q4 8 12 10" />
          <path d="M58 26 q0 6 0 10" />
        </g>
        <path d="M58 20 q-3 -6 2 -10 q3 4 -2 10" fill="var(--moss)" stroke="var(--ink)" stroke-width="2" />
        <ellipse cx="34" cy="74" rx="6" ry="4" fill="var(--vermilion)" opacity=".35" />
        <ellipse cx="82" cy="74" rx="6" ry="4" fill="var(--vermilion)" opacity=".35" />
        {eyes}
        {mouth}
      </g>
    </svg>
  )
}

export function Hillside() {
  return (
    <svg class="hillside" viewBox="0 0 400 170" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>
        <filter id="wc" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4" />
          <feDisplacementMap in="SourceGraphic" scale="5" />
        </filter>
        <linearGradient id="sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#cfe3ea" />
          <stop offset="1" stop-color="#f6efe1" />
        </linearGradient>
      </defs>
      <rect width="400" height="170" fill="url(#sky)" />
      <g filter="url(#wc)">
        <circle cx="318" cy="46" r="20" fill="#f3c98b" opacity=".9" />
        <g fill="#fffaf0" opacity=".9">
          <ellipse cx="90" cy="40" rx="34" ry="11" />
          <ellipse cx="116" cy="34" rx="20" ry="10" />
          <ellipse cx="250" cy="28" rx="26" ry="8" />
        </g>
        <path d="M0 112 C 60 70 120 78 180 100 C 240 122 300 76 400 92 L400 170 L0 170 Z" fill="#a9c49a" opacity=".85" />
        <path d="M0 132 C 80 104 150 118 220 128 C 290 138 340 112 400 120 L400 170 L0 170 Z" fill="#7fa572" opacity=".9" />
        <path d="M0 152 C 90 136 180 148 260 150 C 320 152 360 142 400 146 L400 170 L0 170 Z" fill="#5f8a5a" />
        {/* a little roof on the hill */}
        <g transform="translate(300 100)">
          <rect x="0" y="8" width="22" height="14" fill="#fffaf0" stroke="var(--ink)" stroke-width="1.6" />
          <path d="M-5 9 L11 -2 L27 9 Z" fill="var(--vermilion)" stroke="var(--ink)" stroke-width="1.6" />
          <rect x="8" y="13" width="6" height="9" fill="var(--ink)" opacity=".7" />
        </g>
      </g>
      {/* clean bottom edge (the watercolour filter frays the edge) */}
      <rect x="0" y="158" width="400" height="12" fill="#5f8a5a" />
    </svg>
  )
}
