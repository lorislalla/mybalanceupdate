import { Component, ChangeDetectionStrategy, inject, signal, computed, output } from '@angular/core'
import { CommonModule, DatePipe, formatCurrency, getLocaleCurrencySymbol } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { StorageService } from '../../services/storage.service'
import { MonthlyReport } from '../../models/financial-data.model'
import {
  NgApexchartsModule,
  ApexAxisChartSeries,
  ApexChart,
  ApexXAxis,
  ApexDataLabels,
  ApexTooltip,
  ApexStroke,
  ApexGrid,
  ApexYAxis,
  ApexMarkers,
  ApexTheme,
  ApexFill
} from 'ng-apexcharts'

// Configurazione completa per i grafici ApexCharts
export type ChartOptions = {
  series: ApexAxisChartSeries
  chart: ApexChart
  xaxis: ApexXAxis
  yaxis: ApexYAxis
  stroke: ApexStroke
  tooltip: ApexTooltip
  dataLabels: ApexDataLabels
  grid: ApexGrid
  markers: ApexMarkers
  theme: ApexTheme
  fill: ApexFill
  colors: string[]
}

// Punto dati per i grafici
interface ChartDataPoint {
  date: Date
  balance: number
  label?: string
}

// Configurazione per una singola serie dati del grafico
interface SeriesConfig {
  name: string
  data: ChartDataPoint[]
  color: string
  type?: string
}

// Opzioni per l'asse Y
interface YAxisConfig {
  startFromZero?: boolean
  extraPadding?: boolean
}

@Component({
  selector: 'app-summary-view',
  templateUrl: './summary-view.component.html',
  providers: [DatePipe],
  imports: [CommonModule, FormsModule, NgApexchartsModule],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SummaryViewComponent {
  private storageService = inject(StorageService)
  private datePipe: DatePipe = inject(DatePipe)

  navigateToMonthlyView = output<void>()

  showConfirm = signal(false)
  selectedMonth = signal<{ year: number, month: number } | null>(null)
  selectedMonthLabel = signal('')

  // Stato di espansione/compressione dei grafici
  expandedCharts = signal<Record<string, boolean>>({
    'overall': false,
    'last12': false,
    'salary': false,
    'outgoings': false
  })

  toggleChart(chartId: string) {
    this.expandedCharts.update(prev => ({
      ...prev,
      [chartId]: !prev[chartId]
    }))
  }

  // Filtro i reports con saldo > 0 e li ordino cronologicamente
  reports = computed(() => {
    return this.storageService.appData().reports
      .filter(r => r.balance > 0)
      .sort((a, b) => new Date(a.year, a.month - 1).getTime() - new Date(b.year, b.month - 1).getTime())
  })

  // Reports con stipendio > 0 per il grafico delle entrate
  salaryReports = computed(() => {
    return this.storageService.appData().reports
      .filter(r => (r.salary || 0) > 0)
      .sort((a, b) => new Date(a.year, a.month - 1).getTime() - new Date(b.year, b.month - 1).getTime())
  })

  chartData = computed<ChartDataPoint[]>(() => {
    return this.reports().map(r => ({
      date: new Date(r.year, r.month - 1),
      balance: r.balance
    }))
  })

  salaryChartData = computed<ChartDataPoint[]>(() => {
    const points: ChartDataPoint[] = []
    for (const r of this.salaryReports()) {
      // Calcolo il label del mese precedente (lo stipendio si riferisce al mese prima)
      let prevMonth = r.month - 1
      let prevYear = r.year
      if (prevMonth === 0) {
        prevMonth = 12
        prevYear -= 1
      }

      points.push({
        date: new Date(r.year, r.month - 1, 1),
        balance: r.salary || 0,
        label: `Stipendio ${prevMonth}/${prevYear}`
      })
    }
    return points.sort((a, b) => a.date.getTime() - b.date.getTime())
  })

  outgoingsChartData = computed<ChartDataPoint[]>(() => {
    return this.reports()
      .map(r => ({
        date: new Date(r.year, r.month - 1),
        balance: r.expenses.reduce((sum, exp) => sum + exp.amount, 0)
      }))
      .filter(p => p.balance > 0)
  })

  // Filtro gli ultimi 12 mesi per il grafico dettagliato
  last12MonthsChartData = computed<ChartDataPoint[]>(() => {
    const today = new Date()
    const startDate = new Date(today.getFullYear(), today.getMonth() - 11, 1)

    return this.reports()
      .filter(r => new Date(r.year, r.month - 1) >= startDate)
      .map(r => ({
        date: new Date(r.year, r.month - 1),
        balance: r.balance
      }))
  })

  // Opzioni comuni condivise tra tutti i grafici
  private commonChartOptions: Partial<ChartOptions> = {
    chart: {
      height: 350,
      type: 'area',
      fontFamily: 'Inter, sans-serif',
      toolbar: {
        show: true,
        tools: {
          download: false,
          selection: true,
          zoom: true,
          zoomin: true,
          zoomout: true,
          pan: true,
          reset: true
        },
        autoSelected: 'zoom'
      },
      zoom: {
        enabled: true,
        type: 'x',
        autoScaleYaxis: true
      }
    },
    dataLabels: { enabled: false },
    stroke: { curve: 'smooth', width: 3 },
    grid: {
      borderColor: '#374151',
      strokeDashArray: 4,
      padding: { left: 20, right: 20 }
    },
    markers: {
      size: 5,
      strokeWidth: 3,
      strokeColors: '#111827',
      hover: { size: 7 }
    },
    theme: { mode: 'dark' },
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.45,
        opacityTo: 0.01,
        stops: [0, 100]
      }
    }
  }

  // Calcolo la media mobile a 12 mesi per le spese
  outgoingsSMAData = computed<ChartDataPoint[]>(() => {
    const data = this.outgoingsChartData()
    const period = 12
    return data.map((point, i) => {
      const window = data.slice(Math.max(0, i - period + 1), i + 1)
      const sum = window.reduce((acc, d) => acc + d.balance, 0)
      return {
        date: point.date,
        balance: sum / window.length,
        label: `Media Mobile (12m)`
      }
    })
  })

  overallChartOptions = computed(() => this.buildOptions(
    [{ name: 'Saldo Totale', data: this.chartData(), color: '#6366f1' }],
    { startFromZero: true }
  ))

  last12ChartOptions = computed(() => this.buildOptions(
    [{ name: 'Ultimi 12 Mesi', data: this.last12MonthsChartData(), color: '#10b981' }],
    { startFromZero: true }
  ))

  salaryChartOptions = computed(() => this.buildOptions(
    [{ name: 'Entrate Mensili', data: this.salaryChartData(), color: '#f59e0b' }],
    { extraPadding: true }
  ))

  outgoingsChartOptions = computed(() => this.buildOptions(
    [
      { name: 'Uscite Mensili', data: this.outgoingsChartData(), color: '#f87171' },
      { name: 'Media Mobile (12m)', data: this.outgoingsSMAData(), color: '#ffffff', type: 'line' }
    ],
    { extraPadding: true }
  ))

  // Costruisco le opzioni complete per un grafico a partire dalle serie e dalla configurazione dell'asse Y
  private buildOptions(
    seriesConfigs: SeriesConfig[],
    yAxisConfig: YAxisConfig = {}
  ): Partial<ChartOptions> {
    const series = seriesConfigs.map(config => ({
      name: config.name,
      type: config.type || 'area',
      data: config.data.map(d => ({
        x: d.date.getTime(),
        y: d.balance
      }))
    }))

    const colors = seriesConfigs.map(c => c.color)
    const primaryData = seriesConfigs[0].data

    const chartConfig: Partial<ApexChart> = {
      ...this.commonChartOptions.chart,
      events: {
        markerClick: (_event: unknown, _chartContext: unknown, opts: { seriesIndex: number, dataPointIndex: number }) => {
          if (opts.seriesIndex === 0) {
            const point = primaryData[opts.dataPointIndex]
            if (point) {
              this.handlePointClick(point)
            }
          }
        }
      }
    }

    return {
      ...this.commonChartOptions,
      series,
      colors,
      stroke: {
        ...this.commonChartOptions.stroke,
        dashArray: seriesConfigs.map(c => c.type === 'line' ? 5 : 0)
      },
      markers: {
        ...this.commonChartOptions.markers,
        size: seriesConfigs.map(c => c.type === 'line' ? 0 : 5)
      },
      fill: {
        ...this.commonChartOptions.fill,
        type: seriesConfigs.map(c => c.type === 'line' ? 'solid' : 'gradient'),
        opacity: seriesConfigs.map(c => c.type === 'line' ? 1 : 0.45)
      },
      xaxis: {
        type: 'datetime',
        axisBorder: { show: false },
        axisTicks: { show: false },
        labels: {
          style: { colors: '#9ca3af', fontSize: '10px' },
          datetimeFormatter: {
            year: 'yyyy',
            month: "MMM 'yy",
            day: 'dd MMM',
            hour: 'HH:mm'
          }
        },
        tooltip: { enabled: false }
      },
      yaxis: {
        labels: {
          style: { colors: '#9ca3af', fontSize: '10px' },
          formatter: (val: number) => `${(val / 1000).toFixed(1)}k`
        },
        min: (min: number) => {
          if (yAxisConfig.startFromZero) return 0
          if (yAxisConfig.extraPadding) {
            const allData = seriesConfigs.flatMap(c => c.data)
            const maxVal = allData.length > 0 ? Math.max(...allData.map(d => d.balance)) : 0
            const range = maxVal - min
            return Math.max(0, min - (range * 0.4 + 200))
          }
          return min
        },
        max: (max: number) => {
          if (yAxisConfig.extraPadding) {
            const allData = seriesConfigs.flatMap(c => c.data)
            const minVal = allData.length > 0 ? Math.min(...allData.map(d => d.balance)) : 0
            const range = max - minVal
            return max + (range * 0.2 + 100)
          }
          return max
        }
      },
      tooltip: {
        theme: 'dark',
        shared: true,
        intersect: false,
        x: {
          format: 'MMMM yyyy'
        },
        y: {
          formatter: (val: number) => formatCurrency(val, 'it-IT', getLocaleCurrencySymbol('it-IT')!)
        }
      },
      chart: chartConfig as ApexChart
    }
  }

  // Gestisco il click su un punto del grafico per navigare al mese corrispondente
  private handlePointClick(point: ChartDataPoint) {
    const year = point.date.getFullYear()
    const month = point.date.getMonth() + 1
    this.selectedMonth.set({ year, month })
    this.selectedMonthLabel.set(this.datePipe.transform(point.date, 'MMMM yyyy') || '')
    this.showConfirm.set(true)
  }

  cancelNavigation() {
    this.showConfirm.set(false)
    this.selectedMonth.set(null)
  }

  confirmNavigation() {
    const target = this.selectedMonth()
    if (target) {
      const monthYear = `${target.year}-${target.month.toString().padStart(2, '0')}`
      this.storageService.activeMonthYear.set(monthYear)
      this.navigateToMonthlyView.emit()
    }
    this.cancelNavigation()
  }
}
