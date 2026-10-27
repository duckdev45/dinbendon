import type { Api, Current, Order, ShopRow, Snapshot, Week } from '../types'

/**
 * Google Apps Script Web App。
 * POST 用 text/plain，瀏覽器就不會送 CORS preflight（Apps Script 不回應 OPTIONS）。
 */
export function createGasApi(url: string): Api {
  async function call<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, ...payload }),
      })
    } catch {
      throw new Error('連不到伺服器，檢查一下網路再試一次')
    }
    const json = await res.json().catch(() => null)
    if (!json) throw new Error('伺服器回傳格式不對，請負責人檢查 Apps Script 部署')
    if (!json.ok) throw new Error(json.error || '發生錯誤')
    return json.data as T
  }

  return {
    mode: 'gas',
    getCurrent: () => call<Current>('getCurrent'),
    placeOrder: (input) => call<Order>('placeOrder', { ...input }),
    cancelOrder: (weekId, name, secret) => call<void>('cancelOrder', { weekId, name, secret }),
    getRound: (weekId, secret) => call<Snapshot>('getRound', { weekId, secret }),
    admin: {
      verify: (password) => call<void>('adminVerify', { password }),
      listWeeks: (password) => call<{ weeks: Week[]; latest: Snapshot; shops?: ShopRow[] }>('adminListWeeks', { password }),
      getWeek: (password, weekId, secret) => call<Snapshot>('adminGetWeek', { password, weekId, secret }),
      saveWeek: (password, week, roundPassword, secret) => call<Week>('adminSaveWeek', { password, week, roundPassword, secret }),
      uploadImage: (password, dataUrl, filename) => call<string>('adminUploadImage', { password, dataUrl, filename }),
      deleteOrder: (password, orderId, roundPassword) => call<void>('adminDeleteOrder', { password, orderId, roundPassword }),
      deleteWeek: (password, weekId, roundPassword, secret) => call<void>('adminDeleteWeek', { password, weekId, roundPassword, secret }),
      saveShop:(password, shop, from) => call<ShopRow[]>('adminSaveShop', { password, shop, from }),
    },
  }
}
