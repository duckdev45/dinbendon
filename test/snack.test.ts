import assert from 'node:assert/strict'
import { test } from 'node:test'
import { currentRounds, endsEarly, openConflict, statsPick } from '../src/lib/drink.ts'
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

test('訂單統計預設：有限時團收單中先看它，結束了回到這週便當', () => {
  const now = new Date('2026-10-21T07:30:00.000Z').getTime()
  assert.equal(statsPick([snack, bento], now), snack)
  assert.equal(statsPick([snack, bento], now + 3600_000), bento)
  assert.equal(statsPick([], now), null)
})

test('提早結束要密碼：還在收單、存檔後截止時間已經過了才算；舊團沒設密碼不用', () => {
  const now = new Date('2026-10-21T07:30:00.000Z').getTime()
  const locked = { ...snack, hasPassword: true } as Week
  assert.equal(endsEarly(locked, '2026-10-21T07:30:00.000Z', now), true)
  assert.equal(endsEarly(locked, '2026-10-21T09:00:00.000Z', now), false)
  assert.equal(endsEarly(locked, '2026-10-21T07:00:00.000Z', now + 3600_000), false)
  assert.equal(endsEarly(snack, '2026-10-21T07:30:00.000Z', now), false)
  assert.equal(endsEarly(null, '2026-10-21T07:30:00.000Z', now), false)
})

test('便當截止後還顯示「已截止」，到截止那天 17:30（台北）就清空', () => {
  // bento 週五 13:00 截止
  const tpe = (hhmm: string) => new Date(`2026-10-23T${hhmm}:00+08:00`).getTime()
  assert.equal(currentRounds([bento], tpe('17:29')).bento, bento)
  assert.equal(currentRounds([bento], tpe('17:31')).bento, null)
  // 截止時間比 17:30 晚：截止就清空
  const late = { ...bento, deadline: '2026-10-23T10:00:00.000Z' } as Week
  assert.equal(currentRounds([late], tpe('17:45')).bento, late)
  assert.equal(currentRounds([late], tpe('18:01')).bento, null)
  // 訂單統計還是看得到上週便當
  assert.equal(statsPick([bento], tpe('20:00')), bento)
})
