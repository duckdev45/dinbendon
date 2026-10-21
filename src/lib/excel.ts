import type { Order, Week } from '../types'
import type { Worksheet } from 'exceljs'
import { computeStats, drinkSummary, pickupTable } from './stats'
import { formatDeadline, isoDay } from './time'

const HEAD_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD23F' } } as const
const MONEY = '"$"#,##0'
const TOTAL_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3C4' } } as const
const UNIT: Record<string, string> = { bento: '便當', drink: '飲料', snack: '點心' }
// 印出來給長輩看：正黑體、字大、每格都有框線
const FONT = 'Microsoft JhengHei'
const LINE = { style: 'thin', color: { argb: 'FF3B2314' } } as const
const BOX = { top: LINE, left: LINE, bottom: LINE, right: LINE }

/**
 * 標題列（第 1 列）放大加粗、不畫框；表頭（第 3 列）起每格畫框線、自動換行。
 * 印 A4 直式，寬度縮到一頁、每頁都印表頭；bold 是要加粗的列（表頭、合計）
 */
function printable(ws: Worksheet, size: number, bold: number[]) {
  ws.getRow(1).getCell(1).font = { name: FONT, size: size + 4, bold: true }
  // 空字串的格子 eachCell 會跳過，照欄數一格一格畫
  ws.eachRow((row, n) => {
    if (n < 3) return
    for (let i = 1; i <= ws.columnCount; i++) {
      const c = row.getCell(i)
      c.font = { name: FONT, size, bold: bold.includes(n) }
      c.border = BOX
      c.alignment = { vertical: 'middle', wrapText: true, ...(typeof c.value === 'number' ? { horizontal: 'right' } : {}) }
    }
  })
  ws.pageSetup = {
    paperSize: 9, // A4
    orientation: 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    printTitlesRow: '3:3',
    margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
  }
  ws.views = [{ state: 'frozen', ySplit: 3 }]
}

/** 第一張「領便當／領飲料／領點心」給大家核對自己點了什麼；第二張便當是「統計」、飲料點心是「訂購統計」，叫餐、請款用 */
export async function exportExcel(week: Week, orders: Order[]) {
  const { default: ExcelJS } = await import('exceljs') // 只有負責人會用到，延遲載入
  const stats = computeStats(week, orders)
  const wb = new ExcelJS.Workbook()
  wb.creator = '甲奔！dinbendon'

  const drink = week.kind === 'drink'
  const bonus = drink || week.kind === 'snack'
  const unit = UNIT[week.kind] ?? '便當'

  // ── 領便當／領飲料／領點心：印出來給大家核對（飲料：姓名／飲料／其他備註；揪團多一欄要付）
  const d = wb.addWorksheet(`領${unit}`)
  const pick = pickupTable(week, orders)
  const who = bonus && week.host ? `・${week.host}${week.mode === 'group' ? '揪團' : '請客'}` : ''
  d.addRow([`${week.shop || unit}${who}｜截止 ${formatDeadline(week.deadline)}｜共 ${orders.length} ${drink ? '杯' : bonus ? '份' : '個'}`])
  d.addRow([])
  d.addRow(pick.head).eachCell((c) => (c.fill = HEAD_FILL))
  for (const r of pick.rows) d.addRow(r)
  // A4 直式可印寬度約 95（Excel 欄寬單位），欄位加起來用滿，16pt 的字才不會擠到一直換行
  const group = pick.head.includes('要付')
  const WIDTH: Record<string, number> = drink
    ? { 姓名: 14, 飲料: group ? 40 : 46, 其他備註: group ? 32 : 36, 要付: 10 }
    : { 姓名: 20, [unit]: group ? 60 : 72, 要付: 12 }
  d.columns = pick.head.map((h) => ({ width: WIDTH[h], ...(h === '要付' ? { style: { numFmt: MONEY } } : {}) }))
  printable(d, 16, [3])

  // ── 飲料、點心：訂購統計表（同品項同甜度冰量加料併一列）
  if (bonus) {
    const s = wb.addWorksheet('訂購統計')
    s.addRow([`${week.shop || unit}${drink ? '（全部 L）' : ''}${who}｜截止 ${formatDeadline(week.deadline)}`])
    s.addRow([])
    s.addRow([unit, drink ? '杯數' : '份數', '單價', '小計', '誰點的']).eachCell((c) => (c.fill = HEAD_FILL))
    for (const r of drinkSummary(week, orders)) s.addRow([r.label, r.count, r.price, r.subtotal, r.people.join('、')])
    const st = s.addRow(['合計', stats.total, '', stats.amount, ''])
    st.eachCell((c) => (c.fill = TOTAL_FILL))
    s.columns = [{ width: 38 }, { width: 8 }, { width: 9, style: { numFmt: MONEY } }, { width: 10, style: { numFmt: MONEY } }, { width: 31 }]
    printable(s, 14, [3, st.number])
    return download(wb, week)
  }

  // ── 統計
  const s = wb.addWorksheet('統計')
  s.addRow([`${week.shop || '便當'}｜截止 ${formatDeadline(week.deadline)}`])
  s.addRow([])
  s.addRow(['便當', '單價', '數量', '小計', '誰點的']).eachCell((c) => (c.fill = HEAD_FILL))
  for (const it of stats.items) s.addRow([it.name, it.price, it.count, it.subtotal, it.people.join('、')])
  const st = s.addRow(['合計', '', stats.total, stats.amount, ''])
  st.eachCell((c) => (c.fill = TOTAL_FILL))
  s.columns = [{ width: 30 }, { width: 9, style: { numFmt: MONEY } }, { width: 8 }, { width: 10, style: { numFmt: MONEY } }, { width: 39 }]
  printable(s, 14, [3, st.number])

  return download(wb, week)
}

async function download(wb: import('exceljs').Workbook, week: Week) {
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `甲奔_${UNIT[week.kind] ?? '便當'}訂單_${isoDay(week.deadline)}.xlsx`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
