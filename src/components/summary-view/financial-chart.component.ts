import { Component, ChangeDetectionStrategy, ElementRef, computed, inject, input, output, signal, viewChild } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { NgApexchartsModule, ApexOptions, ApexAxisChartSeries } from 'ng-apexcharts'
import { MonthlyReport } from '../../models/financial-data.model'
import { MoneyInputDirective } from '../monthly-report/money-input.directive'
import { ChartPreferencesService } from './chart-preferences.service'
import { ChartId, ChartPoint, ChartSettings, chartPoints, defaultSettings, monthIndex, movingAverage } from './chart-data'

const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', useGrouping: true })
const monthLabel = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' })
const shortMonth = new Intl.DateTimeFormat('it-IT', { month: 'short', year: '2-digit' })
const definitions = {
  overall: { title: 'Saldo complessivo', subtitle: 'L’evoluzione del tuo saldo nel tempo', color: '#a5b4fc', metric: 'Ultimo saldo registrato' },
  last12: { title: 'Saldo · ultimi 12 mesi', subtitle: 'Il saldo nei 12 mesi di calendario, fino al mese corrente', color: '#6ee7b7', metric: 'Ultimo saldo del periodo' },
  outgoings: { title: 'Spese mensili', subtitle: 'Le tue uscite, con le esclusioni che scegli tu', color: '#fda4af', metric: 'Ultimo mese registrato' },
  salary: { title: 'Entrate mensili', subtitle: 'Stipendi e, se vuoi, le altre entrate', color: '#fcd34d', metric: 'Ultimo mese registrato' }
}

@Component({
  selector: 'app-financial-chart',
  imports: [CommonModule, FormsModule, NgApexchartsModule, MoneyInputDirective],
  templateUrl: './financial-chart.component.html',
  styleUrl: './financial-chart.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FinancialChartComponent {
  id = input.required<ChartId>()
  reports = input.required<MonthlyReport[]>()
  openMonth = output<ChartPoint>()
  preferences = inject(ChartPreferencesService)
  definition = computed(() => definitions[this.id()])
  settings = computed(() => this.preferences.preferences().charts[this.id()], { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) })
  points = computed(() => chartPoints(this.reports(), this.id(), this.settings()))
  latest = computed(() => this.points().at(-1))
  average = computed(() => this.points().length ? this.points().reduce((sum, point) => sum + point.y, 0) / this.points().length : null)
  change = computed(() => this.points().length > 1 ? this.points().at(-1)!.y - this.points()[0].y : null)
  excluded = computed(() => this.points().reduce((sum, point) => ({ count: sum.count + point.excludedCount, amount: sum.amount + point.excludedAmount }), { count: 0, amount: 0 }))
  hasExpenseFilters = computed(() => this.id() === 'outgoings' && (this.settings().expenseLimit !== null || !!this.settings().excludedTerms.trim()))
  periodLabel = computed(() => {
    const points = this.points()
    if (!points.length) return 'Nessun dato nel periodo'
    return `${shortMonth.format(points[0].x)} — ${shortMonth.format(points.at(-1)!.x)}`
  })
  configureButton = viewChild.required<ElementRef<HTMLButtonElement>>('configureButton')
  editing = signal(false)
  draft = signal<ChartSettings>(defaultSettings('overall'))
  selected = signal('')
  formError = signal('')
  currency(value: number | null | undefined) { return value == null ? '—' : euro.format(value) }
  month(point: ChartPoint) { return monthLabel.format(point.x) }
  key(point: ChartPoint) { return `${point.year}-${String(point.month).padStart(2, '0')}` }

  startEditing() {
    this.draft.set({ ...this.settings() })
    this.formError.set('')
    this.editing.set(true)
  }
  cancelEditing() { this.editing.set(false); this.formError.set(''); this.configureButton().nativeElement.focus() }
  resetDraft() { this.draft.set(defaultSettings(this.id())); this.formError.set('') }
  patchDraft(patch: Partial<ChartSettings>) { this.draft.update(value => ({ ...value, ...patch })) }
  async saveSettings(valid: boolean | null) {
    const draft = this.draft()
    if (!valid || (draft.expenseLimit !== null && draft.expenseLimit < 0)) { this.formError.set('Inserisci una soglia valida, maggiore o uguale a zero.'); return }
    if (this.id() !== 'last12' && draft.period === 'custom' && (!draft.from || !draft.to || draft.from > draft.to)) {
      this.formError.set('Seleziona un mese iniziale e uno finale, in ordine cronologico.'); return
    }
    if (this.preferences.status() === 'saving') return
    // Saving applies only display preferences, never the original reports.
    const saving = this.preferences.save(this.id(), draft)
    this.cancelEditing()
    await saving
  }
  async toggleTable() {
    if (this.preferences.status() !== 'saving') await this.preferences.save(this.id(), { ...this.settings(), showTable: !this.settings().showTable })
  }
  openSelected() {
    const point = this.points().find(point => this.key(point) === this.selected())
    if (point) this.openMonth.emit(point)
  }
  selectionValid = computed(() => this.points().some(point => this.key(point) === this.selected()))

  options = computed<ApexOptions & { series: ApexAxisChartSeries }>(() => {
    const settings = this.settings()
    const points = this.points()
    const color = this.definition().color
    const series: ApexAxisChartSeries = [{ name: this.id() === 'outgoings' ? 'Spese incluse' : this.definition().title, type: settings.type, data: this.seriesData(points, settings.type !== 'bar') }]
    if (this.id() === 'outgoings' && settings.movingAverage && points.length) {
      const history = chartPoints(this.reports(), 'outgoings', { ...settings, period: 'all' })
      const dates = new Set(points.map(point => point.x))
      const averages = movingAverage(history, settings.averageMonths).filter(point => dates.has(point.x))
      series.push({ name: `Media mobile · ${settings.averageMonths} mesi`, type: 'line', data: this.seriesData(averages, true) })
    }
    const values = series.flatMap(item => (item.data as { y: number | null }[]).filter(point => point.y !== null).map(point => point.y!))
    const low = values.length ? Math.min(...values) : 0
    const high = values.length ? Math.max(...values) : 0
    const padding = Math.max((high - low) * 0.15, Math.abs(high) * 0.04, 1)
    const rangeMin = settings.zeroBaseline ? Math.min(0, low - (low < 0 ? padding : 0)) : low - padding
    const rangeMax = settings.zeroBaseline ? Math.max(0, high + padding) : high + padding
    const selectPoint = (_event: unknown, _context: unknown, opts: { seriesIndex: number; dataPointIndex: number }) => {
      if (opts.seriesIndex !== 0) return
      const data = series[0].data as { x: number; y: number | null }[]
      const selected = data[opts.dataPointIndex]
      const point = selected && points.find(point => point.x === selected.x)
      if (point) { this.selected.set(this.key(point)); this.openMonth.emit(point) }
    }
    return {
      series,
      chart: {
        id: `balance-${this.id()}`, type: settings.type, height: 300, width: '100%',
        fontFamily: 'inherit', foreColor: '#aebbd0', background: 'transparent',
        parentHeightOffset: 0, redrawOnParentResize: true, redrawOnWindowResize: true,
        animations: { enabled: false }, toolbar: { show: false }, zoom: { enabled: false },
        events: { dataPointSelection: selectPoint, markerClick: selectPoint },
        locales: [{ name: 'it', options: {
          months: ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'],
          shortMonths: ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'],
          days: ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'], shortDays: ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab']
        } }], defaultLocale: 'it'
      },
      colors: [color, '#e2e8f0'], theme: { mode: 'dark' },
      stroke: { curve: 'straight', width: [settings.type === 'bar' ? 0 : 2.5, 2], dashArray: [0, 6] },
      plotOptions: { bar: { borderRadius: 4, columnWidth: points.length > 18 ? '65%' : '45%' } },
      fill: { type: settings.type === 'area' ? ['gradient', 'solid'] : 'solid', opacity: [settings.type === 'area' ? 0.22 : 0.9, 1], gradient: { opacityFrom: 0.3, opacityTo: 0.02, stops: [0, 100] } },
      markers: { size: [settings.type === 'bar' ? 0 : points.length > 36 ? 2 : 4, 0], strokeColors: '#172233', strokeWidth: 2, hover: { sizeOffset: 2 } },
      dataLabels: { enabled: false }, legend: { show: false },
      grid: { borderColor: '#2a374b', strokeDashArray: 4, padding: { left: 4, right: 12, bottom: 0, top: 0 }, xaxis: { lines: { show: false } } },
      xaxis: {
        type: 'datetime', tickAmount: 5, axisBorder: { show: false }, axisTicks: { show: false },
        labels: { datetimeUTC: false, hideOverlappingLabels: true, style: { fontSize: '11px' }, formatter: (_value: string, timestamp?: number) => timestamp ? shortMonth.format(timestamp) : _value },
        tooltip: { enabled: false }
      },
      yaxis: {
        min: rangeMin, max: rangeMax, tickAmount: 4, forceNiceScale: true,
        labels: { minWidth: 48, maxWidth: 78, style: { fontSize: '11px' }, formatter: value => `${new Intl.NumberFormat('it-IT', { notation: Math.abs(value) >= 10000 ? 'compact' : 'standard', maximumFractionDigits: rangeMax - rangeMin < 10 ? 2 : 1, useGrouping: true }).format(value)} €` }
      },
      tooltip: { theme: 'dark', shared: series.length > 1, intersect: series.length === 1 && settings.type !== 'bar', x: { formatter: value => monthLabel.format(Number(value)) }, y: { formatter: value => this.currency(value) } },
      responsive: [{ breakpoint: 600, options: { chart: { height: 260 }, xaxis: { tickAmount: 3 }, grid: { padding: { left: 0, right: 4 } } } }]
    }
  })
  private seriesData(points: ChartPoint[], gaps: boolean): { x: number; y: number | null }[] {
    return points.flatMap((point, index) => {
      const next = points[index + 1]
      return gaps && next && monthIndex(next.year, next.month) - monthIndex(point.year, point.month) > 1
        ? [{ x: point.x, y: point.y }, { x: new Date(point.year, point.month, 1).getTime(), y: null }]
        : [{ x: point.x, y: point.y }]
    })
  }
}
