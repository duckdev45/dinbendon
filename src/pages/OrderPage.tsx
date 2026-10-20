import {useCallback, useEffect, useMemo, useState} from 'react'
import {api} from '../api'
import {BobaCup} from '../components/BobaCup'
import {Bowl, type BowlMood} from '../components/Bowl'
import {Countdown} from '../components/Countdown'
import {BobaBuddy} from '../components/BobaBuddy'
import {DrinkBonus} from '../components/DrinkBonus'
import {useToast} from '../components/Toast'
import {computeStats, normName} from '../lib/stats'
import {isClosed} from '../lib/time'
import type {Current} from '../types'

const NAME_KEY = 'dinbendon:name'

function rememberName(name: string) {
    try {
        localStorage.setItem(NAME_KEY, name.trim())
    } catch {
        /* ignore */
    }
}

function readName() {
    try {
        return localStorage.getItem(NAME_KEY) ?? ''
    } catch {
        return ''
    }
}

export function OrderPage() {
    const [snap, setSnap] = useState<Current | null>(null)
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
            const order = await api.placeOrder({weekId: week.id, name, itemId})
            rememberName(name)
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

    // 老闆請喝飲料：收單中才有，跟便當各點各的
    const drinkWeek = snap?.drink?.week
    const drink = drinkWeek ? (
        <DrinkBonus
            key={drinkWeek.id}
            bonus={{week: drinkWeek, orders: snap!.drink!.orders}}
            name={name}
            setName={setName}
            toast={toast}
            onChange={async () => {
                if (name.trim()) rememberName(name)
                await refresh()
            }}
        />
    ) : (
        <BobaBuddy/>
    )

    // ── 載入中 / 錯誤 / 沒有菜單
    if (!snap) {
        return (
            <main className="page flex min-h-[70vh] flex-col items-center justify-center gap-3 text-center">
                <BobaCup size={200}/>
                <p className="text-soy-soft">{loadError || '讀取資料中…'}</p>
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
            // 完全沒有便當團：讓人直接選要開便當還是飲料
            <main className="page flex min-h-[70vh] flex-col items-center justify-center gap-6 pb-40 text-center">
                {toast.node}
                {drink}
                <h1 className="text-[1.8rem]">現在沒有團，要開什麼？</h1>
                <div className="grid w-full max-w-[640px] grid-cols-2 gap-6 max-md:grid-cols-1">
                    {(
                        [
                            ['#/admin/menu', <Bowl key="b" size={170}/>, '開便當團', '一人一個，週五 13:00 截止'],
                            ['#/admin/drink', <BobaCup key="d" size={130}/>, '開飲料團', '抖內或揪團，拉霸抽今天喝哪家'],
                        ] as const
                    ).map(([href, icon, label, hint]) => (
                        <a key={href} href={href}
                           className="card flex flex-col items-center gap-2 no-underline transition-[translate,box-shadow] hover:-translate-y-1 hover:shadow-[7px_7px_0_var(--color-soy)]">
                            <span className="grid h-[180px] place-items-center">{icon}</span>
                            <b className="text-[1.5rem]">{label}</b>
                            <span className="text-soy-soft">{hint}</span>
                        </a>
                    ))}
                </div>
            </main>
        )
    }

    return (
        <main className="page pb-44">{/* 右下角的飲料小卡／珍奶，留空間才不會蓋到訂便當按鈕 */}
            {toast.node}
            {drink}

            <section
                className="flex items-center gap-8 pt-4 pb-7 max-md:flex-col max-md:gap-2 max-md:pb-5 max-md:text-center">
                <div className="flex-none">
                    <Bowl mood={mood} size={240} className="max-md:h-auto max-md:w-[180px]"/>
                </div>
                <div className="min-w-0">
                    <p className="mb-1 text-[1.05rem]">下週二吃</p>
                    <h1 className="mb-3.5 text-[clamp(2rem,5vw,3.2rem)]">{week.shop || '這週便當'}</h1>
                    <Countdown deadline={week.deadline} onClose={() => forceTick((n) => n + 1)}/>
                </div>
            </section>

            <div
                className={`grid grid-cols-1 items-start gap-7 ${week.imageUrl ? 'md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]' : 'max-w-[720px]'}`}>
                {week.imageUrl && (
                    <figure className="sticky top-4 max-md:static">
                        <button
                            className="block w-full -rotate-[1.5deg] cursor-zoom-in overflow-hidden rounded-card border-3 border-soy bg-rice shadow-pop transition-[rotate] duration-200 hover:rotate-0 max-md:rotate-0"
                            onClick={() => setZoom(true)}
                            aria-label="放大看菜單"
                        >
                            {/* 手機上菜單照片先當預覽，點開再看全圖，表單才不會被擠到很下面 */}
                            <img
                                className="max-h-[70vh] w-full bg-rice object-contain max-md:max-h-[220px] max-md:object-cover max-md:object-top"
                                src={week.imageUrl}
                                alt={`${week.shop} 菜單`}
                            />
                        </button>
                        <figcaption className="mt-2.5 text-center text-sm text-soy-soft">點圖片放大</figcaption>
                    </figure>
                )}

                <section className="card">
                    {closed ? (
                        <div className="py-4 text-center">
                            <div
                                className="mt-2 mb-4 inline-block -rotate-8 animate-stamp-in rounded-xl border-5 border-stamp px-[22px] py-1 text-[2.4rem] text-stamp opacity-90">
                                已截止
                            </div>
                            {mine ? (
                                <p className="my-4">
                                    你這週點的是 <b>{mine.itemName}</b>，等開飯！
                                </p>
                            ) : (
                                <p className="my-4 text-soy-soft">這週的訂單已經收齊，下週記得早點點。要補點請直接找負責人。</p>
                            )}
                        </div>
                    ) : (
                        <form onSubmit={submit} className="flex flex-col gap-[18px]">
                            <label className="field">
                                <span className="field-label">你的名字</span>
                                <input
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    maxLength={20}
                                    autoComplete="name"
                                />
                            </label>

                            {mine && (
                                <div
                                    className="flex flex-wrap justify-between gap-2 rounded-xl border-2 border-dashed border-scallion bg-scallion-soft px-3.5 py-2.5 text-md">
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
                                <div
                                    className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3 max-md:grid-cols-2"
                                    role="radiogroup">
                                    {week.items.map((it) => {
                                        const count = stats.items.find((s) => s.itemId === it.id)?.count ?? 0
                                        const on = it.id === itemId
                                        return (
                                            <label
                                                key={it.id}
                                                className={`relative flex min-h-[76px] cursor-pointer flex-col justify-between gap-1 rounded-tile border-3 border-soy px-3.5 py-3 transition-[translate,box-shadow,background-color] duration-[120ms] has-focus-visible:outline-3 has-focus-visible:outline-offset-3 has-focus-visible:outline-bowl-blue ${
                                                    on ? 'translate-[3px] bg-yolk' : 'bg-rice shadow-pop-sm hover:-translate-px hover:shadow-pop-md'
                                                }`}
                                            >
                                                <input className="sr-only" type="radio" name="item" value={it.id}
                                                       checked={on} onChange={() => setItemId(it.id)}/>
                                                <span className="text-[1.05rem] leading-[1.3]">{it.name}</span>
                                                <span
                                                    className="text-xs text-soy-soft">{count > 0 ? `${count} 人點了` : '還沒人點'}</span>
                                                {on && (
                                                    <span
                                                        className="absolute -top-2.5 -right-2.5 grid size-[26px] animate-pop place-items-center rounded-full border-2 border-soy bg-stamp text-sm text-rice"
                                                        aria-hidden
                                                    >
                            ✓
                          </span>
                                                )}
                                            </label>
                                        )
                                    })}
                                </div>
                            </fieldset>

                            <button className="btn btn-primary btn-big"
                                    disabled={busy || (!!mine && mine.itemId === itemId)}>
                                {busy ? '送出中…' : mine ? (mine.itemId === itemId ? '已經訂好了' : '換這個便當') : '訂便當'}
                            </button>
                        </form>
                    )}
                </section>
            </div>

            {zoom && week.imageUrl && (
                <div
                    className="fixed inset-0 z-50 grid cursor-zoom-out place-items-center bg-soy/85 p-6"
                    onClick={() => setZoom(false)}
                    role="dialog"
                    aria-label="菜單大圖"
                >
                    <img
                        className="max-h-[calc(100dvh-48px)] max-w-[calc(100vw-48px)] rounded-xl border-3 border-soy bg-rice object-contain"
                        src={week.imageUrl} alt={`${week.shop} 菜單`}/>
                    <button
                        className="absolute top-4 right-4 size-11 cursor-pointer rounded-full border-3 border-soy bg-rice text-[1.6rem]"
                        onClick={() => setZoom(false)}
                        aria-label="關閉"
                    >
                        ×
                    </button>
                </div>
            )}
        </main>
    )
}
