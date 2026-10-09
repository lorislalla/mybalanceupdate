import { Component, ChangeDetectionStrategy, ElementRef, computed, inject, output, signal, viewChild } from '@angular/core'
import { StorageService } from '../../services/storage.service'
import { ChartPreferencesService } from './chart-preferences.service'
import { CHART_IDS, ChartPoint } from './chart-data'
import { FinancialChartComponent } from './financial-chart.component'

@Component({
  selector: 'app-summary-view',
  templateUrl: './summary-view.component.html',
  styleUrl: './summary-view.component.css',
  imports: [FinancialChartComponent],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SummaryViewComponent {
  private storageService = inject(StorageService)
  preferences = inject(ChartPreferencesService)
  navigateToMonthlyView = output<void>()
  chartIds = CHART_IDS
  reports = computed(() => this.storageService.appData().reports)
  selectedMonth = signal<ChartPoint | null>(null)
  monthDialog = viewChild.required<ElementRef<HTMLDialogElement>>('monthDialog')
  selectedMonthLabel = computed(() => {
    const point = this.selectedMonth()
    return point ? new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' }).format(point.x) : ''
  })
  statusText = computed(() => {
    switch (this.preferences.status()) {
      case 'saving': return 'Salvataggio nell’account…'
      case 'synced': return 'Impostazioni salvate nell’account'
      case 'local': return 'Ospite · impostazioni salvate in questo browser'
      case 'error': return 'Salvate in questo browser · sincronizzazione da completare'
      case 'unsaved': return 'Salvataggio non riuscito: impostazioni attive solo fino alla chiusura'
      default: return this.preferences.guest() ? 'Ospite · le impostazioni si salvano in questo browser' : 'Le impostazioni si salvano nel tuo account'
    }
  })
  openMonth(point: ChartPoint) {
    this.selectedMonth.set(point)
    this.monthDialog().nativeElement.showModal()
  }
  cancelNavigation() { this.monthDialog().nativeElement.close() }
  confirmNavigation() {
    const point = this.selectedMonth()
    if (!point) return
    this.storageService.activeMonthYear.set(`${point.year}-${String(point.month).padStart(2, '0')}`)
    this.monthDialog().nativeElement.close()
    this.navigateToMonthlyView.emit()
  }
}
