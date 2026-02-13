import { Injectable, signal, WritableSignal } from '@angular/core'
import { AppData, CalculatorItem, MonthlyReport } from '../models/financial-data.model'
import { SupabaseService } from './supabase.service'

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  // Mantengo la struttura a signal per compatibilità con i componenti esistenti
  appData: WritableSignal<AppData> = signal({ reports: [], globalNotes: '', calculatorItems: [] })
  activeMonthYear = signal<string>(new Date().toISOString().substring(0, 7))
  initialized = signal(false)

  constructor(private supabase: SupabaseService) {
    // Mi iscrivo ai flussi dati di Supabase per aggiornare lo stato locale
    this.supabase.reports$.subscribe(reports => {
      this.appData.update(current => ({ ...current, reports }))
    })

    this.supabase.globalNotes$.subscribe(globalNotes => {
      this.appData.update(current => ({ ...current, globalNotes }))
    })

    this.supabase.calculatorItems$.subscribe(calculatorItems => {
      this.appData.update(current => ({ ...current, calculatorItems }))
    })
  }

  // Trovo il mese ideale per l'apertura: se il corrente ha già il payday, propongo il prossimo
  getFirstIncompleteMonth(): string {
    const reports = this.appData().reports
    const today = new Date()
    const currentYear = today.getFullYear()
    const currentMonth = today.getMonth() + 1 // 1-12

    // Cerco se esiste già il report per il mese corrente e se è stato impostato il payday
    const currentReport = reports.find(r => r.year === currentYear && r.month === currentMonth)

    if (currentReport && currentReport.payday) {
      // Se il mese corrente è già "chiuso" col payday, suggerisco di aprire il mese prossimo
      const nextMonthDate = new Date(currentYear, currentMonth, 1) // currentMonth è 1-based, JS Date con (year, 1-based-month, 1) punta al mese dopo
      return `${nextMonthDate.getFullYear()}-${(nextMonthDate.getMonth() + 1).toString().padStart(2, '0')}`
    }

    // Altrimenti cerco se c'è un mese nel passato o futuro che non ha il payday, partendo dal più recente
    const sortedDesc = [...reports].sort((a, b) =>
      new Date(b.year, b.month - 1).getTime() - new Date(a.year, a.month - 1).getTime()
    )

    const firstIncomplete = sortedDesc.find(r => !r.payday)
    if (firstIncomplete) {
      return `${firstIncomplete.year}-${firstIncomplete.month.toString().padStart(2, '0')}`
    }

    // Se non trovo nulla, apro sul mese corrente
    return `${currentYear}-${currentMonth.toString().padStart(2, '0')}`
  }

  getReport(year: number, month: number): MonthlyReport | undefined {
    return this.appData().reports.find(r => r.year === year && r.month === month)
  }

  // Aggiorno un report con update ottimistico locale + sync su Supabase
  async updateReport(report: MonthlyReport) {
    this.appData.update(data => {
      const index = data.reports.findIndex(r => r.year === report.year && r.month === report.month)
      const reports = [...data.reports]
      if (index > -1) {
        reports[index] = report
      } else {
        reports.push(report)
      }
      // Ordino i reports per data per consistenza
      reports.sort((a, b) => new Date(b.year, b.month - 1).getTime() - new Date(a.year, a.month - 1).getTime())
      return { ...data, reports }
    })

    try {
      await this.supabase.upsertReport(report)
    } catch (e) {
      console.error('Errore nella sincronizzazione del report su Supabase:', e)
    }
  }

  // Importo una serie di reports (usato per l'import AI e il restore backup)
  async importData(reports: MonthlyReport[]) {
    for (const report of reports) {
      const reportToSave = {
        ...report,
        expenses: report.expenses?.map(e => ({ ...e, id: e.id || crypto.randomUUID() })) || []
      }
      await this.updateReport(reportToSave)
    }
  }

  async updateGlobalNotes(notes: string) {
    this.appData.update(data => ({ ...data, globalNotes: notes }))
    try {
      await this.supabase.updateGlobalNotes(notes)
    } catch (e) {
      console.error('Errore nella sincronizzazione delle note globali:', e)
    }
  }

  async updateCalculatorItems(items: CalculatorItem[]) {
    this.appData.update(data => ({ ...data, calculatorItems: items }))
    try {
      await this.supabase.updateCalculatorItems(items)
    } catch (e) {
      console.error('Errore nella sincronizzazione del calcolatore:', e)
    }
  }

  // Ripristino completo da un file di backup
  async restoreBackup(data: AppData) {
    if (data.reports && Array.isArray(data.reports)) {
      await this.importData(data.reports)
    }

    if (data.globalNotes) {
      await this.updateGlobalNotes(data.globalNotes)
    }

    if (data.calculatorItems && Array.isArray(data.calculatorItems)) {
      await this.updateCalculatorItems(data.calculatorItems)
    }
  }
}