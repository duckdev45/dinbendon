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

// 選擇障礙轉盤：品名有奶的算奶類，其他茶、果茶都算茶類；兩邊都對不到（購物袋、黑糖珍珠）不上轉盤
// 「奶蓋」「奶霜」是茶上面一層，底還是茶，不算奶類
const MILK = /奶茶|鮮奶|牛奶|拿鐵|那堤|奶綠|奶青|歐蕾|厚奶|可可|阿華田|巧克力|奶昔|凍奶|雪奶|嫩奶|撞奶|濃乳|燕麥奶|蕎麥奶(?!蓋)|烏奶|泰奶|豆花|瑪奇朵/
const TEA = /茶|烏龍|觀音|普洱|包種|金萱|翠玉|東方美人|綠|紅|青|春|茉|蕎麥|大麥|菁|雪芽|隱山|丹寧|藍山|琥珀|火炭|30[78]|505|雲蓋|月光|朱丰|平川|卡紅|蜂凝露|冬露|冬瓜|仙草|檸|柚|橙|柳丁|百香|芒|愛文|葡萄|莓|鳳梨|旺來|甘蔗|梅|蘋果|荔|梨|西瓜|果|桔|橘|柑|椰|芭樂|桃|多多|樂多|優|甘露|蜜朵朵|曼美|抹一點酸/

export function drinkType(name: string): 'tea' | 'milk' | null {
  return MILK.test(name) ? 'milk' : TEA.test(name) ? 'tea' : null
}

/** 飲料團、點心團：限時、有人開團，抖內或揪團 */
export const isBonus = (kind: string) => kind === 'drink' || kind === 'snack'

/** 秘密團（Week.private）叫什麼；後端 Code.gs 錯誤訊息一樣 */
export const secretName = (kind: string) => (kind === 'snack' ? '吃點心不揪' : '喝飲料不揪')

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

/** 便當是最新一筆便當菜單（過了清空時間就沒有）；飲料團、點心團只在收單中才算，喝飲料不揪不算（舊資料沒有 kind = 便當） */
export function currentRounds(weeks: Week[], now = Date.now()) {
  const sorted = [...weeks].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const open = (kind: 'drink' | 'snack') => {
    const w = sorted.find((x) => x.kind === kind && !x.private)
    return w && now < new Date(w.deadline).getTime() ? w : null
  }
  const bento = sorted.find((w) => !isBonus(w.kind))
  return {
    bento: bento && !bentoGone(bento.deadline, now) ? bento : null,
    drink: open('drink'),
    snack: open('snack'),
  }
}

/** 訂單統計的下拉只放還在收單、或截止不到一天的團；更早的到「歷史訂單」看 */
export function recentRounds(weeks: Week[], now = Date.now()) {
  return weeks.filter((w) => now < new Date(w.deadline).getTime() + 86400_000)
}

/** 訂單統計預設看哪團：收單中的飲料、點心團（最新的）優先，不然最近的便當；都超過一天就沒有。後端 adminListWeeks 的 latest 一樣挑法 */
export function statsPick(weeks: Week[], now = Date.now()) {
  const { drink, snack } = currentRounds(weeks, now)
  const open = [drink, snack].filter((w) => w).sort((a, b) => b!.createdAt.localeCompare(a!.createdAt))[0]
  // 點餐頁的便當 17:30 就清空了，統計還是要看得到
  // 喝飲料不揪要通關密碼才看得到，不當預設
  const recent = recentRounds(weeks, now).filter((w) => !w.private).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return open ?? recent.find((w) => !isBonus(w.kind)) ?? recent[0] ?? null
}

/** 存檔會不會讓還在收單的團提早結束（流團、把截止時間改到現在以前）；有設開團密碼的才要擋。後端 adminSaveWeek 一樣的判斷 */
export function endsEarly(prev: Week | null, deadline: string, now = Date.now()) {
  if (!prev?.hasPassword) return false
  return new Date(deadline).getTime() <= now && now < new Date(prev.deadline).getTime()
}

/**
 * 同一種限時團同時只能有一團收單中，不然新的會把還在收單的那團從點餐頁擠掉。
 * 回傳擋路的那團；存自己那團（改內容、流團）、便當、喝飲料不揪都不算。後端 Code.gs 有一份一樣的檢查。
 */
export function openConflict(weeks: Week[], draft: Pick<Week, 'id' | 'kind' | 'private'>, now = Date.now()) {
  if (!isBonus(draft.kind) || draft.private) return null
  const open = currentRounds(weeks, now)[draft.kind as 'drink' | 'snack']
  return open && open.id !== draft.id ? open : null
}
