export interface Expense {
  id: string;
  description: string;
  amount: number;
  shared?: boolean;
  totalAmount?: number;
}

export interface Income {
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
  salary13?: number; // Tredicesima (December)
  salary14?: number; // Quattordicesima (June)
  incomes: Income[];
  expenses: Expense[];
  notes: string;
}

export interface CalculatorItem {
  id: string;
  description: string;
  amount: number;
  color?: string;
}

export interface AppData {
  reports: MonthlyReport[];
  globalNotes: string;
  calculatorItems: CalculatorItem[];
}
