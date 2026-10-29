import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseBulk, presets } from '../src/shops.ts'
import type { ShopRow, Week } from '../src/types.ts'

const week = (p: Partial<Week>) =>
  ({ id: 'w', kind: 'snack', shop: '巷口車輪餅', imageUrl: 'pic', items: [{ id: 'a', name: '紅豆', price: 15 }], addons: [], updatedAt: '2026-10-21T07:00:00.000Z', ...p }) as Week
const row = (p: Partial<ShopRow>) =>
  ({ kind: 'snack', shop: '巷口車輪餅', imageUrl: '', items: [['奶油', 20]], addons: [], hidden: false, updatedAt: '2026-10-21T08:00:00.000Z', ...p }) as ShopRow

test('開過的團自動變常用店家：同一家取最後一次的菜單', () => {
  const older = week({ id: 'w1', items: [{ id: 'a', name: '紅豆', price: 12 }], updatedAt: '2026-10-14T07:00:00.000Z' })
  assert.deepEqual(presets('snack', [week({}), older], []), [{ kind: 'snack', shop: '巷口車輪餅', imageUrl: 'pic', items: [['紅豆', 15]], addons: [], phone: '', note: '' }])
  // 別種團、沒填店名的不算
  assert.deepEqual(presets('snack', [week({ kind: 'drink' }), week({ shop: ' ' })], []), [])
  // 店名前後多打空白也算同一家
  assert.equal(presets('snack', [week({ shop: '巷口車輪餅 ' }), older], []).length, 1)
})

// 原本寫死的內建店家匯入 shops 表時 updatedAt 是 1970（最舊）
const OLD = '1970-01-01T00:00:00.000Z'
const seeded = [
  row({ kind: 'bento', shop: '山水美食坊', items: [['排骨飯', 100]], updatedAt: OLD }),
  row({ kind: 'bento', shop: '米香手作便當', items: [['滷雞腿', 105]], updatedAt: OLD }),
  row({ kind: 'drink', shop: '得正', items: [['紅茶', 30]], updatedAt: OLD }),
]

test('匯入的內建店家照表上順序；手動維護過的、開團改過價錢的，以比較新的為準', () => {
  assert.deepEqual(presets('bento', [], seeded).map((p) => p.shop), ['山水美食坊', '米香手作便當'])
  assert.equal(presets('drink', [], seeded)[0].shop, '得正')
  assert.deepEqual(presets('snack', [week({})], [row({})])[0].items, [['奶油', 20]])
  assert.deepEqual(presets('snack', [week({ updatedAt: '2026-10-21T09:00:00.000Z' })], [row({})])[0].items, [['紅豆', 15]])
  // 開過的團比匯入的內建店家新
  const s = seeded.find((p) => p.kind === 'bento')!
  assert.deepEqual(presets('bento', [week({ kind: 'bento', shop: s.shop })], seeded).find((p) => p.shop === s.shop)!.items, [['紅豆', 15]])
})

test('刪掉的常用店家不出現，之後又用同一家開團就回來', () => {
  const s = seeded[0].shop
  assert.equal(presets('bento', [], [...seeded.filter((p) => p.shop !== s), row({ kind: 'bento', shop: s, hidden: true })]).some((p) => p.shop === s), false)
  assert.equal(presets('snack', [week({})], [row({ hidden: true })]).length, 0)
  assert.equal(presets('snack', [week({ updatedAt: '2026-10-21T09:00:00.000Z' })], [row({ hidden: true })]).length, 1)
})

test('從文字貼上：一行一種，後面的數字當單價', () => {
  assert.deepEqual(parseBulk('排骨便當 100\n\n 雞腿便當：$110元 \n滷肉飯\n大腸麵線,65'), [['排骨便當', 100], ['雞腿便當', 110], ['滷肉飯', 0], ['大腸麵線', 65]])
  assert.deepEqual(parseBulk(' \n$50\n'), [])
})

test('店家電話、備註只存在 shops 表：開過的團比較新也留著', () => {
  const r = row({ phone: '02-2345-6789', note: '滿 1000 外送' })
  assert.equal(presets('snack', [], [r])[0].phone, '02-2345-6789')
  const p = presets('snack', [week({ updatedAt: '2026-10-21T09:00:00.000Z' })], [r])[0]
  assert.deepEqual([p.phone, p.note], ['02-2345-6789', '滿 1000 外送'])
  // 舊版 Code.gs 沒有 phone、note 欄
  const old = presets('snack', [], [row({ phone: undefined, note: undefined })])[0]
  assert.deepEqual([old.phone, old.note], ['', ''])
})
