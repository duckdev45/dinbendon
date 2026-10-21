import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pickupTable } from '../src/lib/stats.ts'
import type { Order, Week } from '../src/types.ts'

const o = (name: string, itemName: string, options = '', itemId = 'a') => ({ name, itemId, itemName, options, addonIds: [] }) as unknown as Order

test('印出來的領取表：飲料是 姓名／飲料／其他備註，甜度冰量加料另一欄；依姓名排序', () => {
  const drink = { kind: 'drink', mode: 'treat', items: [{ id: 'a', name: '鐵觀音拿鐵', price: 65 }], addons: [] } as unknown as Week
  assert.deepEqual(pickupTable(drink, [o('吳曼暐', '鐵觀音拿鐵', '無糖 少冰 +紅萱粉粿'), o('尤鈺雲', '鐵觀音拿鐵', '少糖 去冰')]), {
    head: ['姓名', '飲料', '其他備註'],
    rows: [['尤鈺雲', '鐵觀音拿鐵', '少糖 去冰'], ['吳曼暐', '鐵觀音拿鐵', '無糖 少冰 +紅萱粉粿']],
  })
})

test('便當單純：姓名／便當；揪團多一欄要付', () => {
  const bento = { kind: 'bento', mode: 'treat', items: [], addons: [] } as unknown as Week
  assert.deepEqual(pickupTable(bento, [o('阿明', '排骨飯')]), { head: ['姓名', '便當'], rows: [['阿明', '排骨飯']] })
  const snack = { kind: 'snack', mode: 'group', items: [{ id: 'a', name: '紅豆', price: 15 }], addons: [] } as unknown as Week
  assert.deepEqual(pickupTable(snack, [o('阿明', '紅豆')]), { head: ['姓名', '點心', '要付'], rows: [['阿明', '紅豆', 15]] })
})
