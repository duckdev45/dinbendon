export interface MenuItem {
  id: string
  name: string
  price: number
}

/** 一週一份菜單 */
export interface Week {
  id: string
  shop: string
  imageUrl: string
  /** ISO 時間字串，預設為該週五 14:00（台北時間） */
  deadline: string
  items: MenuItem[]
  note: string
  createdAt: string
  updatedAt: string
}

export interface Order {
  id: string
  weekId: string
  name: string
  itemId: string
  /** 下單當下的便當名稱與價格快照，菜單之後改了也不影響 */
  itemName: string
  price: number
  qty: number
  note: string
  createdAt: string
  updatedAt: string
}

export interface Snapshot {
  week: Week | null
  orders: Order[]
}

export interface PlaceOrderInput {
  weekId: string
  name: string
  itemId: string
  qty: number
  note: string
}

export type WeekDraft = Omit<Week, 'createdAt' | 'updatedAt'>

export interface Api {
  mode: 'gas' | 'demo'
  getCurrent(): Promise<Snapshot>
  placeOrder(input: PlaceOrderInput): Promise<Order>
  cancelOrder(weekId: string, name: string): Promise<void>
  admin: {
    verify(password: string): Promise<void>
    listWeeks(password: string): Promise<Week[]>
    getWeek(password: string, weekId: string): Promise<Snapshot>
    saveWeek(password: string, week: WeekDraft): Promise<Week>
    uploadImage(password: string, dataUrl: string, filename: string): Promise<string>
    deleteOrder(password: string, orderId: string): Promise<void>
  }
}
