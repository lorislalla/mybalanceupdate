import { Component, ChangeDetectionStrategy, inject, signal, computed, output } from '@angular/core';
import { CommonModule, DatePipe, formatCurrency, getLocaleCurrencySymbol } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StorageService } from '../../services/storage.service';
import { MonthlyReport } from '../../models/financial-data.model';
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
} from "ng-apexcharts";

export type ChartOptions = {
  series: ApexAxisChartSeries;
  chart: ApexChart;
  xaxis: ApexXAxis;
  yaxis: ApexYAxis;
  stroke: ApexStroke;
  tooltip: ApexTooltip;
  dataLabels: ApexDataLabels;
  grid: ApexGrid;
  markers: ApexMarkers;
  theme: ApexTheme;
  fill: ApexFill;
  colors: string[];
};

interface ChartDataPoint {
  date: Date;
  balance: number;
  label?: string;
}




@Component({
  selector: 'app-summary-view',
  templateUrl: './summary-view.component.html',
  providers: [DatePipe],
  standalone: true,
  imports: [CommonModule, FormsModule, NgApexchartsModule],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SummaryViewComponent {
  private storageService = inject(StorageService);
  private datePipe: DatePipe = inject(DatePipe);

  navigateToMonthlyView = output<void>();

  showConfirm = signal(false);
  selectedMonth = signal<{ year: number, month: number } | null>(null);
  selectedMonthLabel = signal('');

  // Chart expansion state
  expandedCharts = signal<Record<string, boolean>>({
    'overall': false,
    'last12': false,
    'salary': false,
    'outgoings': false
  });

  toggleChart(chartId: string) {
    this.expandedCharts.update(prev => ({
      ...prev,
      [chartId]: !prev[chartId]
    }));
  }

  reports = computed(() => {
    return this.storageService.appData().reports
      .filter(r => r.balance > 0)
      .sort((a, b) => new Date(a.year, a.month - 1).getTime() - new Date(b.year, b.month - 1).getTime());
  });

  salaryReports = computed(() => {
    // For salary chart, we might want even months with 0 balance if salary is set?
    // But consistency with other charts implies we use same filter or just all?
    // Let's use all reports that have salary > 0
    return this.storageService.appData().reports
      .filter(r => (r.salary || 0) > 0)
      .sort((a, b) => new Date(a.year, a.month - 1).getTime() - new Date(b.year, b.month - 1).getTime());
  });

  chartData = computed<ChartDataPoint[]>(() => {
    return this.reports().map(r => ({
      date: new Date(r.year, r.month - 1),
      balance: r.balance
    }));
  });

  salaryChartData = computed<ChartDataPoint[]>(() => {
    const points: ChartDataPoint[] = [];
    for (const r of this.salaryReports()) {
      // Calculate previous month label
      let prevMonth = r.month - 1;
      let prevYear = r.year;
      if (prevMonth === 0) {
        prevMonth = 12;
        prevYear -= 1;
      }

      points.push({
        date: new Date(r.year, r.month - 1, 1),
        balance: r.salary || 0,
        label: `Stipendio ${prevMonth}/${prevYear}`
      });
    }
    return points.sort((a, b) => a.date.getTime() - b.date.getTime());
  });

  outgoingsChartData = computed<ChartDataPoint[]>(() => {
    return this.reports()
      .map(r => ({
        date: new Date(r.year, r.month - 1),
        balance: r.expenses.reduce((sum, exp) => sum + exp.amount, 0)
      }))
      .filter(p => p.balance > 0);
  });

  last12MonthsChartData = computed<ChartDataPoint[]>(() => {
    const today = new Date();
    // Start from the first day of the month, 11 months ago to get a 12-month window
    const startDate = new Date(today.getFullYear(), today.getMonth() - 11, 1);

    return this.reports()
      .filter(r => new Date(r.year, r.month - 1) >= startDate)
      .map(r => ({
        date: new Date(r.year, r.month - 1),
        balance: r.balance
      }));
  });



  private commonChartOptions: Partial<ChartOptions> = {
    chart: {
      height: 350,
      type: "area",
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
    stroke: { curve: "smooth", width: 3 },
    grid: {
      borderColor: "#374151",
      strokeDashArray: 4,
      padding: { left: 20, right: 20 }
    },
    markers: {
      size: 5,
      strokeWidth: 3,
      strokeColors: "#111827",
      hover: { size: 7 }
    },
    theme: { mode: "dark" },
    fill: {
      type: "gradient",
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.45,
        opacityTo: 0.01,
        stops: [0, 100]
      }
    }
  };

  outgoingsSMAData = computed<ChartDataPoint[]>(() => {
    const data = this.outgoingsChartData();
    const period = 12;
    return data.map((point, i) => {
      const window = data.slice(Math.max(0, i - period + 1), i + 1);
      const sum = window.reduce((acc, d) => acc + d.balance, 0);
      return {
        date: point.date,
        balance: sum / window.length,
        label: `Media Mobile (12m)`
      };
    });
  });

  overallChartOptions = computed(() => this.buildOptions(
    [{ name: "Saldo Totale", data: this.chartData(), color: "#6366f1" }],
    { startFromZero: true }
  ));

  last12ChartOptions = computed(() => this.buildOptions(
    [{ name: "Ultimi 12 Mesi", data: this.last12MonthsChartData(), color: "#10b981" }],
    { startFromZero: true }
  ));

  salaryChartOptions = computed(() => this.buildOptions(
    [{ name: "Entrate Mensili", data: this.salaryChartData(), color: "#f59e0b" }],
    { extraPadding: true }
  ));

  outgoingsChartOptions = computed(() => this.buildOptions(
    [
      { name: "Uscite Mensili", data: this.outgoingsChartData(), color: "#f87171" },
      { name: "Media Mobile (12m)", data: this.outgoingsSMAData(), color: "#ffffff", type: 'line' }
    ],
    { extraPadding: true }
  ));

  private buildOptions(
    seriesConfigs: { name: string, data: ChartDataPoint[], color: string, type?: string }[],
    yAxisConfig: { startFromZero?: boolean, extraPadding?: boolean } = {}
  ): Partial<ChartOptions> {
    const series = seriesConfigs.map(config => ({
      name: config.name,
      type: config.type || 'area',
      data: config.data.map(d => ({
        x: d.date.getTime(),
        y: d.balance
      }))
    }));

    const colors = seriesConfigs.map(c => c.color);
    const primaryData = seriesConfigs[0].data;

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
          style: { colors: "#9ca3af", fontSize: '10px' },
          datetimeFormatter: {
            year: 'yyyy',
            month: 'MMM \'yy',
            day: 'dd MMM',
            hour: 'HH:mm'
          }
        },
        tooltip: { enabled: false }
      },
      yaxis: {
        labels: {
          style: { colors: "#9ca3af", fontSize: '10px' },
          formatter: (val) => `${(val / 1000).toFixed(1)}k`
        },
        min: (min: number) => {
          if (yAxisConfig.startFromZero) return 0;
          if (yAxisConfig.extraPadding) {
            // Find max to calculate range across all series
            const allData = seriesConfigs.flatMap(c => c.data);
            const maxVal = allData.length > 0 ? Math.max(...allData.map(d => d.balance)) : 0;
            const range = maxVal - min;
            return Math.max(0, min - (range * 0.4 + 200));
          }
          return min;
        },
        max: (max: number) => {
          if (yAxisConfig.extraPadding) {
            const allData = seriesConfigs.flatMap(c => c.data);
            const minVal = allData.length > 0 ? Math.min(...allData.map(d => d.balance)) : 0;
            const range = max - minVal;
            return max + (range * 0.2 + 100);
          }
          return max;
        }
      },
      tooltip: {
        theme: "dark",
        shared: true,
        intersect: false,
        x: {
          format: 'MMMM yyyy'
        },
        y: {
          formatter: (val) => formatCurrency(val, 'it-IT', getLocaleCurrencySymbol('it-IT')!)
        }
      },
      chart: {
        ...this.commonChartOptions.chart,
        events: {
          markerClick: (event: any, chartContext: any, { seriesIndex, dataPointIndex }: any) => {
            if (seriesIndex === 0) {
              const point = primaryData[dataPointIndex];
              if (point) {
                this.handlePointClick(point);
              }
            }
          }
        }
      } as any
    };
  }

  private handlePointClick(point: ChartDataPoint) {
    const year = point.date.getFullYear();
    const month = point.date.getMonth() + 1;
    this.selectedMonth.set({ year, month });
    this.selectedMonthLabel.set(this.datePipe.transform(point.date, 'MMMM yyyy') || '');
    this.showConfirm.set(true);
  }

  cancelNavigation() {
    this.showConfirm.set(false);
    this.selectedMonth.set(null);
  }

  confirmNavigation() {
    const target = this.selectedMonth();
    if (target) {
      const monthYear = `${target.year}-${target.month.toString().padStart(2, '0')}`;
      this.storageService.activeMonthYear.set(monthYear);
      this.navigateToMonthlyView.emit();
    }
    this.cancelNavigation();
  }
}
