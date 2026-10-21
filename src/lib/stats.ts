import type { Order, Week } from '../types'

export interface ItemStat {
  itemId: string
  name: string
  price: number
  count: number
  subtotal: number
  people: string[]
}

export interface Stats {
  items: ItemStat[]
  /** 一人一份，所以訂餐人數 = 便當（飲料）數 */
  total: number
  /** 總金額，請款用 */
  amount: number
  /** 最多人點的便當，平手就全部列出 */
  tops: ItemStat[]
}

/** 一筆訂單的金額：品項單價＋加料；菜單上已刪掉的品項不知道價錢算 0 */
export function orderPrice(week: Week | null, o: Order): number {
  const item = week?.items.find((it) => it.id === o.itemId)?.price ?? 0
  const addons = (week?.addons ?? []).filter((a) => o.addonIds?.includes(a.id)).reduce((sum, a) => sum + a.price, 0)
  return item + addons
}

/** 「茶花紅烏龍 微糖 少冰 +燕麥粒」；便當就只有名稱 */
export function orderLabel(o: Order): string {
  return o.options ? `${o.itemName} ${o.options}` : o.itemName
}

/**
 * 印出來的領取表（Excel 第一張）：飲料是 姓名／飲料／其他備註（甜度冰量加料），便當、點心只有 姓名／品項；
 * 揪團多一欄要付的錢。依姓名排序，找自己最快
 */
export function pickupTable(week: Week, orders: Order[]) {
  const unit = week.kind === 'drink' ? '飲料' : week.kind === 'snack' ? '點心' : '便當'
  const drink = week.kind === 'drink'
  const group = week.kind !== 'bento' && week.mode === 'group'
  const head = ['姓名', unit, ...(drink ? ['其他備註'] : []), ...(group ? ['要付'] : [])]
  const rows = [...orders]
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'))
    .map((o): (string | number)[] => [o.name, o.itemName, ...(drink ? [o.options] : []), ...(group ? [orderPrice(week, o)] : [])])
  return { head, rows }
}

/** 「鴨子 奶茶 無糖 少冰 +珍珠」：發飲料、核對用 */
export function personLine(o: Order): string {
  return `${o.name} ${orderLabel(o)}`
}

export interface SummaryRow {
  label: string
  count: number
  /** 一杯的錢，含加料 */
  price: number
  subtotal: number
  people: string[]
}

/** 飲料訂購統計表：同飲料同甜度冰量加料併成一列，照第一次出現的順序 */
export function drinkSummary(week: Week, orders: Order[]): SummaryRow[] {
  const rows = new Map<string, SummaryRow>()
  for (const o of orders) {
    const label = orderLabel(o)
    const row = rows.get(label) ?? { label, count: 0, price: orderPrice(week, o), subtotal: 0, people: [] }
    row.count += 1
    row.subtotal += row.price
    row.people.push(o.name)
    rows.set(label, row)
  }
  return [...rows.values()]
}

/** 依菜單順序統計；菜單上已刪掉但有人點過的品項會排在最後。小計含加料 */
export function computeStats(week: Week | null, orders: Order[]): Stats {
  const map = new Map<string, ItemStat>()
  week?.items.forEach((it) => map.set(it.id, { itemId: it.id, name: it.name, price: it.price, count: 0, subtotal: 0, people: [] }))
  for (const o of orders) {
    let s = map.get(o.itemId)
    if (!s) {
      s = { itemId: o.itemId, name: o.itemName, price: 0, count: 0, subtotal: 0, people: [] }
      map.set(o.itemId, s)
    }
    s.count += 1
    s.subtotal += orderPrice(week, o)
    s.people.push(o.name)
  }
  const items = [...map.values()]
  const max = Math.max(0, ...items.map((s) => s.count))
  const tops = max > 0 ? items.filter((s) => s.count === max) : []
  const amount = items.reduce((sum, s) => sum + s.subtotal, 0)
  return { items, total: orders.length, amount, tops }
}

export function normName(name: string) {
  return name.trim().toLowerCase()
}

/** 複製用的文字：便當照品項數量；飲料、點心一人一行「鴨子 奶茶 無糖 少冰 +珍珠」，揪團後面帶要付的錢 */
export function shopText(week: Week, stats: Stats, orders: Order[]): string {
  const total = (unit: string) => `共 ${stats.total} ${unit}${stats.amount ? `，$${stats.amount}` : ''}`
  if (week.kind === 'drink' || week.kind === 'snack') {
    const drink = week.kind === 'drink'
    const group = week.mode === 'group'
    const host = week.host ? `・${week.host}${group ? '揪團' : '請客'}` : ''
    const lines = orders.map((o) => (group ? `${personLine(o)} $${orderPrice(week, o)}` : personLine(o)))
    const head = drink ? `${week.shop || '飲料'} 飲料（全部 L）` : `${week.shop || '點心'} 點心`
    return [`${head}${host}`, ...lines, total(drink ? '杯' : '份')].join('\n')
  }
  const lines = stats.items.filter((s) => s.count > 0).map((s) => `${s.name} × ${s.count}`)
  return [`${week.shop || '便當'} 訂單`, ...lines, total('個')].join('\n')
}
