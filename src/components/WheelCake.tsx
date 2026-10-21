import { useId } from 'react'

export type WheelMood = 'idle' | 'happy'

// 圓餅側面看：上面一圈餅面、下面一段餅身
const BODY = 'M20 78 A80 32 0 0 1 180 78 L180 128 A80 32 0 0 1 20 128 Z'
// 右上角被咬掉兩口（圓心、半徑）
const BITES: [number, number, number][] = [
  [182, 70, 28],
  [156, 50, 24],
]

/** 車輪餅朋友：點心團的吉祥物，被咬一口露出紅豆；idle 會晃、冒熱氣，happy 跳起來 */
export function WheelCake({
  mood = 'idle',
  size = 200,
  className = '',
  decorative = false,
}: {
  mood?: WheelMood
  size?: number
  className?: string
  decorative?: boolean
}) {
  // 一頁可能同時有好幾顆，mask / clipPath 的 id 不能撞
  const id = useId()
  const bite = `${id}bite`
  const body = `${id}body`
  return (
    <svg
      className={`wheel wheel--${mood} overflow-visible ${className}`}
      width={size}
      height={(size * 190) / 200}
      viewBox="0 0 200 190"
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': '車輪餅朋友' })}
    >
      <defs>
        <mask id={bite} maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="190">
          <rect width="200" height="190" fill="#fff" />
          {BITES.map(([x, y, r]) => (
            <circle key={x} cx={x} cy={y} r={r} fill="#000" />
          ))}
        </mask>
        <clipPath id={body}>
          <path d={BODY} />
        </clipPath>
      </defs>

      <ellipse className="wheel-shadow" cx="100" cy="174" rx="66" ry="7" />

      {mood === 'idle' && (
        <g fill="none" stroke="var(--color-soy-soft)" strokeWidth="4" strokeLinecap="round">
          <path className="wheel-steam" d="M78 38 Q70 28 78 18 Q86 8 78 -2" />
          <path className="wheel-steam" d="M104 34 Q96 24 104 14 Q112 4 104 -6" />
        </g>
      )}

      <g className="wheel-body">
        <g mask={`url(#${bite})`}>
          {/* 餅身＋中間壓合的那條縫 */}
          <path d={BODY} fill="#e09a45" />
          <path d="M20 104 A80 32 0 0 0 180 104" fill="none" stroke="#b8742c" strokeWidth="3" />
          <path d="M33 116 Q36 130 54 139" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="5" strokeLinecap="round" />
          {/* 餅面：外圈烤得比較深 */}
          <ellipse cx="100" cy="78" rx="80" ry="32" fill="#f5bf62" />
          <ellipse cx="100" cy="80" rx="62" ry="22" fill="#f9d283" />
          <path d="M20 78 A80 32 0 0 0 180 78" fill="none" stroke="var(--color-soy)" strokeWidth="4" />
          <path d={BODY} fill="none" stroke="var(--color-soy)" strokeWidth="4" strokeLinejoin="round" />

          {/* 咬痕：外面一圈餅皮、裡面紅豆 */}
          <g clipPath={`url(#${body})`}>
            {BITES.map(([x, y, r]) => (
              <circle key={`f${x}`} cx={x} cy={y} r={r + 15} fill="#6e2b22" />
            ))}
            <ellipse cx="146" cy="80" rx="4" ry="3" fill="#a24a38" />
            <ellipse cx="164" cy="100" rx="4" ry="3" fill="#a24a38" />
            <ellipse cx="130" cy="66" rx="3.5" ry="2.5" fill="#a24a38" />
            {BITES.map(([x, y, r]) => (
              <circle key={`c${x}`} cx={x} cy={y} r={r + 4} fill="#f6e0b0" />
            ))}
            {BITES.map(([x, y, r]) => (
              <circle key={`e${x}`} cx={x} cy={y} r={r} fill="none" stroke="var(--color-soy)" strokeWidth="7" />
            ))}
          </g>
        </g>

        {/* 臉在餅面上 */}
        <ellipse cx="64" cy="86" rx="9" ry="5" fill="var(--color-blush)" />
        <ellipse cx="128" cy="86" rx="9" ry="5" fill="var(--color-blush)" />
        {mood === 'idle' ? (
          <g className="bowl-eyes">
            <ellipse cx="78" cy="74" rx="6" ry="7.5" fill="var(--color-soy)" />
            <ellipse cx="114" cy="74" rx="6" ry="7.5" fill="var(--color-soy)" />
            <circle cx="80" cy="71" r="2.2" fill="#fff" />
            <circle cx="116" cy="71" r="2.2" fill="#fff" />
          </g>
        ) : (
          <g fill="none" stroke="var(--color-soy)" strokeWidth="4" strokeLinecap="round">
            <path d="M71 77 Q78 66 85 77" />
            <path d="M107 77 Q114 66 121 77" />
          </g>
        )}
        {mood === 'happy' ? (
          <path d="M87 82 Q96 98 105 82 Z" fill="var(--color-soy)" stroke="var(--color-soy)" strokeWidth="3" strokeLinejoin="round" />
        ) : (
          <path d="M89 83 Q92.5 88 96 84 Q99.5 88 103 83" fill="none" stroke="var(--color-soy)" strokeWidth="3" strokeLinecap="round" />
        )}
      </g>
    </svg>
  )
}
