import {useEffect, useState} from 'react'
import {api} from '../api'
import {ICE, SUGAR} from '../lib/drink'
import {normName, orderLabel, orderPrice, personLine} from '../lib/stats'
import type {Order, Snapshot, Week} from '../types'
import {BobaCup} from './BobaCup'
import {ShopLogo} from './ShopLogo'
import type {useConfirm} from './Confirm'
import type {useToast} from './Toast'
import {WheelCake} from './WheelCake'

const CHIP =
    'cursor-pointer rounded-full border-2 border-soy bg-rice px-3 py-1 text-md has-checked:bg-yolk has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-bowl-blue'

/** 「許慶良鮮奶珍珠（只有 M）」→ ['許慶良鮮奶珍珠', '只有 M']；沒有括號就第二個是空字串 */
function splitNote(name: string): [string, string] {
    const m = name.match(/^(.+?)（([^（）]+)）$/)
    return m ? [m[1], m[2]] : [name, '']
}

/** 剩下的時間「42:15」，超過一小時「1:02:15」 */
function clock(ms: number) {
    const s = Math.max(0, Math.floor(ms / 1000))
    const p = (n: number) => String(n).padStart(2, '0')
    const h = Math.floor(s / 3600)
    return h > 0 ? `${h}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}` : `${p(Math.floor(s / 60))}:${p(s % 60)}`
}

// 飲料團、點心團只差在用字、吉祥物，還有飲料多了甜度冰量加料
const WORDS = {
    drink: {unit: '飲料', eat: '喝', one: '杯', Mascot: BobaCup, icon: 'boba'},
    snack: {unit: '點心', eat: '吃', one: '個', Mascot: WheelCake, icon: 'wheel'},
} as const

/**
 * 飲料團、點心團：像廣告一樣從畫面中間跳出來，按「我要喝／我要吃」才進點單。
 * 抖內（有人請客）顯示「限時 BONUS!」；揪團（各付各的）顯示「限時揪團!」。
 * 按 × 收成右下角的倒數小卡（放在點餐頁的右下角欄位裡，兩團同時開會上下疊）；已經點過的人進來不自動彈。便當頁面完全不動。
 */
export function DrinkBonus({
                               bonus,
                               name,
                               setName,
                               onChange,
                               toast,
                               ask,
                               autoOpen = true,
                           }: {
    bonus: Snapshot & { week: Week }
    /** false：一開始就收成右下角小卡（另一團已經在畫面上，不要兩張廣告疊在一起） */
    autoOpen?: boolean
    name: string
    setName: (name: string) => void
    onChange: () => Promise<void>
    toast: ReturnType<typeof useToast>
    ask: ReturnType<typeof useConfirm>['ask']
}) {
    const {week, orders} = bonus
    const drink = week.kind === 'drink'
    const {unit, eat, one, Mascot, icon} = WORDS[drink ? 'drink' : 'snack']
    const group = week.mode === 'group'
    const badge = group ? '限時揪團' : '限時 BONUS'
    const title = group ? `${week.host} 揪團${eat}${unit}！` : `${week.host || '老闆'} 請${eat}${unit}！`
    const size = drink ? '一律 L' : ''
    const mine = name.trim() ? orders.find((o) => normName(o.name) === normName(name)) : undefined
    const [view, setView] = useState<'ad' | 'form' | 'done' | 'closed'>(mine || !autoOpen ? 'closed' : 'ad')
    const [done, setDone] = useState<Order | null>(null)
    const [itemId, setItemId] = useState('')
    const [sugar, setSugar] = useState('')
    const [ice, setIce] = useState('')
    const [addonId, setAddonId] = useState('')
    const [busy, setBusy] = useState(false)
    const [now, setNow] = useState(Date.now())
    const left = new Date(week.deadline).getTime() - now

    useEffect(() => {
        const t = window.setInterval(() => setNow(Date.now()), 1000)
        return () => window.clearInterval(t)
    }, [])

    // 時間到就重抓，飲料團會從畫面上消失
    useEffect(() => {
        if (left <= 0) onChange()
    }, [left <= 0]) // eslint-disable-line react-hooks/exhaustive-deps

    // 名字對到已經點過的，就把選項帶成那杯（options 是「甜度 冰量 +加料」）
    useEffect(() => {
        if (!mine) return
        const [s, i] = mine.options.split(' ')
        setItemId(mine.itemId)
        setSugar(s ?? '')
        setIce(i ?? '')
        setAddonId(mine.addonIds[0] ?? '')
    }, [mine?.id, mine?.updatedAt]) // eslint-disable-line react-hooks/exhaustive-deps

    async function submit(e: React.FormEvent) {
        e.preventDefault()
        if (!name.trim()) return toast.show('先填你的名字', 'error')
        if (!itemId) return toast.show(`還沒選${unit}喔`, 'error')
        if (drink && (!sugar || !ice)) return toast.show('甜度、冰量都要選', 'error')
        setBusy(true)
        try {
            const order = await api.placeOrder(drink ? {
                weekId: week.id,
                name,
                itemId,
                sugar,
                ice,
                addonIds: addonId ? [addonId] : []
            } : {weekId: week.id, name, itemId})
            // 點完在畫面中間秀一張收據，不另外跳 toast
            setDone(order)
            setView('done')
            await onChange()
        } catch (err) {
            toast.show((err as Error).message, 'error')
        } finally {
            setBusy(false)
        }
    }

    async function cancel() {
        if (!mine || (await ask(`確定不${eat} ${mine.itemName} 了？`, {ok: `不${eat}了`})) === null) return
        setBusy(true)
        try {
            await api.cancelOrder(week.id, mine.name)
            toast.show(`${unit}已取消`, 'ok', icon)
            setItemId('')
            await onChange()
        } catch (err) {
            toast.show((err as Error).message, 'error')
        } finally {
            setBusy(false)
        }
    }

    const close = (
        <button
            type="button"
            className="absolute top-3 right-3 z-10 size-10 cursor-pointer rounded-full border-3 border-soy bg-rice text-[1.4rem] leading-none hover:bg-stamp hover:text-rice"
            onClick={() => setView('closed')}
            aria-label="先收起來"
        >
            ×
        </button>
    )

    if (view === 'closed') {
        return (
            <button
                className="flex animate-pop cursor-pointer items-center gap-3 rounded-card border-3 border-soy bg-yolk py-2.5 pr-6 pl-3 text-left shadow-pop transition-[translate] hover:-translate-y-1 max-md:gap-2 max-md:py-1.5 max-md:pr-4 max-md:pl-2"
                onClick={() => setView(mine ? 'form' : 'ad')}
            >
                <Mascot size={72} decorative className="max-md:h-auto max-md:w-[44px]"/>
                <span className="leading-tight">
          <span className="block text-[1.05rem] text-stamp">{badge}{mine ? '・已點' : '！'}</span>
          <span className="font-num text-[2rem] leading-none font-bold tabular-nums max-md:text-[1.4rem]">{clock(left)}</span>
        </span>
            </button>
        )
    }

    return (
        <div className="fixed inset-0 z-50 grid place-items-center bg-soy/60 p-4" role="dialog" aria-modal
             aria-label={`${badge}：${title}`}>
            {view === 'ad' ? (
                <div
                    className="relative max-h-[calc(100dvh-32px)] w-full max-w-[540px] animate-pop overflow-y-auto rounded-card border-3 border-soy bg-yolk p-2.5 text-center shadow-pop max-md:max-w-[360px] max-md:p-2">
                    {close}
                    <div
                        className="flex flex-col items-center gap-4 rounded-[14px] border-3 border-dashed border-soy px-7 pt-8 pb-7 max-md:gap-2.5 max-md:px-4 max-md:pt-6 max-md:pb-4">
                        <div
                            className="-rotate-6 animate-stamp-in rounded-xl border-5 border-stamp bg-rice px-4 py-0.5 font-num text-[2.8rem] font-bold tracking-wide whitespace-nowrap text-stamp max-md:text-[1.8rem]">
                            {badge}!
                        </div>
                        <Mascot size={200} className="max-md:h-auto max-md:w-[110px]"/>
                        <h2 className="mb-0 text-[2.4rem] max-md:text-[1.6rem]">{title}</h2>
                        <div className="flex items-center gap-2.5">
                            {(drink || week.imageUrl) && <ShopLogo logo={week.imageUrl} shop={week.shop} size={64} className="max-md:size-12!"/>}
                            <span className="text-left leading-snug">
                <b className="block">{week.shop}</b>
                <span className="text-sm text-soy-soft">{[size, group && '各付各的'].filter(Boolean).join('・')}</span>
              </span>
                        </div>
                        <div
                            className="rounded-full bg-soy px-8 py-1 font-num text-[3.4rem] leading-tight font-bold text-yolk tabular-nums max-md:px-6 max-md:text-[2.4rem]">
                            {clock(left)}
                        </div>
                        <button className="btn btn-primary btn-big w-full" onClick={() => setView('form')}>
                            我要{eat}！
                        </button>
                    </div>
                </div>
            ) : view === 'done' && done ? (
                <div className="relative flex w-full max-w-[460px] animate-pop flex-col items-center gap-3 rounded-card border-3 border-soy bg-rice px-6 pt-6 pb-6 text-center shadow-pop" role="status">
                    {close}
                    <Mascot mood="happy" size={120} decorative/>
                    <h2 className="mb-0 text-[2rem]">點好了！</h2>
                    <p className="w-full rounded-xl border-2 border-dashed border-soy bg-yolk-soft px-4 py-3 text-[1.3rem] leading-snug">
                        {personLine(done)}
                    </p>
                    <p className="text-soy-soft">
                        {[week.shop, drink && 'L', group && `要付 $${orderPrice(week, done)}`, '截止前都可以換'].filter(Boolean).join('・')}
                    </p>
                    <div className="flex w-full gap-3">
                        <button className="btn flex-1" onClick={() => setView('form')}>換一{one}</button>
                        <button className="btn btn-primary flex-1" onClick={() => setView('closed')}>好，關閉</button>
                    </div>
                </div>
            ) : (
                <form
                    onSubmit={submit}
                    className="card relative flex max-h-[calc(100dvh-32px)] w-full max-w-[1000px] animate-pop flex-col gap-4 overflow-y-auto"
                >
                    {close}
                    <div className="flex items-center gap-3 pr-10">
                        {drink ? <ShopLogo logo={week.imageUrl} shop={week.shop} size={56}/> : <Mascot size={56} decorative/>}
                        <div>
                            <p className="text-sm text-stamp">
                                {badge}・剩 <span className="font-num font-bold tabular-nums">{clock(left)}</span>
                            </p>
                            <h2 className="mb-0 max-md:text-base">{[week.shop, size, group && '各付各的'].filter(Boolean).join('・')}</h2>
                        </div>
                    </div>

                    {/* 點心團選填的照片；飲料團的 imageUrl 是店家 logo，已經在上面 */}
                    {!drink && week.imageUrl && (
                        <a href={week.imageUrl} target="_blank" rel="noreferrer" className="block">
                            <img src={week.imageUrl} alt={`${week.shop} 照片`}
                                 className="max-h-[260px] w-full rounded-tile border-3 border-soy bg-rice object-contain max-md:max-h-[180px]"/>
                        </a>
                    )}

                    <label className="field">
                        <span className="field-label">你的名字</span>
                        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20}
                               autoComplete="name"/>
                    </label>

                    {mine && (
                        <div
                            className="flex flex-wrap justify-between gap-2 rounded-xl border-2 border-dashed border-scallion bg-scallion-soft px-3.5 py-2.5 text-md">
              <span>
                你點了 <b>{orderLabel(mine)}</b>（${orderPrice(week, mine)}）
              </span>
                            <button type="button" className="link-btn" onClick={cancel} disabled={busy}>
                                不{eat}了
                            </button>
                        </div>
                    )}

                    <fieldset className="field">
                        <legend className="field-label">選{unit}</legend>
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2" role="radiogroup">
                            {week.items.map((it) => (
                                // 一律一行：名字後面的（只有 M）（茶乳）縮成小字，太長就截掉，滑鼠移上去看全名
                                <label key={it.id} title={it.name}
                                       className={`${CHIP} flex items-center gap-1.5 rounded-xl whitespace-nowrap`}>
                                    <input className="sr-only" type="radio" name="item" checked={itemId === it.id}
                                           onChange={() => setItemId(it.id)}/>
                                    <span className="min-w-0 truncate">{splitNote(it.name)[0]}</span>
                                    {splitNote(it.name)[1] && (
                                        <span className="shrink-0 rounded-full bg-yolk-soft px-1.5 text-xs text-soy-soft">{splitNote(it.name)[1]}</span>
                                    )}
                                    {it.price > 0 && <span className="ml-auto shrink-0 pl-1 font-num text-soy-soft">${it.price}</span>}
                                </label>
                            ))}
                        </div>
                    </fieldset>

                    {drink && (
                        [
                            ['甜度', SUGAR, sugar, setSugar],
                            ['冰量', ICE, ice, setIce],
                        ] as const
                    ).map(([label, list, value, setValue]) => (
                        <fieldset key={label} className="field">
                            <legend className="field-label">{label}</legend>
                            <div className="flex flex-wrap gap-2" role="radiogroup">
                                {list.map((v) => (
                                    <label key={v} className={CHIP}>
                                        <input className="sr-only" type="radio" name={label} checked={value === v}
                                               onChange={() => setValue(v)}/>
                                        {v}
                                    </label>
                                ))}
                            </div>
                        </fieldset>
                    ))}

                    {drink && week.addons.length > 0 && (
                        <fieldset className="field">
                            <legend className="field-label">加料</legend>
                            <div className="flex flex-wrap gap-2" role="radiogroup">
                                {[{id: '', name: '不加料', price: 0}, ...week.addons].map((a) => (
                                    <label key={a.id || 'none'} className={CHIP}>
                                        <input className="sr-only" type="radio" name="addon" checked={addonId === a.id}
                                               onChange={() => setAddonId(a.id)}/>
                                        {a.id ? `+${a.name}` : a.name}
                                        {a.price > 0 && <span className="ml-1 font-num text-soy-soft">${a.price}</span>}
                                    </label>
                                ))}
                            </div>
                        </fieldset>
                    )}

                    <button className="btn btn-primary btn-big" disabled={busy}>
                        {busy ? '送出中…' : mine ? `換這${one}` : `就${eat}這${one}！`}
                    </button>
                </form>
            )}
        </div>
    )
}
