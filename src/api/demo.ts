import type { Api, Order, Snapshot, Week } from '../types'
import { defaultDeadline, isClosed } from '../lib/time'
import { normName } from '../lib/stats'
import { uid } from '../lib/image'

/**
 * Demo 模式：沒有設定 VITE_GAS_URL 時使用，資料只存在這台電腦的瀏覽器。
 * 負責人密碼：admin
 */
const KEY = 'dinbendon:demo:v1'
const PASSWORD = 'admin'

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

function auth(pw: string) {
  if (pw !== PASSWORD) throw new Error('密碼不對（Demo 模式的密碼是 admin）')
}

function latest(db: Db): Week | null {
  return [...db.weeks].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
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
      return snapshot(db, latest(db))
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
      const qty = Math.max(1, Math.min(20, Math.floor(input.qty) || 1))
      const now = new Date().toISOString()
      const existing = db.orders.find((o) => o.weekId === week.id && normName(o.name) === normName(name))
      const order: Order = {
        id: existing?.id ?? uid('o_'),
        weekId: week.id,
        name,
        itemId: item.id,
        itemName: item.name,
        price: item.price,
        qty,
        note: input.note.trim().slice(0, 100),
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
      async verify(pw) {
        await wait()
        auth(pw)
      },
      async listWeeks(pw) {
        await wait()
        auth(pw)
        return [...load().weeks].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      },
      async getWeek(pw, weekId) {
        await wait()
        auth(pw)
        const db = load()
        return snapshot(db, db.weeks.find((w) => w.id === weekId) ?? null)
      },
      async saveWeek(pw, draft) {
        await wait(400)
        auth(pw)
        const db = load()
        const now = new Date().toISOString()
        const prev = db.weeks.find((w) => w.id === draft.id)
        const week: Week = { ...draft, createdAt: prev?.createdAt ?? now, updatedAt: now }
        db.weeks = prev ? db.weeks.map((w) => (w.id === week.id ? week : w)) : [...db.weeks, week]
        save(db)
        return week
      },
      async uploadImage(pw, dataUrl) {
        await wait(600)
        auth(pw)
        return dataUrl // Demo 直接存 data URL
      },
      async deleteOrder(pw, orderId) {
        await wait()
        auth(pw)
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
    { id: 'i_1', name: '招牌排骨便當', price: 95 },
    { id: 'i_2', name: '香酥雞腿便當', price: 110 },
    { id: 'i_3', name: '三杯雞便當', price: 100 },
    { id: 'i_4', name: '滷肉飯便當', price: 80 },
    { id: 'i_5', name: '鮭魚便當', price: 130 },
    { id: 'i_6', name: '素食便當', price: 85 },
  ]
  const week: Week = {
    id: 'w_demo',
    shop: '阿嬤灶腳便當',
    imageUrl: menuSvg(items),
    deadline: defaultDeadline(),
    items,
    note: '下週一中午送到一樓櫃台，記得準備零錢給負責人～',
    createdAt: now,
    updatedAt: now,
  }
  const people: [string, string, number, string][] = [
    ['Lee', 'i_2', 1, ''],
    ['Jared', 'i_1', 1, '飯少'],
    ['Wes', 'i_1', 2, '一個幫老婆點'],
    ['小美', 'i_6', 1, ''],
    ['阿傑', 'i_3', 1, '不要辣'],
  ]
  const orders: Order[] = people.map(([name, itemId, qty, note], i) => {
    const it = items.find((x) => x.id === itemId)!
    const t = new Date(Date.now() - (people.length - i) * 37 * 60_000).toISOString()
    return { id: `o_demo${i}`, weekId: week.id, name, itemId, itemName: it.name, price: it.price, qty, note, createdAt: t, updatedAt: t }
  })
  return { weeks: [week], orders }
}

/** 假裝是負責人拍的手寫菜單 */
function menuSvg(items: { name: string; price: number }[]): string {
  const rows = items
    .map(
      (it, i) =>
        `<text x="60" y="${210 + i * 62}" font-size="34">${it.name}</text><text x="540" y="${210 + i * 62}" font-size="34" text-anchor="end">$${it.price}</text>`,
    )
    .join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="640" viewBox="0 0 600 640">
<rect width="600" height="640" fill="#2f4a3a"/><rect x="18" y="18" width="564" height="604" fill="none" stroke="#c49a5a" stroke-width="14"/>
<g font-family="Huninn, 'PingFang TC', 'Microsoft JhengHei', sans-serif" fill="#fdf7e3">
<text x="300" y="110" font-size="56" text-anchor="middle" fill="#ffd23f">阿嬤灶腳便當</text>
<line x1="70" y1="140" x2="530" y2="140" stroke="#fdf7e3" stroke-width="3" stroke-dasharray="10 8"/>${rows}
<text x="300" y="600" font-size="22" text-anchor="middle" fill="#c9d8c9">每個便當附湯　加飯免費</text></g></svg>`
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}
