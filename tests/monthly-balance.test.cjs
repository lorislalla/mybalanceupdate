const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const ts = require('typescript')

require('@angular/compiler')
require.extensions['.ts'] = (module, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      experimentalDecorators: true
    }
  })
  module._compile(outputText, filename)
}

const { signal, computed } = require('@angular/core')
const { StorageService } = require('../src/services/storage.service.ts')
const { MonthlyReportComponent } = require('../src/components/monthly-report/monthly-report.component.ts')

function report(overrides = {}) {
  return {
    year: 2026, month: 10, payday: '', balance: 20000, salary: 2000,
    incomes: [], expenses: [{ id: 'expense', description: 'Spesa', amount: 1500 }], notes: '',
    ...overrides
  }
}

function componentFor(current, otherReports = []) {
  const storage = Object.create(StorageService.prototype)
  storage.appData = signal({ reports: [current, ...otherReports], globalNotes: '', calculatorItems: [] })
  const component = Object.create(MonthlyReportComponent.prototype)
  component.report = signal(current)
  component.storageService = storage
  return { component, storage }
}

test('opening stays in October after payday instead of advancing to November', t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 9, 20, 12).getTime() })
  const { storage } = componentFor(report({ payday: '2026-10-15' }), [report({ month: 11 })])
  const selectedMonth = storage.getCurrentMonthYear()
  assert.equal(selectedMonth, '2026-10')
})

test('opening follows the calendar even if an older month has no payday', t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 10, 1, 12).getTime() })
  const { storage } = componentFor(report())
  const selectedMonth = storage.getCurrentMonthYear()
  assert.equal(selectedMonth, '2026-11')
})

test('October shows both real balance change and discrepancy from recorded movements', () => {
  const { component } = componentFor(report(), [report({ month: 11, balance: 20300 })])
  assert.deepEqual(component.getMonthlyBalanceSummary(), {
    closingBalance: 20300, balanceChange: 300, unrecordedChange: -200
  })
})

test('all income types and personal shares of expenses contribute to the discrepancy', () => {
  const { component } = componentFor(report({
    salary: 1700, salary13: 200, salary14: 100,
    incomes: [{ id: 'income', description: 'Rimborso', amount: 50 }],
    expenses: [{ id: 'shared', description: 'Spesa condivisa', amount: 500, shared: true, totalAmount: 1000 }]
  }), [report({ month: 11, balance: 21000 })])
  assert.deepEqual(component.getMonthlyBalanceSummary(), {
    closingBalance: 21000, balanceChange: 1000, unrecordedChange: -550
  })
})

test('December closes using January of the following year, including negative changes', () => {
  const { component } = componentFor(report({ month: 12 }), [report({ year: 2027, month: 1, balance: 19000 })])
  assert.deepEqual(component.getMonthlyBalanceSummary(), {
    closingBalance: 19000, balanceChange: -1000, unrecordedChange: -1500
  })
})

test('a missing next month or its unfilled balance does not produce a closing estimate', () => {
  for (const otherReports of [[], [report({ month: 11, balance: 0 })], [report({ month: 12, balance: 20300 })]]) {
    const { component } = componentFor(report(), otherReports)
    assert.deepEqual(component.getMonthlyBalanceSummary(), {
      closingBalance: null, balanceChange: null, unrecordedChange: null
    })
  }
})

test('a missing opening balance does not produce fabricated changes', () => {
  const { component } = componentFor(report({ balance: 0 }), [report({ month: 11, balance: 20300 })])
  assert.deepEqual(component.getMonthlyBalanceSummary(), {
    closingBalance: 20300, balanceChange: null, unrecordedChange: null
  })
})

test('September and earlier keep their payday balance without calendar comparisons', () => {
  for (const current of [report({ month: 9 }), report({ year: 2025, month: 12 })]) {
    const { component } = componentFor(current, [report({ balance: 20300 })])
    assert.equal(component.isCalendarMonth(), false)
    assert.deepEqual(component.getMonthlyBalanceSummary(), {
      closingBalance: null, balanceChange: null, unrecordedChange: null
    })
  }
})

test('editing November updates the closing information shown for October', () => {
  const { component, storage } = componentFor(report(), [report({ month: 11, balance: 20300 })])
  const summary = computed(() => component.getMonthlyBalanceSummary())
  assert.equal(summary().closingBalance, 20300)
  storage.appData.update(data => ({ ...data, reports: [report(), report({ month: 11, balance: 20600 })] }))
  assert.deepEqual(summary(), {
    closingBalance: 20600, balanceChange: 600, unrecordedChange: 100
  })
})
