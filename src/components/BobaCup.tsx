export type BobaMood = 'idle' | 'happy'

const CUP = 'M38 88 L162 88 L148 232 Q147 240 139 240 L61 240 Q53 240 52 232 Z'
const PEARLS: [number, number][] = [
  [66, 224], [84, 226], [102, 225], [120, 226], [136, 223],
  [75, 208], [93, 210], [111, 209], [129, 207],
]

/** 手搖飲朋友：碗公的好朋友，idle 會晃、珍珠在杯底跳；happy 跳起來 */
export function BobaCup({
  mood = 'idle',
  size = 200,
  className = '',
  decorative = false,
}: {
  mood?: BobaMood
  size?: number
  className?: string
  decorative?: boolean
}) {
  return (
    <svg
      className={`boba boba--${mood} overflow-visible ${className}`}
      width={size}
      height={(size * 260) / 200}
      viewBox="0 0 200 260"
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': '手搖飲朋友' })}
    >
      <ellipse className="boba-shadow" cx="100" cy="250" rx="54" ry="6" />

      <g className="boba-body">
        {/* 吸管 */}
        <g className="boba-straw" strokeLinecap="round">
          <line x1="124" y1="6" x2="106" y2="112" stroke="var(--color-soy)" strokeWidth="17" />
          <line x1="124" y1="6" x2="106" y2="112" stroke="var(--color-stamp)" strokeWidth="9" />
        </g>

        {/* 杯蓋 */}
        <path d="M44 80 Q100 26 156 80 Z" fill="#fff" fillOpacity=".9" stroke="var(--color-soy)" strokeWidth="4" strokeLinejoin="round" />
        <rect x="30" y="76" width="140" height="14" rx="7" fill="#fff" stroke="var(--color-soy)" strokeWidth="4" />

        {/* 杯身：奶茶＋上層奶泡 */}
        <path d={CUP} fill="#d9a066" />
        <path d="M41 92 L159 92 L156 126 Q128 116 100 126 Q72 136 44 126 Z" fill="#f6e3c3" />
        <g className="boba-pearls">
          {PEARLS.map(([x, y], i) => (
            <g key={i} className="boba-pearl">
              <circle cx={x} cy={y} r="9" fill="var(--color-soy)" />
              <circle cx={x - 3} cy={y - 3} r="2.4" fill="#fff" fillOpacity=".7" />
            </g>
          ))}
        </g>
        <path d={CUP} fill="none" stroke="var(--color-soy)" strokeWidth="4" strokeLinejoin="round" />

        {/* 臉 */}
        <ellipse cx="68" cy="170" rx="9" ry="5" fill="var(--color-blush)" />
        <ellipse cx="132" cy="170" rx="9" ry="5" fill="var(--color-blush)" />
        {mood === 'idle' ? (
          <g className="bowl-eyes">
            <ellipse cx="82" cy="158" rx="6" ry="7.5" fill="var(--color-soy)" />
            <ellipse cx="118" cy="158" rx="6" ry="7.5" fill="var(--color-soy)" />
            <circle cx="84" cy="155" r="2.2" fill="#fff" />
            <circle cx="120" cy="155" r="2.2" fill="#fff" />
          </g>
        ) : (
          <g fill="none" stroke="var(--color-soy)" strokeWidth="4" strokeLinecap="round">
            <path d="M75 161 Q82 150 89 161" />
            <path d="M111 161 Q118 150 125 161" />
          </g>
        )}
        {mood === 'happy' ? (
          <path d="M91 166 Q100 182 109 166 Z" fill="var(--color-soy)" stroke="var(--color-soy)" strokeWidth="3" strokeLinejoin="round" />
        ) : (
          <path d="M93 167 Q96.5 172 100 168 Q103.5 172 107 167" fill="none" stroke="var(--color-soy)" strokeWidth="3" strokeLinecap="round" />
        )}
      </g>
    </svg>
  )
}
