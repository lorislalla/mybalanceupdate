// Guest session and synthetic records only. Run against the Angular development server.
async (page) => {
  const assert = (condition, message) => { if (!condition) throw new Error(message) }
  page.setDefaultTimeout(15000)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('http://localhost:3000')
  await page.getByRole('button', { name: 'Entra come ospite (senza salvataggio dati)', exact: true }).click()
  await page.locator('app-monthly-report').waitFor()
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  const paste = async (field, value) => {
    await page.evaluate(value => navigator.clipboard.writeText(value), value)
    await field.focus()
    await field.press('ControlOrMeta+A')
    await field.press('ControlOrMeta+V')
  }
  await page.evaluate(() => {
    const c = ng.getComponent(document.querySelector('app-monthly-report'))
    c.storageService.appData.set({ globalNotes: '', calculatorItems: [], reports: [{
      year: 2026, month: 9, payday: '2026-09-15', balance: 10000, salary: 2000, incomes: [], notes: '',
      expenses: [{ id: 'test', description: 'Spesa', amount: 67, shared: true, totalAmount: 134 }]
    }] })
    c.currentMonthYear.set('2026-09')
  })
  await page.getByRole('button', { name: 'Modifica Spesa', exact: true }).click()
  const amount = page.getByRole('textbox', { name: 'Importo totale', exact: true })
  await amount.waitFor()
  await page.waitForFunction(() => document.querySelector('#expense-amount')?.value === '134')
  assert(await amount.inputValue() === '134', 'Editing did not load the whole shared total')
  assert(await amount.getAttribute('inputmode') === 'numeric', 'Mobile keyboard is not numeric')
  await amount.focus()
  await amount.press('End')
  for (const key of [',', '.', 'e']) {
    await amount.press(key)
    assert(await amount.inputValue() === '134', 'Disallowed key entered the amount: ' + key)
  }
  await paste(amount, '67,50')
  await amount.blur()
  await page.locator('.expense-composer [role=alert]').waitFor()
  assert(await page.getByRole('button', { name: 'Salva spesa', exact: true }).isDisabled(), 'Pasted decimal can be saved')
  assert(await amount.inputValue() === '67,50', 'Invalid paste was silently converted to an integer')
  await amount.fill('69')
  await amount.blur()
  assert(await amount.inputValue() === '69', 'Blur restored decimal formatting')
  await page.getByRole('button', { name: 'Salva spesa', exact: true }).click()
  await page.getByText('Condivisa · totale 69 €', { exact: true }).waitFor()
  await page.locator('.expense-list').getByText('34,5 €', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Modifica Spesa', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('#expense-amount')?.value === '69')
  assert(await amount.inputValue() === '69', 'Saved total did not round-trip')
  await page.locator('.expense-composer').getByRole('button', { name: 'Annulla', exact: true }).click()
  const balance = page.locator('app-money-field').first()
  await balance.getByRole('button', { name: /^Modifica / }).click()
  await balance.getByRole('textbox').waitFor()
  assert(await balance.getByRole('textbox').inputValue() === '10000', 'Balance editor has separators or decimal zeroes')
  await paste(balance.getByRole('textbox'), '10000.5')
  await balance.getByRole('alert').waitFor()
  assert(await balance.getByRole('button', { name: 'Salva', exact: true }).isDisabled(), 'Fractional balance can be saved')
  await balance.getByRole('button', { name: 'Annulla', exact: true }).click()
  await page.getByRole('button', { name: 'Aggiungi altra entrata', exact: true }).click()
  await page.getByRole('combobox', { name: 'Descrizione entrata', exact: true }).fill('Rimborso')
  await paste(page.getByRole('textbox', { name: 'Importo entrata', exact: true }), '12.5')
  await page.locator('.income-form [role=alert]').waitFor()
  assert(await page.getByRole('button', { name: 'Aggiungi entrata', exact: true }).isDisabled(), 'Fractional income can be saved')
  return { integerExpenseEditing: 'passed', decimalTypingBlocked: 'passed', decimalPasteRejected: 'passed', integerBlurAndSave: 'passed', balanceAndIncome: 'passed', mobileKeyboard: 'numeric' }
}
