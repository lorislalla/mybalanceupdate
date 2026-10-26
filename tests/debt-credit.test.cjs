const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const ts = require('typescript')
require('@angular/compiler')
require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true }
  }).outputText, filename)
}
const { signal, computed } = require('@angular/core')
const { BehaviorSubject } = require('rxjs')
const { StorageService } = require('../src/services/storage.service.ts')
const { SupabaseService } = require('../src/services/supabase.service.ts')
test('backup restores debts and credits, including clearing them, and old backups preserve them', async () => {
  const debts$ = new BehaviorSubject([])
  const backend = { reports$: new BehaviorSubject([]), globalNotes$: new BehaviorSubject(''), calculatorItems$: new BehaviorSubject([]), debtCreditItems$: debts$, debtCreditLoadState$: new BehaviorSubject('ready'),
    updateDebtCreditItems: async items => debts$.next(items) }
  const storage = new StorageService(backend)
  const items = [{ id: 'one', person: 'Anna', amount: -12.35, reason: 'Cena' }]
  await storage.restoreBackup({ debtCreditItems: items })
  assert.deepEqual(storage.appData().debtCreditItems, items)
  await storage.restoreBackup({})
  assert.deepEqual(storage.appData().debtCreditItems, items)
  await storage.restoreBackup({ debtCreditItems: [] })
  assert.deepEqual(storage.appData().debtCreditItems, [])
})

test('failed persistence leaves saved debt data intact and propagates the error', async () => {
  const storage = new StorageService({ reports$: new BehaviorSubject([]), globalNotes$: new BehaviorSubject(''), calculatorItems$: new BehaviorSubject([]), debtCreditItems$: new BehaviorSubject([]), debtCreditLoadState$: new BehaviorSubject('ready'),
    updateDebtCreditItems: async () => { throw new Error('Offline') } })
  await assert.rejects(() => storage.updateDebtCreditItems([{ id: 'new', person: 'Anna', amount: 10, reason: '' }]), /Offline/)
  assert.deepEqual(storage.appData().debtCreditItems, [])
})

test('signed cents total and clipboard preserve exact amounts without hundred-euro rounding', async t => {
  const { DebtCreditComponent } = require('../src/components/debt-credit/debt-credit.component.ts')
  const component = Object.create(DebtCreditComponent.prototype)
  component.items = signal([{ amount: 0.1 }, { amount: 0.2 }, { amount: -0.05 }])
  // Exercise the component getter used by its computed total.
  assert.equal(component.calculateTotal(component.items()), 0.25)
  assert.equal(component.calculateTotal([{ amount: -42.55 }, { amount: 0.05 }]), -42.5)
  assert.equal(component.calculateTotal([]), 0)
  const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  let copied
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { copied = text } } })
  t.after(() => original ? Object.defineProperty(navigator, 'clipboard', original) : delete navigator.clipboard)
  component.copyStatus = signal('idle')
  component.total = computed(() => component.calculateTotal(component.items()))
  await component.copyBalance()
  assert.equal(copied, '+0,25')
  component.items.set([{ amount: -42.5 }])
  await component.copyBalance()
  assert.equal(copied, '-42,50')
  navigator.clipboard.writeText = async () => { throw new Error('Denied') }
  await component.copyBalance()
  assert.equal(component.copyStatus(), 'error')
})

test('editor validates person and cents, preserves draft on failure, updates identity and deletes a settled entry', async () => {
  const { DebtCreditComponent } = require('../src/components/debt-credit/debt-credit.component.ts')
  const c = Object.create(DebtCreditComponent.prototype)
  let items = []
  c.items = () => items
  c.person = signal('  Anna  ')
  c.amount = signal(12.35)
  c.reason = signal(' Cena ')
  c.editingId = signal(null)
  c.saving = signal(false)
  c.error = signal('')
  c.storageService = { debtCreditLoadState: () => 'ready', updateDebtCreditItems: async next => { items = next } }
  await c.saveItem()
  assert.deepEqual(items.map(({ person, amount, reason }) => ({ person, amount, reason })), [{ person: 'Anna', amount: 12.35, reason: 'Cena' }])
  const id = items[0].id
  c.editItem(items[0])
  c.amount.set(-10.2)
  await c.saveItem()
  assert.equal(items[0].id, id)
  assert.equal(items[0].amount, -10.2)
  for (const value of [null, 0, NaN, Infinity, 1.234]) {
    c.person.set('Anna'); c.amount.set(value)
    await c.saveItem()
    assert.equal(items.length, 1)
  }
  c.person.set('  '); c.amount.set(3)
  await c.saveItem()
  assert.equal(items.length, 1)
  c.editItem(items[0]); c.amount.set(55)
  c.storageService.updateDebtCreditItems = async () => { throw new Error('Offline') }
  await c.saveItem()
  assert.equal(c.amount(), 55)
  assert.equal(c.editingId(), id)
  assert.ok(c.error())
  c.storageService.updateDebtCreditItems = async next => { items = next }
  await c.removeItem(id)
  assert.deepEqual(items, [])
  assert.equal(c.editingId(), null)
})

test('cloud persistence scopes the list to the account, loads it on another device, and reports errors', async () => {
  const service = Object.create(SupabaseService.prototype)
  service.debtCreditLoadVersion = 0
  service.userSubject = new BehaviorSubject({ id: 'owner' })
  service.debtCreditItemsSubject = new BehaviorSubject([])
  service.debtCreditLoadStateSubject = new BehaviorSubject('loading')
  let saved = null
  let offline = false
  service.supabase = { from(table) {
    assert.equal(table, 'debt_credit_data')
    return {
      async upsert(payload, options) {
        assert.equal(payload.user_id, 'owner')
        assert.equal(options.onConflict, 'user_id')
        if (offline) return { error: new Error('Offline') }
        saved = structuredClone(payload.items)
        return { error: null }
      },
      select(columns) {
        assert.equal(columns, 'items')
        return { eq(column, user) {
          assert.equal(column, 'user_id'); assert.equal(user, 'owner')
          return { maybeSingle: async () => offline ? { data: null, error: new Error('Offline') } : { data: saved === null ? null : { items: structuredClone(saved) }, error: null } }
        } }
      }
    }
  } }
  await service.loadDebtCreditItems()
  assert.deepEqual(service.debtCreditItemsSubject.value, [])
  assert.equal(service.debtCreditLoadStateSubject.value, 'ready')
  const items = [{ id: 'one', person: 'Anna', amount: -12.35, reason: '' }]
  await service.updateDebtCreditItems(items)
  await service.loadDebtCreditItems()
  assert.deepEqual(service.debtCreditItemsSubject.value, items)
  offline = true
  await assert.rejects(() => service.updateDebtCreditItems([]), /Offline/)
  await service.loadDebtCreditItems()
  assert.equal(service.debtCreditLoadStateSubject.value, 'error')
  assert.deepEqual(service.debtCreditItemsSubject.value, items)
  service.isGuestSession = true
  await service.updateDebtCreditItems([])
  assert.deepEqual(saved, items)
  service.isGuestSession = false
  service.userSubject.next(null)
  await assert.rejects(() => service.updateDebtCreditItems([]), /Account richiesto/)
})

test('malformed backup cannot replace the saved list', async () => {
  const stream = new BehaviorSubject([{ id: 'saved', person: 'Anna', amount: 2, reason: '' }])
  const storage = new StorageService({ reports$: new BehaviorSubject([]), globalNotes$: new BehaviorSubject(''), calculatorItems$: new BehaviorSubject([]), debtCreditItems$: stream, debtCreditLoadState$: new BehaviorSubject('ready'), updateDebtCreditItems: async items => stream.next(items) })
  for (const items of [[null], [{ id: 'bad', person: 'Anna', amount: '12', reason: '' }], [{ id: 'bad', person: 'Anna', amount: 1.234, reason: '' }]]) {
    await assert.rejects(() => storage.restoreBackup({ debtCreditItems: items }))
    assert.equal(storage.appData().debtCreditItems[0].id, 'saved')
  }
  await storage.restoreBackup({ debtCreditItems: [{ id: 'valid', person: 'Anna', amount: -4.5 }] })
  assert.equal(storage.appData().debtCreditItems[0].reason, '')
})

test('late account save and stale reads never replace newer session data', async () => {
  const c = Object.create(SupabaseService.prototype)
  c.debtCreditLoadVersion = 0
  c.userSubject = new BehaviorSubject({ id: 'A' })
  c.debtCreditItemsSubject = new BehaviorSubject([])
  c.debtCreditLoadStateSubject = new BehaviorSubject('ready')
  let finishSave
  const reads = []
  c.supabase = { from: () => ({ upsert: () => new Promise(resolve => { finishSave = resolve }), select: () => ({ eq: () => ({ maybeSingle: () => new Promise(resolve => reads.push(resolve)) }) }) }) }
  const a = [{ id: 'A-private', person: 'Anna', amount: 2, reason: '' }]
  const b = [{ id: 'B-private', person: 'Luca', amount: 5, reason: '' }]
  const saving = c.updateDebtCreditItems(a)
  c.userSubject.next({ id: 'B' })
  c.debtCreditItemsSubject.next(b)
  finishSave({ error: null })
  await assert.rejects(() => saving, /Sessione/)
  assert.deepEqual(c.debtCreditItemsSubject.value, b)
  const olderRead = c.loadDebtCreditItems()
  const newerRead = c.loadDebtCreditItems()
  reads[1]({ data: { items: b }, error: null }); await newerRead
  reads[0]({ data: { items: [] }, error: null }); await olderRead
  assert.deepEqual(c.debtCreditItemsSubject.value, b)
  const staleRead = c.loadDebtCreditItems()
  const newSave = c.updateDebtCreditItems(b)
  finishSave({ error: null }); await newSave
  reads[2]({ data: { items: [] }, error: null }); await staleRead
  assert.deepEqual(c.debtCreditItemsSubject.value, b)
  assert.equal(c.debtCreditLoadStateSubject.value, 'ready')
})
