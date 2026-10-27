const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const ts = require('typescript')
require('@angular/compiler')
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true }
}).outputText, filename)

const summary = (...args) => require('../src/components/monthly-report/monthly-financial-summary.ts').calculateFinancialSummary(...args)
const report = overrides => ({ year: 2026, month: 10, payday: '', balance: 10000, salary: 0, incomes: [], expenses: [], notes: '', ...overrides })

test('cash and market snapshots distinguish monthly savings from investment performance', () => {
  const result = summary(report({ investmentValue: 20000, investmentNetFlow: 2000, salary: 2000, expenses: [{ amount: 500 }] }), report({ month: 11, balance: 9500, investmentValue: 22750 }))
  assert.equal(result.openingTotal, 30000)
  assert.equal(result.closingTotal, 32250)
  assert.equal(result.wealthChange, 2250)
  assert.equal(result.savings, 1500)
  assert.equal(result.investmentResult, 750)
})

test('investing existing cash is a transfer, not a loss or an expense', () => {
  const result = summary(report({ investmentValue: 20000, investmentNetFlow: 2000 }), report({ month: 11, balance: 8000, investmentValue: 22000 }))
  assert.equal(result.savings, 0)
  assert.equal(result.investmentResult, 0)
  assert.equal(result.wealthChange, 0)
})

test('withdrawals do not become savings and market losses remain investment losses', () => {
  const result = summary(report({ investmentValue: 20000, investmentNetFlow: -1000 }), report({ month: 11, balance: 11000, investmentValue: 18600 }))
  assert.equal(result.savings, 0)
  assert.equal(result.investmentResult, -400)
  assert.equal(result.wealthChange, -400)
})

test('distributions moved into liquidity are included among net outflows to isolate investment income', () => {
  const result = summary(report({ investmentValue: 20000, investmentNetFlow: -100 }), report({ month: 11, balance: 10100, investmentValue: 20000 }))
  assert.equal(result.savings, 0)
  assert.equal(result.investmentResult, 100)
})

test('missing flows or snapshots never become fabricated zero performance', () => {
  const current = report({ investmentValue: 20000 })
  const next = report({ month: 11, investmentValue: 22000 })
  assert.equal(summary(current, next).savings, null)
  assert.equal(summary(current, next).investmentResult, null)
  assert.equal(summary(current, next).wealthChange, 2000)
  assert.equal(summary(report({ investmentNetFlow: 0 }), next).openingTotal, null)
  assert.equal(summary(report({ investmentNetFlow: 0 }), next).investmentResult, null)
  const missingEnd = summary(report({ investmentValue: 20000, investmentNetFlow: 0 }), undefined)
  for (const field of ['closingTotal', 'wealthChange', 'savings', 'investmentResult']) assert.equal(missingEnd[field], null)
})

test('explicit zeros are valid but legacy default zero cash remains unknown', () => {
  const zero = report({ balance: 0, balanceRecorded: true, investmentValue: 0, investmentNetFlow: 0 })
  for (const field of ['openingTotal', 'closingTotal', 'wealthChange', 'savings', 'investmentResult']) assert.equal(summary(zero, zero)[field], 0)
  assert.equal(summary(report({ balance: 0, investmentValue: 0, investmentNetFlow: 0 }), zero).openingTotal, null)
  assert.equal(summary(report({ balance: 0, investmentValue: 0, investmentNetFlow: 0 }), zero).savings, null)
})

test('cents and negative cash use the same exact monetary perimeter', () => {
  const result = summary(report({ balance: -10.1, investmentValue: 20.2, investmentNetFlow: 0.1, salary: 10, salary13: 2, salary14: 3, incomes: [{ amount: 0.3 }], expenses: [{ amount: 5, shared: true, totalAmount: 10 }] }), report({ balance: 0.1, investmentValue: 20.5 }))
  assert.equal(result.openingTotal, 10.1)
  assert.equal(result.savings, 10.3)
  assert.equal(result.investmentResult, 0.2)
})

test('the money editor preserves explicit zero, decimal cents and missing values for snapshots', () => {
  const { signal } = require('@angular/core')
  const { MoneyFieldComponent } = require('../src/components/monthly-report/money-field.component.ts')
  const c = Object.create(MoneyFieldComponent.prototype)
  const emitted = []
  c.integerOnly = () => false
  c.zeroIsEmpty = () => false
  c.draft = signal(null); c.dirty = signal(false); c.isEditing = signal(true)
  c.model = () => ({ invalid: false, reset: () => {} })
  c.valueSaved = { emit: value => emitted.push(value) }
  for (const value of [0, 1234.56, -100.25, null]) { c.draft.set(value); c.save() }
  assert.deepEqual(emitted, [0, 1234.56, -100.25, null])
  for (const value of [NaN, Infinity, 12.345]) { c.draft.set(value); c.save() }
  assert.equal(emitted.length, 4)
  c.integerOnly = () => true
  c.zeroIsEmpty = () => true
  c.draft.set(12.5); c.save()
  assert.equal(emitted.length, 4)
  c.draft.set(null); c.save()
  assert.equal(emitted.at(-1), 0)
})

test('Supabase payload and row mapping round-trip snapshots, transfers, explicit zero and null', async () => {
  const { BehaviorSubject } = require('rxjs')
  const { SupabaseService } = require('../src/services/supabase.service.ts')
  const c = Object.create(SupabaseService.prototype)
  c.userSubject = new BehaviorSubject({ id: 'owner' })
  let payload
  c.supabase = { from: table => {
    assert.equal(table, 'monthly_reports')
    return { upsert: body => { payload = body; return { select: () => ({ single: async () => ({ error: null }) }) } } }
  } }
  await c.upsertReport(report({ balance: 0, balanceRecorded: true, investmentValue: 0, investmentNetFlow: -123.45 }))
  assert.equal(payload.balance_recorded, true)
  assert.equal(payload.investment_value, 0)
  assert.equal(payload.investment_net_flow, -123.45)
  const mapped = c.mapReportRowToModel(payload)
  assert.equal(mapped.balanceRecorded, true)
  assert.equal(mapped.investmentValue, 0)
  assert.equal(mapped.investmentNetFlow, -123.45)
  await c.upsertReport(report({ investmentValue: null, investmentNetFlow: null }))
  assert.equal(payload.investment_value, null)
  assert.equal(payload.investment_net_flow, null)
  await c.upsertReport(report({}))
  assert.equal('investment_value' in payload, false)
  assert.equal('investment_net_flow' in payload, false)
  assert.equal('balance_recorded' in payload, false)
})

test('JSON export and restore preserve investment values and CSV includes the new monthly fields', async () => {
  const { ImportExportComponent } = require('../src/components/import-export/import-export.component.ts')
  const { StorageService } = require('../src/services/storage.service.ts')
  const item = report({ balance: 0, balanceRecorded: true, investmentValue: 3210.25, investmentNetFlow: -50.5 })
  const component = Object.create(ImportExportComponent.prototype)
  component.storageService = { appData: () => ({ reports: [item], globalNotes: '', calculatorItems: [] }) }
  let output
  component.downloadFile = text => { output = text }
  component.exportData('json')
  const data = JSON.parse(output)
  assert.equal(data.reports[0].investmentValue, 3210.25)
  assert.equal(data.reports[0].investmentNetFlow, -50.5)
  assert.equal(data.reports[0].balanceRecorded, true)
  const storage = Object.create(StorageService.prototype)
  let restored
  storage.updateReport = async value => { restored = value }
  storage.updateCalculatorItems = async () => {}
  await storage.restoreBackup(data)
  assert.equal(restored.investmentValue, 3210.25)
  assert.equal(restored.investmentNetFlow, -50.5)
  component.exportData('csv')
  assert.ok(output.includes('Investimenti al 1° del mese'))
  assert.ok(output.includes('Versamenti netti del mese'))
  assert.ok(output.includes('3210.25,-50.5'))
})

test('authenticated local preview rejects investment writes before optimistic state or backend changes', async () => {
  const { signal } = require('@angular/core')
  const { StorageService } = require('../src/services/storage.service.ts')
  const storage = Object.create(StorageService.prototype)
  const original = report({})
  storage.appData = signal({ reports: [original], globalNotes: '', calculatorItems: [] })
  storage.supabase = { investmentPreviewLocked: true, upsertReport: async () => { throw new Error('Should not reach backend') } }
  await assert.rejects(() => storage.updateReport(report({ investmentValue: 20000 })), /ospite/)
  assert.deepEqual(storage.appData().reports, [original])
})
