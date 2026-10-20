import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {api} from '../api'
import {SlotMachine} from '../components/SlotMachine'
import {useToast} from '../components/Toast'
import {exportExcel} from '../lib/excel'
import {shrinkImage, uid} from '../lib/image'
import {DRINK_SHOPS, MAX_PRICE, SHOPS} from '../shops'
import {currentRounds} from '../lib/drink'
import {computeStats, drinkSummary, orderLabel, orderPrice, shopText} from '../lib/stats'
import {
    defaultDeadline,
    formatDay,
    formatDeadline,
    formatTime,
    fromLocalInput,
    isClosed,
    toLocalInput
} from '../lib/time'
import type {MenuItem, RoundKind, Snapshot, Week, WeekDraft} from '../types'

// 訂單管理不用密碼，知道網址就能進；API 的 password 參數留著傳空字串，後端已不檢查
export function AdminPage() {
    const toast = useToast()
    return <AdminConsole pw="" toast={toast}/>
}

type Tab = 'menu' | 'drink' | 'stats'

const TAB = 'cursor-pointer px-5 py-2 text-soy aria-selected:bg-soy aria-selected:text-yolk'

function AdminConsole({pw, toast}: { pw: string; toast: ReturnType<typeof useToast> }) {
    // 從點餐頁「開便當團 / 開飲料團」過來會帶 #/admin/menu、#/admin/drink
    const [tab, setTab] = useState<Tab>(() => {
        const t = window.location.hash.split('/')[2]
        return t === 'menu' || t === 'drink' ? t : 'stats'
    })
    const [weeks, setWeeks] = useState<Week[] | null>(null)

    const loadWeeks = useCallback(async () => {
        try {
            const list = await api.admin.listWeeks(pw)
            setWeeks(list)
            if (list.length === 0) setTab((t) => (t === 'stats' ? 'menu' : t))
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
                    <button role="tab" className={`${TAB} border-l-3 border-soy`} aria-selected={tab === 'drink'}
                            onClick={() => setTab('drink')}>
                        飲料 Bonus
                    </button>
                </div>
            </div>
            {!weeks ? (
                <p className="text-soy-soft">載入中…</p>
            ) : tab !== 'stats' ? (
                <MenuEditor
                    key={tab}
                    kind={tab === 'drink' ? 'drink' : 'bento'}
                    pw={pw}
                    // 飲料團只接著編收單中的那團，截止了就開新的
                    current={currentRounds(weeks)[tab === 'drink' ? 'drink' : 'bento']}
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

/** 飲料團預設開團後 1 小時截止 */
const drinkDeadline = () => new Date(Date.now() + 3600_000).toISOString()

function blankDraft(kind: RoundKind): WeekDraft {
    const deadline = kind === 'drink' ? drinkDeadline() : defaultDeadline()
    // 飲料團預設由自己開（點餐頁記住的名字）、抖內
    let host = ''
    try {
        host = kind === 'drink' ? localStorage.getItem('dinbendon:name') ?? '' : ''
    } catch {
        /* ignore */
    }
    return {id: uid('w_'), kind, shop: '', imageUrl: '', deadline, items: [], addons: [], host, mode: 'treat'}
}

function MenuEditor({
                        kind,
                        pw,
                        current,
                        toast,
                        onSaved,
                    }: {
    kind: RoundKind
    pw: string
    current: Week | null
    toast: ReturnType<typeof useToast>
    onSaved: () => Promise<void>
}) {
    const drink = kind === 'drink'
    const unit = drink ? '飲料' : '便當'
    // 舊後端的資料沒有 addons，補空陣列
    const [draft, setDraft] = useState<WeekDraft>(() => (current ? {...current, addons: current.addons ?? []} : blankDraft(kind)))
    const [isNew, setIsNew] = useState(!current)
    const [uploading, setUploading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [bulkOpen, setBulkOpen] = useState(false)
    const [bulk, setBulk] = useState('')
    const fileRef = useRef<HTMLInputElement>(null)

    const set = <K extends keyof WeekDraft>(k: K, v: WeekDraft[K]) => setDraft((d) => ({...d, [k]: v}))
    function startNewWeek() {
        if (!window.confirm(`開新的${drink ? '飲料團' : '一週'}會建立一份新菜單，之前的訂單仍然保留在「訂單統計」。要繼續嗎？`)) return
        // 店家通常不常換，把店名和品項帶過來，負責人只要改不一樣的地方
        setDraft({
            ...blankDraft(kind),
            shop: draft.shop,
            imageUrl: draft.imageUrl,
            items: draft.items.map((it) => ({...it, id: uid('i_')})),
            addons: draft.addons.map((it) => ({...it, id: uid('a_')})),
        })
        setIsNew(true)
    }

    /** 選常用店家就整份帶入；便當選「其他」清空讓負責人自己填，飲料只能拉霸抽 */
    function pickShop(name: string) {
        const s = (drink ? DRINK_SHOPS : SHOPS).find((x) => x.shop === name)
        const ds = DRINK_SHOPS.find((x) => drink && x.shop === name)
        const addons = ds?.addons ?? []
        // 同名品項沿用原本的 id，已經有人點的訂單才對得上
        const keep = (list: MenuItem[], rows: [string, number][], prefix: string) =>
            rows.map(([name, price]) => ({id: list.find((x) => x.name === name)?.id ?? uid(prefix), name, price}))
        setDraft((d) => ({
            ...d,
            shop: s?.shop ?? '',
            // 飲料團不放菜單照片，imageUrl 存店家 logo
            imageUrl: ds ? ds.logo : SHOPS.find((x) => x.shop === name)?.image ?? '',
            // 便當超過上限的不帶入；飲料不設限
            items: s ? keep(d.items, s.items.filter(([, price]) => drink || price <= MAX_PRICE), 'i_') : [],
            addons: keep(d.addons, addons, 'a_'),
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
        toast.show(`加入 ${parsed.length} 種${unit}`)
    }

    async function save() {
        const tidy = (list: MenuItem[]) => list.map((it) => ({...it, name: it.name.trim()})).filter((it) => it.name)
        const items = tidy(draft.items)
        if (drink && !draft.host.trim()) return toast.show('填一下你的名字，大家才知道誰開的團', 'error')
        if (!draft.shop.trim()) return toast.show(drink ? '先拉一下拉霸，抽今天喝哪家' : '填一下店家名稱', 'error')
        if (items.length === 0) return toast.show(`至少要有一種${unit}`, 'error')
        const over = drink ? [] : items.filter((it) => it.price > MAX_PRICE)
        if (over.length) return toast.show(`便當不能超過 $${MAX_PRICE}：${over.map((it) => it.name).join('、')}`, 'error')
        setSaving(true)
        try {
            const saved = await api.admin.saveWeek(pw, {...draft, shop: draft.shop.trim(), host: draft.host.trim(), items, addons: tidy(draft.addons)})
            // 舊版 Code.gs 不認得飲料團，會存成便當蓋掉這週菜單
            if (drink && saved.kind !== 'drink') throw new Error('後端 Code.gs 是舊版，請先貼上新版並部署，再開飲料團')
            setDraft(saved)
            toast.show(isNew ? (drink ? `${draft.mode === 'group' ? '揪團' : '抖內'}開好了，大家的畫面會跳出來` : '菜單已發佈，大家可以點了') : '菜單已儲存', 'ok', drink ? 'boba' : 'bowl')
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
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                {drink && isNew ? (
                    // 誰開的團＋抖內（請大家喝）還是揪團（各付各的）
                    <div className="flex flex-wrap items-end gap-3">
                        <label className="field w-48">
                            <span className="field-label">你的名字</span>
                            <input value={draft.host} onChange={(e) => set('host', e.target.value)} maxLength={20}/>
                        </label>
                        <div className="inline-flex overflow-hidden rounded-full border-3 border-soy bg-rice shadow-pop-sm" role="radiogroup" aria-label="抖內還是揪團">
                            {([['treat', '抖內', '我請大家喝'], ['group', '揪團', '各付各的']] as const).map(([m, label, hint], i) => (
                                <button key={m} type="button" role="radio" aria-checked={draft.mode === m} onClick={() => set('mode', m)}
                                        className={`${TAB} ${i ? 'border-l-3 border-soy' : ''} aria-checked:bg-soy aria-checked:text-yolk`}>
                                    {label}<span className="ml-1.5 text-sm opacity-75">{hint}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                <p className="text-[1.1rem]">
                    {isNew
                        ? '新的一週'
                        : drink
                            ? `${draft.host} 的${draft.mode === 'group' ? '揪團' : '抖內'}・${formatDeadline(draft.deadline)}截止`
                            : `正在編輯 ${formatDay(draft.deadline)}截止的菜單`}
                    {!isNew && isClosed(draft.deadline) && <span className="pill text-stamp-dark">已截止</span>}
                </p>
                )}
                {!isNew && (
                    <button className="btn btn-ghost" onClick={startNewWeek}>
                        {drink ? '開新的飲料團' : '開新的一週'}
                    </button>
                )}
            </div>

            <div className="grid grid-cols-2 gap-6 max-md:grid-cols-1">
                {!drink && (
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
                )}

                <section className={`card flex flex-col gap-3.5 ${drink ? 'col-span-full' : ''}`}>
                    <h2 className="mb-0">{drink ? '今天喝哪家？' : '基本資料'}</h2>
                    {drink ? (
                        // 飲料店只能拉霸抽，開團後就不能換
                        <SlotMachine shops={DRINK_SHOPS} value={draft.shop} onPick={pickShop} locked={!isNew}/>
                    ) : (
                    <>
                    <label className="field">
                        <span className="field-label">常用店家</span>
                        <select value={(drink ? DRINK_SHOPS : SHOPS).some((s) => s.shop === draft.shop) ? draft.shop : ''}
                                onChange={(e) => pickShop(e.target.value)}>
                            <option value="">其他店家（自己填）</option>
                            {(drink ? DRINK_SHOPS : SHOPS).map((s) => (
                                <option key={s.shop}>{s.shop}</option>
                            ))}
                        </select>
                    </label>
                    <label className="field">
                        <span className="field-label">店家名稱</span>
                        <input value={draft.shop} onChange={(e) => set('shop', e.target.value)}
                               placeholder="例如：阿嬤灶腳便當"/>
                    </label>
                    </>
                    )}
                    <label className="field">
                        <span className="field-label">截止時間</span>
                        <input
                            type="datetime-local"
                            value={toLocalInput(draft.deadline)}
                            onChange={(e) => e.target.value && set('deadline', fromLocalInput(e.target.value))}
                        />
                        {drink ? (
                            <span className="text-sm text-soy-soft">
                                限時 bonus，預設開團後 1 小時。
                                <button type="button" className="link-btn" onClick={() => set('deadline', drinkDeadline())}>
                                    改成 1 小時後
                                </button>
                            </span>
                        ) : (
                            <span className="text-sm text-soy-soft">
                                預設是週五 13:00。
                                <button type="button" className="link-btn" onClick={() => set('deadline', defaultDeadline())}>
                                    改回這週五 13:00
                                </button>
                            </span>
                        )}
                    </label>
                </section>

                <section className="card col-span-full flex flex-col gap-3.5">
                    <div className="flex items-baseline justify-between">
                        <h2 className="mb-0">{unit}種類{drink && <span className="ml-2 text-sm font-normal text-soy-soft">一律 L，填 L 的價錢</span>}</h2>
                        {!drink && (
                            <button className="link-btn" onClick={() => setBulkOpen((o) => !o)}>
                                {bulkOpen ? '收起' : '從文字貼上'}
                            </button>
                        )}
                    </div>
                    {bulkOpen && (
                        <div className="flex flex-col items-start gap-2.5">
              <textarea
                  rows={5}
                  value={bulk}
                  onChange={(e) => setBulk(e.target.value)}
                  placeholder={drink ? '一行一種，後面可以帶價錢\n茶花紅烏龍 75' : '一行一種，後面可以帶價錢\n排骨便當 100\n雞腿便當 $110'}
              />
                            <button className="btn" onClick={applyBulk}>
                                加入清單
                            </button>
                        </div>
                    )}
                    {draft.items.length === 0 && !bulkOpen &&
                        <p className="text-soy-soft">{drink ? '拉霸抽到店家後，飲料會自動帶進來。' : `還沒有${unit}，按下面的按鈕新增。`}</p>}
                    <ItemRows list={draft.items} onChange={(v) => set('items', v)} unit={unit} max={drink ? undefined : MAX_PRICE}/>
                </section>

                {drink && (
                    <section className="card col-span-full flex flex-col gap-3.5">
                        <h2 className="mb-0">加料<span className="ml-2 text-sm font-normal text-soy-soft">每杯選一種</span></h2>
                        {draft.addons.length === 0 && <p className="text-soy-soft">沒有加料就留空。</p>}
                        <ItemRows list={draft.addons} onChange={(v) => set('addons', v)} unit="加料"/>
                    </section>
                )}
            </div>

            <div className="mt-6 flex justify-end">
                <button className="btn btn-primary btn-big" onClick={save} disabled={saving || uploading}>
                    {saving ? '儲存中…' : isNew ? (drink ? '開團！' : '發佈菜單') : '儲存菜單'}
                </button>
            </div>
        </div>
    )
}

/** 品項清單：名稱＋單價＋刪除，最後一顆新增；便當有上限，超過的單價變紅 */
function ItemRows({list, onChange, unit, max}: {
    list: MenuItem[]
    onChange: (list: MenuItem[]) => void
    unit: string
    max?: number
}) {
    const patch = (id: string, p: Partial<MenuItem>) => onChange(list.map((it) => (it.id === id ? {...it, ...p} : it)))
    return (
        <>
            <ul className="grid grid-cols-2 gap-x-6 gap-y-2.5 max-md:grid-cols-1">
                {list.map((it, i) => (
                    <li key={it.id} className="flex items-center gap-2">
                        <input aria-label={`第 ${i + 1} 種${unit}名稱`} value={it.name}
                               onChange={(e) => patch(it.id, {name: e.target.value})} placeholder={`${unit}名稱`}/>
                        <input
                            className="w-24 flex-none aria-invalid:border-stamp aria-invalid:text-stamp"
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={max}
                            aria-invalid={max != null && it.price > max}
                            aria-label={`第 ${i + 1} 種${unit}單價`}
                            value={it.price || ''}
                            onChange={(e) => patch(it.id, {price: Math.max(0, Math.round(Number(e.target.value) || 0))})}
                            placeholder="$ 單價"
                        />
                        <button
                            className="size-9 flex-none cursor-pointer rounded-full border-2 border-soy bg-rice text-[1.3rem] leading-none text-soy hover:bg-stamp hover:text-rice"
                            aria-label={`刪除 ${it.name}`}
                            onClick={() => onChange(list.filter((x) => x.id !== it.id))}
                        >
                            ×
                        </button>
                    </li>
                ))}
            </ul>
            <button className="btn btn-ghost w-full" onClick={() => onChange([...list, {id: uid('i_'), name: '', price: 0}])}>
                + 加一種{unit}
            </button>
        </>
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
            await navigator.clipboard.writeText(shopText(week, stats, snap!.orders))
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
                                {w.kind === 'drink' ? (w.mode === 'group' ? '【揪團】' : '【抖內】') : ''}{w.shop || '未命名'}（{formatDay(w.deadline)}截止）
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
                        {week?.kind === 'drink' ? '複製訂單' : '複製給店家'}
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

                    {week?.kind === 'drink' ? (
                        <section className="card">
                            <h2>訂購統計表</h2>
                            {snap.orders.length === 0 ? (
                                <p className="text-soy-soft">還沒有人點。</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-md">
                                        <thead>
                                        <tr>
                                            <th>飲料（L）</th>
                                            <th className="text-right">杯數</th>
                                            <th className="text-right">單價</th>
                                            <th className="text-right">小計</th>
                                            <th>誰點的</th>
                                        </tr>
                                        </thead>
                                        <tbody>
                                        {drinkSummary(week, snap.orders).map((r) => (
                                            <tr key={r.label} className="hover:bg-yolk-soft">
                                                <td>{r.label}</td>
                                                <td className="text-right font-num tabular-nums">{r.count}</td>
                                                <td className="text-right font-num tabular-nums">${r.price}</td>
                                                <td className="text-right font-num tabular-nums">${r.subtotal}</td>
                                                <td className="whitespace-normal text-soy-soft">{r.people.join('、')}</td>
                                            </tr>
                                        ))}
                                        <tr className="font-bold">
                                            <td>合計</td>
                                            <td className="text-right font-num tabular-nums">{stats.total}</td>
                                            <td/>
                                            <td className="text-right font-num tabular-nums">${stats.amount}</td>
                                            <td/>
                                        </tr>
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </section>
                    ) : (
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
                    )}

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
                                        <th>餐點</th>
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
                                            <td>{orderLabel(o)}</td>
                                            <td className="text-right font-num tabular-nums">{orderPrice(snap.week, o) ? `$${orderPrice(snap.week, o)}` : '—'}</td>
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
