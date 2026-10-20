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
  /** 一人一個，所以訂餐人數 = 便當數 */
  total: number
  /** 總金額，請款用 */
  amount: number
  /** 最多人點的便當，平手就全部列出 */
  tops: ItemStat[]
}

/** 依菜單順序統計；菜單上已刪掉但有人點過的品項會排在最後，不知道價錢算 0 */
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
    s.subtotal += s.price
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

/** 打電話給店家用的文字 */
export function shopText(week: Week, stats: Stats): string {
  const lines = stats.items.filter((s) => s.count > 0).map((s) => `${s.name} × ${s.count}`)
  return [`${week.shop || '便當'} 訂單`, ...lines, `共 ${stats.total} 個${stats.amount ? `，$${stats.amount}` : ''}`].join('\n')
}
