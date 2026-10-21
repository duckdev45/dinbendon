import { useState } from 'react'
import { drinkType } from '../lib/drink'
import type { MenuItem } from '../types'

type Cat = 'tea' | 'milk'

const MAX = 8 // 轉盤最多幾格，再多手機上字會擠；菜單比較多就隨機抽 8 杯上轉盤
const TURNS = 5 // 轉幾圈才停
const LABEL = { tea: '茶類', milk: '奶類' } as const
// 茶：蔥綠／白輪流；奶：奶茶色／白輪流
const FILL = { tea: ['var(--color-scallion)', 'var(--color-rice)'], milk: ['var(--color-soy-soft)', 'var(--color-rice)'] } as const
const INK = ['var(--color-rice)', 'var(--color-soy)']

/** 從 12 點方向順時針 a 度、半徑 r 的點 */
const at = (a: number, r: number) => [r * Math.sin((a * Math.PI) / 180), -r * Math.cos((a * Math.PI) / 180)]

/** 轉盤上的字：拿掉（只有 M）這類括號，太長截掉 */
function short(name: string) {
  const s = name.replace(/[（(][^）)]*[）)]/g, '').trim() || name
  return s.length > 6 ? s.slice(0, 5) + '…' : s
}

function shuffle<T>(list: T[]) {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** 選擇障礙轉盤：上面切茶類／奶類，下面轉盤就是那一類的飲料，轉完問「確定」還是「再轉一次」。甜度冰量還是自己選 */
export function DrinkWheel({ items, onPick, onClose }: { items: MenuItem[]; onPick: (id: string) => void; onClose: () => void }) {
  const groups = { tea: items.filter((it) => drinkType(it.name) === 'tea'), milk: items.filter((it) => drinkType(it.name) === 'milk') }
  // 預設茶類，這家沒茶類就奶類
  const first: Cat = groups.tea.length ? 'tea' : 'milk'
  const [cat, setCat] = useState<Cat>(first)
  const [slices, setSlices] = useState(() => shuffle(groups[first]).slice(0, MAX))
  const [rot, setRot] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [target, setTarget] = useState(0)
  const [result, setResult] = useState<MenuItem | null>(null)
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const n = slices.length
  const deg = 360 / Math.max(1, n)

  function choose(c: Cat) {
    if (spinning || c === cat) return
    setCat(c)
    setSlices(shuffle(groups[c]).slice(0, MAX))
    setResult(null)
  }

  function spin() {
    if (spinning || !n) return
    const i = Math.floor(Math.random() * n)
    // 第 i 格的中心轉到 12 點方向，格子裡再隨機偏一點，看起來不會每次都停正中間
    const center = (i + 0.5) * deg + (Math.random() - 0.5) * deg * 0.6
    setTarget(i)
    setResult(null)
    setSpinning(true)
    setRot(rot + TURNS * 360 + ((((-center - rot) % 360) + 360) % 360))
  }

  function done() {
    setSpinning(false)
    setResult(slices[target])
  }

  return (
    <div className="fixed inset-0 z-60 grid place-items-center bg-soy/50 p-4" onClick={(e) => e.target === e.currentTarget && !spinning && onClose()}>
      <div className="relative flex w-full max-w-[24rem] animate-pop flex-col items-center gap-4 rounded-card border-3 border-soy bg-yolk px-5 pt-5 pb-6 text-center shadow-pop" role="dialog" aria-label="選擇障礙轉盤">
        <button
          type="button"
          className="absolute -top-4 -right-4 size-11 cursor-pointer rounded-full border-3 border-soy bg-rice text-[1.6rem] leading-none text-soy hover:bg-stamp hover:text-rice disabled:opacity-50"
          onClick={onClose}
          disabled={spinning}
          aria-label="關閉"
        >
          ×
        </button>
        <p className="-rotate-3 rounded-xl border-3 border-stamp bg-rice px-3 font-num text-[1.4rem] font-bold tracking-wide text-stamp">選擇障礙轉盤</p>

        {/* 茶類／奶類切換，切了轉盤就換成那一類 */}
        <div className="inline-flex overflow-hidden rounded-full border-3 border-soy bg-rice shadow-pop-sm" role="radiogroup" aria-label="茶類還是奶類">
          {(['tea', 'milk'] as const).map((c, i) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={cat === c}
              className={`flex cursor-pointer items-center gap-1 py-1 pr-4 pl-2.5 font-bold text-soy aria-checked:bg-soy aria-checked:text-yolk disabled:cursor-not-allowed disabled:opacity-40 ${i ? 'border-l-3 border-soy' : ''}`}
              onClick={() => choose(c)}
              disabled={spinning || groups[c].length === 0}
            >
              <CupIcon cat={c} size={28} />
              {LABEL[c]}
              <span className="text-sm font-normal opacity-75">{groups[c].length}</span>
            </button>
          ))}
        </div>

        <div className="relative size-[min(17rem,70vw)]">
          {/* 指針固定在 12 點 */}
          <svg className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 overflow-visible" width="34" height="38" viewBox="0 0 34 38" aria-hidden>
            <path d="M3 3 H31 L17 35 Z" fill="var(--color-stamp)" stroke="var(--color-soy)" strokeWidth="3" strokeLinejoin="round" />
          </svg>
          <div
            className="size-full"
            style={{ transform: `rotate(${rot}deg)`, transition: spinning ? `transform ${reduce ? 0.01 : 3.2}s cubic-bezier(0.15, 0.8, 0.25, 1)` : 'none' }}
            onTransitionEnd={done}
          >
            <svg viewBox="-110 -110 220 220" className="size-full overflow-visible drop-shadow-[4px_4px_0_var(--color-soy)]" aria-hidden>
              <circle r="106" fill="var(--color-soy)" />
              <circle r="100" fill="var(--color-yolk-deep)" />
              {slices.map((it, i) => {
                const a0 = i * deg
                const [x0, y0] = at(a0, 88)
                const [x1, y1] = at(a0 + deg, 88)
                const mid = a0 + deg / 2
                const [tx, ty] = at(mid, 57)
                // 奇數格的話最後一格跟第一格同色會黏在一起，最後一格換第三種顏色
                const k = n % 2 && i === n - 1 && n > 1 ? 2 : i % 2
                const fill = k === 2 ? 'var(--color-yolk-soft)' : FILL[cat][k]
                return (
                  <g key={it.id}>
                    {n === 1 ? (
                      <circle r="88" fill={fill} stroke="var(--color-soy)" strokeWidth="3" />
                    ) : (
                      <path d={`M0 0 L${x0} ${y0} A88 88 0 0 1 ${x1} ${y1} Z`} fill={fill} stroke="var(--color-soy)" strokeWidth="3" strokeLinejoin="round" />
                    )}
                    {/* 字沿著半徑從圓心往外讀 */}
                    <text x={tx} y={ty} transform={`rotate(${mid - 90} ${tx} ${ty})`} textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight="700" fill={k === 0 ? INK[0] : INK[1]}>
                      {short(it.name)}
                    </text>
                  </g>
                )
              })}
              {/* 外圈燈泡 */}
              {Array.from({ length: 16 }, (_, i) => {
                const [x, y] = at(i * 22.5, 94)
                return <circle key={i} cx={x} cy={y} r="3.4" fill={i % 2 ? 'var(--color-rice)' : 'var(--color-stamp)'} stroke="var(--color-soy)" strokeWidth="1.5" />
              })}
            </svg>
          </div>
          <button
            type="button"
            className="absolute inset-0 m-auto size-[3.6rem] cursor-pointer rounded-full border-3 border-soy bg-stamp font-num text-[1.25rem] font-bold text-rice shadow-pop-sm hover:bg-stamp-dark disabled:cursor-not-allowed"
            onClick={spin}
            disabled={spinning}
          >
            轉！
          </button>
        </div>

        <p className="min-h-[3.2em] text-[1.2rem] leading-snug" aria-live="polite">
          {spinning ? (
            '轉呀轉…'
          ) : result ? (
            <>
              今天喝
              <br />
              <b className="text-[1.4rem]">{result.name}</b>
              {result.price > 0 && <span className="ml-1.5 font-num text-soy-soft">${result.price}</span>}
            </>
          ) : (
            <>
              {LABEL[cat]}{groups[cat].length > MAX && `隨機抽 ${MAX} 杯`}，按中間的「轉！」
            </>
          )}
        </p>

        {result && !spinning && (
          <div className="flex w-full gap-3">
            <button type="button" className="btn flex-1" onClick={spin}>
              再轉一次
            </button>
            <button type="button" className="btn btn-primary flex-1" onClick={() => onPick(result.id)}>
              確定
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/** 茶類／奶類切換上的小杯子：茶類是茶葉、奶類是一杯奶茶 */
function CupIcon({ cat, size = 46 }: { cat: Cat; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 46 46" aria-hidden>
      <path d="M10 12 H36 L33 40 Q32.5 43 29.5 43 H16.5 Q13.5 43 13 40 Z" fill={cat === 'tea' ? '#cfe9a6' : '#d9a877'} stroke="var(--color-soy)" strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="8" y="8" width="30" height="5" rx="2.5" fill="var(--color-rice)" stroke="var(--color-soy)" strokeWidth="2.5" />
      <path d="M26 8 L30 1" stroke="var(--color-stamp)" strokeWidth="3" strokeLinecap="round" />
      {cat === 'tea' ? (
        <path d="M17 38 Q21 28 30 29 Q27 39 17 38 Z M17 38 L25 33" fill="var(--color-scallion)" stroke="var(--color-soy)" strokeWidth="1.8" strokeLinejoin="round" />
      ) : (
        [17, 23, 29].map((x) => <circle key={x} cx={x} cy={37} r="2.6" fill="var(--color-soy)" />)
      )}
      <circle cx="19" cy="20" r="1.6" fill="var(--color-soy)" />
      <circle cx="27" cy="20" r="1.6" fill="var(--color-soy)" />
    </svg>
  )
}
