import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DRINK_SHOPS, SHOPS, presets } from '../src/shops.ts'
import type { ShopRow, Week } from '../src/types.ts'

const week = (p: Partial<Week>) =>
  ({ id: 'w', kind: 'snack', shop: '巷口車輪餅', imageUrl: 'pic', items: [{ id: 'a', name: '紅豆', price: 15 }], addons: [], updatedAt: '2026-10-21T07:00:00.000Z', ...p }) as Week
const row = (p: Partial<ShopRow>) =>
  ({ kind: 'snack', shop: '巷口車輪餅', imageUrl: '', items: [['奶油', 20]], addons: [], hidden: false, updatedAt: '2026-10-21T08:00:00.000Z', ...p }) as ShopRow

test('開過的團自動變常用店家：同一家取最後一次的菜單', () => {
  const older = week({ id: 'w1', items: [{ id: 'a', name: '紅豆', price: 12 }], updatedAt: '2026-10-14T07:00:00.000Z' })
  assert.deepEqual(presets('snack', [week({}), older], []), [{ kind: 'snack', shop: '巷口車輪餅', imageUrl: 'pic', items: [['紅豆', 15]], addons: [] }])
  // 別種團、沒填店名的不算
  assert.deepEqual(presets('snack', [week({ kind: 'drink' }), week({ shop: ' ' })], []), [])
  // 店名前後多打空白也算同一家
  assert.equal(presets('snack', [week({ shop: '巷口車輪餅 ' }), older], []).length, 1)
})

test('內建店家照舊在；手動維護過的、開團改過價錢的，以比較新的為準', () => {
  assert.equal(presets('bento', [], []).length, SHOPS.length)
  assert.equal(presets('drink', [], [])[0].imageUrl, DRINK_SHOPS[0].logo)
  assert.deepEqual(presets('snack', [week({})], [row({})])[0].items, [['奶油', 20]])
  assert.deepEqual(presets('snack', [week({ updatedAt: '2026-10-21T09:00:00.000Z' })], [row({})])[0].items, [['紅豆', 15]])
  const s = SHOPS[0].shop
  assert.deepEqual(presets('bento', [], [row({ kind: 'bento', shop: s })]).find((p) => p.shop === s)!.items, [['奶油', 20]])
})

test('刪掉的常用店家不出現，之後又用同一家開團就回來', () => {
  const s = SHOPS[0].shop
  assert.equal(presets('bento', [], [row({ kind: 'bento', shop: s, hidden: true })]).some((p) => p.shop === s), false)
  assert.equal(presets('snack', [week({})], [row({ hidden: true })]).length, 0)
  assert.equal(presets('snack', [week({ updatedAt: '2026-10-21T09:00:00.000Z' })], [row({ hidden: true })]).length, 1)
})
