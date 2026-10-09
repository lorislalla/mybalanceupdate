import { MonthlyReport } from '../../models/financial-data.model'

export type ChartId = 'overall' | 'last12' | 'outgoings' | 'salary'
export interface ChartSettings {
  period: 'all' | '6' | '12' | '24' | 'custom'
  from: string
  to: string
  type: 'area' | 'line' | 'bar'
  zeroBaseline: boolean
  showTable: boolean
  expenseLimit: number | null
  excludedTerms: string
  movingAverage: boolean
  averageMonths: 3 | 6 | 12
  includeExtraSalary: boolean
  includeOtherIncome: boolean
}
export interface ChartPreferences {
  version: 1
  updatedAt: number
  charts: Record<ChartId, ChartSettings>
}
export interface ChartPoint {
  x: number
  y: number
  year: number
  month: number
  excludedCount: number
  excludedAmount: number
}
export const CHART_IDS: ChartId[] = ['overall', 'last12', 'outgoings', 'salary']
export function defaultSettings(id: ChartId): ChartSettings {
  return {
    period: 'all', from: '', to: '', type: id === 'salary' || id === 'outgoings' ? 'bar' : 'area',
    zeroBaseline: id === 'outgoings' || id === 'salary', showTable: false,
    expenseLimit: null, excludedTerms: '', movingAverage: true, averageMonths: 12,
    includeExtraSalary: false, includeOtherIncome: false
  }
}
export function defaultPreferences(): ChartPreferences {
  return { version: 1, updatedAt: 0, charts: Object.fromEntries(CHART_IDS.map(id => [id, defaultSettings(id)])) as Record<ChartId, ChartSettings> }
}
const validMonth = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
export function normalizePreferences(value: unknown): ChartPreferences {
  const defaults = defaultPreferences()
  if (!value || typeof value !== 'object' || (value as ChartPreferences).version !== 1) return defaults
  const raw = value as ChartPreferences
  defaults.updatedAt = Number.isFinite(raw.updatedAt) && raw.updatedAt >= 0 ? raw.updatedAt : 0
  for (const id of CHART_IDS) {
    const source = raw.charts?.[id]
    if (!source || typeof source !== 'object') continue
    const setting = defaults.charts[id]
    if (['all', '6', '12', '24', 'custom'].includes(source.period)) setting.period = source.period
    if (validMonth(source.from)) setting.from = source.from
    if (validMonth(source.to)) setting.to = source.to
    if (['area', 'line', 'bar'].includes(source.type)) setting.type = source.type
    for (const key of ['zeroBaseline', 'showTable', 'movingAverage', 'includeExtraSalary', 'includeOtherIncome'] as const) {
      if (typeof source[key] === 'boolean') setting[key] = source[key]
    }
    if (typeof source.expenseLimit === 'number' && Number.isFinite(source.expenseLimit) && source.expenseLimit >= 0) setting.expenseLimit = source.expenseLimit
    if (typeof source.excludedTerms === 'string') setting.excludedTerms = source.excludedTerms.slice(0, 500)
    if ([3, 6, 12].includes(source.averageMonths)) setting.averageMonths = source.averageMonths
  }
  return defaults
}
export function monthIndex(year: number, month: number): number { return year * 12 + month - 1 }
function selectedRange(id: ChartId, settings: ChartSettings, now: Date): [number, number] {
  const end = monthIndex(now.getFullYear(), now.getMonth() + 1)
  if (id === 'last12') return [end - 11, end]
  if (settings.period === 'custom') {
    const index = (value: string) => { const [year, month] = value.split('-').map(Number); return monthIndex(year, month) }
    return [validMonth(settings.from) ? index(settings.from) : -Infinity, validMonth(settings.to) ? index(settings.to) : Infinity]
  }
  return settings.period === 'all' ? [-Infinity, Infinity] : [end - Number(settings.period) + 1, end]
}
export function chartPoints(reports: MonthlyReport[], id: ChartId, settings: ChartSettings, now = new Date()): ChartPoint[] {
  const [start, end] = selectedRange(id, settings, now)
  const terms = settings.excludedTerms.split(',').map(term => term.trim().toLocaleLowerCase('it-IT')).filter(Boolean)
  return reports.filter(report => {
    const month = monthIndex(report.year, report.month)
    return month >= start && month <= end
  }).map(report => {
    let y = report.balance
    let excludedCount = 0
    let excludedAmount = 0
    if (id === 'outgoings') {
      y = 0
      for (const expense of report.expenses || []) {
        const excluded = (settings.expenseLimit !== null && expense.amount > settings.expenseLimit) || terms.some(term => expense.description.toLocaleLowerCase('it-IT').includes(term))
        if (excluded) { excludedCount++; excludedAmount += expense.amount } else { y += expense.amount }
      }
    }
    if (id === 'salary') {
      y = (report.salary || 0) + (settings.includeExtraSalary ? (report.salary13 || 0) + (report.salary14 || 0) : 0)
      if (settings.includeOtherIncome) y += (report.incomes || []).reduce((sum, income) => sum + income.amount, 0)
    }
    // Zero balances are unfilled fields in this app; expense months remain visible even when a filter leaves zero.
    const populated = id === 'outgoings' ? (report.expenses || []).length > 0 : y !== 0
    return populated && Number.isFinite(y) ? {
      x: new Date(report.year, report.month - 1, 1).getTime(), y: Math.round(y * 100) / 100,
      year: report.year, month: report.month, excludedCount, excludedAmount: Math.round(excludedAmount * 100) / 100
    } : null
  }).filter((point): point is ChartPoint => point !== null).sort((a, b) => a.x - b.x)
}
// Calendar windows, not the previous N recorded entries. Missing months are never invented as zero.
export function movingAverage(points: ChartPoint[], months: number): ChartPoint[] {
  return points.map(point => {
    const end = monthIndex(point.year, point.month)
    const window = points.filter(candidate => {
      const index = monthIndex(candidate.year, candidate.month)
      return index > end - months && index <= end
    })
    return { ...point, y: window.reduce((sum, candidate) => sum + candidate.y, 0) / window.length }
  })
}
