import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { Bowl, type BowlMood } from '../components/Bowl'
import { Countdown } from '../components/Countdown'
import { useToast } from '../components/Toast'
import { computeStats, normName } from '../lib/stats'
import { isClosed } from '../lib/time'
import type { Snapshot } from '../types'

const NAME_KEY = 'dinbendon:name'

function readName() {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

export function OrderPage() {
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [loadError, setLoadError] = useState('')
  const [name, setName] = useState(readName)
  const [itemId, setItemId] = useState('')
  const [busy, setBusy] = useState(false)
  const [celebrate, setCelebrate] = useState(false)
  const [zoom, setZoom] = useState(false)
  const [, forceTick] = useState(0)
  const toast = useToast()

  const refresh = useCallback(async () => {
    try {
      setSnap(await api.getCurrent())
      setLoadError('')
    } catch (e) {
      setLoadError((e as Error).message)
    }
  }, [])

  // 進來載一次、每 30 秒、切回分頁時再抓，名單會跟著更新
  useEffect(() => {
    refresh()
    const t = window.setInterval(refresh, 30_000)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearInterval(t)
      window.removeEventListener('focus', refresh)
    }
  }, [refresh])

  const week = snap?.week ?? null
  const orders = snap?.orders ?? []
  const closed = week ? isClosed(week.deadline) : false
  const stats = useMemo(() => computeStats(week, orders), [week, orders])
  const mine = name.trim() ? orders.find((o) => normName(o.name) === normName(name)) : undefined

  // 名字對到已經點過的訂單，就把表單帶成那筆
  useEffect(() => {
    if (mine) setItemId(mine.itemId)
  }, [mine?.id, mine?.updatedAt]) // eslint-disable-line react-hooks/exhaustive-deps

  const mood: BowlMood = celebrate ? 'happy' : closed ? 'sleep' : 'idle'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!week) return
    if (!name.trim()) return toast.show('先填你的名字，負責人才知道便當是誰的', 'error')
    if (!itemId) return toast.show('還沒選便當喔', 'error')
    setBusy(true)
    try {
      const updating = !!mine
      const order = await api.placeOrder({ weekId: week.id, name, itemId })
      try {
        localStorage.setItem(NAME_KEY, name.trim())
      } catch {
        /* ignore */
      }
      toast.show(`${updating ? '換好了' : '訂好了'}：${order.itemName}`)
      setCelebrate(true)
      window.setTimeout(() => setCelebrate(false), 1800)
      await refresh()
    } catch (err) {
      toast.show((err as Error).message, 'error')
      refresh()
    } finally {
      setBusy(false)
    }
  }

  async function cancel() {
    if (!week || !mine) return
    if (!window.confirm(`確定取消 ${mine.itemName}？`)) return
    setBusy(true)
    try {
      await api.cancelOrder(week.id, mine.name)
      toast.show('訂單已取消')
      setItemId('')
      await refresh()
    } catch (err) {
      toast.show((err as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  // ── 載入中 / 錯誤 / 沒有菜單
  if (!snap) {
    return (
      <main className="page page--center">
        <Bowl size={200} />
        <p className="muted">{loadError || '盛飯中…'}</p>
        {loadError && (
          <button className="btn" onClick={refresh}>
            再試一次
          </button>
        )}
      </main>
    )
  }

  if (!week) {
    return (
      <main className="page page--center">
        <Bowl size={220} mood="sleep" />
        <h1 className="empty-title">這週菜單還沒上架</h1>
        <p className="muted">負責人放上菜單後，這裡就能點便當。</p>
        <a className="btn btn--ghost" href="#/admin">
          我是負責人，去上菜單
        </a>
      </main>
    )
  }

  return (
    <main className="page">
      {toast.node}

      <section className="hero">
        <div className="hero-bowl">
          <Bowl mood={mood} size={240} />
        </div>
        <div className="hero-text">
          <p className="hero-day">這週的便當</p>
          <h1 className="hero-shop">{week.shop || '這週便當'}</h1>
          <Countdown deadline={week.deadline} onClose={() => forceTick((n) => n + 1)} />
          {week.note && <p className="hero-note">{week.note}</p>}
        </div>
      </section>

      <div className="order-layout">
        {week.imageUrl && (
          <figure className="menu-photo">
            <button className="menu-photo-btn" onClick={() => setZoom(true)} aria-label="放大看菜單">
              <img src={week.imageUrl} alt={`${week.shop} 菜單`} />
            </button>
            <figcaption>點圖片放大</figcaption>
          </figure>
        )}

        <section className="card order-card">
          {closed ? (
            <div className="closed">
              <div className="stamp">已截止</div>
              {mine ? (
                <p>
                  你這週點的是 <b>{mine.itemName}</b>，等開飯！
                </p>
              ) : (
                <p className="muted">這週的訂單已經收齊，下週記得早點點。要補點請直接找負責人。</p>
              )}
            </div>
          ) : (
            <form onSubmit={submit} className="order-form">
              <label className="field">
                <span className="field-label">你的名字</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：小鴨"
                  maxLength={20}
                  autoComplete="name"
                />
              </label>

              {mine && (
                <div className="mine">
                  <span>
                    你已經點了 <b>{mine.itemName}</b>。想換別的，選好再按「換這個便當」。
                  </span>
                  <button type="button" className="link-btn" onClick={cancel} disabled={busy}>
                    取消訂單
                  </button>
                </div>
              )}

              <fieldset className="field">
                <legend className="field-label">選便當</legend>
                <div className="items" role="radiogroup">
                  {week.items.map((it) => {
                    const count = stats.items.find((s) => s.itemId === it.id)?.count ?? 0
                    const on = it.id === itemId
                    return (
                      <label key={it.id} className={`item ${on ? 'item--on' : ''}`}>
                        <input type="radio" name="item" value={it.id} checked={on} onChange={() => setItemId(it.id)} />
                        <span className="item-name">{it.name}</span>
                        <span className="item-count">{count > 0 ? `${count} 人點了` : '還沒人點'}</span>
                      </label>
                    )
                  })}
                </div>
              </fieldset>

              <button className="btn btn--primary btn--big" disabled={busy || (!!mine && mine.itemId === itemId)}>
                {busy ? '送出中…' : mine ? (mine.itemId === itemId ? '已經訂好了' : '換這個便當') : '訂便當'}
              </button>
            </form>
          )}
        </section>
      </div>

      <section className="who">
        <h2>
          已經點的人 <span className="who-count">{stats.total} 人</span>
        </h2>
        {orders.length === 0 ? (
          <p className="muted">還沒有人點，當第一個吧！</p>
        ) : (
          <ul className="who-list">
            {orders.map((o) => (
              <li key={o.id} className={mine?.id === o.id ? 'is-me' : ''}>
                <b>{o.name}</b>
                <span>{o.itemName}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {zoom && week.imageUrl && (
        <div className="lightbox" onClick={() => setZoom(false)} role="dialog" aria-label="菜單大圖">
          <img src={week.imageUrl} alt={`${week.shop} 菜單`} />
          <button className="lightbox-close" onClick={() => setZoom(false)} aria-label="關閉">
            ×
          </button>
        </div>
      )}
    </main>
  )
}
