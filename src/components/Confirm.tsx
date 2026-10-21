import { useCallback, useState } from 'react'

type Ask = { text: string; ok: string; password: boolean; hint: string; resolve: (v: string | null) => void }

/**
 * 取代 window.confirm 的確認卡片，跟成功 toast 同一個樣子。
 * ask() 回傳 Promise：按確定給輸入的密碼（沒有密碼欄就是 ''），取消給 null
 */
export function useConfirm() {
  const [req, setReq] = useState<Ask | null>(null)
  const [pw, setPw] = useState('')
  const ask = useCallback(
    (text: string, { ok = '確定', password = false, hint = '' }: { ok?: string; password?: boolean; hint?: string } = {}) =>
      new Promise<string | null>((resolve) => {
        setPw('')
        setReq({ text, ok, password, hint, resolve })
      }),
    [],
  )
  const close = (v: string | null) => {
    req?.resolve(v)
    setReq(null)
  }
  const node = req && (
    <div className="fixed inset-0 z-60 grid place-items-center bg-soy/40 p-4" onClick={(e) => e.target === e.currentTarget && close(null)}>
      <form
        className="flex w-full max-w-[22rem] animate-pop flex-col gap-4 rounded-card border-3 border-soy bg-rice px-6 pt-5 pb-6 text-center shadow-pop"
        role="alertdialog"
        aria-label={req.text}
        onKeyDown={(e) => e.key === 'Escape' && close(null)}
        onSubmit={(e) => {
          e.preventDefault()
          if (!req.password || pw.trim()) close(pw)
        }}
      >
        <p className="text-[1.2rem] whitespace-pre-line">{req.text}</p>
        {req.password && (
          <label className="field text-left">
            <span className="field-label req">開團密碼</span>
            <input value={pw} onChange={(e) => setPw(e.target.value)} autoFocus autoComplete="off" placeholder="開團時設定的那組" />
            {req.hint && <span className="text-sm text-stamp-dark">{req.hint}</span>}
          </label>
        )}
        <div className="flex justify-center gap-3">
          <button type="button" className="btn" onClick={() => close(null)}>
            取消
          </button>
          <button type="submit" className="btn btn-primary" autoFocus={!req.password} disabled={req.password && !pw.trim()}>
            {req.ok}
          </button>
        </div>
      </form>
    </div>
  )
  return { ask, node }
}
