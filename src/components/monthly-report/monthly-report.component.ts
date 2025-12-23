import { Component, ChangeDetectionStrategy, inject, signal, computed, effect } from '@angular/core'
import { CommonModule, DatePipe } from '@angular/common'
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms'
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop'
import { StorageService } from '../../services/storage.service'
import { MonthlyReport, Expense, Income } from '../../models/financial-data.model'

import { TextFieldModule } from '@angular/cdk/text-field'

@Component({
  selector: 'app-monthly-report',
  templateUrl: './monthly-report.component.html',
  providers: [DatePipe],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, DragDropModule, TextFieldModule],
  styles: [
    `
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
    `
  ]
})
export class MonthlyReportComponent {
  // --- Drag & Drop ---
  drop(event: CdkDragDrop<Expense[]>) {
    const currentReport = this.report()
    if (currentReport) {
      const expenses = [...currentReport.expenses]
      moveItemInArray(expenses, event.previousIndex, event.currentIndex)
      this.updateReportField('expenses', expenses)
    }
  }

  private storageService = inject(StorageService)
  private fb = inject(FormBuilder)
  // FIX: Explicitly type `datePipe` to `DatePipe` to resolve type inference issue.
  private datePipe: DatePipe = inject(DatePipe)

  today = new Date()
  currentMonthYear = this.storageService.activeMonthYear // Shared signal from storage service

  report = signal<MonthlyReport | undefined>(undefined)

  newExpenseForm = this.fb.group({
    description: ['', Validators.required],
    amount: [null as number | null, [Validators.required, Validators.min(0)]],
    shared: [false]
  })

  newIncomeForm = this.fb.group({
    description: ['', Validators.required],
    amount: [null as number | null, [Validators.required, Validators.min(0)]]
  })

  // Signals for editing
  editingExpenseId = signal<string | null>(null)
  editExpenseForm = this.fb.group({
    description: ['', Validators.required],
    amount: [null as number | null, [Validators.required, Validators.min(0)]],
    shared: [false]
  })

  editingIncomeId = signal<string | null>(null)
  editIncomeForm = this.fb.group({
    description: ['', Validators.required],
    amount: [null as number | null, [Validators.required, Validators.min(0)]]
  })

  // Signals for delete confirmation
  showDeleteConfirmation = signal(false)
  expenseToDelete = signal<Expense | null>(null)

  showDeleteIncomeConfirmation = signal(false)
  incomeToDelete = signal<Income | null>(null)

  // Signals for custom month picker
  isMonthPickerOpen = signal(false)
  pickerYear = signal(new Date().getFullYear())
  monthPickerShortNames = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
  private monthPickerLongNames = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']

  // Signals for repeat expense modal
  showRepeatModal = signal(false)
  expenseToRepeat = signal<Expense | null>(null)
  repeatMonthYear = signal<string>('') // YYYY-MM
  repeatPickerYear = signal(new Date().getFullYear())

  expenseSuggestions = computed(() => {
    const reports = this.storageService.appData().reports
    const suggestions = new Set<string>()
    reports.forEach(r => {
      r.expenses?.forEach(e => {
        if (e.description) suggestions.add(e.description)
      })
    })
    return Array.from(suggestions).sort()
  })

  incomeSuggestions = computed(() => {
    const reports = this.storageService.appData().reports
    const suggestions = new Set<string>()
    reports.forEach(r => {
      r.incomes?.forEach(i => {
        if (i.description) suggestions.add(i.description)
      })
    })
    return Array.from(suggestions).sort()
  })

  isAddingIncome = signal(false)

  selectedMonthDisplay = computed(() => {
    const [year, month] = this.currentMonthYear().split('-').map(Number)
    return `${this.monthPickerLongNames[month - 1]} ${year}`
  })

  salaryLabel = computed(() => {
    const [year, month] = this.currentMonthYear().split('-').map(Number)
    let prevMonth = month - 1
    let prevYear = year
    if (prevMonth === 0) {
      prevMonth = 12
      prevYear -= 1
    }
    return `Stipendio ${prevMonth}/${prevYear}`
  })

  monthsWithData = computed(() => {
    const reports = this.storageService.appData().reports
    const dataSet = new Set<string>()
    reports.forEach(r => {
      if (r.payday) {
        dataSet.add(`${r.year}-${r.month}`)
      }
    })
    return dataSet
  })

  hasDataForMonth(monthIndex: number): boolean {
    const year = this.pickerYear()
    const month = monthIndex + 1
    return this.monthsWithData().has(`${year}-${month}`)
  }

  constructor() {
    effect(() => {
      // 1. Load specific report for currentMonthYear
      this.cancelEditing()
      const [year, month] = this.currentMonthYear().split('-').map(Number)
      const loadedReport = this.storageService.getReport(year, month)

      const newReport: MonthlyReport = loadedReport || {
        year: year,
        month: month,
        payday: '',
        balance: 0,
        salary: 0,
        incomes: [],
        expenses: [],
        notes: ''
      }
      this.report.set(newReport)

      // Handle auto-edit after month switch (e.g. from repeatExpense)
      if (this.pendingEditId) {
        const expenseToEdit = newReport.expenses.find(e => e.id === this.pendingEditId)
        if (expenseToEdit) {
          // Delay slightly to ensure UI has rendered the list (although signal update might be enough, safe to just set it)
          // But editExpenseForm needs to be set.
          this.startEditing(expenseToEdit)
        }
        this.pendingEditId = null
      }
    })

    effect(() => {
      // 2. One-time initialization logic: find first incomplete month
      if (!this.storageService.initialized() && this.storageService.appData().reports.length > 0) {
        this.storageService.initialized.set(true)
        this.storageService.activeMonthYear.set(this.storageService.getFirstIncompleteMonth())
      }
    })
  }

  private getDateString(date: Date): string {
    return this.datePipe.transform(date, 'yyyy-MM')!
  }

  totalExpenses = computed(() => {
    return this.report()?.expenses.reduce((acc, exp) => acc + exp.amount, 0) ?? 0
  })

  totalIncomes = computed(() => {
    return this.report()?.incomes?.reduce((acc, inc) => acc + inc.amount, 0) ?? 0
  })

  totalSalary = computed(() => {
    const report = this.report()
    return (report?.salary || 0) + this.totalIncomes() + (report?.salary13 || 0) + (report?.salary14 || 0)
  })

  sharedExpensesCount = computed(() => {
    return this.report()?.expenses.filter(e => e.shared).length ?? 0
  })

  sharedExpensesTotal = computed(() => {
    return (
      this.report()
        ?.expenses.filter(e => e.shared)
        .reduce((acc, exp) => acc + (exp.totalAmount || exp.amount * 2), 0) ?? 0
    )
  })

  changeMonth(delta: number) {
    const [year, month] = this.currentMonthYear().split('-').map(Number)
    // Create date on the 15th
    const currentDate = new Date(year, month - 1, 15)
    currentDate.setMonth(currentDate.getMonth() + delta)
    this.currentMonthYear.set(this.getDateString(currentDate))
  }

  onPaydayChange(newPayday: string) {
    if (newPayday) {
      this.updateReportField('payday', newPayday)
      // "Appena inserisco... passa al mese successivo"
      // Add a small delay for UX so user sees value set
      setTimeout(() => {
        this.changeMonth(1)
      }, 500)
    } else {
      this.updateReportField('payday', newPayday)
    }
  }

  updateReportField<K extends keyof MonthlyReport>(field: K, value: MonthlyReport[K]) {
    const currentReport = this.report()
    if (currentReport) {
      const updatedReport = { ...currentReport, [field]: value }
      this.report.set(updatedReport)
      this.storageService.updateReport(updatedReport)
    }
  }

  addExpense() {
    if (this.newExpenseForm.valid) {
      const { description, amount, shared } = this.newExpenseForm.value
      const currentReport = this.report()

      if (currentReport && description && amount != null) {
        const newExpense: Expense = {
          id: crypto.randomUUID(),
          description,
          amount,
          shared: !!shared,
          totalAmount: shared ? amount * 2 : amount
        }
        const updatedExpenses = [...currentReport.expenses, newExpense]
        this.updateReportField('expenses', updatedExpenses)
        this.newExpenseForm.reset({ shared: false })
      }
    }
  }

  // --- Edit Expense Methods ---
  startEditing(expense: Expense) {
    this.editingExpenseId.set(expense.id)
    this.editExpenseForm.setValue({
      description: expense.description,
      amount: expense.amount,
      shared: !!expense.shared
    })
  }

  cancelEditing() {
    this.editingExpenseId.set(null)
  }

  saveExpense() {
    if (this.editExpenseForm.invalid || !this.editingExpenseId()) {
      return
    }

    const currentReport = this.report()
    const { description, amount, shared } = this.editExpenseForm.value

    if (currentReport && description && amount != null) {
      const updatedExpenses = currentReport.expenses.map(exp =>
        exp.id === this.editingExpenseId()
          ? {
              ...exp,
              description,
              amount,
              shared: !!shared,
              totalAmount: shared ? amount * 2 : amount
            }
          : exp
      )
      this.updateReportField('expenses', updatedExpenses)
      this.cancelEditing() // Exit editing mode
    }
  }

  // --- Repeat Expense Method ---
  private pendingEditId: string | null = null

  repeatExpense(expense: Expense) {
    this.expenseToRepeat.set(expense)
    const firstIncomplete = this.storageService.getFirstIncompleteMonth()
    this.repeatMonthYear.set(firstIncomplete)
    const [year] = firstIncomplete.split('-').map(Number)
    this.repeatPickerYear.set(year)
    this.showRepeatModal.set(true)
  }

  cancelRepeat() {
    this.showRepeatModal.set(false)
    this.expenseToRepeat.set(null)
  }

  async confirmRepeat() {
    const expense = this.expenseToRepeat()
    const targetMonthYear = this.repeatMonthYear()

    if (!expense || !targetMonthYear) return

    const [nextYear, nextMonth] = targetMonthYear.split('-').map(Number)

    // Attempt to load report for key month, or create a fresh one if it doesn't exist in local store
    let nextReport = this.storageService.getReport(nextYear, nextMonth)

    if (!nextReport) {
      nextReport = {
        year: nextYear,
        month: nextMonth,
        payday: '',
        balance: 0,
        salary: 0,
        incomes: [],
        expenses: [],
        notes: ''
      }
    }

    // Add the expense
    const newExpense: Expense = {
      ...expense,
      id: crypto.randomUUID() // Ensure valid new ID
    }

    const updatedNextReport = {
      ...nextReport,
      expenses: [...nextReport.expenses, newExpense]
    }

    // Save
    await this.storageService.updateReport(updatedNextReport)

    // Set pending edit ID and switch to target month
    this.pendingEditId = newExpense.id
    this.currentMonthYear.set(targetMonthYear)
    this.showRepeatModal.set(false)
    this.expenseToRepeat.set(null)
  }

  selectRepeatMonth(monthIndex: number) {
    const year = this.repeatPickerYear()
    const month = monthIndex + 1
    this.repeatMonthYear.set(`${year}-${month.toString().padStart(2, '0')}`)
  }

  changeRepeatPickerYear(delta: number) {
    this.repeatPickerYear.update(y => y + delta)
  }

  // --- Delete Expense Methods ---
  promptDeleteExpense(expense: Expense) {
    this.expenseToDelete.set(expense)
    this.showDeleteConfirmation.set(true)
  }

  cancelDelete() {
    this.expenseToDelete.set(null)
    this.showDeleteConfirmation.set(false)
  }

  confirmDelete() {
    const expenseIdToDelete = this.expenseToDelete()?.id
    if (!expenseIdToDelete) {
      this.cancelDelete()
      return
    }

    const currentReport = this.report()
    if (currentReport) {
      const updatedExpenses = currentReport.expenses.filter(exp => exp.id !== expenseIdToDelete)
      this.updateReportField('expenses', updatedExpenses)
    }

    this.cancelDelete()
  }

  // --- Income Methods ---
  addIncome() {
    if (this.newIncomeForm.valid) {
      const { description, amount } = this.newIncomeForm.value
      const currentReport = this.report()

      if (currentReport && description && amount != null) {
        const newIncome: Income = {
          id: crypto.randomUUID(),
          description,
          amount
        }
        const updatedIncomes = [...(currentReport.incomes || []), newIncome]
        this.updateReportField('incomes', updatedIncomes)
        this.newIncomeForm.reset()
        this.isAddingIncome.set(false)
      }
    }
  }

  toggleAddIncome() {
    this.isAddingIncome.set(!this.isAddingIncome())
    if (this.isAddingIncome()) {
      this.newIncomeForm.reset()
    }
  }

  cancelAddingIncome() {
    this.isAddingIncome.set(false)
    this.newIncomeForm.reset()
  }

  startEditingIncome(income: Income) {
    this.editingIncomeId.set(income.id)
    this.editIncomeForm.setValue({
      description: income.description,
      amount: income.amount
    })
  }

  cancelEditingIncome() {
    this.editingIncomeId.set(null)
  }

  saveIncome() {
    if (this.editIncomeForm.invalid || !this.editingIncomeId()) {
      return
    }

    const currentReport = this.report()
    const { description, amount } = this.editIncomeForm.value

    if (currentReport && description && amount != null) {
      const updatedIncomes = currentReport.incomes.map(inc => (inc.id === this.editingIncomeId() ? { ...inc, description, amount } : inc))
      this.updateReportField('incomes', updatedIncomes)
      this.cancelEditingIncome()
    }
  }

  promptDeleteIncome(income: Income) {
    this.incomeToDelete.set(income)
    this.showDeleteIncomeConfirmation.set(true)
  }

  cancelDeleteIncome() {
    this.incomeToDelete.set(null)
    this.showDeleteIncomeConfirmation.set(false)
  }

  confirmDeleteIncome() {
    const incomeIdToDelete = this.incomeToDelete()?.id
    if (!incomeIdToDelete) {
      this.cancelDeleteIncome()
      return
    }

    const currentReport = this.report()
    if (currentReport) {
      const updatedIncomes = currentReport.incomes.filter(inc => inc.id !== incomeIdToDelete)
      this.updateReportField('incomes', updatedIncomes)
    }

    this.cancelDeleteIncome()
  }

  // --- Custom Month Picker Methods ---
  openMonthPicker() {
    const [year] = this.currentMonthYear().split('-').map(Number)
    this.pickerYear.set(year)
    this.isMonthPickerOpen.set(true)
  }

  closeMonthPicker() {
    this.isMonthPickerOpen.set(false)
  }

  changePickerYear(delta: number) {
    this.pickerYear.update(y => y + delta)
  }

  selectMonth(monthIndex: number) {
    // monthIndex is 0-11
    const year = this.pickerYear()
    const month = monthIndex + 1 // month is 1-12
    const newMonthYear = `${year}-${month.toString().padStart(2, '0')}`
    this.currentMonthYear.set(newMonthYear)
    this.closeMonthPicker()
  }

  goToThisMonth() {
    this.currentMonthYear.set(this.storageService.getFirstIncompleteMonth())
    this.closeMonthPicker()
  }
}
