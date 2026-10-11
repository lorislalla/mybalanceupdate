// Run on localhost:3000 with Playwright. Guest session and synthetic records only.
async (page) => {
  const assert = (condition, message) => { if (!condition) throw new Error(message) }
  const wholeEuros = async root => {
    assert(!/\d,[0-9]+\s*€/u.test(await root.innerText()), 'Cents are still displayed')
  }
  page.setDefaultTimeout(15000)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('http://localhost:3000')
  await page.getByRole('button', { name: 'Entra come ospite (senza salvataggio dati)', exact: true }).click()
  await page.locator('app-monthly-report').waitFor()
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  const navigate = async (desktop, mobile = desktop) => {
    const small = page.viewportSize().width < 768
    if (small) await page.locator('app-header button[type=button]').click()
    await page.getByRole('button', { name: small ? mobile : desktop, exact: true }).click()
  }
  const paste = async (input, text) => {
    await page.evaluate(text => navigator.clipboard.writeText(text), text)
    await input.focus()
    await input.press('ControlOrMeta+A')
    await input.press('ControlOrMeta+V')
  }
  await page.evaluate(() => {
    const storage = ng.getComponent(document.querySelector('app-monthly-report')).storageService
    const now = new Date()
    storage.appData.set({ globalNotes: '', calculatorItems: [{ id: 'balance', description: 'Conto', amount: 10000 }], reports: Array.from({ length: 4 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - 2 + index, 1)
      return { year: date.getFullYear(), month: date.getMonth() + 1, payday: '', notes: '', balance: 147467 + index * 1000, salary: 1729, salary13: 1500, salary14: 1600,
        incomes: [{ id: 'sale', description: 'Vendita casa', amount: 133000 }, { id: 'zero', description: 'Conguaglio', amount: 0 }],
        expenses: [{ id: 'bill', description: 'Bolletta', amount: [50, 51, 54, 50][index], shared: true, totalAmount: [100, 102, 108, 100][index] }, { id: 'car', description: 'Rata auto', amount: 280 }]
      }
    }) })
  })
  await page.getByText('Condivisa · totale 108 €', { exact: true }).waitFor()
  const report = page.locator('app-monthly-report')
  await wholeEuros(report)
  assert(await report.getByText('1.729 €', { exact: true }).isVisible(), 'Salary is not displayed in whole euros')
  assert(await report.getByText('133.000 €', { exact: true }).isVisible(), 'Other income lost Italian grouping')
  assert(await report.getByText('0 €', { exact: true }).isVisible(), 'Zero income still has cents')
  assert(await report.getByText('1.500 €', { exact: true }).isVisible(), 'Extra salary still has cents')
  await navigate('Cerca', 'Cerca Spese')
  const search = page.locator('app-search-expenses')
  await search.locator('input').fill('Bolletta')
  await search.getByText('-54 €', { exact: true }).waitFor()
  await wholeEuros(search)
  await search.locator('input').fill('Vendita casa')
  await search.getByText('+133.000 €', { exact: true }).first().waitFor()
  await wholeEuros(search)
  await navigate('Grafici')
  await page.waitForFunction(() => document.querySelectorAll('.apexcharts-svg').length === 4)
  const outgoing = page.locator('app-financial-chart').nth(2)
  const formatterResults = await outgoing.evaluate(el => {
    const chart = ng.getComponent(el)
    const options = chart.options()
    return { average: chart.average(), averageDisplay: chart.currency(chart.average()), tooltip: options.tooltip.y.formatter(331.5), axis: options.yaxis.labels.formatter(1500.5), rawMovingAverage: options.series[1].data[1].y }
  })
  assert(formatterResults.average === 331.25 && formatterResults.averageDisplay.replace(/\s/gu, '') === '331€', 'Monthly average is not rounded for display')
  assert(formatterResults.tooltip.replace(/\s/gu, '') === '332€', 'Tooltip still shows cents')
  assert(formatterResults.axis.replace(/\s/gu, '') === '1.501€', 'Axis still shows fractional or compact amounts')
  assert(formatterResults.rawMovingAverage === 330.5, 'Formatting changed the underlying moving average')
  await outgoing.getByRole('button', { name: 'Mostra valori', exact: true }).click()
  await outgoing.locator('tbody tr').nth(3).waitFor()
  await wholeEuros(page.locator('app-summary-view'))
  await outgoing.getByRole('button', { name: 'Configura Spese mensili', exact: true }).click()
  const threshold = outgoing.getByRole('textbox', { name: 'Escludi spese superiori a (€)', exact: true })
  assert(await threshold.getAttribute('inputmode') === 'numeric', 'Threshold does not use integer keyboard')
  await paste(threshold, '300,50')
  await outgoing.getByRole('button', { name: 'Salva impostazioni', exact: true }).click()
  await outgoing.getByRole('alert').waitFor()
  await threshold.fill('300')
  await outgoing.getByRole('button', { name: 'Salva impostazioni', exact: true }).click()
  await outgoing.getByRole('button', { name: 'Configura Spese mensili', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('input[name=expenseLimit]')?.value === '300')
  assert(await threshold.inputValue() === '300', 'Saved threshold added decimal zeroes')
  await outgoing.getByRole('button', { name: 'Annulla', exact: true }).click()
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.waitForFunction(() => [...document.querySelectorAll('.chart-container .apexcharts-svg')].every(svg => svg.width.baseVal.value <= svg.closest('.chart-container').clientWidth))
  const balanceChart = page.locator('app-financial-chart').first()
  await balanceChart.locator('.chart-container').scrollIntoViewIfNeeded()
  await balanceChart.locator('.apexcharts-marker').nth(1).hover()
  await balanceChart.locator('.apexcharts-tooltip.apexcharts-active').waitFor()
  await wholeEuros(balanceChart.locator('.apexcharts-tooltip'))
  const dimensions = []
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await page.waitForFunction(() => [...document.querySelectorAll('.chart-container .apexcharts-svg')].every(svg => svg.width.baseVal.value <= svg.closest('.chart-container').clientWidth))
    dimensions.push(await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth })))
  }
  assert(dimensions.every(d => d.width === d.scroll), 'Full euro labels overflow on mobile')
  await navigate('Calcolo', 'Calcolatore')
  await page.getByRole('textbox', { name: 'Nuova voce', exact: true }).fill('Prestito')
  const newAmount = page.getByRole('textbox', { name: 'Importo nuova voce', exact: true })
  await paste(newAmount, '-250,50')
  await page.locator('.calculator-composer [role=alert]').waitFor()
  assert(await page.getByRole('button', { name: 'Aggiungi voce', exact: true }).isDisabled(), 'Calculator accepts fractional creation')
  await newAmount.fill('-250')
  await page.getByRole('button', { name: 'Aggiungi voce', exact: true }).click()
  const rowAmount = page.getByRole('textbox', { name: 'Importo Prestito', exact: true })
  await rowAmount.waitFor()
  assert(await rowAmount.inputValue() === '-250', 'Negative calculator amount gained cents')
  await paste(rowAmount, '-300.50')
  await page.locator('.calculator-row [role=alert]').waitFor()
  assert(await page.locator('.calculator-total strong').innerText() === '9.750 €', 'Invalid draft overwrote the saved total')
  await rowAmount.fill('-300')
  await rowAmount.blur()
  await page.waitForFunction(() => document.querySelector('.calculator-total strong')?.innerText === '9.700 €')
  assert(await rowAmount.inputValue() === '-300', 'Calculator blur added cents')
  await wholeEuros(page.locator('app-calculator'))
  return { report: 'passed', search: 'passed', chartAxesTooltipsAndTables: 'passed', roundedAverages: 'passed', integerThresholdPersistence: 'passed', calculatorNegativeAndInvalidDrafts: 'passed', dimensions }
}
