export interface Expense {
  id: string;
  description: string;
  amount: number;
}

export interface MonthlyReport {
  year: number;
  month: number; // 1-12
  payday: string; // YYYY-MM-DD
  balance: number;
  salary?: number; // Optional strictly speaking for old data, but we'll default to 0
  expenses: Expense[];
  notes: string;
}

export interface CalculatorItem {
  id: string;
  description: string;
  amount: number;
}

export interface AppData {
  reports: MonthlyReport[];
  globalNotes: string;
  calculatorItems: CalculatorItem[];
}
