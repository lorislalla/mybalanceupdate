import { Component, ChangeDetectionStrategy, inject, signal, computed, effect } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { StorageService } from '../../services/storage.service';
import { MonthlyReport, Expense } from '../../models/financial-data.model';

@Component({
  selector: 'app-monthly-report',
  templateUrl: './monthly-report.component.html',
  providers: [DatePipe],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, DragDropModule],
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
    
    // Optional: User feedback (could use a snackbar, but for now console/alert or just UI update if we were looking at that month)
    alert(`Spesa "${expense.description}" copiata nel mese di ${this.monthPickerLongNames[nextMonth - 1]} ${nextYear}`);
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
