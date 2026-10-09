// Run with the Angular development server on localhost:3000 and Playwright.
// Uses a guest session and synthetic financial records; no authenticated writes.
async (page) => {
  const assert = (condition, message) => { if (!condition) throw new Error(message) }
  page.setDefaultTimeout(15000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 1440, height: 1000 })
  const enter = async () => {
    await page.goto('http://localhost:3000')
    await page.getByRole('button', { name: 'Entra come ospite (senza salvataggio dati)', exact: true }).click()
    await page.getByRole('button', { name: 'Grafici', exact: true }).click()
    await page.getByRole('heading', { name: 'I tuoi grafici', exact: true }).waitFor()
  }
  const seed = async () => page.evaluate(() => {
    const c = ng.getComponent(document.querySelector('app-summary-view'))
    const now = new Date()
    c.storageService.appData.set({ reports: Array.from({ length: 15 }, (_, i) => {
      const date = new Date(now.getFullYear(), now.getMonth() - 14 + i, 1)
      return { year: date.getFullYear(), month: date.getMonth() + 1, payday: '', balance: 18000 + i * 350, salary: 2000 + i * 10, salary13: 100, salary14: 50, incomes: [{ id: 'refund', description: 'Rimborso', amount: 75.5 }], expenses: [
        { id: 'small', description: 'Spesa', amount: 200 + i },
        { id: 'limit', description: 'Affitto', amount: 500 },
        { id: 'large', description: 'Vacanza', amount: 2500 }
      ], notes: '' }
    }), calculatorItems: [], globalNotes: '' })
  })
  await enter()
  assert(await page.getByRole('heading', { name: 'Nessun dato da visualizzare', exact: true }).count() === 4, 'Empty states are missing')
  await seed()
  await page.waitForFunction(() => document.querySelectorAll('.apexcharts-svg').length === 4)
  assert(JSON.stringify(await page.locator('.chart-card h2').allTextContents()) === JSON.stringify(['Saldo complessivo', 'Saldo · ultimi 12 mesi', 'Spese mensili', 'Entrate mensili']), 'Four chart order is wrong')
  const marker = page.locator('app-financial-chart').first().locator('.apexcharts-marker').nth(4)
  await marker.click()
  await page.getByRole('dialog').waitFor()
  await page.getByRole('button', { name: 'Resta nei grafici', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  const outgoing = page.locator('app-financial-chart').nth(2)
  await outgoing.getByRole('button', { name: 'Configura Spese mensili', exact: true }).click()
  const threshold = outgoing.getByRole('textbox', { name: 'Escludi spese superiori a (€)', exact: true })
  await threshold.fill('-1')
  await outgoing.getByRole('button', { name: 'Salva impostazioni', exact: true }).click()
  await outgoing.getByRole('alert').waitFor()
  await threshold.fill('abc')
  await outgoing.getByRole('button', { name: 'Salva impostazioni', exact: true }).click()
  assert(await outgoing.getByRole('alert').count() === 1, 'Invalid amount was silently saved')
  await threshold.fill('500,00')
  await outgoing.getByLabel('Finestra della media', { exact: true }).selectOption({ label: '3 mesi' })
  await outgoing.getByRole('button', { name: 'Salva impostazioni', exact: true }).click()
  await page.waitForFunction(() => {
    const c = ng.getComponent(document.querySelectorAll('app-financial-chart')[2])
    return c.settings().expenseLimit === 500 && c.points().at(-1).y === 714 && c.points().every(p => p.excludedCount === 1)
  })
  await outgoing.getByText('Esclusioni attive', { exact: true }).waitFor()
  await outgoing.getByRole('button', { name: 'Mostra valori', exact: true }).click()
  await page.waitForFunction(() => document.querySelectorAll('app-financial-chart:nth-child(3) tbody tr').length === 15)
  await outgoing.getByRole('button', { name: 'Configura Spese mensili', exact: true }).click()
  await threshold.fill('900')
  await outgoing.getByRole('button', { name: 'Annulla', exact: true }).click()
  assert(await outgoing.evaluate(el => ng.getComponent(el).settings().expenseLimit) === 500, 'Cancel changed the saved filter')
  await outgoing.getByRole('button', { name: 'Configura Spese mensili', exact: true }).click()
  await outgoing.getByLabel('Periodo', { exact: true }).selectOption('custom')
  await outgoing.getByLabel('Dal mese', { exact: true }).fill('2026-10')
  await outgoing.getByLabel('Al mese', { exact: true }).fill('2026-09')
  await outgoing.getByRole('button', { name: 'Salva impostazioni', exact: true }).click()
  await outgoing.getByRole('alert').waitFor()
  await outgoing.getByRole('button', { name: 'Annulla', exact: true }).click()
  const dimensions = []
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await outgoing.getByRole('button', { name: 'Configura Spese mensili', exact: true }).click()
    await page.waitForFunction(() => [...document.querySelectorAll('.chart-container .apexcharts-svg')].every(svg => svg.width.baseVal.value <= svg.closest('.chart-container').clientWidth))
    dimensions.push(await page.locator('app-summary-view').evaluate(el => ({
      width: innerWidth, document: document.documentElement.scrollWidth, client: el.clientWidth, scroll: el.scrollWidth,
      cards: [...el.querySelectorAll('.chart-card')].map(card => ({ client: card.clientWidth, scroll: card.scrollWidth }))
    })))
    await outgoing.getByRole('button', { name: 'Annulla', exact: true }).click()
  }
  assert(dimensions.every(d => d.width === d.document && d.client === d.scroll && d.cards.every(c => c.client === c.scroll)), 'Chart or settings horizontal overflow')
  await page.setViewportSize({ width: 1440, height: 1000 })
  const targetMonth = await outgoing.evaluate(el => { const c = ng.getComponent(el); return c.key(c.points().at(-1)) })
  await outgoing.getByRole('combobox', { name: 'Mese da aprire · Spese mensili', exact: true }).selectOption(targetMonth)
  await outgoing.getByRole('button', { name: 'Apri mese', exact: true }).click()
  await page.getByRole('dialog').waitFor()
  await page.keyboard.press('Escape')
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await outgoing.getByRole('button', { name: 'Apri mese', exact: true }).click()
  await page.getByRole('button', { name: 'Apri resoconto', exact: true }).click()
  await page.locator('app-monthly-report').waitFor()
  assert(await page.locator('app-monthly-report').evaluate(el => ng.getComponent(el).storageService.activeMonthYear()) === targetMonth, 'Month navigation selected wrong report')
  await page.getByRole('button', { name: 'Grafici', exact: true }).click()
  assert(await outgoing.evaluate(el => ng.getComponent(el).settings().expenseLimit) === 500, 'Re-entry forgot settings')
  await enter()
  await seed()
  await page.waitForFunction(() => ng.getComponent(document.querySelectorAll('app-financial-chart')[2]).settings().expenseLimit === 500)
  await outgoing.locator('tbody tr').nth(14).waitFor()
  assert(await outgoing.evaluate(el => ng.getComponent(el).settings().averageMonths) === 3, 'Reload forgot moving-average period')
  await page.evaluate(() => {
    const c = ng.getComponent(document.querySelector('app-summary-view'))
    const report = c.reports().at(-1)
    c.storageService.appData.update(data => ({ ...data, reports: [{ ...report, balance: -100, expenses: [{ id: 'all', description: 'Grande', amount: 900 }] }] }))
  })
  await page.waitForFunction(() => ng.getComponent(document.querySelectorAll('app-financial-chart')[2]).points()[0].y === 0)
  await outgoing.locator('.apexcharts-svg').waitFor()
  assert(await page.locator('app-financial-chart').first().evaluate(el => ng.getComponent(el).points()[0].y) === -100, 'Negative balances disappear')
  assert(errors.length === 0, 'Browser errors: ' + errors.join('\n'))
  return { filtering: 'passed', validation: 'passed', table: 'passed', persistenceAfterReload: 'passed', navigation: 'passed', singlePointAndZero: 'passed', dimensions, pageErrors: errors }
}
