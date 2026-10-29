// 常用店家：店家清單存在後台的 shops 工作表；原本寫死在程式裡的內建店家已經匯入（updatedAt 是 1970，最舊）
import type { RoundKind, ShopPreset, ShopRow, Week } from './types'

/** 公司補助上限：超過的便當選店家時不帶入，存菜單時也擋 */
export const MAX_PRICE = 150

/**
 * 常用店家＝開過的團＋shops 表（手動維護的、匯入的內建店家），同一家取最新的那份；
 * 最新的是「刪掉」就不顯示，之後又用同一家開團會再出現
 */
export function presets(kind: RoundKind, weeks: Week[], rows: ShopRow[]): ShopPreset[] {
  const best = new Map<string, { at: string; hidden: boolean; p: ShopPreset }>()
  const offer = (at: string, hidden: boolean, p: ShopPreset) => {
    const cur = best.get(p.shop)
    if (!cur || at > cur.at) best.set(p.shop, { at, hidden, p })
  }
  // 電話、備註只存在 shops 表，開過的團比較新也要留著
  const extra = new Map(rows.filter((r) => r.kind === kind).map((r) => [r.shop, { phone: r.phone ?? '', note: r.note ?? '' }]))
  const pairs = (list: { name: string; price: number }[]) => list.map((it): [string, number] => [it.name, it.price])
  // 先放 shops 表，清單順序照表上的
  for (const r of rows) {
    if (r.kind === kind) offer(r.updatedAt, r.hidden, { kind, shop: r.shop, imageUrl: r.imageUrl, items: r.items, addons: r.addons, phone: '', note: '' })
  }
  for (const w of weeks) {
    if (w.kind !== kind || !w.shop.trim()) continue
    offer(w.updatedAt ?? '', false, { kind, shop: w.shop.trim(), imageUrl: w.imageUrl, items: pairs(w.items), addons: pairs(w.addons ?? []), phone: '', note: '' })
  }
  return [...best.values()].filter((x) => !x.hidden).map((x) => ({ ...x.p, ...extra.get(x.p.shop) }))
}

/** 從文字貼上：一行一個；照抄店家菜單時後面帶的價格會當成單價 */
export function parseBulk(text: string): [string, number][] {
  return text
    .split('\n')
    .map((l): [string, number] => {
      const m = l.trim().match(/^(.*?)[\s:：$＄,，]*(\d+)\s*元?$/)
      return [(m ? m[1] : l).trim(), m ? Number(m[2]) : 0]
    })
    .filter(([name]) => name)
}
