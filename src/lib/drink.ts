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

/** 飲料團、點心團：限時、有人開團，抖內或揪團 */
export const isBonus = (kind: string) => kind === 'drink' || kind === 'snack'

/**
 * 便當截止後點餐頁還顯示「已截止」，到截止那天 17:30（台北）清空；截止時間比 17:30 晚就截止即清空。
 * 後端 Code.gs bentoGone_ 一樣的算法
 */
export function bentoGone(deadline: string, now = Date.now()) {
  const end = new Date(deadline).getTime()
  const t = new Date(end + 8 * 3600_000) // 台北時間欄位
  const clear = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), 17 - 8, 30)
  return now >= Math.max(end, clear)
}

/** 便當是最新一筆便當菜單（過了清空時間就沒有）；飲料團、點心團只在收單中才算（舊資料沒有 kind = 便當） */
export function currentRounds(weeks: Week[], now = Date.now()) {
  const sorted = [...weeks].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const open = (kind: 'drink' | 'snack') => {
    const w = sorted.find((x) => x.kind === kind)
    return w && now < new Date(w.deadline).getTime() ? w : null
  }
  const bento = sorted.find((w) => !isBonus(w.kind))
  return {
    bento: bento && !bentoGone(bento.deadline, now) ? bento : null,
    drink: open('drink'),
    snack: open('snack'),
  }
}

/** 訂單統計預設看哪團：收單中的飲料、點心團（最新的）優先，不然這週便當。後端 adminListWeeks 的 latest 一樣挑法 */
export function statsPick(weeks: Week[], now = Date.now()) {
  const { drink, snack } = currentRounds(weeks, now)
  const open = [drink, snack].filter((w) => w).sort((a, b) => b!.createdAt.localeCompare(a!.createdAt))[0]
  // 便當清空了統計還是要看得到上一週
  const bento = [...weeks].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).find((w) => !isBonus(w.kind))
  return open ?? bento ?? weeks[0] ?? null
}

/** 存檔會不會讓還在收單的團提早結束（流團、把截止時間改到現在以前）；有設開團密碼的才要擋。後端 adminSaveWeek 一樣的判斷 */
export function endsEarly(prev: Week | null, deadline: string, now = Date.now()) {
  if (!prev?.hasPassword) return false
  return new Date(deadline).getTime() <= now && now < new Date(prev.deadline).getTime()
}

/**
 * 同一種限時團同時只能有一團收單中，不然新的會把還在收單的那團從點餐頁擠掉。
 * 回傳擋路的那團；存自己那團（改內容、流團）、便當都不算。後端 Code.gs 有一份一樣的檢查。
 */
export function openConflict(weeks: Week[], draft: Pick<Week, 'id' | 'kind'>, now = Date.now()) {
  if (!isBonus(draft.kind)) return null
  const open = currentRounds(weeks, now)[draft.kind as 'drink' | 'snack']
  return open && open.id !== draft.id ? open : null
}
