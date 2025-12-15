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
  expenses: Expense[];
  notes: string;
}

export interface AppData {
  reports: MonthlyReport[];
  globalNotes: string;
}
