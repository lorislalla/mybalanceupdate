// With localhost:3000 running:
// npx --package @playwright/cli playwright-cli --session resoconto-check open http://localhost:3000
// npx --package @playwright/cli playwright-cli --session resoconto-check run-code --filename tests/resoconto-browser.js
// The check signs in as guest and uses synthetic data; it never writes to an authenticated account.
async (page) => {
  page.setDefaultTimeout(5000)
  await page.goto('http://localhost:3000')
  await page.getByRole('button', { name: 'Entra come ospite (senza salvataggio dati)', exact: true }).click()
  await page.getByRole('heading', { name: 'Bilancio del mese', exact: true }).waitFor()
  await page.evaluate(() => {
    const component = ng.getComponent(document.querySelector('app-monthly-report'))
    const report = (month, overrides = {}) => ({ year: 2026, month, payday: '', balance: 0, salary: 0, incomes: [], expenses: [], notes: '', ...overrides })
    component.storageService.appData.set({ reports: [
      report(9, { payday: '2026-09-15', balance: 21000 }),
      report(10, { balance: 20000, salary: 2000, expenses: [
        { id: 'a', description: 'Spesa supermercato', amount: 500, shared: true, totalAmount: 1000 },
        { id: 'b', description: 'Lavori in casa', amount: 700 },
        { id: 'c', description: 'Assicurazione auto', amount: 300 }
      ], notes: 'Prima riga\n\n' + 'Note lunghe e leggibili. '.repeat(80) + '\nUltima riga' }),
      report(11, { balance: 20300 }), report(12), report(6)
    ], globalNotes: '', calculatorItems: [] })
    component.currentMonthYear.set('2026-10')
  })
  const waitMonth = async month => page.waitForFunction(expected => {
    const component = ng.getComponent(document.querySelector('app-monthly-report'))
    const monthYear = `2026-${String(expected).padStart(2, '0')}`
    const field = ng.getComponent(document.querySelector('app-money-field'))
    return component?.report()?.month === expected && component?.currentMonthYear() === monthYear && field?.month() === monthYear
  }, month)
  await waitMonth(10)
  const assert = (condition, message) => { if (!condition) throw new Error(message) }
  const field = page.locator('app-money-field').first()
  assert(await field.getByRole('textbox').count() === 0, 'Balance is permanently editable instead of read-only')
  const openField = async target => {
    await target.getByRole('button', { name: /^(Inserisci|Modifica) / }).click()
    await target.getByRole('textbox').waitFor()
  }
  const save = field.getByRole('button', { name: 'Salva', exact: true })
  await openField(field)
  await field.getByRole('textbox').fill('20000,55')
  await page.evaluate(() => {
    const component = ng.getComponent(document.querySelector('app-monthly-report'))
    component.storageService.updateReport({ ...component.report(), balance: 21000 })
  })
  await page.waitForFunction(() => ng.getComponent(document.querySelector('app-monthly-report')).report().balance === 21000)
  assert(await field.getByRole('textbox').inputValue() === '20000,55', 'Incoming update discarded the monetary draft')
  await field.getByRole('button', { name: 'Annulla', exact: true }).click()
  await field.getByRole('textbox').waitFor({ state: 'hidden' })
  assert(await field.locator('.currency-value').innerText() === '21.000,00 €', 'Cancel did not restore the latest persisted value')
  await openField(field)
  await field.getByRole('textbox').fill('20.000,00')
  await save.click()
  await page.getByRole('button', { name: 'Mese successivo', exact: true }).click()
  await waitMonth(11)
  const salary = page.locator('app-money-field').nth(1)
  assert(await salary.getByRole('textbox').count() === 0, 'Empty salary is permanently editable')
  assert(await salary.getByRole('button', { name: 'Inserisci Stipendio 10/2026', exact: true }).isVisible(), 'Empty salary has no insertion action')
  await openField(salary)
  await salary.getByRole('textbox').fill('0')
  await salary.getByRole('button', { name: 'Salva', exact: true }).click()
  await salary.getByRole('button', { name: 'Salva', exact: true }).waitFor({ state: 'hidden' })
  assert(await salary.getByRole('button', { name: 'Salva', exact: true }).count() === 0, 'Saving zero left the field dirty')
  await openField(salary)
  await salary.getByRole('textbox').fill('abc')
  await salary.getByRole('button', { name: 'Annulla', exact: true }).click()
  await salary.getByRole('textbox').waitFor({ state: 'hidden' })
  assert(await salary.getByRole('alert').count() === 0, 'Cancel retained invalid text from an empty field')
  await openField(salary)
  await salary.getByRole('textbox').fill('abc')
  await page.getByRole('button', { name: 'Mese precedente', exact: true }).click()
  await waitMonth(10)
  assert(!await salary.getByRole('alert').count(), 'Month change retained an invalid draft')
  assert(await salary.getByRole('textbox').count() === 0, 'Month change left the monetary editor open')
  const green = await salary.locator('.currency-value').evaluate(el => getComputedStyle(el).color)
  const red = await page.locator('.expense-row .amount').first().evaluate(el => getComputedStyle(el).color)
  assert(green === 'rgb(110, 231, 183)', 'Salary has no income color')
  assert(red === 'rgb(253, 164, 175)', 'Expense has no outgoing color')

  await page.getByRole('button', { name: 'Modifica Spesa supermercato', exact: true }).click()
  await page.getByRole('heading', { name: 'Modifica spesa', exact: true }).waitFor()
  await page.getByRole('combobox', { name: 'Spesa', exact: true }).fill('Modifica da annullare')
  await page.locator('.expense-composer').getByRole('button', { name: 'Annulla', exact: true }).click()
  await page.getByRole('heading', { name: 'Segna una spesa', exact: true }).waitFor()
  assert(await page.getByRole('button', { name: 'Modifica Spesa supermercato', exact: true }).count() === 1, 'Cancel changed the saved expense')
  await page.getByRole('combobox', { name: 'Spesa', exact: true }).fill('Nuova spesa')
  await page.getByRole('textbox', { name: 'Importo · tua quota', exact: true }).fill('65.50')
  await page.getByRole('button', { name: 'Aggiungi spesa', exact: true }).click()
  await page.getByRole('button', { name: 'Modifica Nuova spesa', exact: true }).waitFor()
  assert(await page.locator('.expense-list .expense-row').count() === 4, 'New expense replaced a cancelled edit')
  await page.getByRole('button', { name: 'Modifica Spesa supermercato', exact: true }).click()
  await page.getByRole('heading', { name: 'Modifica spesa', exact: true }).waitFor()
  await page.getByRole('textbox', { name: 'Importo · tua quota', exact: true }).fill('500,25')
  await page.getByRole('button', { name: 'Salva spesa', exact: true }).click()
  await page.getByText('Condivisa · totale 1.000,50 €', { exact: true }).waitFor()
  assert(await page.getByText('Condivisa · totale 1.000,50 €', { exact: true }).isVisible(), 'Shared total lost personal-share cents')
  await page.getByRole('button', { name: 'Modifica Spesa supermercato', exact: true }).click()
  await page.getByRole('heading', { name: 'Modifica spesa', exact: true }).waitFor()
  await page.getByRole('combobox', { name: 'Spesa', exact: true }).press('Escape')
  await page.getByRole('button', { name: 'Aggiungi spesa', exact: true }).waitFor()
  assert(await page.getByRole('button', { name: 'Aggiungi spesa', exact: true }).isVisible(), 'Escape did not leave expense editing')

  await page.getByRole('button', { name: '+ Aggiungi', exact: true }).click()
  await page.getByRole('combobox', { name: 'Descrizione entrata', exact: true }).fill('Rimborso')
  await page.getByRole('textbox', { name: 'Importo entrata', exact: true }).fill('100,50')
  await page.getByRole('button', { name: 'Aggiungi entrata', exact: true }).click()
  await page.getByRole('button', { name: 'Modifica entrata Rimborso', exact: true }).click()
  await page.getByRole('textbox', { name: 'Importo entrata', exact: true }).fill('101,75')
  await page.getByRole('button', { name: 'Salva entrata', exact: true }).click()
  await page.locator('.income-row').getByText('101,75 €', { exact: true }).waitFor()
  assert(await page.locator('.income-row').getByText('101,75 €', { exact: true }).isVisible(), 'Income edit lost cents')

  const notes = page.locator('.notes-text')
  const original = await notes.innerText()
  await page.getByRole('button', { name: 'Modifica note', exact: true }).click()
  const noteEditor = page.getByRole('textbox', { name: 'Note del mese', exact: true })
  await noteEditor.fill('Da annullare')
  await page.locator('.month-notes').getByRole('button', { name: 'Annulla', exact: true }).click()
  assert(await notes.innerText() === original, 'Cancelling notes changed the original')
  await page.getByRole('button', { name: 'Modifica note', exact: true }).click()
  await noteEditor.fill(original + '\nAggiunta con righe\nSeconda riga')
  await page.getByRole('button', { name: 'Salva note', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.notes-text')?.innerText.endsWith('Seconda riga'))
  assert(await notes.innerText() === original + '\nAggiunta con righe\nSeconda riga', 'Long multiline notes were truncated')

  const dimensions = []
  for (const width of [1280, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    dimensions.push(await page.locator('app-monthly-report').evaluate(el => ({
      width: window.innerWidth, document: document.documentElement.scrollWidth,
      report: el.clientWidth, scroll: el.scrollWidth
    })))
  }
  assert(dimensions.every(d => d.document === d.width && d.scroll === d.report), 'Responsive horizontal overflow')
  await page.getByRole('button', { name: 'Modifica note', exact: true }).click()
  await noteEditor.waitFor()
  await page.waitForFunction(() => document.querySelector('#month-notes-editor')?.value.length > 1000)
  const noteSize = await noteEditor.evaluate(el => ({ client: el.clientHeight, scroll: el.scrollHeight }))
  assert(noteSize.scroll <= noteSize.client + 2, 'Long note editor retained internal scrolling')
  await page.locator('.month-notes').getByRole('button', { name: 'Annulla', exact: true }).click()
  await notes.waitFor()
  await page.getByRole('button', { name: 'Mese precedente', exact: true }).click()
  await waitMonth(9)
  assert(await page.getByRole('button', { name: 'Modifica Saldo dopo stipendio', exact: true }).isVisible(), 'Historical balance label changed')
  assert(await page.getByLabel('Giorno dello stipendio', { exact: true }).inputValue() === '2026-09-15', 'Historical payday was lost')
  assert(await page.getByRole('heading', { name: 'Confronto del mese', exact: true }).count() === 0, 'Historical month shows calendar comparison')
  await page.getByRole('button', { name: 'Mese successivo', exact: true }).click()
  await waitMonth(10)
  return { monetaryDrafts: 'passed', expenseAndIncomeEditing: 'passed', notes: 'passed', historical: 'passed', dimensions }
}
