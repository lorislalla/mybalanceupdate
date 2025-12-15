import { Component, ChangeDetectionStrategy, inject, signal, computed, effect } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { StorageService } from '../../services/storage.service';
import { MonthlyReport, Expense } from '../../models/financial-data.model';

@Component({
  selector: 'app-monthly-report',
  templateUrl: './monthly-report.component.html',
  providers: [DatePipe],
  imports: [CommonModule, FormsModule, ReactiveFormsModule]
})
export class MonthlyReportComponent {
  private storageService = inject(StorageService);
  private fb = inject(FormBuilder);
  // FIX: Explicitly type `datePipe` to `DatePipe` to resolve type inference issue.
  private datePipe: DatePipe = inject(DatePipe);

  today = new Date();
  currentMonthYear = signal(this.datePipe.transform(this.today, 'yyyy-MM')!);
  
  report = signal<MonthlyReport | undefined>(undefined);
  
  newExpenseForm = this.fb.group({
    description: ['', Validators.required],
    amount: [null as number | null, [Validators.required, Validators.min(50)]]
  });

  // Signals for editing
  editingExpenseId = signal<string | null>(null);
  editExpenseForm = this.fb.group({
    description: ['', Validators.required],
    amount: [null as number | null, [Validators.required, Validators.min(50)]]
  });

  // Signals for delete confirmation
  showDeleteConfirmation = signal(false);
  expenseToDelete = signal<Expense | null>(null);

  // Signals for custom month picker
  isMonthPickerOpen = signal(false);
  pickerYear = signal(new Date().getFullYear());
  monthPickerShortNames = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  private monthPickerLongNames = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  
  selectedMonthDisplay = computed(() => {
    const [year, month] = this.currentMonthYear().split('-').map(Number);
    return `${this.monthPickerLongNames[month - 1]} ${year}`;
  });

  constructor() {
    effect(() => {
      this.cancelEditing(); // Reset editing state when month changes
      const [year, month] = this.currentMonthYear().split('-').map(Number);
      const loadedReport = this.storageService.getReport(year, month);
      
      const newReport: MonthlyReport = loadedReport || {
        year: year,
        month: month,
        payday: '',
        balance: 0,
        expenses: [],
        notes: ''
      };
      this.report.set(newReport);
    });
  }

  totalExpenses = computed(() => {
    return this.report()?.expenses.reduce((acc, exp) => acc + exp.amount, 0) ?? 0;
  });

  changeMonth(delta: number) {
    const [year, month] = this.currentMonthYear().split('-').map(Number);
    // Create date on the 15th to avoid timezone/daylight saving issues
    const currentDate = new Date(year, month - 1, 15);
    currentDate.setMonth(currentDate.getMonth() + delta);
    this.currentMonthYear.set(this.datePipe.transform(currentDate, 'yyyy-MM')!);
  }

  updateReportField<K extends keyof MonthlyReport>(field: K, value: MonthlyReport[K]) {
    const currentReport = this.report();
    if (currentReport) {
      const updatedReport = { ...currentReport, [field]: value };
      this.report.set(updatedReport);
      this.storageService.updateReport(updatedReport);
    }
  }

  addExpense() {
    if (this.newExpenseForm.valid) {
      const { description, amount } = this.newExpenseForm.value;
      const currentReport = this.report();

      if (currentReport && description && amount) {
        const newExpense: Expense = {
          id: crypto.randomUUID(),
          description,
          amount
        };
        const updatedExpenses = [...currentReport.expenses, newExpense];
        this.updateReportField('expenses', updatedExpenses);
        this.newExpenseForm.reset();
      }
    }
  }

  // --- Edit Expense Methods ---
  startEditing(expense: Expense) {
    this.editingExpenseId.set(expense.id);
    this.editExpenseForm.setValue({
      description: expense.description,
      amount: expense.amount
    });
  }

  cancelEditing() {
    this.editingExpenseId.set(null);
  }

  saveExpense() {
    if (this.editExpenseForm.invalid || !this.editingExpenseId()) {
      return;
    }

    const currentReport = this.report();
    const { description, amount } = this.editExpenseForm.value;
    
    if (currentReport && description && amount != null) {
      const updatedExpenses = currentReport.expenses.map(exp => 
        exp.id === this.editingExpenseId() 
          ? { ...exp, description, amount } 
          : exp
      );
      this.updateReportField('expenses', updatedExpenses);
      this.cancelEditing(); // Exit editing mode
    }
  }

  // --- Delete Expense Methods ---
  promptDeleteExpense(expense: Expense) {
    this.expenseToDelete.set(expense);
    this.showDeleteConfirmation.set(true);
  }

  cancelDelete() {
    this.expenseToDelete.set(null);
    this.showDeleteConfirmation.set(false);
  }

  confirmDelete() {
    const expenseIdToDelete = this.expenseToDelete()?.id;
    if (!expenseIdToDelete) {
      this.cancelDelete();
      return;
    }

    const currentReport = this.report();
    if (currentReport) {
      const updatedExpenses = currentReport.expenses.filter(exp => exp.id !== expenseIdToDelete);
      this.updateReportField('expenses', updatedExpenses);
    }
    
    this.cancelDelete();
  }

  // --- Custom Month Picker Methods ---
  openMonthPicker() {
    const [year] = this.currentMonthYear().split('-').map(Number);
    this.pickerYear.set(year);
    this.isMonthPickerOpen.set(true);
  }
  
  closeMonthPicker() {
    this.isMonthPickerOpen.set(false);
  }

  changePickerYear(delta: number) {
    this.pickerYear.update(y => y + delta);
  }

  selectMonth(monthIndex: number) { // monthIndex is 0-11
    const year = this.pickerYear();
    const month = monthIndex + 1; // month is 1-12
    const newMonthYear = `${year}-${month.toString().padStart(2, '0')}`;
    this.currentMonthYear.set(newMonthYear);
    this.closeMonthPicker();
  }
  
  goToThisMonth() {
    this.currentMonthYear.set(this.datePipe.transform(this.today, 'yyyy-MM')!);
    this.closeMonthPicker();
  }
}
