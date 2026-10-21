import assert from 'node:assert/strict'
import { test } from 'node:test'
import { drinkType } from '../src/lib/drink.ts'

test('轉盤分類：有奶的是奶類，其他茶、果茶都算茶類；認不出來的不上轉盤', () => {
  for (const n of ['珍珠奶茶', '紅茶拿鐵', '蜜香那堤', '烏奶', '芋頭奶綠', '醇濃可可奶霜', '天蟬燕麥奶', '蜜桃奶茶', '葡萄Q凍撞奶']) assert.equal(drinkType(n), 'milk', n)
  for (const n of ['茉莉綠茶', '檸檬綠', '多多綠', '波霸綠', '極上307（厚）', '芝士奶蓋春烏龍', '蕎麥奶蓋綠水', '冬瓜檸檬', '巨峰葡萄冰沙']) assert.equal(drinkType(n), 'tea', n)
  for (const n of ['購物袋', '本日限定（只有 M）', '黑糖珍珠']) assert.equal(drinkType(n), null, n)
})
