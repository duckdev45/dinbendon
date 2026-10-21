export interface MenuItem {
  id: string
  name: string
  /** 單價（元），給負責人結算請款；0 = 沒填 */
  price: number
}

/** bento：每週便當；drink / snack：臨時的飲料團、下午茶點心團（限時 bonus） */
export type RoundKind = 'bento' | 'drink' | 'snack'

/** 飲料團、點心團：treat 抖內（有人請客）、group 揪團（各付各的） */
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
  /** 飲料團、點心團：誰請客／誰揪的、抖內還是揪團；便當為空字串 / treat */
  host: string
  mode: DrinkMode
  /** 負責人：開團時跟密碼一起填，之後不能改；有問題找他。舊團沒有 */
  owner?: string
  /** 開團時有設密碼（刪訂單、提早結束要輸入）；密碼本身不會傳到前端。舊團沒有 */
  hasPassword?: boolean
  /** 飲料團、點心團的喝飲料不揪：點餐頁不顯示，要專屬連結 #/r/<id>＋通關密碼才看得到；開團後不能改 */
  private?: boolean
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

/** 點餐頁：這週便當＋收單中的飲料團、點心團（沒有就 null） */
export interface Current extends Snapshot {
  drink: Snapshot | null
  snack: Snapshot | null
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
  /** 喝飲料不揪的通關密碼 */
  secret?: string
}

/** 常用店家：開團時選了整份帶入；品項存 [名稱, 單價] */
export interface ShopPreset {
  kind: RoundKind
  shop: string
  imageUrl: string
  items: [name: string, price: number][]
  addons: [name: string, price: number][]
}

/** 後台手動維護的常用店家（shops 工作表）；hidden = 刪掉 */
export interface ShopRow extends ShopPreset {
  hidden: boolean
  updatedAt: string
}

export type WeekDraft = Omit<Week, 'createdAt' | 'updatedAt'>

export interface Api {
  mode: 'gas' | 'demo'
  getCurrent(): Promise<Current>
  placeOrder(input: PlaceOrderInput): Promise<Order>
  cancelOrder(weekId: string, name: string, secret?: string): Promise<void>
  /** 喝飲料不揪：通關密碼對了才回傳那團 */
  getRound(weekId: string, secret: string): Promise<Snapshot>
  admin: {
    verify(password: string): Promise<void>
    /** 順便帶最新一團的訂單和常用店家，省往返；舊版 Code.gs 沒有 shops */
    listWeeks(password: string): Promise<{ weeks: Week[]; latest: Snapshot; shops?: ShopRow[] }>
    /** 喝飲料不揪要帶通關密碼 */
    getWeek(password: string, weekId: string, secret?: string): Promise<Snapshot>
    /** roundPassword：開新團時設定；提早結束（endsEarly）時驗證。secret：開喝飲料不揪時設定的通關密碼 */
    saveWeek(password: string, week: WeekDraft, roundPassword?: string, secret?: string): Promise<Week>
    uploadImage(password: string, dataUrl: string, filename: string): Promise<string>
    /** 那團有設開團密碼就要帶 */
    deleteOrder(password: string, orderId: string, roundPassword?: string): Promise<void>
    /** 新增、修改、刪除（hidden）常用店家；from = 改名前的店名。回傳整份 shops */
    saveShop(password: string, shop: Omit<ShopRow, 'updatedAt'>, from?: string): Promise<ShopRow[]>
  }
}
