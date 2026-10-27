import { MonthlyReport } from '../../models/financial-data.model'

export function liquidityValue(report: MonthlyReport | undefined): number | null {
  return report && (report.balance !== 0 || report.balanceRecorded) ? report.balance : null
}

export function calculateFinancialSummary(report: MonthlyReport, next: MonthlyReport | undefined) {
  const cents = (value: number | null | undefined) => value == null ? null : Math.round(value * 100)
  const euros = (value: number | null) => value === null ? null : value / 100
  const cash = cents(liquidityValue(report))
  const endCash = cents(liquidityValue(next))
  const investments = cents(report.investmentValue)
  const endInvestments = cents(next?.investmentValue)
  const flows = cents(report.investmentNetFlow)
  const opening = cash === null || investments === null ? null : cash + investments
  const closing = endCash === null || endInvestments === null ? null : endCash + endInvestments
  const savings = cash === null || endCash === null || flows === null ? null : endCash - cash + flows
  const investmentResult = investments === null || endInvestments === null || flows === null ? null : endInvestments - investments - flows
  return {
    openingTotal: euros(opening),
    closingTotal: euros(closing),
    wealthChange: euros(opening === null || closing === null ? null : closing - opening),
    savings: euros(savings),
    investmentResult: euros(investmentResult)
  }
}
