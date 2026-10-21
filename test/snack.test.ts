import assert from 'node:assert/strict'
import { test } from 'node:test'
import { currentRounds, openConflict } from '../src/lib/drink.ts'
import { computeStats, shopText } from '../src/lib/stats.ts'
import type { Order, Week } from '../src/types.ts'

const snack = {
  id: 's1',
  kind: 'snack',
  shop: '巷口車輪餅',
  host: '鴨子',
  mode: 'treat',
  deadline: '2026-10-21T08:00:00.000Z',
  createdAt: '2026-10-21T07:00:00.000Z',
  items: [
    { id: 'a', name: '紅豆', price: 15 },
    { id: 'b', name: '奶油', price: 20 },
  ],
  addons: [],
} as unknown as Week
const bento = { id: 'b1', kind: 'bento', createdAt: '2026-10-19T00:00:00.000Z', deadline: '2026-10-23T05:00:00.000Z', items: [], addons: [] } as unknown as Week

test('點餐頁：點心團只在收單中出現，不會被當成便當', () => {
  const now = new Date('2026-10-21T07:30:00.000Z').getTime()
  assert.deepEqual(currentRounds([snack, bento], now), { bento, drink: null, snack })
  assert.deepEqual(currentRounds([snack, bento], now + 3600_000), { bento, drink: null, snack: null })
})

const o = (name: string, itemId: string, itemName: string) => ({ name, itemId, itemName, options: '', addonIds: [] }) as unknown as Order
const orders = [o('鴨子', 'a', '紅豆'), o('Amy', 'b', '奶油'), o('Ben', 'a', '紅豆')]

test('複製點心訂單：一人一行，單位是份；揪團帶要付的錢', () => {
  assert.equal(shopText(snack, computeStats(snack, orders), orders), '巷口車輪餅 點心・鴨子請客\n鴨子 紅豆\nAmy 奶油\nBen 紅豆\n共 3 份，$50')
  const group = { ...snack, mode: 'group' } as Week
  assert.equal(
    shopText(group, computeStats(group, orders), orders),
    '巷口車輪餅 點心・鴨子揪團\n鴨子 紅豆 $15\nAmy 奶油 $20\nBen 紅豆 $15\n共 3 份，$50',
  )
})

test('同一種團同時只能有一團收單中：另開一團會被擋，改自己那團、開別種團、上一團截止了都可以', () => {
  const now = new Date('2026-10-21T07:30:00.000Z').getTime()
  const other = { ...snack, id: 's2' } as Week
  assert.equal(openConflict([snack, bento], other, now), snack)
  assert.equal(openConflict([snack, bento], snack, now), null)
  assert.equal(openConflict([snack, bento], { ...other, kind: 'drink' } as Week, now), null)
  assert.equal(openConflict([snack, bento], other, now + 3600_000), null)
  assert.equal(openConflict([snack, bento], { ...bento, id: 'b2' } as Week, now), null)
})
