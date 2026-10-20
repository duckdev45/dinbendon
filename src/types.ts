export interface MenuItem {
  id: string
  name: string
  /** 單價（元），給負責人結算請款；0 = 沒填 */
  price: number
}

/** bento：每週便當；drink：老闆臨時請的飲料團（限時 bonus） */
export type RoundKind = 'bento' | 'drink'

/** 飲料團：treat 抖內（有人請客）、group 揪團（各付各的） */
export type DrinkMode = 'treat' | 'group'

/** 一週一份菜單；飲料團也是一筆，用 kind 分 */
export interface Week {
  id: string
  kind: RoundKind
  shop: string
  imageUrl: string
  /** ISO 時間字串，預設為該週五 13:00（台北時間） */
  deadline: string
  items: MenuItem[]
  /** 飲料加料；便當為空 */
  addons: MenuItem[]
  /** 飲料團：誰開的團、抖內還是揪團；便當為空字串 / treat */
  host: string
  mode: DrinkMode
  createdAt: string
  updatedAt: string
}

export interface Order {
  id: string
  weekId: string
  name: string
  itemId: string
  /** 下單當下的便當名稱快照，菜單之後改了也不影響 */
  itemName: string
  /** 飲料的甜度冰量加料，例「微糖 少冰 +燕麥粒」；便當為空字串 */
  options: string
  addonIds: string[]
  createdAt: string
  updatedAt: string
}

export interface Snapshot {
  week: Week | null
  orders: Order[]
}

/** 點餐頁：這週便當＋收單中的飲料團（沒有就 null） */
export interface Current extends Snapshot {
  drink: Snapshot | null
}

/** 公司每週請客，一人一個便當；金額照菜單單價算，負責人拿去請款 */
export interface PlaceOrderInput {
  weekId: string
  name: string
  itemId: string
  /** 飲料才有 */
  sugar?: string
  ice?: string
  addonIds?: string[]
}

export type WeekDraft = Omit<Week, 'createdAt' | 'updatedAt'>

export interface Api {
  mode: 'gas' | 'demo'
  getCurrent(): Promise<Current>
  placeOrder(input: PlaceOrderInput): Promise<Order>
  cancelOrder(weekId: string, name: string): Promise<void>
  admin: {
    verify(password: string): Promise<void>
    /** 順便帶最新一團的訂單，省一次往返 */
    listWeeks(password: string): Promise<{ weeks: Week[]; latest: Snapshot }>
    getWeek(password: string, weekId: string): Promise<Snapshot>
    saveWeek(password: string, week: WeekDraft): Promise<Week>
    uploadImage(password: string, dataUrl: string, filename: string): Promise<string>
    deleteOrder(password: string, orderId: string): Promise<void>
  }
}
