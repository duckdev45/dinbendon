import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'

type Opts = { ok?: string; password?: boolean; label?: string; hint?: string; icon?: ReactNode; check?: (v: string) => Promise<unknown> }
type Ask = Required<Omit<Opts, 'check'>> & Pick<Opts, 'check'> & { text: string; resolve: (v: string | null) => void }

/**
 * 取代 window.confirm 的確認卡片，跟成功 toast 同一個樣子。
 * ask() 回傳 Promise：確定給輸入的密碼（沒有密碼欄就是 ''），取消給 null
 * check：要做的事（驗密碼、刪單…）。成功才關掉；失敗把錯誤留在卡片上，密碼框變紅
 * 有密碼欄的沒有確定鍵：打完停一下就自動 check
 */
export function useConfirm() {
  const [req, setReq] = useState<Ask | null>(null)
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  // check 是非同步的：回來時卡片可能已經關掉、密碼也可能又改了
  const reqRef = useRef<Ask | null>(null)
  const pwRef = useRef('')
  pwRef.current = pw
  const ask = useCallback(
    (text: string, { ok = '確定', password = false, label = '開團密碼', hint = '', icon = null, check }: Opts = {}) =>
      new Promise<string | null>((resolve) => {
        setPw('')
        setErr('')
        setBusy(false)
        reqRef.current = { text, ok, password, label, hint, icon, check, resolve }
        setReq(reqRef.current)
      }),
    [],
  )
  const close = (v: string | null) => {
    reqRef.current?.resolve(v)
    reqRef.current = null
    setReq(null)
  }
  const run = async (v: string) => {
    const r = reqRef.current
    if (!r) return
    setErr('')
    setBusy(true)
    try {
      await r.check?.(v)
      if (reqRef.current === r) close(v)
    } catch (e) {
      if (reqRef.current === r && pwRef.current === v) setErr((e as Error).message)
    } finally {
      if (reqRef.current === r) setBusy(false)
    }
  }
  // 停 0.6 秒沒再按就當打完了
  useEffect(() => {
    if (!req?.password || !pw) return
    const t = setTimeout(() => run(pw), 600)
    return () => clearTimeout(t)
  }, [pw, req]) // eslint-disable-line react-hooks/exhaustive-deps
  // 密碼只能是數字，最多 12 碼（跟後端 digits_ 一樣）
  const press = (k: string) => {
    setErr('')
    setPw((v) => (k === '⌫' ? v.slice(0, -1) : k === '清除' ? '' : (v + k).slice(0, 12)))
  }
  const cancel = () => !busy && close(null)
  const node = req && (
    <div className="fixed inset-0 z-60 grid place-items-center bg-soy/40 p-4" onClick={(e) => e.target === e.currentTarget && cancel()}>
      <form
        className="relative flex w-full max-w-[22rem] animate-pop flex-col gap-4 rounded-card border-3 border-soy bg-rice px-6 pt-5 pb-6 text-center shadow-pop"
        role="alertdialog"
        aria-label={req.text}
        onKeyDown={(e) => {
          if (e.key === 'Escape') cancel()
          if (!req.password) return
          // 電腦上直接打數字也行；不要觸發焦點所在的按鍵
          if (/^\d$/.test(e.key)) press(e.key)
          else if (e.key === 'Backspace') press('⌫')
          else if (e.key !== 'Enter') return
          e.preventDefault()
        }}
        onSubmit={(e) => {
          e.preventDefault()
          if (!req.password && !busy) run('')
        }}
      >
        {req.password && (
          <button type="button" className="absolute top-3 right-3 grid size-9 cursor-pointer place-items-center rounded-full text-[1.4rem] leading-none hover:bg-yolk-soft disabled:opacity-40" aria-label="關閉" disabled={busy} onClick={cancel}>
            ✕
          </button>
        )}
        {req.icon && <div className="-mb-2 flex justify-center">{req.icon}</div>}
        <p className="text-[1.2rem] whitespace-pre-line">{req.text}</p>
        {req.password ? (
          // 不用 label：點標題會把焦點丟給密碼框
          <div className="field text-left">
            <span className="field-label req">{req.label}</span>
            {/* readOnly＋inputMode none＋點不到：手機不跳內建鍵盤，畫面不會被推上去；用下面的數字鍵 */}
            <input
              key={err}
              value={pw}
              readOnly
              inputMode="none"
              tabIndex={-1}
              aria-invalid={!!err}
              aria-label={req.label}
              className={`pointer-events-none text-center font-num text-[1.4rem] tracking-[0.3em] placeholder:text-base placeholder:tracking-normal ${err ? 'animate-shake border-stamp bg-stamp/10' : 'bg-yolk-soft/40'} ${busy ? 'opacity-60' : ''}`}
              placeholder="開團時設定的那組"
            />
            <span className={`min-h-5 text-sm ${err ? 'font-bold text-stamp' : 'text-stamp-dark'}`} aria-live="polite">
              {err || (busy ? '檢查中…' : req.hint)}
            </span>
          </div>
        ) : (
          err && <p className="text-sm font-bold text-stamp" aria-live="polite">{err}</p>
        )}
        {req.password ? (
          <div className="grid grid-cols-3 gap-2.5">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '清除', '0', '⌫'].map((k, i) => (
              <button key={k} type="button" className={`btn py-2 font-num text-[1.3rem] ${/\d/.test(k) ? 'bg-yolk-soft' : 'bg-yolk'}`} autoFocus={i === 0} aria-label={k === '⌫' ? '刪一個字' : k} onClick={() => press(k)}>
                {k}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex justify-center gap-3">
            <button type="button" className="btn" disabled={busy} onClick={cancel}>
              取消
            </button>
            <button type="submit" className="btn btn-primary" autoFocus disabled={busy}>
              {req.ok}
            </button>
          </div>
        )}
      </form>
    </div>
  )
  return { ask, node }
}
