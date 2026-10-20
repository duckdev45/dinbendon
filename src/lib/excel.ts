import type { Order, Week } from '../types'
import { computeStats } from './stats'
import { formatDeadline, isoDay } from './time'

const HEAD_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD23F' } } as const
const MONEY = '"$"#,##0'
const TOTAL_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3C4' } } as const

/** 第一張「領便當」給大家核對自己點了什麼，第二張「統計」給叫便當、請款用 */
export async function exportExcel(week: Week, orders: Order[]) {
  const { default: ExcelJS } = await import('exceljs') // 只有負責人會用到，延遲載入
  const stats = computeStats(week, orders)
  const wb = new ExcelJS.Workbook()
  wb.creator = '甲奔！dinbendon'

  // ── 領便當（依姓名排序，找自己最快）
  const d = wb.addWorksheet('領便當')
  const dh = d.addRow(['姓名', '餐點'])
  dh.font = { bold: true }
  dh.eachCell((c) => (c.fill = HEAD_FILL))
  for (const o of [...orders].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'))) d.addRow([o.name, o.itemName])
  d.columns = [{ width: 14 }, { width: 24 }]
  d.views = [{ state: 'frozen', ySplit: 1 }]

  // ── 統計
  const s = wb.addWorksheet('統計')
  s.addRow([`${week.shop || '便當'}｜截止 ${formatDeadline(week.deadline)}`]).font = { bold: true, size: 14 }
  s.addRow([])
  const sh = s.addRow(['便當', '單價', '數量', '小計', '誰點的'])
  sh.font = { bold: true }
  sh.eachCell((c) => (c.fill = HEAD_FILL))
  for (const it of stats.items) s.addRow([it.name, it.price, it.count, it.subtotal, it.people.join('、')])
  const st = s.addRow(['合計', '', stats.total, stats.amount, ''])
  st.font = { bold: true }
  st.eachCell((c) => (c.fill = TOTAL_FILL))
  s.columns = [{ width: 22 }, { width: 8, style: { numFmt: MONEY } }, { width: 8 }, { width: 10, style: { numFmt: MONEY } }, { width: 60 }]

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `甲奔_便當訂單_${isoDay(week.deadline)}.xlsx`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
