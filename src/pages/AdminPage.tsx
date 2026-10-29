import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {api} from '../api'
import {useConfirm} from '../components/Confirm'
import {LockIcon} from '../components/LockIcon'
import {SlotMachine} from '../components/SlotMachine'
import {useToast} from '../components/Toast'
import {exportExcel} from '../lib/excel'
import {shrinkImage, uid} from '../lib/image'
import {MAX_PRICE, parseBulk, presets} from '../shops'
import {currentRounds, endsEarly, isBonus, privateRounds, recentRounds, secretName, statsPick} from '../lib/drink'
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
import type {MenuItem, RoundKind, ShopPreset, ShopRow, Snapshot, Week, WeekDraft} from '../types'

// 訂單管理不用密碼，知道網址就能進；API 的 password 參數留著傳空字串，後端已不檢查
export function AdminPage() {
    const toast = useToast()
    return <AdminConsole pw="" toast={toast}/>
}

type Tab = 'menu' | 'drink' | 'snack' | 'shops' | 'stats'

const UNIT = {bento: '便當', drink: '飲料', snack: '點心'} as const
const ICON = {bento: 'bowl', drink: 'boba', snack: 'wheel'} as const

type Ask = ReturnType<typeof useConfirm>['ask']

/** 要密碼的確認卡片底下的提示 */
const pwHint = (owner = '') => `訂單需要密碼才能修改，請聯絡負責人${owner ? ' ' + owner : ''}`

const TAB = 'cursor-pointer px-5 py-2 whitespace-nowrap text-soy aria-selected:bg-soy aria-selected:text-yolk max-md:flex-1 max-md:px-2'

function AdminConsole({pw, toast}: { pw: string; toast: ReturnType<typeof useToast> }) {
    // 從點餐頁「開便當團 / 開飲料團 / 開點心團」過來會帶 #/admin/menu、#/admin/drink、#/admin/snack
    const [tab, setTab] = useState<Tab>(() => {
        const t = window.location.hash.split('/')[2]
        return t === 'menu' || t === 'drink' || t === 'snack' || t === 'shops' ? t : 'stats'
    })
    // 「菜單」分頁給行政統一維護店家，裡面再分便當／飲料／點心
    const [shopKind, setShopKind] = useState<RoundKind>('bento')
    const kind: RoundKind = tab === 'shops' ? shopKind : tab === 'drink' || tab === 'snack' ? tab : 'bento'
    const [weeks, setWeeks] = useState<Week[] | null>(null)
    const [latest, setLatest] = useState<Snapshot | null>(null)
    // null = 舊版 Code.gs 沒有 shops 表
    const [shopRows, setShopRows] = useState<ShopRow[] | null>(null)
    const {ask, node: confirmNode} = useConfirm()
    const shops = useMemo(() => presets(kind, weeks ?? [], shopRows ?? []), [kind, weeks, shopRows])
    // 喝飲料不揪開完，飲料頁就回到公開的團；要改截止時間、流團，從上面那排叫出來（輸入通關密碼，從後端拿完整那團）
    // fresh = 剛開好，進來先秀連結和通關密碼
    const [priv, setPriv] = useState<{ week: Week; secret: string; fresh?: boolean } | null>(null)
    const privList = privateRounds(weeks ?? [], kind)
    const listed = priv && privList.find((w) => w.id === priv.week.id)
    // 截止了、換頁就不管了；清單沒有誰揪、負責人（後端遮掉），用拿到的那份補回來
    const managing = listed ? {...priv!, week: {...listed, host: priv!.week.host, owner: priv!.week.owner}} : null

    async function manage(w: Week) {
        await ask(`${secretName(w.kind)}\n輸入通關密碼才能管理這團`, {
            password: true, label: '通關密碼', icon: <LockIcon size={56}/>,
            check: async (v) => {
                const {week} = await api.admin.getWeek(pw, w.id, v)
                if (week) setPriv({week, secret: v})
            },
        })
    }

    const loadWeeks = useCallback(async () => {
        try {
            const {weeks: list, latest, shops} = await api.admin.listWeeks(pw)
            setWeeks(list)
            setLatest(latest)
            setShopRows(shops ?? null)
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
            {confirmNode}
            <div className="mt-2 mb-6 flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-[1.8rem]">訂單管理</h1>
                <div
                    className="inline-flex overflow-hidden rounded-full border-3 border-soy bg-rice shadow-pop-sm max-md:flex max-md:w-full"
                    role="tablist">
                    <button role="tab" className={TAB} aria-selected={tab === 'stats'}
                            onClick={() => (setTab('stats'), setPriv(null))}>
                        訂單統計
                    </button>
                    {(['menu', 'drink', 'snack'] as const).map((t) => (
                        <button key={t} role="tab" className={`${TAB} border-l-3 border-soy`} aria-selected={tab === t}
                                onClick={() => (setTab(t), setPriv(null))}>
                            {UNIT[t === 'menu' ? 'bento' : t]}
                        </button>
                    ))}
                    <button role="tab" className={`${TAB} border-l-3 border-soy`} aria-selected={tab === 'shops'}
                            onClick={() => (setTab('shops'), setPriv(null))}>
                        菜單
                    </button>
                </div>
            </div>
            {!weeks ? (
                <p className="text-soy-soft">載入中…</p>
            ) : tab === 'shops' ? (
                <>
                    <div className="mb-4 inline-flex overflow-hidden rounded-full border-3 border-soy bg-rice shadow-pop-sm"
                         role="tablist">
                        {(['bento', 'drink', 'snack'] as const).map((k, i) => (
                            <button key={k} role="tab" className={`${TAB} ${i ? 'border-l-3 border-soy' : ''}`}
                                    aria-selected={shopKind === k} onClick={() => setShopKind(k)}>
                                {UNIT[k]}
                            </button>
                        ))}
                    </div>
                    <ShopShelf key={kind} kind={kind} shops={shops} ask={ask} pw={pw} toast={toast}
                               onSaved={setShopRows}/>
                </>
            ) : tab !== 'stats' ? (
                <>
                    {privList.length > 0 && (
                        <div className="mb-4 flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1 font-bold"><LockIcon
                                size={18}/>收單中的{secretName(kind)}</span>
                            {privList.map((w) => (
                                <button key={w.id}
                                        className={`btn ${managing?.week.id === w.id ? 'btn-primary' : 'btn-ghost'}`}
                                        onClick={() => manage(w)} disabled={managing?.week.id === w.id}>
                                    {w.shop || '未命名'}・{formatDeadline(w.deadline)}截止
                                </button>
                            ))}
                            {managing &&
                                <button className="link-btn" onClick={() => setPriv(null)}>回到公開的團</button>}
                        </div>
                    )}
                    <MenuEditor
                        key={`${tab}-${managing?.week.id ?? currentRounds(weeks)[kind]?.id ?? 'new'}`}
                        kind={kind}
                        shops={shops}
                        ask={ask}
                        pw={pw}
                        // 飲料團、點心團只接著編收單中的那團，截止了就開新的
                        current={managing?.week ?? currentRounds(weeks)[kind]}
                        secret={managing?.secret}
                        invite={managing?.fresh}
                        // 開好的喝飲料不揪換成管理那團，不然編輯器還掛著原本公開的團（店家鎖、提早結束的密碼會對錯團）
                        onCreatedPrivate={(week, secret) => setPriv({week, secret, fresh: true})}
                        toast={toast}
                        onSaved={async () => {
                            await loadWeeks()
                        }}
                    />
                </>
            ) : (
                <StatsPanel pw={pw} weeks={weeks} initial={latest} ask={ask} toast={toast}
                            onEmpty={() => setTab('menu')}/>
            )}
        </main>
    )
}

// ───────────────────────── 菜單設定

/** 飲料團、點心團預設開團後 1 小時截止 */
const drinkDeadline = () => new Date(Date.now() + 3600_000).toISOString()

function blankDraft(kind: RoundKind): WeekDraft {
    const deadline = isBonus(kind) ? drinkDeadline() : defaultDeadline()
    // 負責人、飲料團點心團請客的人預設都是自己（點餐頁記住的名字）；飲料預設揪團，點心預設抖內
    let me = ''
    try {
        me = localStorage.getItem('dinbendon:name') ?? ''
    } catch {
        /* ignore */
    }
    return {
        id: uid('w_'),
        kind,
        shop: '',
        imageUrl: '',
        deadline,
        items: [],
        addons: [],
        host: isBonus(kind) ? me : '',
        owner: me,
        mode: kind === 'drink' ? 'group' : 'treat'
    }
}

function MenuEditor({
                        kind,
                        shops,
                        ask,
                        pw,
                        current,
                        secret: initialSecret = '',
                        invite: initialInvite = false,
                        onCreatedPrivate,
                        toast,
                        onSaved,
                    }: {
    kind: RoundKind
    /** 常用店家（內建＋開過的團＋手動維護的） */
    shops: ShopPreset[]
    ask: Ask
    pw: string
    current: Week | null
    /** 管理喝飲料不揪時帶通關密碼，改內容、流團後端要驗 */
    secret?: string
    invite?: boolean
    onCreatedPrivate: (week: Week, secret: string) => void
    toast: ReturnType<typeof useToast>
    onSaved: () => Promise<void>
}) {
    const drink = kind === 'drink'
    // 點心團：跟飲料團一樣限時、抖內或揪團，沒有內建店家，開過的才會出現在常用店家
    const bonus = isBonus(kind)
    const unit = UNIT[kind]
    // 舊後端的資料沒有 addons，補空陣列
    const [draft, setDraft] = useState<WeekDraft>(() => (current ? {
        ...current,
        addons: current.addons ?? []
    } : blankDraft(kind)))
    const [isNew, setIsNew] = useState(!current)
    // 開團密碼：開新團時設定，之後刪訂單、提早結束要輸入
    const [roundPw, setRoundPw] = useState('')
    // 喝飲料不揪的通關密碼：開團時設定，給要揪的人
    const [secret, setSecret] = useState(initialSecret)
    // 喝飲料不揪開好後在畫面中間秀連結＋通關密碼，一鍵複製整段貼到群組
    const [invite, setInvite] = useState(initialInvite)
    // 飲料店預設拉霸抽，打開開關就直接從下拉選
    const [direct, setDirect] = useState(false)
    const link = `${window.location.origin}${window.location.pathname}#/r/${draft.id}`
    const inviteText = [
        `【${secretName(kind)}】${draft.host} ${draft.mode === 'group' ? '揪團' : '請'}${drink ? '喝' : '吃'}${unit}！`,
        `店家：${draft.shop}`,
        `截止：${formatDeadline(draft.deadline)}`,
        `連結：${link}`,
        `通關密碼：${secret}`,
    ].join('\n')
    // 便當、點心：已經有人點了就不能換店家（null = 還在查）
    const [ordered, setOrdered] = useState<number | null>(null)
    useEffect(() => {
        if (!current || drink) return
        api.admin.getWeek(pw, current.id, secret).then((s) => setOrdered(s.orders.length)).catch(() => setOrdered(null))
    }, [current?.id]) // eslint-disable-line react-hooks/exhaustive-deps
    const shopLocked = !drink && !isNew && !!ordered
    const [uploading, setUploading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [bulkOpen, setBulkOpen] = useState(false)
    const [bulk, setBulk] = useState('')
    const fileRef = useRef<HTMLInputElement>(null)

    const set = <K extends keyof WeekDraft>(k: K, v: WeekDraft[K]) => setDraft((d) => ({...d, [k]: v}))

    async function startNewWeek() {
        if ((await ask('開新的一週會建立一份新菜單，\n之前的訂單仍然保留在「訂單統計」。', {ok: '開新的一週'})) === null) return
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

    /** 選常用店家就整份帶入；便當、點心選「其他」清空讓負責人自己填，飲料拉霸抽或直接選 */
    function pickShop(name: string) {
        const s = shops.find((x) => x.shop === name)
        // 同名品項沿用原本的 id，已經有人點的訂單才對得上
        const keep = (list: MenuItem[], rows: [string, number][], prefix: string) =>
            rows.map(([name, price]) => ({id: list.find((x) => x.name === name)?.id ?? uid(prefix), name, price}))
        setDraft((d) => ({
            ...d,
            shop: s?.shop ?? '',
            // 飲料團不放菜單照片，imageUrl 存店家 logo
            imageUrl: s?.imageUrl ?? '',
            // 便當超過上限的不帶入；飲料、點心不設限
            items: s ? keep(d.items, s.items.filter(([, price]) => bonus || price <= MAX_PRICE), 'i_') : [],
            addons: keep(d.addons, s?.addons ?? [], 'a_'),
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

    function applyBulk() {
        const parsed = parseBulk(bulk).map(([name, price]) => ({id: uid('i_'), name, price}))
        if (parsed.length === 0) return toast.show('沒有讀到品項，一行寫一個，例如「排骨便當」', 'error')
        set('items', [...draft.items, ...parsed])
        setBulk('')
        setBulkOpen(false)
        toast.show(`加入 ${parsed.length} 種${unit}`)
    }

    async function copyInvite() {
        try {
            await navigator.clipboard.writeText(inviteText)
            toast.show('已複製，直接貼給要揪的人', 'ok', ICON[kind])
        } catch {
            toast.show('瀏覽器不讓複製，請手動選取', 'error')
        }
    }

    /** 收單中的團還開著，也能另開一團喝飲料不揪（不會擋到、也不會擠掉公開的團） */
    function startPrivate() {
        setDraft({...blankDraft(kind), private: true})
        setIsNew(true)
    }

    /** 飲料、點心流團／便當結單：把截止時間改成現在，大家就不能再點；訂單留在統計裡 */
    async function closeRound() {
        let closed: Week | undefined
        const input = await ask(bonus ? '流團？關掉後大家就不能再點，\n已經點的會留在「訂單統計」。' : '現在結單？結單後大家就不能再點，\n已經點的會留在「訂單統計」。', {
            ok: bonus ? '流團' : '結單', password: !!draft.hasPassword, hint: pwHint(draft.owner),
            check: async (v) => (closed = await api.admin.saveWeek(pw, {
                ...draft,
                deadline: new Date().toISOString()
            }, v, secret)),
        })
        if (input === null) return
        // 便當結單後還是同一團，編輯器不會重掛，自己換成已截止
        if (closed) setDraft(closed)
        toast.show(bonus ? `${unit}團已關閉` : '已結單', 'ok', ICON[kind])
        await onSaved()
    }

    /** 整團刪掉（菜單＋所有訂單），救不回來 */
    async function deleteRound() {
        const input = await ask(`刪除這份${unit}菜單和所有訂單？\n刪掉就救不回來了。`, {
            ok: '刪除', password: !!draft.hasPassword, hint: pwHint(draft.owner),
            check: (v) => api.admin.deleteWeek(pw, draft.id, v, secret),
        })
        if (input === null) return
        toast.show('訂單已刪除')
        await onSaved()
    }

    async function save() {
        const tidy = (list: MenuItem[]) => list.map((it) => ({...it, name: it.name.trim()})).filter((it) => it.name)
        const items = tidy(draft.items)
        // 必填（標題有 *）照畫面由上到下檢查
        if (bonus && !draft.host.trim()) return toast.show(draft.mode === 'group' ? '填一下誰揪的團' : '填一下誰請客', 'error')
        if (!draft.shop.trim()) return toast.show(drink ? (direct ? '先選今天喝哪家' : '先拉一下拉霸，抽今天喝哪家') : '填一下店家名稱', 'error')
        const end = new Date(draft.deadline).getTime()
        if (Number.isNaN(end)) return toast.show('選一下截止時間', 'error')
        if (isNew && end <= Date.now()) return toast.show('截止時間已經過了，改晚一點再開團', 'error')
        if (isNew && !draft.owner?.trim()) return toast.show('填一下負責人，有問題大家才知道要找誰', 'error')
        if (isNew && !roundPw.trim()) return toast.show('設一組開團密碼，刪訂單、提早結束要用', 'error')
        if (isNew && draft.private && !secret.trim()) return toast.show(`${secretName(kind)}要設通關密碼，給要揪的人`, 'error')
        if (items.length === 0) return toast.show(`至少要有一種${unit}`, 'error')
        const over = bonus ? [] : items.filter((it) => it.price > MAX_PRICE)
        if (over.length) return toast.show(`便當不能超過 $${MAX_PRICE}：${over.map((it) => it.name).join('、')}`, 'error')
        const persist = (input: string) => api.admin.saveWeek(pw, {
            ...draft,
            shop: draft.shop.trim(),
            host: draft.host.trim(),
            owner: draft.owner?.trim(),
            items,
            addons: tidy(draft.addons)
        }, input, secret)
        let saved: Week | undefined
        // 把截止時間改到現在以前＝提早結束，一樣要密碼；密碼對了就直接存掉
        if (!isNew && endsEarly(current, draft.deadline)) {
            const v = await ask('截止時間已經過了，存檔後這團就結束了。', {
                password: true,
                hint: pwHint(current?.owner),
                check: async (v) => (saved = await persist(v))
            })
            if (v === null) return
        }
        setSaving(true)
        try {
            // 舊版 Code.gs 會把點心團存成便當、蓋掉這週菜單，存之前先確認後端認得點心團（新版 getCurrent 一定有 snack）
            if (kind === 'snack' && isNew && !('snack' in (await api.getCurrent()))) {
                throw new Error('後端 Code.gs 是舊版，請先貼上新版並部署，再開點心團')
            }
            saved ??= await persist(roundPw)
            // 舊版 Code.gs 不認得飲料團、點心團，會存成便當蓋掉這週菜單
            if (saved.kind !== kind) throw new Error(`後端 Code.gs 是舊版，請先貼上新版並部署，再開${unit}團`)
            setDraft(saved)
            if (!(isNew && saved.private)) toast.show(isNew ? (bonus ? `${draft.mode === 'group' ? '揪團' : '抖內'}開好了，大家的畫面會跳出來` : '菜單已發佈，大家可以點了') : '菜單已儲存', 'ok', ICON[kind])
            setIsNew(false)
            await onSaved()
            if (isNew && saved.private) onCreatedPrivate(saved, secret)
        } catch (e) {
            toast.show((e as Error).message, 'error')
            // 可能是別人先開了同一種團：重抓一次，畫面就會換成那團（沒撞到的話 key 不變，草稿還在）
            if (bonus && isNew) await onSaved()
        } finally {
            setSaving(false)
        }
    }

    return (
        <div>
            {invite && (
                <div className="fixed inset-0 z-60 grid place-items-center bg-soy/50 p-4"
                     onClick={(e) => e.target === e.currentTarget && setInvite(false)}
                     onKeyDown={(e) => e.key === 'Escape' && setInvite(false)}>
                    <div
                        className="relative flex w-full max-w-[28rem] animate-pop flex-col items-center gap-4 rounded-card border-3 border-soy bg-rice p-6 text-center shadow-pop max-md:p-4"
                        role="dialog" aria-label={`${secretName(kind)}開好了`}>
                        <button
                            className="absolute -top-4 -right-4 size-11 cursor-pointer rounded-full border-3 border-soy bg-rice text-[1.6rem] leading-none text-soy hover:bg-stamp hover:text-rice"
                            onClick={() => setInvite(false)} aria-label="關閉"
                        >
                            ×
                        </button>
                        <LockIcon size={64}/>
                        <h2 className="mb-0">{secretName(kind)}開好了！</h2>
                        <p className="-mt-2 text-soy-soft">點餐頁不會跳出來，把連結和通關密碼傳給要揪的人</p>
                        <label className="field w-full text-left">
                            <span className="field-label">專屬連結</span>
                            <input value={link} readOnly onFocus={(e) => e.target.select()}/>
                        </label>
                        <div className="field w-full text-left">
                            <span className="field-label">通關密碼</span>
                            <span
                                className="rounded-xl border-2 border-dashed border-soy bg-yolk-soft px-4 py-2 text-center font-num text-[1.8rem] font-bold tracking-wider break-all">{secret}</span>
                        </div>
                        <button className="btn btn-primary btn-big w-full" onClick={copyInvite} autoFocus>
                            複製揪團資訊
                        </button>
                    </div>
                </div>
            )}
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                {bonus && isNew ? (
                    // 誰請客／誰揪的＋抖內（請大家喝）還是揪團（各付各的）；負責人可能是別人，在下面跟密碼一起填
                    <div className="flex flex-wrap items-end gap-3">
                        <label className="field w-48">
                            <span className="field-label req">{draft.mode === 'group' ? '誰揪的團' : '誰請客'}</span>
                            <input value={draft.host} onChange={(e) => set('host', e.target.value)} maxLength={20}/>
                        </label>
                        <div
                            className="inline-flex overflow-hidden rounded-full border-3 border-soy bg-rice shadow-pop-sm"
                            role="radiogroup" aria-label="抖內還是揪團">
                            {([['treat', '抖內', drink ? '我請大家喝' : '我請大家吃'], ['group', '揪團', '各付各的']] as const).map(([m, label, hint], i) => (
                                <button key={m} type="button" role="radio" aria-checked={draft.mode === m}
                                        onClick={() => set('mode', m)}
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
                            : bonus
                                ? `${draft.host} 的${draft.mode === 'group' ? '揪團' : '抖內'}・${formatDeadline(draft.deadline)}截止`
                                : `正在編輯 ${formatDay(draft.deadline)}截止的菜單`}
                        {!isNew && draft.owner && `・負責人 ${draft.owner}`}
                        {!isNew && isClosed(draft.deadline) && <span className="pill text-stamp-dark">已截止</span>}
                        {!isNew && draft.private && (
                            <button className="link-btn ml-2 inline-flex items-center gap-1 align-middle"
                                    onClick={() => setInvite(true)}><LockIcon size={18}/>{secretName(kind)}・連結和通關密碼
                            </button>
                        )}
                    </p>
                )}
                {!isNew && bonus && !draft.private && (
                    <button className="btn btn-ghost inline-flex items-center gap-1.5" onClick={startPrivate}>
                        <LockIcon/>另開{secretName(kind)}
                    </button>
                )}
                {!isNew && bonus && !isClosed(draft.deadline) && (
                    <button className="btn btn-ghost text-stamp-dark" onClick={closeRound} disabled={saving}>
                        流團，關閉這團
                    </button>
                )}
                {!isNew && !bonus && (
                    <button className="btn btn-ghost" onClick={startNewWeek}>
                        開新的一週
                    </button>
                )}
            </div>

            <div className="grid grid-cols-2 gap-6 max-md:grid-cols-1">
                {!drink && (
                    <section className="card flex flex-col gap-3.5">
                        <h2 className="mb-0">{bonus ? <>點心照片<span
                            className="ml-2 text-sm font-normal text-soy-soft">選填</span></> : '菜單照片'}</h2>
                        <div
                            className="flex min-h-[220px] flex-col items-center justify-center gap-3.5 rounded-tile border-3 border-dashed border-soy-soft bg-yolk-soft p-4 text-center">
                            {draft.imageUrl ? (
                                <img className="max-h-[280px] max-w-full rounded-lg border-2 border-soy"
                                     src={draft.imageUrl} alt="菜單預覽"/>
                            ) : (
                                <p className="text-soy-soft">{bonus ? '拍菜單或點心照片，大家點的時候看得到' : '把店家菜單拍照上傳，大家點餐時看得到'}</p>
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
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="mb-0">{drink ?
                            <span className="req">今天喝哪家？</span> : bonus ? '今天吃哪家？' : '基本資料'}</h2>
                        {drink && isNew && shops.length > 0 && (
                            // 膠囊開關：開 = 不拉霸，直接從下拉選
                            <button type="button" role="switch" aria-checked={direct}
                                    aria-label="切換：不拉霸，直接選飲料店" onClick={() => setDirect(!direct)}
                                    className="group inline-flex cursor-pointer items-center gap-2 rounded-full text-sm font-bold text-soy focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-bowl-blue">
                                <span
                                    className="relative h-7 w-12 rounded-full border-3 border-soy bg-rice shadow-pop-sm motion-safe:transition-colors group-aria-checked:bg-yolk">
                                    <span
                                        className="absolute top-[3px] left-[3px] size-4 rounded-full bg-soy motion-safe:transition-transform group-aria-checked:translate-x-5"/>
                                </span>
                                切換
                            </button>
                        )}
                    </div>
                    {drink ? (
                        // 飲料店拉霸抽或直接選，開團後就不能換
                        shops.length ? (
                            direct && isNew ? (
                                <label className="field">
                                    <span className="field-label">飲料店</span>
                                    <select value={shops.some((s) => s.shop === draft.shop) ? draft.shop : ''}
                                            onChange={(e) => pickShop(e.target.value)}>
                                        <option value="" disabled>選一家</option>
                                        {shops.map((s) => (
                                            <option key={s.shop}>{s.shop}</option>
                                        ))}
                                    </select>
                                </label>
                            ) : (
                                <SlotMachine shops={shops.map((s) => ({shop: s.shop, logo: s.imageUrl}))}
                                             value={draft.shop} onPick={pickShop} locked={!isNew}/>
                            )
                        ) : (
                            <p className="text-soy-soft">還沒有飲料店可以抽，先到「菜單」新增一家。</p>
                        )
                    ) : (
                        <>
                            {shops.length > 0 && (
                                <label className="field">
                                    <span className="field-label">常用店家</span>
                                    <select value={shops.some((s) => s.shop === draft.shop) ? draft.shop : ''}
                                            onChange={(e) => pickShop(e.target.value)} disabled={shopLocked}>
                                        <option value="">其他店家（自己填）</option>
                                        {shops.map((s) => (
                                            <option key={s.shop}>{s.shop}</option>
                                        ))}
                                    </select>
                                </label>
                            )}
                            <label className="field">
                                <span className="field-label req">店家名稱</span>
                                <input value={draft.shop} onChange={(e) => set('shop', e.target.value)}
                                       placeholder={bonus ? '例如：巷口車輪餅' : '例如：阿嬤灶腳便當'}
                                       disabled={shopLocked}/>
                                {shopLocked && <span
                                    className="text-sm text-stamp-dark">已經有 {ordered} 人點了，不能換店家；要換請{bonus ? '先流團再開新的一團' : '「開新的一週」'}。</span>}
                            </label>
                        </>
                    )}
                    <label className="field">
                        <span className="field-label req">截止時間</span>
                        <input
                            type="datetime-local"
                            value={toLocalInput(draft.deadline)}
                            onChange={(e) => e.target.value && set('deadline', fromLocalInput(e.target.value))}
                        />
                        {bonus ? (
                            <span className="text-sm text-soy-soft">
                                限時 bonus，預設開團後 1 小時。
                                <button type="button" className="link-btn"
                                        onClick={() => set('deadline', drinkDeadline())}>
                                    改成 1 小時後
                                </button>
                            </span>
                        ) : (
                            <span className="text-sm text-soy-soft">
                            </span>
                        )}
                    </label>
                    {!isNew && !bonus && (
                        // 結單、刪除都要開團密碼；飲料、點心用上面的「流團」
                        <div className="flex flex-wrap justify-end gap-3">
                            <button className="btn btn-ghost text-stamp-dark" onClick={deleteRound}
                                    disabled={saving}>刪除訂單
                            </button>
                            {!isClosed(draft.deadline) && (
                                <button className="btn btn-primary" onClick={closeRound} disabled={saving}>結單</button>
                            )}
                        </div>
                    )}
                    {isNew && (
                        // 負責人和開團密碼一起填：刪訂單、提早結束要密碼，忘了就找負責人
                        <div className="flex flex-col gap-1.5">
                            <div className="grid grid-cols-2 gap-3">
                                <label className="field">
                                    <span className="field-label req">負責人</span>
                                    <input value={draft.owner ?? ''} onChange={(e) => set('owner', e.target.value)}
                                           maxLength={20}/>
                                </label>
                                <label className="field">
                                    <span className="field-label req">開團密碼</span>
                                    <input value={roundPw}
                                           onChange={(e) => setRoundPw(e.target.value.replace(/\D/g, ''))}
                                           inputMode="numeric" autoComplete="off" maxLength={12}
                                           placeholder="負責人記得就好"/>
                                </label>
                            </div>
                            <span
                                className="text-sm text-soy-soft">密碼只能是數字。刪訂單、提早結束要輸入密碼；開團後兩個都不能改。</span>
                        </div>
                    )}
                    {isNew && bonus && (
                        // 喝飲料不揪：點餐頁不跳，有專屬連結＋通關密碼才看得到；通關密碼跟開團密碼分開，參加的人不能刪單
                        <div className="flex flex-col gap-1.5">
                            <label className="flex cursor-pointer items-center gap-2 font-bold">
                                <input type="checkbox" className="size-5 accent-soy" checked={!!draft.private}
                                       onChange={(e) => set('private', e.target.checked)}/>
                                <LockIcon/>{secretName(kind)}
                            </label>
                            {draft.private && (
                                <label className="field">
                                    <span className="field-label req">通關密碼</span>
                                    <input value={secret} onChange={(e) => setSecret(e.target.value.replace(/\D/g, ''))}
                                           inputMode="numeric" autoComplete="off" maxLength={12}
                                           placeholder="給要揪的人"/>
                                </label>
                            )}
                            <span className="text-sm text-soy-soft">
                                {draft.private ? '點餐頁不會跳出來，開團後會複製專屬連結，連同通關密碼傳給要揪的人。' : '只想揪幾個人？勾起來，點餐頁就不會跳出來。'}
                            </span>
                        </div>
                    )}
                </section>

                <section className="card col-span-full flex flex-col gap-3.5">
                    <div className="flex items-baseline justify-between">
                        <h2 className="mb-0"><span className="req">{unit}種類</span>{drink &&
                            <span className="ml-2 text-sm font-normal text-soy-soft">一律 L，填 L 的價錢</span>}</h2>
                        {!drink && (
                            // 點心沒有內建菜單，貼一串最快
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
                  placeholder={bonus ? '一行一種，後面可以帶價錢\n紅豆 15\n奶油 $20' : '一行一種，後面可以帶價錢\n排骨便當 100\n雞腿便當 $110'}
              />
                            <button className="btn" onClick={applyBulk}>
                                加入清單
                            </button>
                        </div>
                    )}
                    {draft.items.length === 0 && !bulkOpen &&
                        <p className="text-soy-soft">{drink ? '拉霸抽到店家後，飲料會自動帶進來。' : `還沒有${unit}，按下面的按鈕新增。`}</p>}
                    <ItemRows list={draft.items} onChange={(v) => set('items', v)} unit={unit}
                              max={bonus ? undefined : MAX_PRICE}/>
                </section>

                {drink && (
                    <section className="card col-span-full flex flex-col gap-3.5">
                        <h2 className="mb-0">加料<span
                            className="ml-2 text-sm font-normal text-soy-soft">每杯選一種</span></h2>
                        {draft.addons.length === 0 && <p className="text-soy-soft">沒有加料就留空。</p>}
                        <ItemRows list={draft.addons} onChange={(v) => set('addons', v)} unit="加料"/>
                    </section>
                )}
            </div>

            <div className="mt-6 flex justify-end">
                <button className="btn btn-primary btn-big" onClick={save} disabled={saving || uploading}>
                    {saving ? '儲存中…' : isNew ? (bonus ? '開團！' : '發佈菜單') : '儲存菜單'}
                </button>
            </div>
        </div>
    )
}

// ───────────────────────── 常用店家

type ShopDraft = { from: string; shop: string; phone: string; note: string; imageUrl: string; items: MenuItem[]; addons: MenuItem[] }

/** 「菜單」分頁：左邊店家清單，右邊點一家改菜單、改名、刪掉，或新增一家；開過的團會自動算進來 */
function ShopShelf({kind, shops, ask, pw, toast, onSaved}: {
    kind: RoundKind
    shops: ShopPreset[]
    ask: Ask
    pw: string
    toast: ReturnType<typeof useToast>
    onSaved: (rows: ShopRow[]) => void
}) {
    const drink = kind === 'drink'
    const unit = UNIT[kind]
    // null = 沒在編輯；from = 改的是哪一家（'' = 新增）
    const [edit, setEdit] = useState<ShopDraft | null>(null)
    const [busy, setBusy] = useState(false)
    // null = 收起
    const [bulk, setBulk] = useState<string | null>(null)
    const fileRef = useRef<HTMLInputElement>(null)
    // 剛打開時的樣子，切到別家前比對有沒有改過
    const base = useRef('')
    const set = <K extends keyof ShopDraft>(k: K, v: ShopDraft[K]) => setEdit((d) => d && {...d, [k]: v})
    const toItems = (rows: [string, number][], prefix: string) => rows.map(([name, price]) => ({
        id: uid(prefix),
        name,
        price
    }))
    const pairs = (list: MenuItem[]) => list.filter((it) => it.name.trim()).map((it): [string, number] => [it.name.trim(), it.price])

    async function open(p?: ShopPreset) {
        if (edit && JSON.stringify(edit) !== base.current &&
            (await ask(`「${edit.shop || '新店家'}」還沒儲存，\n改的地方會不見。`, {ok: '不存了'})) === null) return
        const d = {
            from: p?.shop ?? '',
            shop: p?.shop ?? '',
            phone: p?.phone ?? '',
            note: p?.note ?? '',
            imageUrl: p?.imageUrl ?? '',
            items: toItems(p?.items ?? [], 'i_'),
            addons: toItems(p?.addons ?? [], 'a_')
        }
        base.current = JSON.stringify(d)
        setBulk(null)
        setEdit(d)
    }

    async function send(hidden: boolean) {
        if (!edit) return
        const shop = hidden ? edit.from : edit.shop.trim()
        if (!hidden) {
            if (!shop) return toast.show('填一下店家名稱', 'error')
            if (pairs(edit.items).length === 0) return toast.show(`至少要有一種${unit}`, 'error')
            if (shop !== edit.from && shops.some((p) => p.shop === shop)) return toast.show(`已經有「${shop}」了，點它來改`, 'error')
        } else {
            // 拉霸沒店家可抽會壞掉
            if (drink && shops.length <= 1) return toast.show('拉霸至少要留一家', 'error')
            if ((await ask(`從常用店家刪掉「${shop}」？\n開過的團和訂單不受影響。`, {ok: '刪掉'})) === null) return
        }
        setBusy(true)
        try {
            const rows = await api.admin.saveShop(pw, {
                kind,
                shop,
                imageUrl: edit.imageUrl,
                items: pairs(edit.items),
                addons: drink ? pairs(edit.addons) : [],
                phone: edit.phone.trim(),
                note: edit.note.trim(),
                hidden,
            }, hidden ? undefined : edit.from || undefined)
            onSaved(rows)
            // 舊版 Code.gs 不認得 phone、note，回來的 shops 沒有這兩欄
            if (!hidden && (edit.phone.trim() || edit.note.trim()) && rows.find((r) => r.kind === kind && r.shop === shop)?.note === undefined) {
                setEdit(null)
                return toast.show('後端 Code.gs 是舊版，電話、備註沒存到，請先貼上新版並部署', 'error')
            }
            setEdit(null)
            toast.show(hidden ? `刪掉「${shop}」了` : '常用店家已儲存', 'ok', ICON[kind])
        } catch (e) {
            toast.show((e as Error).message, 'error')
        } finally {
            setBusy(false)
        }
    }

    async function pickFile(file: File | undefined) {
        if (!file) return
        setBusy(true)
        try {
            set('imageUrl', await api.admin.uploadImage(pw, await shrinkImage(file), file.name))
        } catch (e) {
            toast.show((e as Error).message, 'error')
        } finally {
            setBusy(false)
            if (fileRef.current) fileRef.current.value = ''
        }
    }

    return (
        <section className="grid grid-cols-[15rem_1fr] items-start gap-6 max-lg:grid-cols-1">
            {/* 左右兩張卡片；菜單很長時左邊清單跟著捲 */}
            <nav className="card flex flex-col gap-1.5 lg:sticky lg:top-4" aria-label={`${unit}店家`}>
                <h2 className="mb-0">{unit}店家</h2>
                <p className="mb-1 text-sm text-soy-soft">開過的團會自動加進來</p>
                {shops.map((p) => (
                    <button key={p.shop} aria-current={edit?.from === p.shop}
                            className="flex cursor-pointer items-baseline justify-between gap-2 rounded-xl px-3 py-2 text-left text-soy hover:bg-yolk/40 aria-[current=true]:bg-soy aria-[current=true]:text-yolk"
                            onClick={() => open(p)}>
                        <span className="min-w-0 break-words">{p.shop}</span>
                        <span className="flex-none text-sm opacity-70">{p.items.length} 種</span>
                    </button>
                ))}
                <button className={`btn mt-1 ${edit && !edit.from ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => open()}>+ 新增店家
                </button>
            </nav>

            {edit ? (
                <div className="card flex min-w-0 flex-col gap-3.5">
                    <div className="flex flex-wrap items-end gap-4">
                        <label className="field min-w-0 flex-1">
                            <span className="field-label req">店家名稱</span>
                            <input value={edit.shop} onChange={(e) => set('shop', e.target.value)} maxLength={40}/>
                        </label>
                        <label className="field w-44 max-md:w-full">
                            <span className="field-label">電話</span>
                            <input type="tel" value={edit.phone} onChange={(e) => set('phone', e.target.value)}
                                   maxLength={30} autoComplete="off" placeholder="02-1234-5678"/>
                        </label>
                        <div className="flex items-center gap-3">
                            {edit.imageUrl &&
                                <img className="size-14 rounded-lg border-2 border-soy object-cover" src={edit.imageUrl}
                                     alt=""/>}
                            <button className="btn" onClick={() => fileRef.current?.click()} disabled={busy}>
                                {edit.imageUrl ? '換' : '上傳'}{drink ? ' logo' : '照片'}
                            </button>
                            {edit.imageUrl &&
                                <button className="link-btn" onClick={() => set('imageUrl', '')}>移除</button>}
                            <input ref={fileRef} type="file" accept="image/*" hidden
                                   onChange={(e) => pickFile(e.target.files?.[0])}/>
                        </div>
                    </div>
                    <label className="field">
                        <span className="field-label">備註</span>
                        <textarea rows={2} value={edit.note} onChange={(e) => set('note', e.target.value)}
                                  maxLength={200} placeholder="例如：滿 1000 外送、週日公休"/>
                    </label>
                    <div className="flex items-baseline justify-between">
                        <h3 className="mb-0"><span className="req">{unit}種類</span></h3>
                        <button className="link-btn" onClick={() => setBulk((b) => (b === null ? '' : null))}>
                            {bulk === null ? '從文字貼上' : '收起'}
                        </button>
                    </div>
                    {bulk !== null && (
                        <div className="flex flex-col items-start gap-2.5">
                            <textarea rows={5} value={bulk} onChange={(e) => setBulk(e.target.value)}
                                      placeholder={`一行一種，後面可以帶價錢\n${{bento: '排骨便當 100\n雞腿便當 $110', drink: '珍珠奶茶 60\n四季春 $40', snack: '紅豆 15\n奶油 $20'}[kind]}`}/>
                            <button className="btn" onClick={() => {
                                const rows = parseBulk(bulk)
                                if (rows.length === 0) return toast.show(`沒有讀到品項，一行寫一個，例如「${drink ? '珍珠奶茶' : '排骨便當'}」`, 'error')
                                set('items', [...edit.items, ...toItems(rows, 'i_')])
                                setBulk(null)
                                toast.show(`加入 ${rows.length} 種${unit}`)
                            }}>加入清單</button>
                        </div>
                    )}
                    <ItemRows list={edit.items} onChange={(v) => set('items', v)} unit={unit}
                              max={kind === 'bento' ? MAX_PRICE : undefined}/>
                    {drink && (
                        <>
                            <h3 className="mb-0">加料</h3>
                            <ItemRows list={edit.addons} onChange={(v) => set('addons', v)} unit="加料"/>
                        </>
                    )}
                    <div className="flex flex-wrap items-center justify-end gap-4">
                        {edit.from && <button className="link-btn mr-auto text-stamp-dark" onClick={() => send(true)}
                                              disabled={busy}>刪掉這家</button>}
                        <button className="link-btn" onClick={() => setEdit(null)} disabled={busy}>取消</button>
                        <button className="btn btn-primary" onClick={() => send(false)}
                                disabled={busy}>{busy ? '儲存中…' : '儲存'}</button>
                    </div>
                </div>
            ) : (
                <p className="card text-soy-soft">{shops.length ? '點左邊的店家看菜單、改價錢。' : `還沒有${unit}店家。開過一次${unit}團就會出現在這裡，也可以先新增。`}</p>
            )}
        </section>
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
            <button className="btn btn-ghost w-full"
                    onClick={() => onChange([...list, {id: uid('i_'), name: '', price: 0}])}>
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
                        initial,
                        ask,
                        toast,
                        onEmpty,
                    }: {
    pw: string
    weeks: Week[]
    /** listWeeks 順帶回來的預設那團（statsPick），先顯示，背景再刷新 */
    initial: Snapshot | null
    ask: Ask
    toast: ReturnType<typeof useToast>
    onEmpty: () => void
}) {
    const [weekId, setWeekId] = useState(statsPick(weeks)?.id ?? '')
    // 舊版 Code.gs 回的是最新一團，跟預設不同團就不要先顯示
    const [snap, setSnap] = useState<Snapshot | null>(initial?.week?.id === weekId ? initial : null)
    const [exporting, setExporting] = useState(false)
    const [history, setHistory] = useState(false)
    // 喝飲料不揪：輸入過的通關密碼記著，重新整理不用再問；locked = 沒輸入對，看不到
    const secrets = useRef<Record<string, string>>({})
    const [locked, setLocked] = useState(false)
    // 下拉只放最近的團（截止不到一天）；從歷史訂單點進來的舊團也放進去，才選得到
    const options = useMemo(() => {
        const recent = recentRounds(weeks)
        const picked = weeks.find((w) => w.id === weekId)
        return picked && !recent.includes(picked) ? [...recent, picked] : recent
    }, [weeks, weekId])

    const load = useCallback(async () => {
        if (!weekId) return
        let secret = secrets.current[weekId] ?? ''
        const w = weeks.find((x) => x.id === weekId)
        if (w?.private && !secret) {
            const v = await ask(`${secretName(w.kind)}\n輸入通關密碼才看得到訂單`, {
                password: true, label: '通關密碼', icon: <LockIcon size={56}/>,
                check: async (v) => {
                    setSnap(await api.admin.getWeek(pw, weekId, v))
                    secrets.current[weekId] = v
                    setLocked(false)
                },
            })
            if (v === null) {
                setSnap(null)
                setLocked(true)
            }
            return
        }
        try {
            setSnap(await api.admin.getWeek(pw, weekId, secret))
            secrets.current[weekId] = secret
            setLocked(false)
        } catch (e) {
            toast.show((e as Error).message, 'error')
            if (secret) {
                delete secrets.current[weekId]
                setSnap(null)
                setLocked(true)
            }
        }
    }, [pw, weekId, weeks, ask, toast.show]) // eslint-disable-line react-hooks/exhaustive-deps

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
        const input = await ask(`刪除 ${label} 的訂單？`, {
            ok: '刪除',
            password: !!week?.hasPassword,
            hint: pwHint(week?.owner),
            check: (v) => api.admin.deleteOrder(pw, id, v)
        })
        if (input === null) return
        toast.show('訂單已刪除')
        load()
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center gap-3">
                {options.length > 0 && (
                    <label className="max-w-full max-md:w-full">
                        <span className="sr-only">選擇哪一週</span>
                        <select
                            className="w-auto max-w-full rounded-full py-2 pl-4 font-bold shadow-pop-sm focus:shadow-pop-sm focus:border-yolk-deep max-md:w-full"
                            value={weekId}
                            onChange={(e) => setWeekId(e.target.value)}>
                            {options.map((w) => (
                                <option key={w.id} value={w.id}>
                                    {w.private ? `【${secretName(w.kind)}】` : isBonus(w.kind) ? `【${UNIT[w.kind]}${w.mode === 'group' ? '揪團' : '抖內'}】` : ''}{w.shop || '未命名'}（{formatDay(w.deadline)}截止）
                                </option>
                            ))}
                        </select>
                    </label>
                )}
                <button className="btn inline-flex items-center gap-1.5" onClick={() => setHistory(true)}>
                    <ClockIcon/>歷史訂單
                </button>
                {week && (
                    <span
                        className={`pill ml-0 border-3 px-3.5 py-1 font-bold ${isClosed(week.deadline) ? 'text-stamp-dark' : 'bg-scallion-soft text-scallion'}`}>
            {isClosed(week.deadline) ? '已截止' : `收單中，${formatDeadline(week.deadline)} 截止`}
          </span>
                )}
                <div className="ml-auto flex flex-wrap gap-2.5 max-md:ml-0">
                    <button className="btn" onClick={load}>
                        重新整理
                    </button>
                    <button className="btn" onClick={copyForShop} disabled={!stats.total}>
                        {week && isBonus(week.kind) ? '複製訂單' : '複製給店家'}
                    </button>
                    <button className="btn btn-primary" onClick={doExport} disabled={!week || exporting}>
                        {exporting ? '匯出中…' : '匯出 Excel'}
                    </button>
                </div>
            </div>

            {history && (
                <HistoryDialog weeks={weeks} current={weekId} onClose={() => setHistory(false)} onPick={(id) => {
                    setWeekId(id)
                    setHistory(false)
                }}/>
            )}

            {!weekId ? (
                <div className="card flex flex-col items-center gap-3 text-center">
                    <p>最近一天內沒有團。之前訂過什麼，打開「歷史訂單」看。</p>
                </div>
            ) : locked ? (
                <div className="card flex flex-col items-center gap-3 text-center">
                    <LockIcon size={64}/>
                    <p>{secretName(weeks.find((w) => w.id === weekId)?.kind ?? '')}，要通關密碼才看得到訂單。</p>
                    <button className="btn btn-primary" onClick={load}>輸入通關密碼</button>
                </div>
            ) : !snap ? (
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

                    {week && isBonus(week.kind) ? (
                        <section className="card">
                            <h2>訂購統計表</h2>
                            {snap.orders.length === 0 ? (
                                <p className="text-soy-soft">還沒有人點。</p>
                            ) : (
                                <div className="relative overflow-x-auto">
                                    <table className="w-full text-md">
                                        <thead>
                                        <tr>
                                            <th>{week.kind === 'drink' ? '飲料（L）' : '點心'}</th>
                                            <th className="text-right">{week.kind === 'drink' ? '杯數' : '份數'}</th>
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
                                        <span
                                            className="text-right font-num font-semibold tabular-nums">{s.count}</span>
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
                            <div className="relative overflow-x-auto">
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

/** 歷史訂單按鈕上的小時鐘 */
function ClockIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
            <circle cx="10" cy="10" r="8" fill="var(--color-yolk)" stroke="currentColor" strokeWidth="2"/>
            <path d="M10 5.5 V10 L13 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                  strokeLinejoin="round"/>
        </svg>
    )
}

const KIND_PILL = {bento: 'bg-yolk', drink: 'bg-scallion-soft text-scallion', snack: 'bg-crumb'} as const

/** 歷史訂單：所有開過的團，新的在上面；同一家訂過幾次一眼看得到，比較不會訂到重複的。點一團就在統計裡打開 */
function HistoryDialog({weeks, current, onPick, onClose}: {
    weeks: Week[]
    current: string
    onPick: (id: string) => void
    onClose: () => void
}) {
    const [kind, setKind] = useState<RoundKind | 'all'>('all')
    const sorted = [...weeks].sort((a, b) => b.deadline.localeCompare(a.deadline))
    const list = sorted.filter((w) => kind === 'all' || w.kind === kind)
    const times = new Map<string, number>()
    for (const w of weeks) times.set(`${w.kind}|${w.shop}`, (times.get(`${w.kind}|${w.shop}`) ?? 0) + 1)
    return (
        <div className="fixed inset-0 z-60 grid place-items-center bg-soy/50 p-4"
             onClick={(e) => e.target === e.currentTarget && onClose()}
             onKeyDown={(e) => e.key === 'Escape' && onClose()}>
            <div
                className="relative flex max-h-[calc(100dvh-32px)] w-full max-w-[40rem] animate-pop flex-col gap-4 rounded-card border-3 border-soy bg-rice p-5 shadow-pop max-md:p-4"
                role="dialog" aria-label="歷史訂單">
                <button
                    className="absolute -top-4 -right-4 size-11 cursor-pointer rounded-full border-3 border-soy bg-rice text-[1.6rem] leading-none text-soy hover:bg-stamp hover:text-rice"
                    onClick={onClose} aria-label="關閉" autoFocus
                >
                    ×
                </button>
                <h2 className="mb-0">歷史訂單</h2>
                <div
                    className="inline-flex self-start overflow-hidden rounded-full border-3 border-soy bg-rice shadow-pop-sm max-md:self-stretch"
                    role="radiogroup" aria-label="哪一種團">
                    {(['all', 'bento', 'drink', 'snack'] as const).map((k, i) => (
                        <button key={k} role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
                                className={`${TAB} ${i ? 'border-l-3 border-soy' : ''} aria-checked:bg-soy aria-checked:text-yolk`}>
                            {k === 'all' ? '全部' : UNIT[k]}
                        </button>
                    ))}
                </div>
                {list.length === 0 ? (
                    <p className="text-soy-soft">還沒有開過。</p>
                ) : (
                    <ul className="-mx-2 flex flex-col overflow-y-auto">
                        {list.map((w) => {
                            const n = times.get(`${w.kind}|${w.shop}`) ?? 1
                            // 喝飲料不揪不露誰揪、誰負責（後端清單也不給）
                            const who = !w.private && [isBonus(w.kind) && w.host && `${w.host}${w.mode === 'group' ? '揪團' : '請客'}`, w.owner && `負責人 ${w.owner}`].filter(Boolean).join('・')
                            return (
                                <li key={w.id}>
                                    <button
                                        className={`flex w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-yolk-soft ${w.id === current ? 'bg-yolk-soft' : ''}`}
                                        onClick={() => onPick(w.id)}
                                    >
                                        <span
                                            className="w-[6.6em] shrink-0 font-num whitespace-nowrap text-soy-soft tabular-nums max-md:w-[6.2em] max-md:text-sm">{formatDay(w.deadline)}</span>
                                        <span
                                            className={`pill ml-0 shrink-0 border-soy ${KIND_PILL[w.kind]}`}>{UNIT[w.kind]}</span>
                                        <span className="min-w-0 flex-1 truncate font-bold">{w.private &&
                                            <LockIcon size={18}
                                                      className="mr-1 inline-block align-[-0.12em]"/>}{w.shop || '未命名'}</span>
                                        {n > 1 && <span className="shrink-0 text-sm text-stamp-dark">訂過 {n} 次</span>}
                                        {who &&
                                            <span className="shrink-0 text-sm text-soy-soft max-md:hidden">{who}</span>}
                                    </button>
                                </li>
                            )
                        })}
                    </ul>
                )}
            </div>
        </div>
    )
}
