const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const ts = require('typescript')
require.extensions['.ts'] = (module, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true }
  })
  module._compile(outputText, filename)
}
const { chartPoints, defaultSettings, movingAverage, normalizePreferences, defaultPreferences, CHART_IDS } = require('../src/components/summary-view/chart-data.ts')
const now = new Date(2026, 9, 9)
const report = (month, changes = {}) => ({ year: 2026, month, payday: '', balance: 1000, salary: 100, incomes: [], expenses: [], notes: '', ...changes })
const expenses = (...amounts) => amounts.map((amount, id) => ({ id: String(id), description: 'Spesa ' + id, amount }))

test('the four charts keep their identity and swap expenses and income', () => {
  assert.deepEqual(CHART_IDS, ['overall', 'last12', 'outgoings', 'salary'])
})
test('expense thresholds exclude individual transactions strictly above the personal-share limit', () => {
  const source = report(10, { balance: 0, expenses: [...expenses(499.5, 500, 500.01), { id: 'shared', description: 'Condivisa', amount: 300, shared: true, totalAmount: 600 }] })
  const before = structuredClone(source)
  const points = chartPoints([source], 'outgoings', { ...defaultSettings('outgoings'), expenseLimit: 500 }, now)
  assert.equal(points[0].y, 1299.5)
  assert.equal(points[0].excludedCount, 1)
  assert.equal(points[0].excludedAmount, 500.01)
  assert.deepEqual(source, before, 'Source financial records must not change')
})
test('fully excluded months remain visible as zero and are included in the average', () => {
  const points = chartPoints([report(9, { expenses: expenses(900) }), report(10, { expenses: expenses(200) })], 'outgoings', { ...defaultSettings('outgoings'), expenseLimit: 500 }, now)
  assert.deepEqual(points.map(p => p.y), [0, 200])
  assert.deepEqual(movingAverage(points, 3).map(p => p.y), [0, 100])
})
test('description exclusions are case-insensitive, comma-separated and never double-count', () => {
  const points = chartPoints([report(10, { expenses: [{ id: 'a', description: 'VACANZA estiva', amount: 900 }, { id: 'b', description: 'Casa nuova', amount: 200 }, { id: 'c', description: 'Cibo', amount: 25.5 }] })], 'outgoings', { ...defaultSettings('outgoings'), expenseLimit: 500, excludedTerms: ' vacanza, CASA , ' }, now)
  assert.equal(points[0].y, 25.5)
  assert.equal(points[0].excludedCount, 2)
  assert.equal(points[0].excludedAmount, 1100)
})
test('negative balances are visible while unfilled zero balances stay absent', () => {
  assert.deepEqual(chartPoints([report(10, { balance: -50 }), report(9, { balance: 0 })], 'overall', defaultSettings('overall'), now).map(p => p.y), [-50])
})
test('last twelve calendar months cross the year boundary and exclude future reports', () => {
  const reports = [report(10, { year: 2025 }), report(11, { year: 2025 }), report(10), report(11)]
  assert.deepEqual(chartPoints(reports, 'last12', defaultSettings('last12'), now).map(p => [p.year, p.month]), [[2025, 11], [2026, 10]])
})
test('custom ranges are inclusive, sorted, and do not mutate the report order', () => {
  const reports = [report(10), report(8), report(9)]
  const settings = { ...defaultSettings('overall'), period: 'custom', from: '2026-09', to: '2026-10' }
  assert.deepEqual(chartPoints(reports, 'overall', settings, now).map(p => p.month), [9, 10])
  assert.deepEqual(reports.map(p => p.month), [10, 8, 9])
})
test('salary settings opt into extra salary and other income, including months without base salary', () => {
  const reports = [report(10, { salary: 0, salary13: 200, salary14: 100, incomes: [{ id: 'i', description: 'Rimborso', amount: 75.5 }] })]
  assert.deepEqual(chartPoints(reports, 'salary', defaultSettings('salary'), now), [])
  assert.equal(chartPoints(reports, 'salary', { ...defaultSettings('salary'), includeExtraSalary: true, includeOtherIncome: true }, now)[0].y, 375.5)
})
test('a moving average uses calendar months without treating missing reports as zeros', () => {
  const points = chartPoints([report(1, { expenses: expenses(900) }), report(9, { expenses: expenses(100) }), report(10, { expenses: expenses(200) })], 'outgoings', defaultSettings('outgoings'), now)
  assert.deepEqual(movingAverage(points, 3).map(p => p.y), [900, 100, 150])
})
test('saved preferences round-trip and corrupt settings fall back safely', () => {
  const preferences = defaultPreferences()
  preferences.updatedAt = 42
  preferences.charts.outgoings.expenseLimit = 500.5
  preferences.charts.salary.includeOtherIncome = true
  assert.deepEqual(normalizePreferences(JSON.parse(JSON.stringify(preferences))), preferences)
  assert.deepEqual(normalizePreferences({ version: 2 }), defaultPreferences())
  const corrupt = normalizePreferences({ version: 1, updatedAt: NaN, charts: { outgoings: { expenseLimit: Infinity, averageMonths: 99, type: 'bad', period: 'bad', from: '2026-99', showTable: 'false' } } })
  assert.deepEqual(corrupt, defaultPreferences())
})
