// 台北沒有日光節約，固定 UTC+8。所有「幾點截止」都以台北時間計算，避免同事電腦時區設錯。
const TPE_OFFSET = 8 * 3600_000
const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六']
const DEADLINE_HOUR = 13

/** 把時間轉成「台北時間欄位」的 Date（用 getUTC* 讀取） */
function tpe(d: Date) {
  return new Date(d.getTime() + TPE_OFFSET)
}

/** 開團那週的週五 13:00（台北）；若已過週五 13:00 就算下週五 */
export function defaultDeadline(now = new Date()): string {
  const t = tpe(now)
  let add = (5 - t.getUTCDay() + 7) % 7
  const at = (days: number) =>
    Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + days, DEADLINE_HOUR, 0, 0) - TPE_OFFSET
  if (at(add) <= now.getTime()) add += 7
  return new Date(at(add)).toISOString()
}

/** 10/23（五）13:00 */
export function formatDeadline(iso: string): string {
  const t = tpe(new Date(iso))
  const hh = String(t.getUTCHours()).padStart(2, '0')
  const mm = String(t.getUTCMinutes()).padStart(2, '0')
  return `${t.getUTCMonth() + 1}/${t.getUTCDate()}（${WEEKDAY[t.getUTCDay()]}）${hh}:${mm}`
}

/** 10/23（五） */
export function formatDay(iso: string): string {
  const t = tpe(new Date(iso))
  return `${t.getUTCMonth() + 1}/${t.getUTCDate()}（${WEEKDAY[t.getUTCDay()]}）`
}

export function formatTime(iso: string): string {
  const t = tpe(new Date(iso))
  const p = (n: number) => String(n).padStart(2, '0')
  return `${t.getUTCMonth() + 1}/${t.getUTCDate()} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`
}

/** 2026-10-23，用在檔名 */
export function isoDay(iso: string): string {
  return tpe(new Date(iso)).toISOString().slice(0, 10)
}

/** <input type="datetime-local"> 的值（台北時間） */
export function toLocalInput(iso: string): string {
  return tpe(new Date(iso)).toISOString().slice(0, 16)
}

export function fromLocalInput(value: string): string {
  const [d, t] = value.split('T')
  const [y, m, day] = d.split('-').map(Number)
  const [hh, mm] = t.split(':').map(Number)
  return new Date(Date.UTC(y, m - 1, day, hh, mm) - TPE_OFFSET).toISOString()
}

export function isClosed(deadline: string, now = Date.now()): boolean {
  return now >= new Date(deadline).getTime()
}

/** 「還有 2 天 3 小時」 */
export function timeLeft(deadline: string, now = Date.now()): { text: string; urgent: boolean } {
  let ms = new Date(deadline).getTime() - now
  if (ms <= 0) return { text: '已截止', urgent: false }
  const d = Math.floor(ms / 86400_000)
  ms -= d * 86400_000
  const h = Math.floor(ms / 3600_000)
  ms -= h * 3600_000
  const m = Math.floor(ms / 60_000)
  const s = Math.floor((ms - m * 60_000) / 1000)
  if (d > 0) return { text: `${d} 天 ${h} 小時`, urgent: false }
  if (h > 0) return { text: `${h} 小時 ${m} 分`, urgent: h < 1 }
  return { text: `${m} 分 ${String(s).padStart(2, '0')} 秒`, urgent: true }
}
