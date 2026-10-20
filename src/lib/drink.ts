import type { PlaceOrderInput, Week } from '../types'

// 後端 Code.gs 有一份一樣的清單，改這裡要一起改
export const SUGAR = ['正常糖', '少糖', '半糖', '微糖', '無糖']
export const ICE = ['正常冰', '少冰', '微冰', '去冰', '溫', '熱']

/** 檢查甜度冰量，加料單選（只認菜單上有的第一個），組成顯示用的字串 */
export function drinkOptions(week: Week, input: Pick<PlaceOrderInput, 'sugar' | 'ice' | 'addonIds'>) {
  if (!SUGAR.includes(input.sugar ?? '')) throw new Error('選一下甜度')
  if (!ICE.includes(input.ice ?? '')) throw new Error('選一下冰量')
  const addons = week.addons.filter((a) => a.id === input.addonIds?.find((id) => week.addons.some((x) => x.id === id)))
  return {
    options: [input.sugar, input.ice, ...addons.map((a) => `+${a.name}`)].join(' '),
    addonIds: addons.map((a) => a.id),
  }
}

/** 便當永遠是最新一筆便當菜單；飲料團只在收單中才算（舊資料沒有 kind = 便當） */
export function currentRounds(weeks: Week[], now = Date.now()) {
  const sorted = [...weeks].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const drink = sorted.find((w) => w.kind === 'drink')
  return {
    bento: sorted.find((w) => w.kind !== 'drink') ?? null,
    drink: drink && now < new Date(drink.deadline).getTime() ? drink : null,
  }
}
