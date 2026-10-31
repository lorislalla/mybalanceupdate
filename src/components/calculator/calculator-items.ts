import { CalculatorItem, DebtCreditItem } from '../../models/financial-data.model'

// Resolve legacy manual placeholders without copying or moving the debt entries.
export function calculatorItems(items: CalculatorItem[], debts: DebtCreditItem[]): CalculatorItem[] {
  const total = debts.reduce((sum, item) => sum + Math.round(item.amount * 100), 0) / 100
  const index = items.findIndex(item => item.source === 'debt-credit' || /^(sospesi\s*\(whatsapp\)|debiti\s*\/\s*crediti)$/i.test(item.description.trim()))
  const linked: CalculatorItem = { ...(items[index] || { id: 'debt-credit-total' }), description: 'DEBITI/CREDITI', amount: total, source: 'debt-credit', color: total > 0 ? '#4ade80' : total < 0 ? '#f87171' : '#9ca3af' }
  return index < 0 ? [...items, linked] : items.map((item, i) => i === index ? linked : item)
}

export function storedCalculatorItems(items: CalculatorItem[]): CalculatorItem[] {
  return items.map(item => item.source === 'debt-credit' ? { ...item, amount: 0 } : item)
}
