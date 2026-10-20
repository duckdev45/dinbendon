import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {api} from '../api'
import {Bowl} from '../components/Bowl'
import {useToast} from '../components/Toast'
import {exportExcel} from '../lib/excel'
import {shrinkImage, uid} from '../lib/image'
import {MAX_PRICE, SHOPS} from '../shops'
import {computeStats, shopText} from '../lib/stats'
import {
    defaultDeadline,
    formatDay,
    formatDeadline,
    formatTime,
    fromLocalInput,
    isClosed,
    toLocalInput
} from '../lib/time'
import type {MenuItem, Snapshot, Week, WeekDraft} from '../types'

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
            <main className="page flex min-h-[70vh] flex-col items-center justify-center gap-3 text-center">
                {toast.node}
                <form className="card flex w-[min(360px,100%)] flex-col items-center gap-3.5" onSubmit={login}>
                    <Bowl size={140}/>
                    <h1 className="text-[2rem]">訂單管理</h1>
                    <label className="field w-full text-left">
                        <span className="field-label">負責人密碼</span>
                        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus
                               autoComplete="current-password"/>
                    </label>
                    <button className="btn btn-primary" disabled={checking || !pw}>
                        {checking ? '確認中…' : '進入後台'}
                    </button>
                </form>
            </main>
        )
    }

    return <AdminConsole pw={pw} toast={toast}/>
}

type Tab = 'menu' | 'stats'

const TAB = 'cursor-pointer px-5 py-2 text-soy aria-selected:bg-soy aria-selected:text-yolk'

function AdminConsole({pw, toast}: { pw: string; toast: ReturnType<typeof useToast> }) {
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
            <div className="mt-2 mb-6 flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-[1.8rem]">訂單管理</h1>
                <div className="inline-flex overflow-hidden rounded-full border-3 border-soy bg-rice shadow-pop-sm"
                     role="tablist">
                    <button role="tab" className={TAB} aria-selected={tab === 'stats'} onClick={() => setTab('stats')}>
                        訂單統計
                    </button>
                    <button role="tab" className={`${TAB} border-l-3 border-soy`} aria-selected={tab === 'menu'}
                            onClick={() => setTab('menu')}>
                        菜單設定
                    </button>
                </div>
            </div>
            {!weeks ? (
                <p className="text-soy-soft">載入中…</p>
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
                <StatsPanel pw={pw} weeks={weeks} toast={toast} onEmpty={() => setTab('menu')}/>
            )}
        </main>
    )
}

// ───────────────────────── 菜單設定

function blankDraft(): WeekDraft {
    return {id: uid('w_'), shop: '', imageUrl: '', deadline: defaultDeadline(), items: []}
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

    const set = <K extends keyof WeekDraft>(k: K, v: WeekDraft[K]) => setDraft((d) => ({...d, [k]: v}))
    const setItem = (id: string, patch: Partial<MenuItem>) =>
        set(
            'items',
            draft.items.map((it) => (it.id === id ? {...it, ...patch} : it)),
        )

    function startNewWeek() {
        if (!window.confirm('開新的一週會建立一份空白菜單，上週的訂單仍然保留在「訂單統計」。要繼續嗎？')) return
        // 店家通常不常換，把店名和品項帶過來，負責人只要改不一樣的地方
        setDraft({
            ...blankDraft(),
            shop: draft.shop,
            items: draft.items.map((it) => ({...it, id: uid('i_')})),
        })
        setIsNew(true)
    }

    /** 選常用店家就整份帶入；選「其他」清空讓負責人自己填 */
    function pickShop(name: string) {
        const s = SHOPS.find((x) => x.shop === name)
        setDraft((d) => ({
            ...d,
            shop: s?.shop ?? '',
            imageUrl: s?.image ?? '',
            // 同名品項沿用原本的 id，這週已經有人點的訂單才對得上
            items: s ? s.items.filter(([, price]) => price <= MAX_PRICE).map(([name, price]) => ({
                id: d.items.find((x) => x.name === name)?.id ?? uid('i_'),
                name,
                price
            })) : [],
        }))
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

    /** 一行一個；照抄店家菜單時後面帶的價格會當成單價 */
    function applyBulk() {
        const parsed = bulk
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean)
            .map((l) => {
                const m = l.match(/^(.*?)[\s:：$＄,，]*(\d+)\s*元?$/)
                return {id: uid('i_'), name: (m ? m[1] : l).trim(), price: m ? Number(m[2]) : 0}
            })
            .filter((it) => it.name)
        if (parsed.length === 0) return toast.show('沒有讀到品項，一行寫一個，例如「排骨便當」', 'error')
        set('items', [...draft.items, ...parsed])
        setBulk('')
        setBulkOpen(false)
        toast.show(`加入 ${parsed.length} 種便當`)
    }

    async function save() {
        const items = draft.items.map((it) => ({...it, name: it.name.trim()})).filter((it) => it.name)
        if (!draft.shop.trim()) return toast.show('填一下店家名稱', 'error')
        if (items.length === 0) return toast.show('至少要有一種便當', 'error')
        const over = items.filter((it) => it.price > MAX_PRICE)
        if (over.length) return toast.show(`便當不能超過 $${MAX_PRICE}：${over.map((it) => it.name).join('、')}`, 'error')
        setSaving(true)
        try {
            const saved = await api.admin.saveWeek(pw, {...draft, shop: draft.shop.trim(), items})
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
        <div>
            <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-[1.1rem]">
                    {isNew ? '新的一週' : `正在編輯 ${formatDay(draft.deadline)}截止的菜單`}
                    {!isNew && isClosed(draft.deadline) && <span className="pill text-stamp-dark">已截止</span>}
                </p>
                {!isNew && (
                    <button className="btn btn-ghost" onClick={startNewWeek}>
                        開新的一週
                    </button>
                )}
            </div>

            <div className="grid grid-cols-2 gap-6 max-md:grid-cols-1">
                <section className="card flex flex-col gap-3.5">
                    <h2 className="mb-0">菜單照片</h2>
                    <div
                        className="flex min-h-[220px] flex-col items-center justify-center gap-3.5 rounded-tile border-3 border-dashed border-soy-soft bg-yolk-soft p-4 text-center">
                        {draft.imageUrl ? (
                            <img className="max-h-[280px] max-w-full rounded-lg border-2 border-soy"
                                 src={draft.imageUrl} alt="菜單預覽"/>
                        ) : (
                            <p className="text-soy-soft">把店家菜單拍照上傳，大家點餐時看得到</p>
                        )}
                        <div className="flex items-center gap-4">
                            <button className="btn" onClick={() => fileRef.current?.click()} disabled={uploading}>
                                {uploading ? '上傳中…' : draft.imageUrl ? '換一張' : '上傳圖片'}
                            </button>
                            {draft.imageUrl && (
                                <button className="link-btn" onClick={() => set('imageUrl', '')}>
                                    移除
                                </button>
                            )}
                        </div>
                        <input ref={fileRef} type="file" accept="image/*" hidden
                               onChange={(e) => pickFile(e.target.files?.[0])}/>
                    </div>
                </section>

                <section className="card flex flex-col gap-3.5">
                    <h2 className="mb-0">基本資料</h2>
                    <label className="field">
                        <span className="field-label">常用店家</span>
                        <select value={SHOPS.some((s) => s.shop === draft.shop) ? draft.shop : ''}
                                onChange={(e) => pickShop(e.target.value)}>
                            <option value="">其他店家（自己填）</option>
                            {SHOPS.map((s) => (
                                <option key={s.shop}>{s.shop}</option>
                            ))}
                        </select>
                    </label>
                    <label className="field">
                        <span className="field-label">店家名稱</span>
                        <input value={draft.shop} onChange={(e) => set('shop', e.target.value)}
                               placeholder="例如：阿嬤灶腳便當"/>
                    </label>
                    <label className="field">
                        <span className="field-label">截止時間</span>
                        <input
                            type="datetime-local"
                            value={toLocalInput(draft.deadline)}
                            onChange={(e) => e.target.value && set('deadline', fromLocalInput(e.target.value))}
                        />
                        <span className="text-sm text-soy-soft">
              預設是週五 13:00。
              <button type="button" className="link-btn" onClick={() => set('deadline', defaultDeadline())}>
                改回這週五 13:00
              </button>
            </span>
                    </label>
                </section>

                <section className="card col-span-full flex flex-col gap-3.5">
                    <div className="flex items-baseline justify-between">
                        <h2 className="mb-0">便當種類</h2>
                        <button className="link-btn" onClick={() => setBulkOpen((o) => !o)}>
                            {bulkOpen ? '收起' : '從文字貼上'}
                        </button>
                    </div>
                    {bulkOpen && (
                        <div className="flex flex-col items-start gap-2.5">
              <textarea
                  rows={5}
                  value={bulk}
                  onChange={(e) => setBulk(e.target.value)}
                  placeholder={'一行一種，後面可以帶價錢\n排骨便當 100\n雞腿便當 $110'}
              />
                            <button className="btn" onClick={applyBulk}>
                                加入清單
                            </button>
                        </div>
                    )}
                    {draft.items.length === 0 && !bulkOpen &&
                        <p className="text-soy-soft">還沒有便當，按下面的按鈕新增。</p>}
                    <ul className="grid grid-cols-2 gap-x-6 gap-y-2.5 max-md:grid-cols-1">
                        {draft.items.map((it, i) => (
                            <li key={it.id} className="flex items-center gap-2">
                                <input aria-label={`第 ${i + 1} 種便當名稱`} value={it.name}
                                       onChange={(e) => setItem(it.id, {name: e.target.value})} placeholder="便當名稱"/>
                                <input
                                    className="w-24 flex-none aria-invalid:border-stamp aria-invalid:text-stamp"
                                    type="number"
                                    inputMode="numeric"
                                    min={0}
                                    max={MAX_PRICE}
                                    aria-invalid={it.price > MAX_PRICE}
                                    aria-label={`第 ${i + 1} 種便當單價`}
                                    value={it.price || ''}
                                    onChange={(e) => setItem(it.id, {price: Math.max(0, Math.round(Number(e.target.value) || 0))})}
                                    placeholder="$ 單價"
                                />
                                <button
                                    className="size-9 flex-none cursor-pointer rounded-full border-2 border-soy bg-rice text-[1.3rem] leading-none text-soy hover:bg-stamp hover:text-rice"
                                    aria-label={`刪除 ${it.name}`}
                                    onClick={() => set('items', draft.items.filter((x) => x.id !== it.id))}
                                >
                                    ×
                                </button>
                            </li>
                        ))}
                    </ul>
                    <button className="btn btn-ghost w-full"
                            onClick={() => set('items', [...draft.items, {id: uid('i_'), name: '', price: 0}])}>
                        + 加一種便當
                    </button>
                </section>
            </div>

            <div className="mt-6 flex justify-end">
                <button className="btn btn-primary btn-big" onClick={save} disabled={saving || uploading}>
                    {saving ? '儲存中…' : isNew ? '發佈菜單' : '儲存菜單'}
                </button>
            </div>
        </div>
    )
}

// ───────────────────────── 訂單統計

const TILE = 'flex items-baseline rounded-card border-3 border-soy px-5 py-4 shadow-pop'
const NUM = 'font-num text-[clamp(1.8rem,4vw,2.6rem)] leading-none font-bold'

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
    const priceOf = (itemId: string) => stats.items.find((s) => s.itemId === itemId)?.price ?? 0

    if (weeks.length === 0) {
        return (
            <div className="card flex flex-col items-center gap-3 text-center">
                <p>還沒有任何菜單。</p>
                <button className="btn btn-primary" onClick={onEmpty}>
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
        <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center gap-3">
                <label>
                    <span className="sr-only">選擇哪一週</span>
                    <select className="w-auto rounded-full px-4 py-2" value={weekId}
                            onChange={(e) => setWeekId(e.target.value)}>
                        {weeks.map((w) => (
                            <option key={w.id} value={w.id}>
                                {w.shop || '未命名'}（{formatDay(w.deadline)}截止）
                            </option>
                        ))}
                    </select>
                </label>
                {week && (
                    <span className={`pill ${isClosed(week.deadline) ? 'text-stamp-dark' : 'text-scallion'}`}>
            {isClosed(week.deadline) ? '已截止' : `收單中，${formatDeadline(week.deadline)} 截止`}
          </span>
                )}
                <div className="ml-auto flex flex-wrap gap-2.5 max-md:ml-0">
                    <button className="btn" onClick={load}>
                        重新整理
                    </button>
                    <button className="btn" onClick={copyForShop} disabled={!stats.total}>
                        複製給店家
                    </button>
                    <button className="btn btn-primary" onClick={doExport} disabled={!week || exporting}>
                        {exporting ? '匯出中…' : '匯出 Excel'}
                    </button>
                </div>
            </div>

            {!snap ? (
                <p className="text-soy-soft">載入中…</p>
            ) : (
                <>
                    <div
                        className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)] gap-4 max-md:grid-cols-2">
                        <div className={`${TILE} gap-2 bg-rice`}>
                            <span className={NUM}>{stats.total}</span>
                            <span>人訂餐</span>
                        </div>
                        <div className={`${TILE} gap-2 bg-rice`}>
                            <span className={NUM}>${stats.amount}</span>
                            <span>總金額</span>
                        </div>
                        <div className={`${TILE} flex-col gap-1 bg-yolk max-md:col-span-full`}>
                            <span>最多人點</span>
                            <span className="text-[clamp(1.3rem,3vw,1.8rem)] leading-[1.2]">{topText(stats.tops)}</span>
                        </div>
                    </div>

                    <section className="card">
                        <h2>各便當數量</h2>
                        <ul className="flex flex-col gap-3.5">
                            {stats.items.map((s) => (
                                <li
                                    key={s.itemId}
                                    className={`grid grid-cols-[minmax(7em,12em)_1fr_3em] items-center gap-x-3 gap-y-1 max-md:grid-cols-[1fr_auto] ${s.count === 0 ? 'text-soy-soft' : ''}`}
                                >
                  <span>
                    {s.name}
                      {s.price > 0 && <span className="ml-1.5 text-sm text-soy-soft">${s.price}</span>}
                  </span>
                                    <span
                                        className="h-[22px] overflow-hidden rounded-full border-2 border-soy bg-yolk-soft max-md:col-span-full max-md:row-start-2">
                    <span
                        className={`block h-full bg-stamp transition-[width] duration-500 ease-[cubic-bezier(0.3,1.3,0.5,1)] ${s.count === 0 ? '' : 'border-r-2 border-soy'}`}
                        style={{width: `${(s.count / maxCount) * 100}%`}}
                    />
                  </span>
                                    <span className="text-right font-num font-semibold tabular-nums">{s.count}</span>
                                    {s.people.length > 0 && <span
                                        className="col-[2/-1] -mt-1.5 text-sm text-soy-soft max-md:col-span-full max-md:mt-0">{s.people.join('、')}</span>}
                                </li>
                            ))}
                        </ul>
                    </section>

                    <section className="card">
                        <h2>訂單明細</h2>
                        {snap.orders.length === 0 ? (
                            <p className="text-soy-soft">這週還沒有人點。把點餐頁網址貼到群組吧！</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-md">
                                    <thead>
                                    <tr>
                                        <th>姓名</th>
                                        <th>便當</th>
                                        <th className="text-right">金額</th>
                                        <th>時間</th>
                                        <th>
                                            <span className="sr-only">操作</span>
                                        </th>
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {snap.orders.map((o) => (
                                        <tr key={o.id} className="hover:bg-yolk-soft">
                                            <td>{o.name}</td>
                                            <td>{o.itemName}</td>
                                            <td className="text-right font-num tabular-nums">{priceOf(o.itemId) ? `$${priceOf(o.itemId)}` : '—'}</td>
                                            <td className="text-soy-soft">{formatTime(o.updatedAt)}</td>
                                            <td>
                                                <button className="link-btn text-stamp-dark"
                                                        onClick={() => remove(o.id, o.name)}>
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
