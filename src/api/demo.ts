import type { Api, Order, ShopRow, Snapshot, Week } from '../types'
import { defaultDeadline, isClosed } from '../lib/time'
import { normName } from '../lib/stats'
import { currentRounds, drinkOptions, endsEarly, openConflict, secretName, statsPick } from '../lib/drink'
import { uid } from '../lib/image'

/**
 * Demo 模式：沒有設定 VITE_GAS_URL 時使用，資料只存在這台電腦的瀏覽器。
 * 訂單管理不用密碼。
 */
const KEY = 'dinbendon:demo:v5'

interface Db {
  weeks: Week[]
  orders: Order[]
  /** 舊的 demo 資料沒有 */
  shops?: ShopRow[]
  /** 開團密碼，跟 week 分開放，不會跟著菜單傳出去 */
  passwords?: Record<string, string>
  /** 喝飲料不揪的通關密碼，一樣分開放 */
  secrets?: Record<string, string>
}

function checkSecret(db: Db, weekId: string, input = '') {
  const s = db.secrets?.[weekId]
  if (s && s !== input.trim()) throw new Error('通關密碼不對，問一下揪你的人')
}

function checkPassword(db: Db, weekId: string, input = '') {
  const pw = db.passwords?.[weekId]
  const owner = db.weeks.find((w) => w.id === weekId)?.owner
  if (pw && pw !== input.trim()) throw new Error(`密碼不對，請聯絡負責人${owner ? ' ' + owner : ''}`)
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
      const { bento, drink, snack } = currentRounds(db.weeks)
      return { ...snapshot(db, bento), drink: drink ? snapshot(db, drink) : null, snack: snack ? snapshot(db, snack) : null }
    },
    async getRound(weekId, secret) {
      await wait()
      const db = load()
      const week = db.weeks.find((w) => w.id === weekId)
      if (!week) throw new Error('找不到這團，連結是不是貼錯了')
      checkSecret(db, weekId, secret)
      return snapshot(db, week)
    },
    async placeOrder(input) {
      await wait(400)
      const db = load()
      const week = db.weeks.find((w) => w.id === input.weekId)
      if (!week) throw new Error('找不到這週的菜單，重新整理看看')
      checkSecret(db, week.id, input.secret)
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
    async cancelOrder(weekId, name, secret) {
      await wait()
      const db = load()
      checkSecret(db, weekId, secret)
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
        const db = load()
        // 喝飲料不揪不露誰揪、誰負責，跟後端一樣
        const weeks = [...db.weeks]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((w) => (w.private ? { ...w, host: '', owner: '' } : w))
        return { weeks, latest: snapshot(db, statsPick(weeks)), shops: db.shops ?? [] }
      },
      async getWeek(_pw, weekId, secret) {
        await wait()
        const db = load()
        checkSecret(db, weekId, secret)
        return snapshot(db, db.weeks.find((w) => w.id === weekId) ?? null)
      },
      async saveWeek(_pw, draft, roundPassword = '', secret = '') {
        await wait(400)
        const db = load()
        const now = new Date().toISOString()
        const prev = db.weeks.find((w) => w.id === draft.id)
        if (prev && endsEarly(prev, draft.deadline)) checkPassword(db, prev.id, roundPassword)
        if (prev) checkSecret(db, prev.id, secret)
        const busy = openConflict(db.weeks, draft)
        if (busy) throw new Error(`${busy.host || '有人'} 已經開了${busy.kind === 'drink' ? '飲料' : '點心'}團，重新整理看看`)
        if (prev && prev.shop !== draft.shop && db.orders.some((o) => o.weekId === draft.id)) throw new Error('已經有人點了，不能換店家')
        if (!prev && roundPassword.trim()) db.passwords = { ...db.passwords, [draft.id]: roundPassword.trim() }
        if (!prev && draft.private && draft.kind !== 'bento') {
          if (!secret.trim()) throw new Error(`${secretName(draft.kind)}要設通關密碼`)
          db.secrets = { ...db.secrets, [draft.id]: secret.trim() }
        }
        const week: Week = { ...draft, owner: prev ? prev.owner : draft.owner?.trim(), hasPassword: !!db.passwords?.[draft.id], private: !!db.secrets?.[draft.id], createdAt: prev?.createdAt ?? now, updatedAt: now }
        db.weeks = prev ? db.weeks.map((w) => (w.id === week.id ? week : w)) : [...db.weeks, week]
        save(db)
        return week
      },
      async uploadImage(_pw, dataUrl) {
        await wait(600)
        return dataUrl // Demo 直接存 data URL
      },
      async saveShop(_pw, shop, from) {
        await wait(400)
        const db = load()
        const name = shop.shop.trim()
        if (!name) throw new Error('填一下店家名稱')
        const updatedAt = new Date().toISOString()
        const put = (row: ShopRow) => {
          db.shops = [...(db.shops ?? []).filter((r) => !(r.kind === row.kind && r.shop === row.shop)), row]
        }
        if (from && from !== name) put({ kind: shop.kind, shop: from, imageUrl: '', items: [], addons: [], phone: '', note: '', hidden: true, updatedAt })
        put({ ...shop, shop: name, updatedAt })
        save(db)
        return db.shops!
      },
      async deleteOrder(_pw, orderId, roundPassword) {
        await wait()
        const db = load()
        const order = db.orders.find((o) => o.id === orderId)
        if (order) checkPassword(db, order.weekId, roundPassword)
        db.orders = db.orders.filter((o) => o.id !== orderId)
        save(db)
      },
      async deleteWeek(_pw, weekId, roundPassword, secret) {
        await wait()
        const db = load()
        checkPassword(db, weekId, roundPassword)
        checkSecret(db, weekId, secret)
        db.weeks = db.weeks.filter((w) => w.id !== weekId)
        db.orders = db.orders.filter((o) => o.weekId !== weekId)
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
