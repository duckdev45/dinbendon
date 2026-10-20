import { useState } from 'react'
import { BobaCup } from './BobaCup'

const PLUS = 'pointer-events-none absolute -top-4 rounded-full border-2 border-soy bg-stamp px-2 font-num text-[1rem] leading-snug font-bold text-rice'

/** 沒有飲料團時，珍奶在右下角晃、一直冒「+1」；點一下再多冒一個（純好玩，不會記錄） */
export function BobaBuddy() {
  const [extra, setExtra] = useState<number[]>([])
  return (
    <button
      type="button"
      className="fixed right-5 bottom-5 z-30 cursor-pointer"
      title="想喝飲料？+1"
      aria-label="想喝飲料 +1"
      onClick={() => setExtra((xs) => [...xs, Date.now()])}
    >
      <BobaCup size={72} decorative />
      <span className={`${PLUS} left-[15%] animate-plus-one motion-reduce:hidden`}>+1</span>
      <span className={`${PLUS} left-[55%] animate-plus-one [animation-delay:1.4s] motion-reduce:hidden`}>+1</span>
      {extra.map((k) => (
        <span
          key={k}
          className={`${PLUS} left-[35%] animate-plus-one-once`}
          onAnimationEnd={() => setExtra((xs) => xs.filter((x) => x !== k))}
        >
          +1
        </span>
      ))}
    </button>
  )
}
