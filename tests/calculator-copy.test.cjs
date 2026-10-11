const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const ts = require('typescript')

require('@angular/compiler')
require.extensions['.ts'] = (module, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true }
  })
  module._compile(outputText, filename)
}
const { signal } = require('@angular/core')
const { CalculatorComponent } = require('../src/components/calculator/calculator.component.ts')

test('copy writes the total rounded to the nearest hundred, with ties toward positive infinity', async t => {
  const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  const writes = []
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => writes.push(text) } })
  t.after(() => original ? Object.defineProperty(navigator, 'clipboard', original) : delete navigator.clipboard)
  const component = Object.create(CalculatorComponent.prototype)
  component.copyStatus = signal('idle')
  const fixtures = [[19910, '19900'], [5655, '5700'], [7550, '7600'], [7549.99, '7500'], [0, '0'], [-7550, '-7500'], [-7550.01, '-7600']]
  for (const [total, expected] of fixtures) {
    component.total = () => total
    await component.copyRoundedTotal()
    assert.equal(writes.at(-1), expected)
    assert.equal(component.copyStatus(), 'copied')
  }
})

test('a denied clipboard write reports an error instead of claiming a successful copy', async t => {
  const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Denied') } } })
  t.after(() => original ? Object.defineProperty(navigator, 'clipboard', original) : delete navigator.clipboard)
  const component = Object.create(CalculatorComponent.prototype)
  component.total = () => 7550
  component.copyStatus = signal('idle')
  await component.copyRoundedTotal()
  assert.equal(component.copyStatus(), 'error')
})

test('calculator edits reject fractional and empty drafts without overwriting the saved integer', () => {
  const component = Object.create(CalculatorComponent.prototype)
  let items = [{ id: 'account', description: 'Conto', amount: 67 }]
  component.items = () => items
  component.storageService = { updateCalculatorItems: next => { items = next } }
  for (const value of [67.5, null, NaN, Infinity, 9007199254740992]) {
    component.updateAmount('account', value)
    assert.equal(items[0].amount, 67)
  }
  for (const value of [-300, 0, 10000]) {
    component.updateAmount('account', value)
    assert.equal(items[0].amount, value)
  }
})

test('calculator creation accepts whole euro amounts including zero and negatives', () => {
  const component = Object.create(CalculatorComponent.prototype)
  let items = []
  component.items = () => items
  component.storageService = { updateCalculatorItems: next => { items = next } }
  component.newDescription = signal('Prestito')
  component.newAmount = signal(12.5)
  component.newColor = signal('#6366f1')
  component.addItem()
  assert.equal(items.length, 0)
  component.newAmount.set(-250)
  component.addItem()
  assert.equal(items[0].amount, -250)
  assert.equal(component.newAmount(), null)
  component.newDescription.set('Azzerato')
  component.newAmount.set(0)
  component.addItem()
  assert.equal(items[1].amount, 0)
})
