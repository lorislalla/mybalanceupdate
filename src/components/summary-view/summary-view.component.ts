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
  selectedMonth = signal<{year: number, month: number} | null>(null);
  selectedMonthLabel = signal('');
  
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

  overallChartOptions = computed(() => this.buildOptions(
    "Saldo Totale", 
    this.chartData(), 
    "#6366f1",
    true
  ));

  last12ChartOptions = computed(() => this.buildOptions(
    "Ultimi 12 Mesi", 
    this.last12MonthsChartData(), 
    "#10b981",
    false
  ));

  salaryChartOptions = computed(() => this.buildOptions(
    "Entrate Mensili", 
    this.salaryChartData(), 
    "#f59e0b",
    false
  ));

  private buildOptions(name: string, data: ChartDataPoint[], color: string, startFromZero: boolean): Partial<ChartOptions> {
    const seriesData = data.map(d => ({
      x: d.date.getTime(),
      y: d.balance
    }));

    return {
      ...this.commonChartOptions,
      series: [{ name, data: seriesData }],
      colors: [color],
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
        min: startFromZero ? 0 : undefined
      },
      tooltip: {
        theme: "dark",
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
          markerClick: (event: any, chartContext: any, { dataPointIndex }: any) => {
            const point = data[dataPointIndex];
            if (point) {
               this.handlePointClick(point);
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
