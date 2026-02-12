import { Component, ChangeDetectionStrategy, inject, signal, computed, output } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { StorageService } from '../../services/storage.service'
import { SearchResult } from '../../models/financial-data.model'

@Component({
  selector: 'app-search-expenses',
  templateUrl: './search-expenses.component.html',
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SearchExpensesComponent {
  private storageService = inject(StorageService)
  private monthNames = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']

  navigateToMonthlyView = output<void>()

  showConfirm = signal(false)
  selectedResult = signal<SearchResult | null>(null)

  searchQuery = signal('')

  // Cerco spese e entrate che contengono la query nel campo descrizione
  searchResults = computed<SearchResult[]>(() => {
    const query = this.searchQuery().trim().toLowerCase()
    if (!query) {
      return []
    }

    const results: SearchResult[] = []
    const allReports = this.storageService.appData().reports

    for (const report of allReports) {
      // Cerco nelle spese
      for (const expense of report.expenses) {
        if (expense.description.toLowerCase().includes(query)) {
          results.push({
            description: expense.description,
            amount: expense.amount,
            year: report.year,
            month: report.month,
            type: 'expense'
          })
        }
      }

      // Cerco nelle entrate
      if (report.incomes) {
        for (const income of report.incomes) {
          if (income.description.toLowerCase().includes(query)) {
            results.push({
              description: income.description,
              amount: income.amount,
              year: report.year,
              month: report.month,
              type: 'income'
            })
          }
        }
      }

      // Cerco la tredicesima
      if ((report.salary13 ?? 0) > 0 && ('13esima'.includes(query) || 'tredicesima'.includes(query))) {
        results.push({
          description: '13ª Mensilità',
          amount: report.salary13 ?? 0,
          year: report.year,
          month: report.month,
          type: 'income'
        })
      }

      // Cerco la quattordicesima
      if ((report.salary14 ?? 0) > 0 && ('14esima'.includes(query) || 'quattordicesima'.includes(query))) {
        results.push({
          description: '14ª Mensilità',
          amount: report.salary14 ?? 0,
          year: report.year,
          month: report.month,
          type: 'income'
        })
      }
    }

    return results.sort((a, b) => new Date(b.year, b.month - 1).getTime() - new Date(a.year, a.month - 1).getTime())
  })

  totalExpenses = computed(() => {
    return this.searchResults()
      .filter(r => r.type === 'expense')
      .reduce((sum, r) => sum + r.amount, 0)
  })

  totalIncomes = computed(() => {
    return this.searchResults()
      .filter(r => r.type === 'income')
      .reduce((sum, r) => sum + r.amount, 0)
  })

  getMonthName(month: number): string {
    return this.monthNames[month - 1] || ''
  }

  requestNavigation(result: SearchResult) {
    this.selectedResult.set(result)
    this.showConfirm.set(true)
  }

  cancelNavigation() {
    this.showConfirm.set(false)
    this.selectedResult.set(null)
  }

  confirmNavigation() {
    const result = this.selectedResult()
    if (result) {
      const monthYear = `${result.year}-${result.month.toString().padStart(2, '0')}`
      this.storageService.activeMonthYear.set(monthYear)
      this.navigateToMonthlyView.emit()
    }
    this.cancelNavigation()
  }
}
