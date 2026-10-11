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
const { integerAmountValidator } = require('../src/components/monthly-report/money-input.directive.ts')

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
  const expenseControls = () => ({ description: ['', Validators.required], amount: [null, [Validators.required, Validators.min(0), integerAmountValidator]], shared: [false] })
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
  component.newExpenseForm.setValue({ description: 'Nuova', amount: 65, shared: true })
  component.addExpense()
  const expenses = storage.getReport(2026, 10).expenses
  assert.equal(expenses.length, 2)
  assert.equal(expenses[0].amount, 1500)
  assert.equal(expenses[1].amount, 65)
  assert.equal(expenses[1].totalAmount, 130)
})

test('saving an edited shared expense preserves its identity and personal share', () => {
  const current = report()
  const { component, storage } = componentFor(current)
  component.startEditing(current.expenses[0])
  component.editExpenseForm.setValue({ description: 'Aggiornata', amount: 75, shared: true })
  component.saveExpense()
  assert.deepEqual(storage.getReport(2026, 10).expenses, [{ id: 'expense', description: 'Aggiornata', amount: 75, shared: true, totalAmount: 150 }])
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

test('expense creation and editing reject fractional amounts without changing existing records', () => {
  const current = report({ expenses: [{ id: 'old', description: 'Storica', amount: 67.5 }] })
  const { component, storage } = componentFor(current)
  component.newExpenseForm.setValue({ description: 'Nuova', amount: 25.5, shared: false })
  component.addExpense()
  component.startEditing(current.expenses[0])
  component.editExpenseForm.patchValue({ description: 'Modificata' })
  component.saveExpense()
  assert.deepEqual(storage.getReport(2026, 10).expenses, current.expenses)
  component.editExpenseForm.patchValue({ amount: 68 })
  component.saveExpense()
  assert.equal(storage.getReport(2026, 10).expenses[0].amount, 68)
})

test('integer mode rejects decimal separators, exponents and unsafe integers', () => {
  const { parseMoneyAmount } = require('../src/components/monthly-report/money-input.directive.ts')
  for (const [text, value] of [['67', 67], ['0', 0], ['-25', -25], [' 1000 ', 1000], ['', null]]) {
    assert.equal(parseMoneyAmount(text, true), value)
  }
  for (const text of ['67,00', '67.5', '1.000', '1e3', '12,', 'abc', '9007199254740993']) {
    assert.equal(parseMoneyAmount(text, true), null, text)
  }
})

test('integer fields stay unformatted on blur and pasted decimals remain invalid without rounding', () => {
  const { MoneyInputDirective } = require('../src/components/monthly-report/money-input.directive.ts')
  const field = Object.create(MoneyInputDirective.prototype)
  field.integerOnly = true
  const input = { value: '' }
  field.element = { nativeElement: input }
  let value
  field.registerOnChange(next => { value = next })
  field.registerOnTouched(() => {})
  field.registerOnValidatorChange(() => {})
  field.writeValue(67)
  assert.equal(input.value, '67')
  field.onBlur()
  assert.equal(input.value, '67')
  input.value = '67,50'
  field.onInput()
  field.onBlur()
  assert.equal(value, null)
  assert.equal(input.value, '67,50')
  assert.deepEqual(field.validate(), { money: true })
  field.writeValue(67.5)
  assert.equal(input.value, '67,5', 'Existing cents must never be rounded silently')
  assert.deepEqual(field.validate(), { money: true })
})

test('integer fields block decimal typing, support replacement and keep editing shortcuts', () => {
  const { MoneyInputDirective } = require('../src/components/monthly-report/money-input.directive.ts')
  const field = Object.create(MoneyInputDirective.prototype)
  field.integerOnly = true
  const input = { value: '67', selectionStart: 2, selectionEnd: 2 }
  field.element = { nativeElement: input }
  const blocked = event => {
    let prevented = false
    field.onKeyDown({ ...event, preventDefault: () => { prevented = true } })
    return prevented
  }
  for (const key of [',', '.', 'e', '-', ' ']) assert.equal(blocked({ key }), true, key)
  for (const key of ['8', 'Backspace', 'ArrowLeft', 'Tab']) assert.equal(blocked({ key }), false, key)
  assert.equal(blocked({ key: 'v', ctrlKey: true }), false)
  input.selectionStart = 0
  input.selectionEnd = 2
  assert.equal(blocked({ key: '-' }), false)
  let prevented = false
  field.onBeforeInput({ inputType: 'insertText', data: ',', preventDefault: () => { prevented = true } })
  assert.equal(prevented, true)
})
