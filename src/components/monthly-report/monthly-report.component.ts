import { Component, ChangeDetectionStrategy, inject, signal, computed, effect } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { StorageService } from '../../services/storage.service';
import { MonthlyReport, Expense } from '../../models/financial-data.model';

import { TextFieldModule } from '@angular/cdk/text-field';

@Component({
  selector: 'app-monthly-report',
  templateUrl: './monthly-report.component.html',
  providers: [DatePipe],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, DragDropModule, TextFieldModule],
  styles: [`
    .cdk-drag-preview {
        box-sizing: border-box;
        border-radius: 6px;
        box-shadow: 0 5px 5px -3px rgba(0, 0, 0, 0.2), 0 8px 10px 1px rgba(0, 0, 0, 0.14), 0 3px 14px 2px rgba(0, 0, 0, 0.12);
        background-color: #1f2937;
        color: #e5e7eb;
        opacity: 0.95;
    }
    .cdk-drag-placeholder {
        opacity: 0.3;
        background: #374151;
        border: 2px dashed #4b5563;
        border-radius: 6px;
    }
    .cdk-drag-animating {
        transition: transform 250ms cubic-bezier(0, 0, 0.2, 1);
    }
    .cdk-drop-list-dragging .cdk-drag {
        transition: transform 250ms cubic-bezier(0, 0, 0.2, 1);
    }
    /* Hide Spinners */
    .no-spin::-webkit-inner-spin-button, 
    .no-spin::-webkit-outer-spin-button { 
      -webkit-appearance: none; 
      margin: 0; 
    }
    .no-spin {
      -moz-appearance: textfield;
    }
  `]
})
export class MonthlyReportComponent {
  // --- Drag & Drop ---
  drop(event: CdkDragDrop<Expense[]>) {
    const currentReport = this.report();
    if (currentReport) {
      const expenses = [...currentReport.expenses];
      moveItemInArray(expenses, event.previousIndex, event.currentIndex);
      this.updateReportField('expenses', expenses);
    }
  }

  private storageService = inject(StorageService);
  private fb = inject(FormBuilder);
  // FIX: Explicitly type `datePipe` to `DatePipe` to resolve type inference issue.
  private datePipe: DatePipe = inject(DatePipe);

  today = new Date();
  currentMonthYear = signal<string>(this.getDateString(this.today)); // Initial value, updated in effect
  
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

  monthsWithData = computed(() => {
    const reports = this.storageService.appData().reports;
    const dataSet = new Set<string>();
    reports.forEach(r => {
      if (r.payday) {
        dataSet.add(`${r.year}-${r.month}`);
      }
    });
    return dataSet;
  });

  hasDataForMonth(monthIndex: number): boolean {
    const year = this.pickerYear();
    const month = monthIndex + 1;
    return this.monthsWithData().has(`${year}-${month}`);
  }

  private initialized = false;

  constructor() {
    effect(() => {
      // 1. Load specific report for currentMonthYear
      this.cancelEditing(); 
      const [year, month] = this.currentMonthYear().split('-').map(Number);
      const loadedReport = this.storageService.getReport(year, month);
      
      const newReport: MonthlyReport = loadedReport || {
        year: year,
        month: month,
        payday: '',
        balance: 0,
        salary: 0,
        expenses: [],
        notes: ''
      };
      this.report.set(newReport);
      
      // Handle auto-edit after month switch (e.g. from repeatExpense)
      if (this.pendingEditId) {
          const expenseToEdit = newReport.expenses.find(e => e.id === this.pendingEditId);
          if (expenseToEdit) {
              // Delay slightly to ensure UI has rendered the list (although signal update might be enough, safe to just set it)
              // But editExpenseForm needs to be set.
               this.startEditing(expenseToEdit);
          }
          this.pendingEditId = null; 
      }
    }, { allowSignalWrites: true });

    effect(() => {
        // 2. One-time initialization logic: find first incomplete month
        const reports = this.storageService.appData().reports; // Track changes
        if (!this.initialized && reports.length > 0) {
            this.initialized = true;
            
            // Find the *earliest* report that has no payday (meaning it's incomplete/to-do)
            // But we probably want the earliest *future* or *current* one?
            // "il primo mese dove NON c'è impostato il giorno dello stipendio"
            // Let's assume reports are sorted descending by date in storage.
            // We want to find the oldest one that is empty? No, that would be very old.
            // Logic: Sort Ascending. Find first without payday.
            
            const sortedAsc = [...reports].sort((a,b) => 
                new Date(a.year, a.month - 1).getTime() - new Date(b.year, b.month - 1).getTime()
            );

            const firstIncomplete = sortedAsc.find(r => !r.payday);

            if (firstIncomplete) {
                const dateStr = `${firstIncomplete.year}-${firstIncomplete.month.toString().padStart(2, '0')}`;
                this.currentMonthYear.set(dateStr);
            } else {
                // All completed? Default to today or next month after latest?
                // Let's stay on today as fallback.
                this.currentMonthYear.set(this.getDateString(this.today));
            }
        }
    }, { allowSignalWrites: true });
  }

  private getDateString(date: Date): string {
    return this.datePipe.transform(date, 'yyyy-MM')!;
  }

  totalExpenses = computed(() => {
    return this.report()?.expenses.reduce((acc, exp) => acc + exp.amount, 0) ?? 0;
  });

  changeMonth(delta: number) {
    const [year, month] = this.currentMonthYear().split('-').map(Number);
    // Create date on the 15th
    const currentDate = new Date(year, month - 1, 15);
    currentDate.setMonth(currentDate.getMonth() + delta);
    this.currentMonthYear.set(this.getDateString(currentDate));
  }
  
  onPaydayChange(newPayday: string) {
      if (newPayday) {
          this.updateReportField('payday', newPayday);
          // "Appena inserisco... passa al mese successivo"
          // Add a small delay for UX so user sees value set
          setTimeout(() => {
              this.changeMonth(1);
          }, 500);
      } else {
          this.updateReportField('payday', newPayday);
      }
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

  // --- Repeat Expense Method ---
  private pendingEditId: string | null = null;

  // --- Repeat Expense Method ---
  async repeatExpense(expense: Expense) {
    const [year, month] = this.currentMonthYear().split('-').map(Number);
    // Calculate next month
    let nextMonth = month + 1;
    let nextYear = year;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }

    // Attempt to load report for key month, or create a fresh one if it doesn't exist in local store
    // Note: getReport is synchronous from the signal store.
    let nextReport = this.storageService.getReport(nextYear, nextMonth);

    if (!nextReport) {
      nextReport = {
        year: nextYear,
        month: nextMonth,
        payday: '',
        balance: 0,
        salary: 0,
        expenses: [],
        notes: ''
      };
    }

    // Add the expense
    const newExpense: Expense = {
      ...expense,
      id: crypto.randomUUID() // Ensure valid new ID
    };

    const updatedNextReport = {
      ...nextReport,
      expenses: [...nextReport.expenses, newExpense]
    };

    // Save
    await this.storageService.updateReport(updatedNextReport);
    
    // Set pending edit ID and switch to next month
    this.pendingEditId = newExpense.id;
    const newMonthYear = `${nextYear}-${nextMonth.toString().padStart(2, '0')}`;
    this.currentMonthYear.set(newMonthYear);
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
