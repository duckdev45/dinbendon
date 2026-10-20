import assert from 'node:assert/strict'
import { test } from 'node:test'
import { defaultDeadline, formatDeadline } from '../src/lib/time.ts'

// 台北時間 → Date
const tpe = (s: string) => new Date(`${s}+08:00`)

test('開團後預設截止在當週五 13:00（台北）', () => {
  assert.equal(formatDeadline(defaultDeadline(tpe('2026-10-19T09:00'))), '10/23（五）13:00') // 週一
  assert.equal(formatDeadline(defaultDeadline(tpe('2026-10-23T12:59'))), '10/23（五）13:00') // 週五截止前
})

test('過了週五 13:00 才開團，算下週五', () => {
  assert.equal(formatDeadline(defaultDeadline(tpe('2026-10-23T13:00'))), '10/30（五）13:00')
  assert.equal(formatDeadline(defaultDeadline(tpe('2026-10-24T10:00'))), '10/30（五）13:00') // 週六
})
