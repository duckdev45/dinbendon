import type { Order, Week } from '../types'
import { computeStats } from './stats'
import { formatDeadline, formatTime, isoDay } from './time'

const HEAD_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD23F' } } as const
const TOTAL_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3C4' } } as const

/** 匯出兩張工作表：「統計」給叫便當用、「訂單明細」給收錢用 */
export async function exportExcel(week: Week, orders: Order[]) {
  const { default: ExcelJS } = await import('exceljs') // 只有負責人會用到，延遲載入
  const stats = computeStats(week, orders)
  const wb = new ExcelJS.Workbook()
  wb.creator = '甲奔！dinbendon'

  // ── 統計
  const s = wb.addWorksheet('統計')
  s.addRow([`${week.shop || '便當'}｜截止 ${formatDeadline(week.deadline)}`]).font = { bold: true, size: 14 }
  s.addRow([])
  const sh = s.addRow(['便當', '單價', '數量', '小計', '誰點的'])
  sh.font = { bold: true }
  sh.eachCell((c) => (c.fill = HEAD_FILL))
  for (const it of stats.items) {
    s.addRow([it.name, it.price, it.qty, it.subtotal, it.people.join('、')])
  }
  const st = s.addRow(['合計', '', stats.totalQty, stats.totalAmount, `${stats.headcount} 人`])
  st.font = { bold: true }
  st.eachCell((c) => (c.fill = TOTAL_FILL))
  s.columns = [{ width: 22 }, { width: 8 }, { width: 8 }, { width: 10 }, { width: 50 }]
  s.getColumn(2).numFmt = '"$"#,##0'
  s.getColumn(4).numFmt = '"$"#,##0'

  // ── 訂單明細
  const d = wb.addWorksheet('訂單明細')
  const dh = d.addRow(['姓名', '便當', '單價', '數量', '小計', '備註', '下單時間', '已付款'])
  dh.font = { bold: true }
  dh.eachCell((c) => (c.fill = HEAD_FILL))
  const sorted = [...orders].sort((a, b) => a.itemName.localeCompare(b.itemName, 'zh-Hant') || a.name.localeCompare(b.name, 'zh-Hant'))
  for (const o of sorted) {
    d.addRow([o.name, o.itemName, o.price, o.qty, o.price * o.qty, o.note, formatTime(o.updatedAt), ''])
  }
  const dt = d.addRow(['合計', '', '', stats.totalQty, stats.totalAmount, '', '', ''])
  dt.font = { bold: true }
  dt.eachCell((c) => (c.fill = TOTAL_FILL))
  d.columns = [{ width: 12 }, { width: 22 }, { width: 8 }, { width: 8 }, { width: 10 }, { width: 24 }, { width: 14 }, { width: 8 }]
  d.getColumn(3).numFmt = '"$"#,##0'
  d.getColumn(5).numFmt = '"$"#,##0'
  d.views = [{ state: 'frozen', ySplit: 1 }]

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `甲奔_便當訂單_${isoDay(week.deadline)}.xlsx`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
