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
const { FormBuilder, Validators } = require('@angular/forms')

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
  const fb = new FormBuilder()
  const expenseControls = () => ({ description: ['', Validators.required], amount: [null, [Validators.required, Validators.min(0)]], shared: [false] })
  component.newExpenseForm = fb.group(expenseControls())
  component.editExpenseForm = fb.group(expenseControls())
  component.editingExpenseId = signal(null)
  component.isEditingNotes = signal(false)
  component.notesDraft = signal('')
  storage.supabase = { upsertReport: async () => {} }
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

test('monetary inputs accept Italian separators and decimal dots without losing cents', () => {
  const { parseMoneyAmount } = require('../src/components/monthly-report/money-input.directive.ts')
  for (const [text, value] of [['20.000,50', 20000.5], ['150,75', 150.75], ['150.75', 150.75], ['1.234', 1234], ['0', 0], ['-25,50', -25.5], ['', null]]) {
    assert.equal(parseMoneyAmount(text), value, text)
  }
  for (const text of ['abc', '1,2,3', 'Infinity', '1e3', '12.3456', '12,345']) {
    assert.equal(parseMoneyAmount(text), null, text)
  }
})

test('typing an amount leaves the visible draft untouched and flags invalid text', () => {
  const { MoneyInputDirective } = require('../src/components/monthly-report/money-input.directive.ts')
  const field = Object.create(MoneyInputDirective.prototype)
  const input = { value: '20.000,5' }
  field.element = { nativeElement: input }
  let value
  field.registerOnChange(next => { value = next })
  field.registerOnTouched(() => {})
  field.registerOnValidatorChange(() => {})
  field.onInput()
  assert.equal(value, 20000.5)
  assert.equal(input.value, '20.000,5')
  input.value = 'abc'
  field.onInput()
  assert.deepEqual(field.validate(), { money: true })
  assert.equal(value, null)
  field.writeValue(150.75)
  assert.equal(input.value, '150,75')
  assert.equal(field.validate(), null)
})

test('cancelled expense edits reset the draft and allow adding a separate new expense', () => {
  const current = report()
  const { component, storage } = componentFor(current)
  component.startEditing(current.expenses[0])
  component.editExpenseForm.patchValue({ description: 'Da annullare', amount: 65.5, shared: true })
  component.cancelEditing()
  assert.equal(component.editingExpenseId(), null)
  assert.equal(component.editExpenseForm.value.description, null)
  assert.deepEqual(storage.getReport(2026, 10).expenses, [{ id: 'expense', description: 'Spesa', amount: 1500 }])
  component.newExpenseForm.setValue({ description: 'Nuova', amount: 65.5, shared: true })
  component.addExpense()
  const expenses = storage.getReport(2026, 10).expenses
  assert.equal(expenses.length, 2)
  assert.equal(expenses[0].amount, 1500)
  assert.equal(expenses[1].amount, 65.5)
  assert.equal(expenses[1].totalAmount, 131)
})

test('saving an edited shared expense preserves its identity and personal share', () => {
  const current = report()
  const { component, storage } = componentFor(current)
  component.startEditing(current.expenses[0])
  component.editExpenseForm.setValue({ description: 'Aggiornata', amount: 75.25, shared: true })
  component.saveExpense()
  assert.deepEqual(storage.getReport(2026, 10).expenses, [{ id: 'expense', description: 'Aggiornata', amount: 75.25, shared: true, totalAmount: 150.5 }])
  assert.equal(component.editingExpenseId(), null)
})

test('month notes save only on confirmation and preserve long multiline text exactly', () => {
  const { component, storage } = componentFor(report({ notes: 'Originale' }))
  component.startEditingNotes()
  component.notesDraft.set('Bozza annullata')
  assert.equal(storage.getReport(2026, 10).notes, 'Originale')
  component.cancelEditingNotes()
  assert.equal(component.isEditingNotes(), false)
  component.startEditingNotes()
  assert.equal(component.notesDraft(), 'Originale')
  const longNote = 'Prima riga\n\n' + 'Nota lunga '.repeat(500) + '\nUltima riga'
  component.notesDraft.set(longNote)
  component.saveNotes()
  assert.equal(storage.getReport(2026, 10).notes, longNote)
  assert.equal(component.isEditingNotes(), false)
})
