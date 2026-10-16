// Run on localhost in an isolated playwright-cli session; uses guest data only.
async (page) => {
  page.setDefaultTimeout(5000)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('http://localhost:3000')
  await page.getByRole('button', { name: 'Entra come ospite (senza salvataggio dati)', exact: true }).click()
  await page.getByRole('button', { name: 'Cerca', exact: true }).click()
  await page.locator('app-search-expenses input').first().waitFor()
  await page.waitForFunction(() => document.activeElement === document.querySelector('app-search-expenses input'), null, { timeout: 1000 })
  const query = page.locator('app-search-expenses input').first()
  await query.fill('Spesa')
  await page.getByRole('heading', { name: 'Cerca Spese & Entrate', exact: true }).click()
  await page.getByRole('button', { name: 'Cerca', exact: true }).click()
  if (await query.evaluate(el => el === document.activeElement)) throw new Error('Clicking the current search tab stole focus')
  await page.getByRole('button', { name: 'Resoconto', exact: true }).click()
  await page.getByRole('button', { name: 'Cerca', exact: true }).click()
  await page.waitForFunction(() => document.activeElement === document.querySelector('app-search-expenses input'))
  await page.evaluate(() => {
    const component = ng.getComponent(document.querySelector('app-search-expenses'))
    component.storageService.appData.set({ reports: [{ year: 2026, month: 10, payday: '', balance: 0, salary: 0, notes: '',
      expenses: [
        { id: 'small', description: 'Casa · Bolletta Luce & Gas agosto', amount: 50 },
        { id: 'medium', description: 'Casa · Mediazione agenzia per vendita casa Rivoli', amount: 1586 },
        { id: 'large', description: 'Casa · Acquisto casa Volvera', amount: 140000 },
        { id: 'long', description: "Casa · Atto d’acquisto + atto di mutuo + imposte", amount: 1925 }
      ], incomes: [{ id: 'refund', description: 'Casa · Rimborso agenzia per vendita casa Rivoli', amount: 4550 }]
    }], globalNotes: '', calculatorItems: [] })
  })
  await query.fill('Casa')
  await page.waitForFunction(() => document.querySelectorAll('app-search-expenses .font-mono').length === 5)
  const searchDimensions = []
  for (const width of [320, 374, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    searchDimensions.push(await page.locator('app-search-expenses').evaluate(el => ({
      width: innerWidth, scroll: document.documentElement.scrollWidth,
      amounts: [...el.querySelectorAll('.font-mono')].map(amount => {
        const range = document.createRange()
        range.selectNodeContents(amount)
        return { lines: range.getClientRects().length, right: amount.getBoundingClientRect().right }
      })
    })))
  }
  if (searchDimensions.some(d => d.scroll !== d.width || d.amounts.some(a => a.lines !== 1 || a.right > d.width))) throw new Error('Search amounts wrap or overflow on mobile: ' + JSON.stringify(searchDimensions))
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.getByRole('button', { name: 'Calcolo', exact: true }).click()
  await page.locator('app-calculator').waitFor()
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  const fixtures = [[19910, '19900'], [5655, '5700'], [7550, '7600'], [-7550, '-7500']]
  for (const [amount, expected] of fixtures) {
    await page.evaluate(value => {
      const component = ng.getComponent(document.querySelector('app-calculator'))
      component.storageService.updateCalculatorItems([{ id: 'account', description: 'Conto in banca', amount: value, color: '#6366f1' }])
    }, amount)
    await page.getByRole('button', { name: 'Copia totale arrotondato alle centinaia', exact: true }).click()
    await page.waitForFunction(() => ng.getComponent(document.querySelector('app-calculator')).copyStatus() === 'copied')
    if (await page.evaluate(() => navigator.clipboard.readText()) !== expected) throw new Error(`Wrong clipboard value for ${amount}`)
  }
  await page.getByRole('textbox', { name: 'Nuova voce', exact: true }).fill('Prestito')
  await page.getByRole('textbox', { name: 'Importo nuova voce', exact: true }).fill('-250')
  await page.getByRole('button', { name: 'Aggiungi voce', exact: true }).click()
  await page.getByRole('textbox', { name: 'Importo Prestito', exact: true }).waitFor()
  await page.getByRole('textbox', { name: 'Importo Prestito', exact: true }).fill('-300')
  await page.getByRole('textbox', { name: 'Importo Prestito', exact: true }).press('Tab')
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Importo Conto in banca')
  await page.locator('input[type="color"][aria-label="Colore Prestito"]').evaluate(el => {
    el.value = '#f97316'
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await page.waitForFunction(() => ng.getComponent(document.querySelector('app-calculator')).items().find(item => item.description === 'Prestito').color === '#f97316')
  const dimensions = []
  for (const width of [1280, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    dimensions.push(await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth })))
  }
  if (dimensions.some(result => result.width !== result.scroll)) throw new Error('Calculator overflows horizontally')
  return { searchFocusOnlyOnEntry: 'passed', searchAmounts: 'passed', roundedClipboard: 'passed', calculatorEditing: 'passed', searchDimensions, dimensions }
}
