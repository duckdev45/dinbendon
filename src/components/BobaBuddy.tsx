import { BobaCup } from './BobaCup'

const PLUS = 'pointer-events-none absolute -top-4 rounded-full border-2 border-soy bg-stamp px-2 font-num text-[1rem] leading-snug font-bold text-rice'

/** 沒有飲料團時，珍奶在右下角晃、一直冒「+1」；點下去到後台開飲料團 */
export function BobaBuddy() {
  return (
    <a
      href="#/admin/drink"
      className="fixed right-5 bottom-5 z-30 no-underline transition-[translate] hover:-translate-y-1 max-md:right-3 max-md:bottom-3"
      title="想喝飲料？點我開飲料團"
      aria-label="想喝飲料 +1，點我開飲料團"
    >
      <BobaCup size={72} decorative className="max-md:h-auto max-md:w-[52px]" />
      <span className={`${PLUS} left-[15%] animate-plus-one motion-reduce:hidden`}>+1</span>
      <span className={`${PLUS} left-[55%] animate-plus-one [animation-delay:1.4s] motion-reduce:hidden`}>+1</span>
    </a>
  )
}
