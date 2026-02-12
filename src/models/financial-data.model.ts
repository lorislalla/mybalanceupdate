// Modello per una singola spesa mensile
export interface Expense {
  id: string
  description: string
  amount: number
  shared?: boolean
  totalAmount?: number
}

// Modello per una singola entrata
export interface Income {
  id: string
  description: string
  amount: number
}

// Resoconto finanziario di un singolo mese
export interface MonthlyReport {
  year: number
  month: number
  payday: string
  balance: number
  salary?: number
  salary13?: number
  salary14?: number
  incomes: Income[]
  expenses: Expense[]
  notes: string
}

// Voce del calcolatore rapido
export interface CalculatorItem {
  id: string
  description: string
  amount: number
  color?: string
}

// Struttura completa dei dati dell'applicazione
export interface AppData {
  reports: MonthlyReport[]
  globalNotes: string
  calculatorItems: CalculatorItem[]
}

// Risultato di una ricerca tra spese e entrate
export interface SearchResult {
  description: string
  amount: number
  year: number
  month: number
  type: 'expense' | 'income'
}
