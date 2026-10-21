import assert from 'node:assert/strict'
import { test } from 'node:test'
import { currentRounds, drinkOptions } from '../src/lib/drink.ts'
import { computeStats, drinkSummary, personLine, shopText } from '../src/lib/stats.ts'
import type { Order, Week } from '../src/types.ts'

const drink = {
  id: 'd1',
  kind: 'drink',
  shop: 'UG',
  deadline: '2026-10-20T08:00:00.000Z',
  createdAt: '2026-10-20T07:00:00.000Z',
  items: [{ id: 'a', name: '茶花紅烏龍', price: 75 }],
  addons: [
    { id: 'x', name: '燕麥粒', price: 15 },
    { id: 'y', name: '紅烏龍茶凍', price: 15 },
  ],
} as Week
const bento = { id: 'b1', kind: 'bento', createdAt: '2026-10-19T00:00:00.000Z', deadline: '2026-10-23T05:00:00.000Z', items: [], addons: [] } as unknown as Week

test('甜度冰量照固定選項，加料單選、只認菜單上有的', () => {
  assert.deepEqual(drinkOptions(drink, { sugar: '微糖', ice: '少冰', addonIds: ['nope', 'x', 'y'] }), {
    options: '微糖 少冰 +燕麥粒',
    addonIds: ['x'],
  })
  assert.deepEqual(drinkOptions(drink, { sugar: '無糖', ice: '去冰', addonIds: [] }).options, '無糖 去冰')
  assert.throws(() => drinkOptions(drink, { sugar: '超甜', ice: '少冰', addonIds: [] }), /甜度/)
  assert.throws(() => drinkOptions(drink, { sugar: '微糖', ice: '', addonIds: [] }), /冰量/)
})

const o = (name: string, options: string, addonIds: string[]) =>
  ({ name, itemId: 'a', itemName: '茶花紅烏龍', options, addonIds }) as Order
const orders = [o('鴨子', '微糖 少冰 +燕麥粒', ['x']), o('Amy', '無糖 去冰', []), o('Ben', '微糖 少冰 +燕麥粒', ['x'])]

test('一人一行：鴨子 奶茶 無糖 少冰 +珍珠', () => {
  assert.equal(personLine(orders[0]), '鴨子 茶花紅烏龍 微糖 少冰 +燕麥粒')
  assert.equal(
    shopText(drink, computeStats(drink, orders), orders),
    'UG 飲料（全部 L）\n鴨子 茶花紅烏龍 微糖 少冰 +燕麥粒\nAmy 茶花紅烏龍 無糖 去冰\nBen 茶花紅烏龍 微糖 少冰 +燕麥粒\n共 3 杯，$255',
  )
})

test('訂購統計表：同飲料同甜度冰量加料併一列，單價含加料', () => {
  assert.deepEqual(drinkSummary(drink, orders), [
    { label: '茶花紅烏龍 微糖 少冰 +燕麥粒', count: 2, price: 90, subtotal: 180, people: ['鴨子', 'Ben'] },
    { label: '茶花紅烏龍 無糖 去冰', count: 1, price: 75, subtotal: 75, people: ['Amy'] },
  ])
  assert.equal(computeStats(drink, orders).amount, 255)
})

test('點餐頁：便當永遠是最新便當菜單，飲料團只在收單中出現', () => {
  const now = new Date('2026-10-20T07:30:00.000Z').getTime()
  assert.deepEqual(currentRounds([drink, bento], now), { bento, drink, snack: null })
  assert.deepEqual(currentRounds([drink, bento], now + 3600_000), { bento, drink: null, snack: null })
  // 舊資料沒有 kind = 便當
  const old = { ...bento, kind: '' } as unknown as Week
  assert.equal(currentRounds([old], now).bento, old)
})

test('揪團：每人一行後面帶要付的錢；抖內：只寫誰請客', () => {
  const group = { ...drink, host: '鴨子', mode: 'group' } as Week
  assert.equal(
    shopText(group, computeStats(group, orders), orders),
    'UG 飲料（全部 L）・鴨子揪團\n鴨子 茶花紅烏龍 微糖 少冰 +燕麥粒 $90\nAmy 茶花紅烏龍 無糖 去冰 $75\nBen 茶花紅烏龍 微糖 少冰 +燕麥粒 $90\n共 3 杯，$255',
  )
  const treat = { ...drink, host: '老闆', mode: 'treat' } as Week
  assert.match(shopText(treat, computeStats(treat, orders), orders), /^UG 飲料（全部 L）・老闆請客\n鴨子 茶花紅烏龍 微糖 少冰 \+燕麥粒\n/)
})
