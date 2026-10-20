import { useId } from 'react'

export type BowlMood = 'idle' | 'happy' | 'sleep'

const STEAM = ['M88 38 C 80 28, 96 20, 88 6', 'M118 34 C 110 22, 126 14, 118 0', 'M148 38 C 140 28, 156 20, 148 6']
const BODY = 'M18 114 C 18 178, 66 214, 130 214 C 194 214, 242 178, 242 114 Z'

/** 碗公：idle 會呼吸冒煙、happy 跳起來、sleep 截止後睡覺 */
export function Bowl({
  mood = 'idle',
  size = 260,
  className = '',
  decorative = false,
}: {
  mood?: BowlMood
  size?: number
  className?: string
  /** 純裝飾時不讓螢幕閱讀器念出來 */
  decorative?: boolean
}) {
  const clip = useId().replace(/:/g, '')
  return (
    <svg
      className={`bowl bowl--${mood} overflow-visible ${className}`}
      width={size}
      height={(size * 250) / 260}
      viewBox="0 0 260 250"
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': '碗公' })}
    >
      <defs>
        <clipPath id={clip}>
          <path d={BODY} />
        </clipPath>
      </defs>

      <ellipse className="bowl-shadow" cx="130" cy="238" rx="72" ry="7" />

      {mood !== 'sleep' && (
        <g className="bowl-steam" fill="none" strokeLinecap="round">
          {STEAM.map((d, i) => (
            <g key={i} className={`steam steam-${i + 1}`}>
              <path d={d} stroke="var(--color-soy)" strokeWidth="9" />
              <path d={d} stroke="#fff" strokeWidth="4.5" />
            </g>
          ))}
        </g>
      )}

      {mood === 'sleep' && (
        <g className="bowl-zzz">
          <text x="196" y="52" fontSize="24">Z</text>
          <text x="216" y="30" fontSize="18">z</text>
          <text x="232" y="14" fontSize="13">z</text>
        </g>
      )}

      {mood === 'happy' && (
        <g className="bowl-sparkles">
          <path d="M30 60 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 l10 -4 z" />
          <path d="M222 54 l3 8 l8 3 l-8 3 l-3 8 l-3 -8 l-8 -3 l8 -3 z" />
          <path d="M236 150 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 l7 -3 z" />
          <path d="M16 150 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 l7 -3 z" />
        </g>
      )}

      <g className="bowl-body">
        {/* 筷子 */}
        <g strokeLinecap="round">
          <line x1="150" y1="72" x2="220" y2="10" stroke="var(--color-soy)" strokeWidth="10" />
          <line x1="150" y1="72" x2="220" y2="10" stroke="#D9924F" strokeWidth="4" />
          <line x1="164" y1="76" x2="238" y2="22" stroke="var(--color-soy)" strokeWidth="10" />
          <line x1="164" y1="76" x2="238" y2="22" stroke="#D9924F" strokeWidth="4" />
        </g>

        {/* 白飯 + 配菜 */}
        <path
          className="bowl-rice"
          d="M34 114 C 34 76, 64 50, 96 48 C 104 40, 120 38, 132 44 C 146 38, 166 42, 172 50 C 204 56, 226 80, 226 114 Z"
          fill="#fff"
          stroke="var(--color-soy)"
          strokeWidth="4"
          strokeLinejoin="round"
        />
        <g fill="#EFE7D4">
          <ellipse cx="72" cy="96" rx="3" ry="5" transform="rotate(-30 72 96)" />
          <ellipse cx="140" cy="62" rx="3" ry="5" transform="rotate(20 140 62)" />
          <ellipse cx="190" cy="92" rx="3" ry="5" transform="rotate(40 190 92)" />
          <ellipse cx="118" cy="100" rx="3" ry="5" transform="rotate(-10 118 100)" />
          <ellipse cx="166" cy="102" rx="3" ry="5" transform="rotate(70 166 102)" />
        </g>
        {/* 滷蛋 */}
        <ellipse cx="96" cy="78" rx="21" ry="17" fill="#C27A3E" stroke="var(--color-soy)" strokeWidth="4" />
        <ellipse cx="96" cy="78" rx="13" ry="10" fill="#FFF6E0" />
        <circle cx="96" cy="78" r="6.5" fill="var(--color-yolk-deep)" />
        {/* 蔥花 */}
        <g fill="var(--color-scallion)" stroke="var(--color-soy)" strokeWidth="2">
          <rect x="140" y="84" width="9" height="6" rx="2" transform="rotate(-20 144 87)" />
          <rect x="176" y="70" width="9" height="6" rx="2" transform="rotate(25 180 73)" />
          <rect x="124" y="70" width="8" height="5" rx="2" transform="rotate(10 128 72)" />
        </g>

        {/* 碗底座 */}
        <path d="M92 206 L 98 226 H 162 L 168 206" fill="#fff" stroke="var(--color-soy)" strokeWidth="4" strokeLinejoin="round" />
        {/* 碗身 */}
        <path d={BODY} fill="#fff" />
        <g clipPath={`url(#${clip})`}>
          <rect x="0" y="122" width="260" height="7" fill="var(--color-bowl-blue)" />
          <rect x="0" y="134" width="260" height="3" fill="var(--color-bowl-blue)" />
          <rect x="0" y="200" width="260" height="5" fill="var(--color-bowl-blue)" />
        </g>
        <path d={BODY} fill="none" stroke="var(--color-soy)" strokeWidth="4" strokeLinejoin="round" />
        <rect x="10" y="106" width="240" height="14" rx="7" fill="#fff" stroke="var(--color-soy)" strokeWidth="4" />

        {/* 臉 */}
        <ellipse cx="80" cy="166" rx="10" ry="5.5" fill="var(--color-blush)" />
        <ellipse cx="180" cy="166" rx="10" ry="5.5" fill="var(--color-blush)" />
        {mood === 'idle' && (
          <g className="bowl-eyes">
            <ellipse cx="102" cy="154" rx="6" ry="7.5" fill="var(--color-soy)" />
            <ellipse cx="158" cy="154" rx="6" ry="7.5" fill="var(--color-soy)" />
            <circle cx="104" cy="151" r="2.2" fill="#fff" />
            <circle cx="160" cy="151" r="2.2" fill="#fff" />
          </g>
        )}
        {mood === 'happy' && (
          <g fill="none" stroke="var(--color-soy)" strokeWidth="4" strokeLinecap="round">
            <path d="M95 157 Q 102 146 109 157" />
            <path d="M151 157 Q 158 146 165 157" />
          </g>
        )}
        {mood === 'sleep' && (
          <g fill="none" stroke="var(--color-soy)" strokeWidth="4" strokeLinecap="round">
            <path d="M95 154 Q 102 160 109 154" />
            <path d="M151 154 Q 158 160 165 154" />
          </g>
        )}
        {mood === 'happy' ? (
          <path d="M120 160 Q 130 176 140 160 Z" fill="var(--color-soy)" stroke="var(--color-soy)" strokeWidth="3" strokeLinejoin="round" />
        ) : (
          <path d="M122 160 Q 126 166 130 161 Q 134 166 138 160" fill="none" stroke="var(--color-soy)" strokeWidth="3" strokeLinecap="round" />
        )}
      </g>
    </svg>
  )
}
