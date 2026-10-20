import type { Api, Order, Snapshot, Week } from '../types'
import { defaultDeadline, isClosed } from '../lib/time'
import { normName } from '../lib/stats'
import { currentRounds, drinkOptions } from '../lib/drink'
import { uid } from '../lib/image'

/**
 * Demo 模式：沒有設定 VITE_GAS_URL 時使用，資料只存在這台電腦的瀏覽器。
 * 訂單管理不用密碼。
 */
const KEY = 'dinbendon:demo:v5'

interface Db {
  weeks: Week[]
  orders: Order[]
}

const wait = (ms = 220) => new Promise((r) => setTimeout(r, ms))

function load(): Db {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* localStorage 不能用時就每次重新產生 */
  }
  const db = seed()
  save(db)
  return db
}

function save(db: Db) {
  try {
    localStorage.setItem(KEY, JSON.stringify(db))
  } catch {
    /* 無痕模式等情況，忽略 */
  }
}

function snapshot(db: Db, week: Week | null): Snapshot {
  return { week, orders: week ? db.orders.filter((o) => o.weekId === week.id) : [] }
}

export function createDemoApi(): Api {
  return {
    mode: 'demo',
    async getCurrent() {
      await wait()
      const db = load()
      const { bento, drink } = currentRounds(db.weeks)
      return { ...snapshot(db, bento), drink: drink ? snapshot(db, drink) : null }
    },
    async placeOrder(input) {
      await wait(400)
      const db = load()
      const week = db.weeks.find((w) => w.id === input.weekId)
      if (!week) throw new Error('找不到這週的菜單，重新整理看看')
      if (isClosed(week.deadline)) throw new Error('已經截止囉，下週請早')
      const item = week.items.find((i) => i.id === input.itemId)
      if (!item) throw new Error('這個便當已經被負責人拿掉了，重新整理再選一次')
      const name = input.name.trim()
      if (!name) throw new Error('要填名字，負責人才知道便當是誰的')
      const extra = week.kind === 'drink' ? drinkOptions(week, input) : { options: '', addonIds: [] }
      const now = new Date().toISOString()
      const existing = db.orders.find((o) => o.weekId === week.id && normName(o.name) === normName(name))
      const order: Order = {
        id: existing?.id ?? uid('o_'),
        weekId: week.id,
        name,
        itemId: item.id,
        itemName: item.name,
        ...extra,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      }
      db.orders = existing ? db.orders.map((o) => (o.id === existing.id ? order : o)) : [...db.orders, order]
      save(db)
      return order
    },
    async cancelOrder(weekId, name) {
      await wait()
      const db = load()
      const week = db.weeks.find((w) => w.id === weekId)
      if (week && isClosed(week.deadline)) throw new Error('已經截止，不能取消了，請直接找負責人')
      db.orders = db.orders.filter((o) => !(o.weekId === weekId && normName(o.name) === normName(name)))
      save(db)
    },
    admin: {
      async verify(_pw) {
        await wait()
      },
      async listWeeks(_pw) {
        await wait()
        return [...load().weeks].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      },
      async getWeek(_pw, weekId) {
        await wait()
        const db = load()
        return snapshot(db, db.weeks.find((w) => w.id === weekId) ?? null)
      },
      async saveWeek(_pw, draft) {
        await wait(400)
        const db = load()
        const now = new Date().toISOString()
        const prev = db.weeks.find((w) => w.id === draft.id)
        if (prev && prev.shop !== draft.shop && db.orders.some((o) => o.weekId === draft.id)) throw new Error('已經有人點了，不能換店家')
        const week: Week = { ...draft, createdAt: prev?.createdAt ?? now, updatedAt: now }
        db.weeks = prev ? db.weeks.map((w) => (w.id === week.id ? week : w)) : [...db.weeks, week]
        save(db)
        return week
      },
      async uploadImage(_pw, dataUrl) {
        await wait(600)
        return dataUrl // Demo 直接存 data URL
      },
      async deleteOrder(_pw, orderId) {
        await wait()
        const db = load()
        db.orders = db.orders.filter((o) => o.id !== orderId)
        save(db)
      },
    },
  }
}

// ───────────────────────── Demo 資料

function seed(): Db {
  const now = new Date().toISOString()
  const items = [
    { id: 'i_1', name: '招牌排骨便當', price: 100 },
    { id: 'i_2', name: '香酥雞腿便當', price: 110 },
    { id: 'i_3', name: '三杯雞便當', price: 100 },
    { id: 'i_4', name: '滷肉飯便當', price: 80 },
    { id: 'i_5', name: '鮭魚便當', price: 130 },
    { id: 'i_6', name: '素食便當', price: 90 },
  ]
  const week: Week = {
    id: 'w_demo',
    kind: 'bento',
    addons: [],
    host: '',
    mode: 'treat',
    shop: '阿嬤灶腳便當',
    imageUrl: menuSvg(items),
    deadline: defaultDeadline(),
    items,
    createdAt: now,
    updatedAt: now,
  }
  const people: [string, string][] = [
    ['Lee', 'i_2'],
    ['Jared', 'i_1'],
    ['Wes', 'i_1'],
    ['小美', 'i_6'],
    ['阿傑', 'i_3'],
  ]
  const orders: Order[] = people.map(([name, itemId], i) => {
    const it = items.find((x) => x.id === itemId)!
    const t = new Date(Date.now() - (people.length - i) * 37 * 60_000).toISOString()
    return { id: `o_demo${i}`, weekId: week.id, name, itemId, itemName: it.name, options: '', addonIds: [], createdAt: t, updatedAt: t }
  })
  return { weeks: [week], orders }
}

/** 假裝是負責人拍的手寫菜單 */
function menuSvg(items: { name: string }[]): string {
  const rows = items
    .map(
      (it, i) =>
        `<text x="300" y="${210 + i * 62}" font-size="34" text-anchor="middle">${it.name}</text>`,
    )
    .join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="640" viewBox="0 0 600 640">
<rect width="600" height="640" fill="#2f4a3a"/><rect x="18" y="18" width="564" height="604" fill="none" stroke="#c49a5a" stroke-width="14"/>
<g font-family="Huninn, 'PingFang TC', 'Microsoft JhengHei', sans-serif" fill="#fdf7e3">
<text x="300" y="110" font-size="56" text-anchor="middle" fill="#ffd23f">阿嬤灶腳便當</text>
<line x1="70" y1="140" x2="530" y2="140" stroke="#fdf7e3" stroke-width="3" stroke-dasharray="10 8"/>${rows}</g></svg>`
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}
