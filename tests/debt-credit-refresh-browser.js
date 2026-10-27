// Isolated guest data and a deferred transport: exercises the real service and DOM without an account.
async (page) => {
  await page.goto('http://localhost:3001')
  await page.getByRole('button', { name: 'Entra come ospite (senza salvataggio dati)', exact: true }).click()
  await page.getByRole('button', { name: 'Debiti/Crediti', exact: true }).click()
  await page.getByRole('textbox', { name: 'Persona/Motivo', exact: true }).fill('Voce sintetica')
  await page.getByRole('textbox', { name: 'Importo (€)', exact: true }).fill('12')
  await page.getByRole('button', { name: 'Aggiungi', exact: true }).click()
  await page.locator('app-debt-credit .entry-description').waitFor()
  await page.getByRole('textbox', { name: 'Persona/Motivo', exact: true }).fill('Bozza da conservare')
  const amount = page.getByRole('textbox', { name: 'Importo (€)', exact: true })
  await amount.fill('+25')
  await page.evaluate(async () => {
    const component = ng.getComponent(document.querySelector('app-debt-credit'))
    const service = component.storageService.supabase
    service.isGuestSession = false
    const pending = []
    service.supabase = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => new Promise(resolve => pending.push(resolve)) }) }) }) }
    const seed = component.items().map(item => ({ ...item }))
    const initial = service.loadDebtCreditItems()
    pending.shift()({ data: { items: seed }, error: null })
    await initial
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const originalRow = document.querySelector('app-debt-credit .entries li')
    const originalFooter = document.querySelector('app-debt-credit footer')
    const input = document.querySelector('#debt-amount')
    input.focus(); input.setSelectionRange(1, 3)
    window.refreshProbe = { component, service, pending, originalRow, originalFooter,
      refresh: () => service.loadDebtCreditItems(),
      settle: error => pending.shift()({ data: error ? null : { items: component.items().map(item => ({ ...item })) }, error: error ? { message: 'Offline' } : null }) }
    window.refreshProbe.request = window.refreshProbe.refresh()
  })
  // Let Angular render the in-flight request, the phase that previously destroyed the list.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const during = await page.evaluate(() => {
    const p = window.refreshProbe
    const input = document.querySelector('#debt-amount')
    return { sameRow: p.originalRow === document.querySelector('app-debt-credit .entries li'),
      sameFooter: p.originalFooter === document.querySelector('app-debt-credit footer'),
      draft: p.component.person(), amount: input.value, focus: document.activeElement === input,
      selection: [input.selectionStart, input.selectionEnd], loading: p.component.loadState() }
  })
  if (!during.sameRow || !during.sameFooter || !during.focus || during.loading !== 'ready' || during.draft !== 'Bozza da conservare' || during.amount !== '+25' || String(during.selection) !== '1,3') throw new Error('Background refresh disrupted the page: ' + JSON.stringify(during))
  await page.evaluate(async () => { window.refreshProbe.settle(false); await window.refreshProbe.request })
  await page.evaluate(async () => {
    const p = window.refreshProbe
    p.request = p.refresh(); p.settle(true); await p.request
  })
  await page.getByRole('alert').filter({ hasText: 'Sincronizzazione non riuscita' }).waitFor()
  const stale = await page.evaluate(() => ({ sameRow: window.refreshProbe.originalRow === document.querySelector('app-debt-credit .entries li'), draft: document.querySelector('#debt-person').value, disabled: document.querySelector('app-debt-credit fieldset').disabled }))
  if (!stale.sameRow || stale.draft !== 'Bozza da conservare' || !stale.disabled) throw new Error('Failed refresh hid data or discarded draft: ' + JSON.stringify(stale))
  await page.evaluate(async () => { const p = window.refreshProbe; p.request = p.refresh(); p.settle(false); await p.request })
  await page.waitForFunction(() => !document.querySelector('app-debt-credit fieldset').disabled)
  const recovered = await page.evaluate(() => window.refreshProbe.originalRow === document.querySelector('app-debt-credit .entries li'))
  if (!recovered) throw new Error('Recovery recreated the list')
  return { passed: 'deferred refresh keeps row/footer/focus/selection/draft, failed refresh retains data read-only, recovery re-enables editing', during, stale }
}
