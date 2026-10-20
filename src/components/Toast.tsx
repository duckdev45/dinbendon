import { useCallback, useEffect, useRef, useState } from 'react'
import { Bowl } from './Bowl'

export type ToastKind = 'ok' | 'error'

export function useToast() {
  const [toast, setToast] = useState<{ text: string; kind: ToastKind; key: number } | null>(null)
  const timer = useRef<number>()
  const show = useCallback((text: string, kind: ToastKind = 'ok') => {
    window.clearTimeout(timer.current)
    setToast({ text, kind, key: Date.now() })
    timer.current = window.setTimeout(() => setToast(null), kind === 'error' ? 5000 : 3000)
  }, [])
  const clear = useCallback(() => {
    window.clearTimeout(timer.current)
    setToast(null)
  }, [])
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const node = toast ? (
    <div key={toast.key} className={`toast toast--${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
      {toast.kind === 'ok' && <Bowl mood="happy" size={38} className="toast-bowl" decorative />}
      <span>{toast.text}</span>
    </div>
  ) : null
  return { show, clear, node }
}
