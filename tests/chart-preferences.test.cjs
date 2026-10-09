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
const { createEnvironmentInjector } = require('@angular/core')
const { BehaviorSubject } = require('rxjs')
const { SupabaseService } = require('../src/services/supabase.service.ts')
const { ChartPreferencesService } = require('../src/components/summary-view/chart-preferences.service.ts')
const { defaultSettings, defaultPreferences } = require('../src/components/summary-view/chart-data.ts')
const settle = () => new Promise(resolve => setImmediate(resolve))

function setup({ guest = false, initial = null, cache = new Map(), fail = false, blockedStorage = false } = {}) {
  global.window = new EventTarget()
  global.localStorage = {
    getItem: key => { if (blockedStorage) throw new Error('Blocked'); return cache.get(key) || null },
    setItem: (key, value) => { if (blockedStorage) throw new Error('Blocked'); cache.set(key, value) }
  }
  const users = new BehaviorSubject({ id: guest ? 'guest-user' : 'user-a', user_metadata: {} })
  const writes = []
  const backend = {
    isGuest: guest, user$: users.asObservable(), remote: initial, fail,
    async getChartPreferences() { return this.remote },
    async updateChartPreferences(preferences) {
      if (this.fail) throw new Error('Offline')
      this.remote = structuredClone(preferences)
      writes.push(this.remote)
    }
  }
  const injector = createEnvironmentInjector([
    { provide: SupabaseService, useValue: backend }, ChartPreferencesService
  ])
  const service = injector.get(ChartPreferencesService)
  return { service, backend, writes, injector, cache, users }
}

test('guest settings survive a new service/browser visit without any cloud write', async () => {
  const first = setup({ guest: true })
  await first.service.save('outgoings', { ...defaultSettings('outgoings'), expenseLimit: 500.5 })
  assert.equal(first.service.status(), 'local')
  assert.equal(first.writes.length, 0)
  first.injector.destroy()
  const next = setup({ guest: true, cache: first.cache })
  assert.equal(next.service.preferences().charts.outgoings.expenseLimit, 500.5)
  next.injector.destroy()
})
test('authenticated preferences are synced and a fresh device restores the threshold', async () => {
  const first = setup()
  await settle()
  await first.service.save('outgoings', { ...defaultSettings('outgoings'), expenseLimit: 1000, excludedTerms: 'vacanza' })
  assert.equal(first.service.status(), 'synced')
  const remote = first.backend.remote
  assert.equal(remote.charts.outgoings.expenseLimit, 1000)
  first.injector.destroy()
  const second = setup({ initial: remote })
  await settle()
  assert.equal(second.service.preferences().charts.outgoings.expenseLimit, 1000)
  assert.equal(second.service.preferences().charts.outgoings.excludedTerms, 'vacanza')
  second.injector.destroy()
})
test('offline saves stay cached, survive re-entry, and retry the pending threshold instead of old cloud settings', async () => {
  const stale = defaultPreferences()
  stale.updatedAt = 1
  const first = setup({ initial: stale, fail: true })
  await settle()
  await first.service.save('outgoings', { ...defaultSettings('outgoings'), expenseLimit: 750 })
  assert.equal(first.service.status(), 'error')
  first.injector.destroy()
  const next = setup({ initial: stale, cache: first.cache, fail: true })
  await settle()
  assert.equal(next.service.preferences().charts.outgoings.expenseLimit, 750)
  assert.equal(next.service.status(), 'error')
  next.backend.fail = false
  await next.service.retry()
  assert.equal(next.service.status(), 'synced')
  assert.equal(next.backend.remote.charts.outgoings.expenseLimit, 750)
  next.injector.destroy()
})
test('account changes do not expose or copy another user’s chart preferences', async () => {
  const state = setup({ guest: true })
  await state.service.save('outgoings', { ...defaultSettings('outgoings'), expenseLimit: 100 })
  state.users.next({ id: 'other-guest', user_metadata: {} })
  assert.equal(state.service.preferences().charts.outgoings.expenseLimit, null)
  state.users.next({ id: 'guest-user', user_metadata: {} })
  assert.equal(state.service.preferences().charts.outgoings.expenseLimit, 100)
  state.injector.destroy()
})
test('blocked browser storage is reported and cloud success still remains durable', async () => {
  const guest = setup({ guest: true, blockedStorage: true })
  await guest.service.save('outgoings', { ...defaultSettings('outgoings'), expenseLimit: 100 })
  assert.equal(guest.service.status(), 'unsaved')
  guest.injector.destroy()
  const user = setup({ blockedStorage: true })
  await settle()
  await user.service.save('outgoings', { ...defaultSettings('outgoings'), expenseLimit: 100 })
  assert.equal(user.service.status(), 'synced')
  assert.equal(user.backend.remote.charts.outgoings.expenseLimit, 100)
  user.injector.destroy()
})
test('a newer cloud preference replaces a stale local cached value', async () => {
  const old = defaultPreferences()
  old.updatedAt = 5
  old.charts.outgoings.expenseLimit = 100
  const remote = defaultPreferences()
  remote.updatedAt = 10
  remote.charts.outgoings.expenseLimit = 200
  const state = setup({ initial: remote, cache: new Map([['mybalance:charts:v1:user-a', JSON.stringify({ preferences: old, pending: false })]]) })
  await settle()
  assert.equal(state.service.preferences().charts.outgoings.expenseLimit, 200)
  state.injector.destroy()
})
test('Supabase writes only the dedicated chart metadata and propagates backend errors', async () => {
  const instance = Object.create(SupabaseService.prototype)
  instance.isGuestSession = false
  instance.userSubject = new BehaviorSubject({ id: 'user-a' })
  let payload
  instance.supabase = { auth: {
    getUser: async () => ({ data: { user: { user_metadata: { mybalance_chart_preferences: { version: 1 } } } }, error: null }),
    updateUser: async value => { payload = value; return { error: null } }
  } }
  assert.deepEqual(await instance.getChartPreferences(), { version: 1 })
  await instance.updateChartPreferences({ version: 1 })
  assert.deepEqual(payload, { data: { mybalance_chart_preferences: { version: 1 } } })
  instance.supabase.auth.updateUser = async () => ({ error: new Error('Failed') })
  await assert.rejects(instance.updateChartPreferences({ version: 1 }), /Failed/)
  instance.isGuestSession = true
  await assert.rejects(instance.updateChartPreferences({ version: 1 }), /Account richiesto/)
})
