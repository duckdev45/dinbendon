import assert from 'node:assert/strict'
import { test } from 'node:test'
import { computeStats, shopText } from '../src/lib/stats.ts'
import type { Order, Week } from '../src/types.ts'

const week = {
  id: 'w',
  shop: '平凡五金行',
  kind: 'bento',
  addons: [],
  items: [
    { id: 'a', name: '香烤鯖魚便當', price: 99 },
    { id: 'b', name: '香煎鮭魚便當', price: 169 },
  ],
} as Week
const order = (name: string, itemId: string, itemName = '') => ({ name, itemId, itemName, options: '', addonIds: [] }) as Order

test('依菜單單價算小計和總金額，請款用', () => {
  const orders = [order('A', 'a', '香烤鯖魚便當'), order('B', 'a', '香烤鯖魚便當'), order('C', 'b', '香煎鮭魚便當')]
  const s = computeStats(week, orders)
  assert.deepEqual(
    s.items.map((i) => [i.name, i.price, i.count, i.subtotal]),
    [
      ['香烤鯖魚便當', 99, 2, 198],
      ['香煎鮭魚便當', 169, 1, 169],
    ],
  )
  assert.equal(s.amount, 367)
  assert.equal(shopText(week, s, orders), '平凡五金行 訂單\n香烤鯖魚便當 × 2\n香煎鮭魚便當 × 1\n共 3 個，$367')
})

test('菜單上被刪掉的品項不知道價錢，算 0', () => {
  const s = computeStats(week, [order('A', 'gone', '舊便當')])
  assert.equal(s.items.at(-1)?.subtotal, 0)
  assert.equal(s.amount, 0)
})
