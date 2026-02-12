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
  changeDetection: ChangeDetectionStrategy.OnPush,
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
      /* Nascondo gli spinner nativi degli input numerici */
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
  private storageService = inject(StorageService)
  private fb = inject(FormBuilder)
  private datePipe: DatePipe = inject(DatePipe)

  today = new Date()
  // Signal condiviso con lo StorageService per il mese/anno corrente
  currentMonthYear = this.storageService.activeMonthYear

  // Report attualmente visualizzato
  report = signal<MonthlyReport | undefined>(undefined)

  // ID da editare dopo il cambio mese (usato dalla funzione "ripeti spesa")
  private pendingEditId: string | null = null

  // =============================================
  // Sezione: Form per aggiunta spese e entrate
  // =============================================

  newExpenseForm = this.fb.group({
    description: ['', Validators.required],
    amount: [null as number | null, [Validators.required, Validators.min(0)]],
    shared: [false]
  })

  newIncomeForm = this.fb.group({
    description: ['', Validators.required],
    amount: [null as number | null, [Validators.required, Validators.min(0)]]
  })

  // =============================================
  // Sezione: Editing inline spese e entrate
  // =============================================

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

  // =============================================
  // Sezione: Conferma eliminazione
  // =============================================

  showDeleteConfirmation = signal(false)
  expenseToDelete = signal<Expense | null>(null)

  showDeleteIncomeConfirmation = signal(false)
  incomeToDelete = signal<Income | null>(null)

  // =============================================
  // Sezione: Month Picker personalizzato
  // =============================================

  isMonthPickerOpen = signal(false)
  pickerYear = signal(new Date().getFullYear())
  monthPickerShortNames = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
  private monthPickerLongNames = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']

  // =============================================
  // Sezione: Modal "Ripeti Spesa"
  // =============================================

  showRepeatModal = signal(false)
  expenseToRepeat = signal<Expense | null>(null)
  repeatMonthYear = signal<string>('')
  repeatPickerYear = signal(new Date().getFullYear())

  // =============================================
  // Sezione: Suggerimenti autocomplete
  // =============================================

  // Raccolgo tutte le descrizioni spese usate in passato per l'autocomplete
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

  // Raccolgo tutte le descrizioni entrate usate in passato per l'autocomplete
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

  // =============================================
  // Sezione: Computed properties per la vista
  // =============================================

  // Nome del mese visualizzato nel selettore
  selectedMonthDisplay = computed(() => {
    const [year, month] = this.currentMonthYear().split('-').map(Number)
    return `${this.monthPickerLongNames[month - 1]} ${year}`
  })

  // Label dello stipendio (si riferisce al mese precedente)
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

  // Set di mesi che hanno dati per il picker (indicatore verde)
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

  // =============================================
  // Sezione: Totali calcolati
  // =============================================

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

  // =============================================
  // Sezione: Inizializzazione ed effetti
  // =============================================

  constructor() {
    // Carico il report corrispondente ogni volta che cambia il mese selezionato
    effect(() => {
      this.cancelEditing()
      const [year, month] = this.currentMonthYear().split('-').map(Number)
      const loadedReport = this.storageService.getReport(year, month)

      const newReport: MonthlyReport = loadedReport || {
        year,
        month,
        payday: '',
        balance: 0,
        salary: 0,
        incomes: [],
        expenses: [],
        notes: ''
      }
      this.report.set(newReport)

      // Gestisco l'auto-edit dopo un cambio mese (es. dopo "ripeti spesa")
      if (this.pendingEditId) {
        const expenseToEdit = newReport.expenses.find(e => e.id === this.pendingEditId)
        if (expenseToEdit) {
          this.startEditing(expenseToEdit)
        }
        this.pendingEditId = null
      }
    })

    // Inizializzazione una tantum: trovo il primo mese incompleto
    effect(() => {
      if (!this.storageService.initialized() && this.storageService.appData().reports.length > 0) {
        this.storageService.initialized.set(true)
        this.storageService.activeMonthYear.set(this.storageService.getFirstIncompleteMonth())
      }
    })
  }

  // =============================================
  // Sezione: Navigazione mesi
  // =============================================

  private getDateString(date: Date): string {
    return this.datePipe.transform(date, 'yyyy-MM')!
  }

  changeMonth(delta: number) {
    const [year, month] = this.currentMonthYear().split('-').map(Number)
    // Uso il giorno 15 per evitare anomalie nei cambi di mese
    const currentDate = new Date(year, month - 1, 15)
    currentDate.setMonth(currentDate.getMonth() + delta)
    this.currentMonthYear.set(this.getDateString(currentDate))
  }

  onPaydayChange(newPayday: string) {
    this.updateReportField('payday', newPayday)
    if (newPayday) {
      // Dopo aver inserito la data stipendio, passo al mese successivo con un breve delay UX
      setTimeout(() => {
        this.changeMonth(1)
      }, 500)
    }
  }

  // =============================================
  // Sezione: Aggiornamento campi report
  // =============================================

  updateReportField<K extends keyof MonthlyReport>(field: K, value: MonthlyReport[K]) {
    const currentReport = this.report()
    if (currentReport) {
      const updatedReport = { ...currentReport, [field]: value }
      this.report.set(updatedReport)
      this.storageService.updateReport(updatedReport)
    }
  }

  // =============================================
  // Sezione: Gestione spese (CRUD + drag & drop)
  // =============================================

  // Riordino le spese con drag & drop
  drop(event: CdkDragDrop<Expense[]>) {
    const currentReport = this.report()
    if (currentReport) {
      const expenses = [...currentReport.expenses]
      moveItemInArray(expenses, event.previousIndex, event.currentIndex)
      this.updateReportField('expenses', expenses)
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
      this.cancelEditing()
    }
  }

  // =============================================
  // Sezione: Eliminazione spese con conferma
  // =============================================

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

  // =============================================
  // Sezione: Ripetizione spesa in altro mese
  // =============================================

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

    // Carico o creo il report del mese di destinazione
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

    // Aggiungo la spesa con un nuovo ID
    const newExpense: Expense = {
      ...expense,
      id: crypto.randomUUID()
    }

    const updatedNextReport = {
      ...nextReport,
      expenses: [...nextReport.expenses, newExpense]
    }

    await this.storageService.updateReport(updatedNextReport)

    // Imposto l'ID da editare e cambio mese
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

  // =============================================
  // Sezione: Gestione entrate (CRUD)
  // =============================================

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

  // =============================================
  // Sezione: Eliminazione entrate con conferma
  // =============================================

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

  // =============================================
  // Sezione: Month Picker (apertura, selezione, navigazione)
  // =============================================

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
    const year = this.pickerYear()
    const month = monthIndex + 1
    const newMonthYear = `${year}-${month.toString().padStart(2, '0')}`
    this.currentMonthYear.set(newMonthYear)
    this.closeMonthPicker()
  }

  goToThisMonth() {
    this.currentMonthYear.set(this.storageService.getFirstIncompleteMonth())
    this.closeMonthPicker()
  }
}
