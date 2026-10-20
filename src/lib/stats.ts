import type { Order, Week } from '../types'

export interface ItemStat {
  itemId: string
  name: string
  price: number
  qty: number
  subtotal: number
  people: string[]
}

export interface Stats {
  items: ItemStat[]
  totalQty: number
  totalAmount: number
  headcount: number
}

/** 依菜單順序統計；菜單上已刪掉但有人點過的品項會排在最後 */
export function computeStats(week: Week | null, orders: Order[]): Stats {
  const map = new Map<string, ItemStat>()
  week?.items.forEach((it) =>
    map.set(it.id, { itemId: it.id, name: it.name, price: it.price, qty: 0, subtotal: 0, people: [] }),
  )
  for (const o of orders) {
    let s = map.get(o.itemId)
    if (!s) {
      s = { itemId: o.itemId, name: o.itemName, price: o.price, qty: 0, subtotal: 0, people: [] }
      map.set(o.itemId, s)
    }
    s.qty += o.qty
    s.subtotal += o.qty * o.price
    s.people.push(o.qty > 1 ? `${o.name}×${o.qty}` : o.name)
  }
  const items = [...map.values()]
  return {
    items,
    totalQty: items.reduce((a, b) => a + b.qty, 0),
    totalAmount: items.reduce((a, b) => a + b.subtotal, 0),
    headcount: new Set(orders.map((o) => normName(o.name))).size,
  }
}

export function normName(name: string) {
  return name.trim().toLowerCase()
}

/** 打電話給店家用的文字 */
export function shopText(week: Week, stats: Stats): string {
  const lines = stats.items.filter((s) => s.qty > 0).map((s) => `${s.name} × ${s.qty}`)
  return [`${week.shop || '便當'} 訂單`, ...lines, `共 ${stats.totalQty} 個，$${stats.totalAmount}`].join('\n')
}
