import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { Bowl } from '../components/Bowl'
import { useToast } from '../components/Toast'
import { exportExcel } from '../lib/excel'
import { shrinkImage, uid } from '../lib/image'
import { computeStats, shopText } from '../lib/stats'
import { defaultDeadline, formatDay, formatDeadline, formatTime, fromLocalInput, isClosed, toLocalInput } from '../lib/time'
import type { MenuItem, Snapshot, Week, WeekDraft } from '../types'

const PW_KEY = 'dinbendon:admin'

function readPw() {
  try {
    return sessionStorage.getItem(PW_KEY) ?? ''
  } catch {
    return ''
  }
}

export function AdminPage() {
  const [pw, setPw] = useState(readPw)
  const [authed, setAuthed] = useState(false)
  const [checking, setChecking] = useState(!!readPw())
  const toast = useToast()

  useEffect(() => {
    if (!pw || authed) return
    // 同一個分頁重新整理不用再打一次密碼
    api.admin
      .verify(pw)
      .then(() => setAuthed(true))
      .catch(() => setPw(''))
      .finally(() => setChecking(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function login(e: React.FormEvent) {
    e.preventDefault()
    setChecking(true)
    try {
      await api.admin.verify(pw)
      try {
        sessionStorage.setItem(PW_KEY, pw)
      } catch {
        /* ignore */
      }
      toast.clear()
      setAuthed(true)
    } catch (err) {
      toast.show((err as Error).message, 'error')
    } finally {
      setChecking(false)
    }
  }

  if (!authed) {
    return (
      <main className="page page--center">
        {toast.node}
        <form className="card login" onSubmit={login}>
          <Bowl size={140} />
          <h1>負責人後台</h1>
          <label className="field">
            <span className="field-label">負責人密碼</span>
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus autoComplete="current-password" />
          </label>
          {api.mode === 'demo' && <p className="muted small">Demo 模式的密碼是 admin</p>}
          <button className="btn btn--primary" disabled={checking || !pw}>
            {checking ? '確認中…' : '進入後台'}
          </button>
        </form>
      </main>
    )
  }

  return <AdminConsole pw={pw} toast={toast} />
}

type Tab = 'menu' | 'stats'

function AdminConsole({ pw, toast }: { pw: string; toast: ReturnType<typeof useToast> }) {
  const [tab, setTab] = useState<Tab>('stats')
  const [weeks, setWeeks] = useState<Week[] | null>(null)

  const loadWeeks = useCallback(async () => {
    try {
      const list = await api.admin.listWeeks(pw)
      setWeeks(list)
      if (list.length === 0) setTab('menu')
    } catch (e) {
      toast.show((e as Error).message, 'error')
    }
  }, [pw, toast])

  useEffect(() => {
    loadWeeks()
  }, [loadWeeks])

  return (
    <main className="page">
      {toast.node}
      <div className="admin-head">
        <h1>負責人後台</h1>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'stats'} onClick={() => setTab('stats')}>
            訂單統計
          </button>
          <button role="tab" aria-selected={tab === 'menu'} onClick={() => setTab('menu')}>
            菜單設定
          </button>
        </div>
      </div>
      {!weeks ? (
        <p className="muted">載入中…</p>
      ) : tab === 'menu' ? (
        <MenuEditor
          pw={pw}
          current={weeks[0] ?? null}
          toast={toast}
          onSaved={async () => {
            await loadWeeks()
          }}
        />
      ) : (
        <StatsPanel pw={pw} weeks={weeks} toast={toast} onEmpty={() => setTab('menu')} />
      )}
    </main>
  )
}

// ───────────────────────── 菜單設定

function blankDraft(): WeekDraft {
  return { id: uid('w_'), shop: '', imageUrl: '', deadline: defaultDeadline(), items: [], note: '' }
}

function MenuEditor({
  pw,
  current,
  toast,
  onSaved,
}: {
  pw: string
  current: Week | null
  toast: ReturnType<typeof useToast>
  onSaved: () => Promise<void>
}) {
  const [draft, setDraft] = useState<WeekDraft>(() => current ?? blankDraft())
  const [isNew, setIsNew] = useState(!current)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulk, setBulk] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const set = <K extends keyof WeekDraft>(k: K, v: WeekDraft[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const setItem = (id: string, patch: Partial<MenuItem>) =>
    set(
      'items',
      draft.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    )

  function startNewWeek() {
    if (!window.confirm('開新的一週會建立一份空白菜單，上週的訂單仍然保留在「訂單統計」。要繼續嗎？')) return
    // 店家通常不常換，把店名和品項帶過來，負責人只要改不一樣的地方
    setDraft({ ...blankDraft(), shop: draft.shop, items: draft.items.map((it) => ({ ...it, id: uid('i_') })), note: draft.note })
    setIsNew(true)
  }

  async function pickFile(file: File | undefined) {
    if (!file) return
    setUploading(true)
    try {
      const dataUrl = await shrinkImage(file)
      const url = await api.admin.uploadImage(pw, dataUrl, file.name)
      set('imageUrl', url)
      toast.show('菜單圖片已上傳')
    } catch (e) {
      toast.show((e as Error).message, 'error')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  /** 一行一個；照抄店家菜單時後面帶的價格會自動拿掉 */
  function applyBulk() {
    const parsed = bulk
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const m = l.match(/^(.*?)[\s:：$＄,，]*\d+\s*元?$/)
        return { id: uid('i_'), name: (m ? m[1] : l).trim() }
      })
      .filter((it) => it.name)
    if (parsed.length === 0) return toast.show('沒有讀到品項，一行寫一個，例如「排骨便當」', 'error')
    set('items', [...draft.items, ...parsed])
    setBulk('')
    setBulkOpen(false)
    toast.show(`加入 ${parsed.length} 種便當`)
  }

  async function save() {
    const items = draft.items.map((it) => ({ ...it, name: it.name.trim() })).filter((it) => it.name)
    if (!draft.shop.trim()) return toast.show('填一下店家名稱', 'error')
    if (items.length === 0) return toast.show('至少要有一種便當', 'error')
    setSaving(true)
    try {
      const saved = await api.admin.saveWeek(pw, { ...draft, shop: draft.shop.trim(), items })
      setDraft(saved)
      toast.show(isNew ? '菜單已發佈，大家可以點了' : '菜單已儲存')
      setIsNew(false)
      await onSaved()
    } catch (e) {
      toast.show((e as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="editor">
      <div className="editor-bar">
        <p>
          {isNew ? '新的一週' : `正在編輯 ${formatDay(draft.deadline)}截止的菜單`}
          {!isNew && isClosed(draft.deadline) && <span className="pill pill--red">已截止</span>}
        </p>
        {!isNew && (
          <button className="btn btn--ghost" onClick={startNewWeek}>
            開新的一週
          </button>
        )}
      </div>

      <div className="editor-grid">
        <section className="card">
          <h2>菜單照片</h2>
          <div className={`dropzone ${draft.imageUrl ? 'dropzone--has' : ''}`}>
            {draft.imageUrl ? (
              <img src={draft.imageUrl} alt="菜單預覽" />
            ) : (
              <p className="muted">把店家菜單拍照上傳，大家點餐時看得到</p>
            )}
            <div className="dropzone-actions">
              <button className="btn" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? '上傳中…' : draft.imageUrl ? '換一張' : '上傳圖片'}
              </button>
              {draft.imageUrl && (
                <button className="link-btn" onClick={() => set('imageUrl', '')}>
                  移除
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
          </div>
        </section>

        <section className="card">
          <h2>基本資料</h2>
          <label className="field">
            <span className="field-label">店家名稱</span>
            <input value={draft.shop} onChange={(e) => set('shop', e.target.value)} placeholder="例如：阿嬤灶腳便當" />
          </label>
          <label className="field">
            <span className="field-label">截止時間（台北時間）</span>
            <input
              type="datetime-local"
              value={toLocalInput(draft.deadline)}
              onChange={(e) => e.target.value && set('deadline', fromLocalInput(e.target.value))}
            />
            <span className="field-hint">
              預設是週五 14:00。
              <button type="button" className="link-btn" onClick={() => set('deadline', defaultDeadline())}>
                改回這週五 14:00
              </button>
            </span>
          </label>
          <label className="field">
            <span className="field-label">給大家的話</span>
            <textarea rows={2} value={draft.note} onChange={(e) => set('note', e.target.value)} placeholder="例如：下週一中午送到一樓櫃台" />
          </label>
        </section>

        <section className="card editor-items">
          <div className="card-head">
            <h2>便當種類</h2>
            <button className="link-btn" onClick={() => setBulkOpen((o) => !o)}>
              {bulkOpen ? '收起' : '從文字貼上'}
            </button>
          </div>
          {bulkOpen && (
            <div className="bulk">
              <textarea
                rows={5}
                value={bulk}
                onChange={(e) => setBulk(e.target.value)}
                placeholder={'一行一種\n排骨便當\n雞腿便當'}
              />
              <button className="btn" onClick={applyBulk}>
                加入清單
              </button>
            </div>
          )}
          {draft.items.length === 0 && !bulkOpen && <p className="muted">還沒有便當，按下面的按鈕新增。</p>}
          <ul className="item-rows">
            {draft.items.map((it, i) => (
              <li key={it.id}>
                <input aria-label={`第 ${i + 1} 種便當名稱`} value={it.name} onChange={(e) => setItem(it.id, { name: e.target.value })} placeholder="便當名稱" />
                <button className="icon-btn" aria-label={`刪除 ${it.name}`} onClick={() => set('items', draft.items.filter((x) => x.id !== it.id))}>
                  ×
                </button>
              </li>
            ))}
          </ul>
          <button className="btn btn--ghost btn--block" onClick={() => set('items', [...draft.items, { id: uid('i_'), name: '' }])}>
            + 加一種便當
          </button>
        </section>
      </div>

      <div className="editor-save">
        <button className="btn btn--primary btn--big" onClick={save} disabled={saving || uploading}>
          {saving ? '儲存中…' : isNew ? '發佈菜單' : '儲存菜單'}
        </button>
      </div>
    </div>
  )
}

// ───────────────────────── 訂單統計

function topText(tops: { name: string; count: number }[]) {
  if (tops.length === 0) return '還沒有人點'
  const names = tops.map((s) => s.name).join('、')
  return tops.length > 1 ? `${names}（各 ${tops[0].count} 人）` : `${names}（${tops[0].count} 人）`
}

function StatsPanel({
  pw,
  weeks,
  toast,
  onEmpty,
}: {
  pw: string
  weeks: Week[]
  toast: ReturnType<typeof useToast>
  onEmpty: () => void
}) {
  const [weekId, setWeekId] = useState(weeks[0]?.id ?? '')
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [exporting, setExporting] = useState(false)

  const load = useCallback(async () => {
    if (!weekId) return
    try {
      setSnap(await api.admin.getWeek(pw, weekId))
    } catch (e) {
      toast.show((e as Error).message, 'error')
    }
  }, [pw, weekId, toast])

  useEffect(() => {
    load()
  }, [load])

  const stats = useMemo(() => computeStats(snap?.week ?? null, snap?.orders ?? []), [snap])
  const maxCount = Math.max(1, ...stats.items.map((s) => s.count))

  if (weeks.length === 0) {
    return (
      <div className="card empty">
        <p>還沒有任何菜單。</p>
        <button className="btn btn--primary" onClick={onEmpty}>
          去設定菜單
        </button>
      </div>
    )
  }

  const week = snap?.week

  async function doExport() {
    if (!week || !snap) return
    setExporting(true)
    try {
      await exportExcel(week, snap.orders)
      toast.show('Excel 已下載')
    } catch (e) {
      toast.show('匯出失敗：' + (e as Error).message, 'error')
    } finally {
      setExporting(false)
    }
  }

  async function copyForShop() {
    if (!week) return
    try {
      await navigator.clipboard.writeText(shopText(week, stats))
      toast.show('已複製，可以直接貼給店家')
    } catch {
      toast.show('瀏覽器不讓複製，請手動選取', 'error')
    }
  }

  async function remove(id: string, label: string) {
    if (!window.confirm(`刪除 ${label} 的訂單？`)) return
    try {
      await api.admin.deleteOrder(pw, id)
      toast.show('訂單已刪除')
      load()
    } catch (e) {
      toast.show((e as Error).message, 'error')
    }
  }

  return (
    <div className="stats">
      <div className="stats-bar">
        <label className="week-pick">
          <span className="sr-only">選擇哪一週</span>
          <select value={weekId} onChange={(e) => setWeekId(e.target.value)}>
            {weeks.map((w) => (
              <option key={w.id} value={w.id}>
                {w.shop || '未命名'}（{formatDay(w.deadline)}截止）
              </option>
            ))}
          </select>
        </label>
        {week && (
          <span className={`pill ${isClosed(week.deadline) ? 'pill--red' : 'pill--green'}`}>
            {isClosed(week.deadline) ? '已截止' : `收單中，${formatDeadline(week.deadline)} 截止`}
          </span>
        )}
        <div className="stats-actions">
          <button className="btn" onClick={load}>
            重新整理
          </button>
          <button className="btn" onClick={copyForShop} disabled={!stats.total}>
            複製給店家
          </button>
          <button className="btn btn--primary" onClick={doExport} disabled={!week || exporting}>
            {exporting ? '匯出中…' : '匯出 Excel'}
          </button>
        </div>
      </div>

      {!snap ? (
        <p className="muted">載入中…</p>
      ) : (
        <>
          <div className="tiles">
            <div className="tile">
              <span className="tile-num">{stats.total}</span>
              <span className="tile-label">人訂餐</span>
            </div>
            <div className="tile tile--top">
              <span className="tile-label">最多人點</span>
              <span className="tile-top">{topText(stats.tops)}</span>
            </div>
          </div>

          <section className="card">
            <h2>各便當數量</h2>
            <ul className="bars">
              {stats.items.map((s) => (
                <li key={s.itemId} className={s.count === 0 ? 'is-zero' : ''}>
                  <span className="bar-name">{s.name}</span>
                  <span className="bar-track">
                    <span className="bar-fill" style={{ width: `${(s.count / maxCount) * 100}%` }} />
                  </span>
                  <span className="bar-qty">{s.count}</span>
                  {s.people.length > 0 && <span className="bar-people">{s.people.join('、')}</span>}
                </li>
              ))}
            </ul>
          </section>

          <section className="card">
            <h2>訂單明細</h2>
            {snap.orders.length === 0 ? (
              <p className="muted">這週還沒有人點。把點餐頁網址貼到群組吧！</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>姓名</th>
                      <th>便當</th>
                      <th>時間</th>
                      <th>
                        <span className="sr-only">操作</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {snap.orders.map((o) => (
                      <tr key={o.id}>
                        <td>{o.name}</td>
                        <td>{o.itemName}</td>
                        <td className="muted">{formatTime(o.updatedAt)}</td>
                        <td>
                          <button className="link-btn link-btn--danger" onClick={() => remove(o.id, o.name)}>
                            刪除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
