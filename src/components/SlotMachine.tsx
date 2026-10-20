import { useRef, useState } from 'react'
import { ShopLogo } from './ShopLogo'

const TILE = 96 // 一格的高度（px），跟 reel 視窗一樣高
const LAPS = 6 // 轉幾圈才停
const REELS = [1.4, 1.9, 2.4] // 三輪各轉幾秒，一輪一輪停

/**
 * 老闆請喝飲料的拉霸機：拉一下三輪一起轉，一定會中（三格同一家），中哪家就喝哪家。
 * 只有 locked 時不能拉（飲料團已經開了，不能換店）。
 */
export function SlotMachine({
  shops,
  value,
  onPick,
  locked = false,
}: {
  shops: { shop: string; logo: string }[]
  value: string
  onPick: (shop: string) => void
  locked?: boolean
}) {
  const n = shops.length
  const current = Math.max(0, shops.findIndex((s) => s.shop === value))
  const [pos, setPos] = useState(current)
  const [animate, setAnimate] = useState(false)
  const [spinning, setSpinning] = useState(false)
  const [pulls, setPulls] = useState(0)
  const target = useRef(current)
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const strip = Array.from({ length: LAPS + 1 }, () => shops).flat()

  function pull() {
    if (spinning || locked) return
    target.current = Math.floor(Math.random() * n)
    setSpinning(true)
    setPulls((k) => k + 1)
    // 先瞬間回到第一圈同一格，下一個 frame 再開始轉，看起來才是連續的
    setAnimate(false)
    setPos(pos % n)
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setAnimate(true)
        setPos(LAPS * n + target.current)
      }),
    )
  }

  function done() {
    setSpinning(false)
    onPick(shops[target.current].shop)
  }

  const picked = value ? shops[current] : null

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-3">
        <div className="rounded-card border-3 border-soy bg-stamp p-3 shadow-pop">
          <p className="mb-2 text-center font-num text-[1.3rem] font-bold tracking-widest text-yolk">★ BONUS 拉霸 ★</p>
          <div className="flex gap-2 rounded-xl border-3 border-soy bg-soy p-2">
            {REELS.map((sec, i) => (
              <div key={i} className="relative w-[104px] overflow-hidden rounded-lg bg-rice" style={{ height: TILE }}>
                <div
                  style={{
                    transform: `translateY(${-pos * TILE}px)`,
                    transition: animate ? `transform ${reduce ? 0.01 : sec}s cubic-bezier(0.15, 0.8, 0.25, 1)` : 'none',
                  }}
                  onTransitionEnd={i === REELS.length - 1 ? done : undefined}
                >
                  {strip.map((s, k) => (
                    <div key={k} className="grid place-items-center" style={{ height: TILE }}>
                      <ShopLogo logo={s.logo} shop={s.shop} size={76} />
                    </div>
                  ))}
                </div>
                {/* 中線 */}
                <div className="pointer-events-none absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-stamp/40" />
              </div>
            ))}
          </div>
        </div>

        {/* 拉桿 */}
        <button
          type="button"
          className="group flex cursor-pointer flex-col items-center disabled:cursor-not-allowed disabled:opacity-50"
          onClick={pull}
          disabled={spinning || locked}
          aria-label="拉霸！"
        >
          <span key={pulls} className={`flex origin-bottom flex-col items-center ${pulls ? 'animate-lever' : ''}`}>
            <span className="size-10 rounded-full border-3 border-soy bg-stamp shadow-pop-sm group-hover:bg-yolk" />
            <span className="h-20 w-3 rounded-b-full border-x-3 border-b-3 border-soy bg-rice" />
          </span>
          <span className="mt-1 text-sm">{locked ? '已開團' : spinning ? '轉轉轉…' : '拉！'}</span>
        </button>
      </div>

      <p className="min-h-[1.6em] text-[1.15rem]" aria-live="polite">
        {spinning ? '轉呀轉…' : picked ? <>🎉 JACKPOT！今天喝 <b>{picked.shop}</b></> : '拉一下拉桿，抽今天喝哪家'}
      </p>
    </div>
  )
}
