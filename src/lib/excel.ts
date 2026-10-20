import type { Order, Week } from '../types'
import { computeStats, drinkSummary, orderLabel, orderPrice } from './stats'
import { formatDeadline, isoDay } from './time'

const HEAD_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD23F' } } as const
const MONEY = '"$"#,##0'
const TOTAL_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3C4' } } as const

/** 第一張「領便當／領飲料」給大家核對自己點了什麼；第二張便當是「統計」、飲料是「訂購統計」，叫餐、請款用 */
export async function exportExcel(week: Week, orders: Order[]) {
  const { default: ExcelJS } = await import('exceljs') // 只有負責人會用到，延遲載入
  const stats = computeStats(week, orders)
  const wb = new ExcelJS.Workbook()
  wb.creator = '甲奔！dinbendon'

  const drink = week.kind === 'drink'

  // ── 領便當／領飲料（依姓名排序，找自己最快）
  const d = wb.addWorksheet(drink ? '領飲料' : '領便當')
  // 揪團多一欄要付的錢，收錢用
  const group = drink && week.mode === 'group'
  const dh = d.addRow(group ? ['姓名', '飲料', '要付'] : ['姓名', drink ? '飲料' : '餐點'])
  dh.font = { bold: true }
  dh.eachCell((c) => (c.fill = HEAD_FILL))
  for (const o of [...orders].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'))) d.addRow(group ? [o.name, orderLabel(o), orderPrice(week, o)] : [o.name, orderLabel(o)])
  d.columns = [{ width: 14 }, { width: drink ? 36 : 24 }, { width: 8, style: { numFmt: MONEY } }]
  d.views = [{ state: 'frozen', ySplit: 1 }]

  // ── 飲料：訂購統計表（同飲料同甜度冰量加料併一列）
  if (drink) {
    const s = wb.addWorksheet('訂購統計')
    const who = week.host ? `・${week.host}${week.mode === 'group' ? '揪團' : '請客'}` : ''
    s.addRow([`${week.shop || '飲料'}（全部 L）${who}｜截止 ${formatDeadline(week.deadline)}`]).font = { bold: true, size: 14 }
    s.addRow([])
    const sh = s.addRow(['飲料', '杯數', '單價', '小計', '誰點的'])
    sh.font = { bold: true }
    sh.eachCell((c) => (c.fill = HEAD_FILL))
    for (const r of drinkSummary(week, orders)) s.addRow([r.label, r.count, r.price, r.subtotal, r.people.join('、')])
    const st = s.addRow(['合計', stats.total, '', stats.amount, ''])
    st.font = { bold: true }
    st.eachCell((c) => (c.fill = TOTAL_FILL))
    s.columns = [{ width: 36 }, { width: 8 }, { width: 8, style: { numFmt: MONEY } }, { width: 10, style: { numFmt: MONEY } }, { width: 40 }]
    return download(wb, week)
  }

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

  return download(wb, week)
}

async function download(wb: import('exceljs').Workbook, week: Week) {
  const drink = week.kind === 'drink'
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `甲奔_${drink ? '飲料' : '便當'}訂單_${isoDay(week.deadline)}.xlsx`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
