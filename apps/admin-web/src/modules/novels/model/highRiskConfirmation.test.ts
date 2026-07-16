import test from 'node:test'
import assert from 'node:assert/strict'
import { formatHighRiskConfirmationMessage, normalizeConfirmationReason } from './highRiskConfirmation'

test('formatHighRiskConfirmationMessage appends visible object details', () => {
  const message = formatHighRiskConfirmationMessage('确认执行高风险动作。', [
    { label: '对象', value: '全书审稿报告' },
    { label: '版本', value: 3 },
    { label: '空字段', value: '' },
  ])

  assert.equal(
    message,
    '确认执行高风险动作。\n\n对象: 全书审稿报告\n版本: 3',
  )
})

test('normalizeConfirmationReason trims whitespace and treats missing input as empty', () => {
  assert.equal(normalizeConfirmationReason('  接受风险继续  '), '接受风险继续')
  assert.equal(normalizeConfirmationReason(null), '')
})
