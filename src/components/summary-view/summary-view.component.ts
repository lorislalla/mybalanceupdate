import { Component, ChangeDetectionStrategy, inject, signal, computed, ElementRef, viewChild, effect } from '@angular/core';
import { CommonModule, DatePipe, formatCurrency, getLocaleCurrencySymbol } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StorageService } from '../../services/storage.service';
import { MonthlyReport, Expense } from '../../models/financial-data.model';

declare var d3: any;

interface ChartDataPoint {
  date: Date;
  balance: number;
}

interface SearchResult {
  description: string;
  amount: number;
  year: number;
  month: number;
}


@Component({
  selector: 'app-summary-view',
  templateUrl: './summary-view.component.html',
  providers: [DatePipe],
  imports: [CommonModule, FormsModule]
})
export class SummaryViewComponent {
  private storageService = inject(StorageService);
  // FIX: Explicitly type `datePipe` to `DatePipe` to resolve type inference issue.
  private datePipe: DatePipe = inject(DatePipe);
  
  chartContainer = viewChild<ElementRef>('chartContainer');
  last12MonthsChartContainer = viewChild<ElementRef>('last12MonthsChartContainer');
  
  reports = computed(() => {
    return this.storageService.appData().reports
      .filter(r => r.balance > 0)
      .sort((a, b) => new Date(a.year, a.month - 1).getTime() - new Date(b.year, b.month - 1).getTime());
  });

  chartData = computed<ChartDataPoint[]>(() => {
    return this.reports().map(r => ({
      date: new Date(r.year, r.month - 1),
      balance: r.balance
    }));
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

  // --- Search Functionality ---
  searchQuery = signal('');
  
  private monthNames = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  
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
    
    // Sort results by date descending
    return allExpenses.sort((a, b) => new Date(b.year, b.month - 1).getTime() - new Date(a.year, a.month - 1).getTime());
  });
  
  getMonthName(month: number): string {
    return this.monthNames[month - 1] || '';
  }
  // --- End Search Functionality ---

  constructor() {
    effect(() => {
      this.drawGenericChart(this.chartData(), this.chartContainer(), { isLast12Months: false });
    });
    effect(() => {
      this.drawGenericChart(this.last12MonthsChartData(), this.last12MonthsChartContainer(), { isLast12Months: true });
    });
  }
  
  private drawGenericChart(data: ChartDataPoint[], chartContainer: ElementRef | undefined, options: { isLast12Months: boolean }) {
    if (!chartContainer || data.length < 2) {
       if (chartContainer) {
         d3.select(chartContainer.nativeElement).select('svg').remove();
       }
       return;
    };

    const el = chartContainer.nativeElement;
    d3.select(el).select('svg').remove(); // Clear previous chart

    const margin = { top: 20, right: 30, bottom: 50, left: 60 };
    const width = el.clientWidth - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;

    const svg = d3.select(el)
      .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
      .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);
        
    // --- Scale ---
    const x = d3.scaleTime()
      .domain(d3.extent(data, (d: ChartDataPoint) => d.date) as [Date, Date])
      .range([0, width]);

    const y = d3.scaleLinear()
      .domain([0, d3.max(data, (d: ChartDataPoint) => d.balance * 1.1) || 1000])
      .range([height, 0]);

    // --- Clipping ---
    // Unique ID for clip path
    const clipId = 'clip-' + (options.isLast12Months ? 'last12' : 'full') + '-' + Math.random().toString(36).substr(2, 9);
    
    svg.append("defs").append("clipPath")
        .attr("id", clipId)
        .append("rect")
        .attr("width", width)
        .attr("height", height);

    // --- Axes ---
    let xAxis = d3.axisBottom(x);
    if (options.isLast12Months) {
       xAxis.ticks(d3.timeMonth.every(1)).tickFormat(d3.timeFormat("%b"));
    } else {
      const timeDomain = d3.extent(data, (d: ChartDataPoint) => d.date);
      const months = timeDomain ? d3.timeMonth.count(timeDomain[0], timeDomain[1]) : 0;
    
      if (months <= 24) {
        xAxis.ticks(d3.timeMonth.every(2)).tickFormat(d3.timeFormat("%b %y"));
      } else if (months <= 60) {
        xAxis.ticks(d3.timeMonth.every(6)).tickFormat(d3.timeFormat("%b %y"));
      } else {
        xAxis.ticks(d3.timeYear.every(1)).tickFormat(d3.timeFormat("%Y"));
      }
    }

    const xAxisGroup = svg.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0, ${height})`)
      .call(xAxis);
      
    xAxisGroup.selectAll("text")
        .style("fill", "#9ca3af")
        .style("font-size", "11px");

    const yAxis = d3.axisLeft(y).tickFormat((d: number) => `${d/1000}k`);
    
    svg.append('g')
      .attr('class', 'y-axis')
      .call(yAxis)
      .selectAll("text")
        .style("fill", "#9ca3af")
        .style("font-size", "11px");

    // --- Line & Circles Group (Clipped) ---
    const chartBody = svg.append('g')
        .attr("clip-path", `url(#${clipId})`);

    const line = d3.line()
      .x((d: ChartDataPoint) => x(d.date))
      .y((d: ChartDataPoint) => y(d.balance))
      .curve(d3.curveMonotoneX);

    const path = chartBody.append('path')
      .datum(data)
      .attr('class', 'line')
      .attr('fill', 'none')
      .attr('stroke', '#818cf8')
      .attr('stroke-width', 2.5)
      .attr('d', line);

    const circles = chartBody.selectAll('circle')
        .data(data)
        .enter().append('circle')
        .attr('cx', (d: ChartDataPoint) => x(d.date))
        .attr('cy', (d: ChartDataPoint) => y(d.balance))
        .attr('r', 5)
        .style('fill', '#6366f1')
        .attr('stroke', '#1f2937')
        .attr('stroke-width', 2)
        .style('cursor', 'pointer');

    // --- Tooltip ---
    const tooltip = d3.select(el)
      .append("div")
      .attr("class", "chart-tooltip")
      .style("opacity", 0);

    circles
        .on('mouseover', (event: MouseEvent, d: ChartDataPoint) => {
            tooltip.transition().duration(200).style('opacity', 1);
            
            const formattedDate = this.datePipe.transform(d.date, 'MMMM yyyy');
            const formattedBalance = formatCurrency(d.balance, 'it-IT', getLocaleCurrencySymbol('it-IT')!);
            
            tooltip.html(`<strong>${formattedDate}</strong><br/>Saldo: ${formattedBalance}`)
              .style('left', `${event.pageX - el.getBoundingClientRect().left + 15}px`)
              .style('top', `${event.pageY - el.getBoundingClientRect().top - 10}px`);

            d3.select(event.currentTarget as SVGCircleElement)
              .transition().duration(150).attr('r', 7).style('fill', '#a78bfa');
        })
        .on('mouseout', (event: MouseEvent) => {
            tooltip.transition().duration(400).style('opacity', 0);
             d3.select(event.currentTarget as SVGCircleElement)
              .transition().duration(150).attr('r', 5).style('fill', '#6366f1');
        });

    // --- Zoom ---
    const zoom = d3.zoom()
        .scaleExtent([1, 10]) // Max zoom 10x
        .extent([[0, 0], [width, height]])
        .translateExtent([[0, 0], [width, height]]) // Create invisible rect for zoom to work everywhere
        .on("zoom", (event: any) => updateChart(event));

    // Invisible rect to capture zoom events
    svg.append("rect")
        .attr("width", width)
        .attr("height", height)
        .style("fill", "none")
        .style("pointer-events", "all")
        .lower() // Keep behind everything
        .call(zoom);

    function updateChart(event: any) {
        // recover the new scale
        const newX = event.transform.rescaleX(x);

        // update axes with these new boundaries
        xAxis.scale(newX);
        xAxisGroup.call(xAxis as any);
        
        xAxisGroup.selectAll("text")
            .style("fill", "#9ca3af")
            .style("font-size", "11px");

        // update line position
        // @ts-ignore
        line.x((d: ChartDataPoint) => newX(d.date));
        path.attr('d', line);
        
        // update circles
        circles
           .attr('cx', (d: ChartDataPoint) => newX(d.date));
    }
  }
}
