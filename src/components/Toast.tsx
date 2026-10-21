import { useCallback, useEffect, useRef, useState } from 'react'
import { BobaCup } from './BobaCup'
import { Bowl } from './Bowl'
import { WheelCake } from './WheelCake'

export type ToastKind = 'ok' | 'error'
/** 成功卡片上的吉祥物：便當用碗公、飲料用珍奶、點心用車輪餅 */
export type ToastIcon = 'bowl' | 'boba' | 'wheel'

export function useToast() {
  const [toast, setToast] = useState<{ text: string; kind: ToastKind; icon: ToastIcon; key: number } | null>(null)
  const timer = useRef<number>()
  const show = useCallback((text: string, kind: ToastKind = 'ok', icon: ToastIcon = 'bowl') => {
    window.clearTimeout(timer.current)
    setToast({ text, kind, icon, key: Date.now() })
    // 成功的要按 × 才關；錯誤的 5 秒後自己消失
    if (kind === 'error') timer.current = window.setTimeout(() => setToast(null), 5000)
  }, [])
  const clear = useCallback(() => {
    window.clearTimeout(timer.current)
    setToast(null)
  }, [])
  useEffect(() => () => window.clearTimeout(timer.current), [])
  // 成功：畫面正中間的大卡片，碗公（或珍奶）跳起來；錯誤：底部小膠囊
  const node = !toast ? null : toast.kind === 'ok' ? (
    <div
      key={toast.key}
      className="fixed inset-0 z-60 m-auto flex h-fit w-fit max-w-[calc(100vw-32px)] animate-pop flex-col items-center gap-2 rounded-card border-3 border-soy bg-scallion px-10 pt-4 pb-6 text-center text-[1.4rem] text-rice shadow-pop"
      role="status"
    >
      {toast.icon === 'boba' ? (
        <BobaCup mood="happy" size={90} decorative />
      ) : toast.icon === 'wheel' ? (
        <WheelCake mood="happy" size={110} decorative />
      ) : (
        <Bowl mood="happy" size={110} decorative />
      )}
      <span>{toast.text}</span>
      <button
        className="absolute -top-4 -right-4 size-11 cursor-pointer rounded-full border-3 border-soy bg-rice text-[1.6rem] leading-none text-soy hover:bg-stamp hover:text-rice"
        onClick={clear}
        aria-label="關閉"
      >
        ×
      </button>
    </div>
  ) : (
    <div
      key={toast.key}
      className="fixed inset-x-0 bottom-7 z-60 mx-auto w-fit max-w-[calc(100vw-32px)] animate-toast-in rounded-full border-3 border-soy bg-stamp px-[22px] py-3 text-rice shadow-pop"
      role="alert"
    >
      {toast.text}
    </div>
  )
  return { show, clear, node }
}
