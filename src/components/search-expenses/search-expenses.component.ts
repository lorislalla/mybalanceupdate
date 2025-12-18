import { Component, ChangeDetectionStrategy, inject, signal, computed, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StorageService } from '../../services/storage.service';

interface SearchResult {
  description: string;
  amount: number;
  year: number;
  month: number;
}

@Component({
  selector: 'app-search-expenses',
  templateUrl: './search-expenses.component.html',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SearchExpensesComponent {
  private storageService = inject(StorageService);
  private monthNames = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  
  navigateToMonthlyView = output<void>();
  
  showConfirm = signal(false);
  selectedResult = signal<SearchResult | null>(null);
  
  searchQuery = signal('');
  
  searchResults = computed<SearchResult[]>(() => {
    const query = this.searchQuery().trim().toLowerCase();
    if (!query) {
      return [];
    }

    const allExpenses: SearchResult[] = [];
    const allReports = this.storageService.appData().reports;

    for (const report of allReports) {
      for (const expense of report.expenses) {
        if (expense.description.toLowerCase().includes(query)) {
          allExpenses.push({
            description: expense.description,
            amount: expense.amount,
            year: report.year,
            month: report.month
          });
        }
      }
    }
    
    return allExpenses.sort((a, b) => new Date(b.year, b.month - 1).getTime() - new Date(a.year, a.month - 1).getTime());
  });
  
  getMonthName(month: number): string {
    return this.monthNames[month - 1] || '';
  }

  requestNavigation(result: SearchResult) {
    this.selectedResult.set(result);
    this.showConfirm.set(true);
  }

  cancelNavigation() {
    this.showConfirm.set(false);
    this.selectedResult.set(null);
  }

  confirmNavigation() {
    const result = this.selectedResult();
    if (result) {
      const monthYear = `${result.year}-${result.month.toString().padStart(2, '0')}`;
      this.storageService.activeMonthYear.set(monthYear);
      this.navigateToMonthlyView.emit();
    }
    this.cancelNavigation();
  }
}
