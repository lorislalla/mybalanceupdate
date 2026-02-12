import { Injectable } from '@angular/core'
import { createClient, SupabaseClient, User, RealtimeChannel } from '@supabase/supabase-js'
import { environment } from '../environments/environment'
import { MonthlyReport, CalculatorItem } from '../models/financial-data.model'
import { BehaviorSubject } from 'rxjs'

// Interfaccia per la riga della tabella monthly_reports su Supabase
interface MonthlyReportRow {
  user_id: string
  year: number
  month: number
  payday: string
  balance: number
  salary: number
  salary_13: number
  salary_14: number
  incomes: MonthlyReport['incomes']
  expenses: MonthlyReport['expenses']
  notes: string
}

// Interfaccia per la riga della tabella global_notes su Supabase
interface GlobalNotesRow {
  id: string
  user_id: string
  notes: string
}

// Interfaccia per la riga della tabella calculator_data su Supabase
interface CalculatorDataRow {
  id: string
  user_id: string
  items: CalculatorItem[]
}

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient
  private userSubject = new BehaviorSubject<User | null>(null)
  user$ = this.userSubject.asObservable()
  private isGuestSession = false

  private realtimeChannel: RealtimeChannel | null = null
  private reportsSubject = new BehaviorSubject<MonthlyReport[]>([])
  public reports$ = this.reportsSubject.asObservable()

  private globalNotesSubject = new BehaviorSubject<string>('')
  public globalNotes$ = this.globalNotesSubject.asObservable()

  private calculatorItemsSubject = new BehaviorSubject<CalculatorItem[]>([])
  public calculatorItems$ = this.calculatorItemsSubject.asObservable()

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey)
    this.initializeAuth()
  }

  get isGuest(): boolean {
    return this.isGuestSession
  }

  private async initializeAuth() {
    const { data: { session } } = await this.supabase.auth.getSession()
    if (session?.user) {
      this.isGuestSession = false
      this.userSubject.next(session.user)
      this.loadInitialData()
      this.setupRealtimeSubscription()
    }

    this.supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null
      if (user) {
        this.isGuestSession = false
      }
      this.userSubject.next(user)
      if (user) {
        this.loadInitialData()
        this.setupRealtimeSubscription()
      } else if (!this.isGuestSession) {
        this.cleanup()
      }
    })
  }

  async signInWithGoogle() {
    this.isGuestSession = false
    const { error } = await this.supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    })
    if (error) throw error
  }

  async signInAsGuest() {
    this.isGuestSession = true
    // Creo un utente fittizio per attivare l'app
    const guestUser: Partial<User> = {
      id: 'guest-user',
      email: 'guest@example.com',
      user_metadata: { full_name: 'Ospite' },
      aud: 'authenticated',
      role: 'authenticated'
    }
    this.userSubject.next(guestUser as User)
    // Svuoto i dati per la sessione ospite
    this.reportsSubject.next([])
    this.globalNotesSubject.next('')
    this.calculatorItemsSubject.next([])
  }

  async signOut() {
    this.isGuestSession = false
    const { error } = await this.supabase.auth.signOut()
    if (error) throw error
  }

  // Carico i dati iniziali da Supabase (reports, note globali, calcolatore)
  private async loadInitialData() {
    if (!this.userSubject.value || this.isGuestSession) return

    // Carico i reports mensili
    const { data: reportsData, error: reportsError } = await this.supabase
      .from('monthly_reports')
      .select('*')
      .order('year', { ascending: false })
      .order('month', { ascending: false })

    if (reportsError) {
      console.error('Errore nel caricamento dei reports:', reportsError)
    } else {
      const reports = (reportsData as MonthlyReportRow[] || []).map(this.mapReportRowToModel)
      this.reportsSubject.next(reports)
    }

    // Carico le note globali
    const { data: notes, error: notesError } = await this.supabase
      .from('global_notes')
      .select('*')
      .limit(1)
      .single()

    if (notesError && notesError.code !== 'PGRST116') {
      console.error('Errore nel caricamento delle note globali:', notesError)
    } else {
      this.globalNotesSubject.next((notes as GlobalNotesRow | null)?.notes || '')
    }

    // Carico i dati del calcolatore
    const { data: calcData, error: calcError } = await this.supabase
      .from('calculator_data')
      .select('*')
      .limit(1)
      .single()

    if (calcError && calcError.code !== 'PGRST116') {
      console.error('Errore nel caricamento del calcolatore:', calcError)
    } else {
      this.calculatorItemsSubject.next((calcData as CalculatorDataRow | null)?.items || [])
    }
  }

  async upsertReport(report: MonthlyReport) {
    const user = this.userSubject.value
    if (!user || this.isGuestSession) return

    const { error } = await this.supabase
      .from('monthly_reports')
      .upsert({
        user_id: user.id,
        year: report.year,
        month: report.month,
        payday: report.payday,
        balance: report.balance,
        salary: report.salary || 0,
        salary_13: report.salary13 || 0,
        salary_14: report.salary14 || 0,
        incomes: report.incomes,
        notes: report.notes,
        expenses: report.expenses
      }, { onConflict: 'user_id, year, month' })
      .select()
      .single()

    if (error) throw error
  }

  async updateGlobalNotes(notes: string) {
    const user = this.userSubject.value
    if (!user || this.isGuestSession) return

    // Verifico se esiste già un record
    const { data: existing } = await this.supabase
      .from('global_notes')
      .select('id')
      .limit(1)
      .single()

    const payload: { user_id: string, notes: string, id?: string } = {
      user_id: user.id,
      notes
    }

    if (existing) {
      payload.id = (existing as GlobalNotesRow).id
    }

    const { error } = await this.supabase
      .from('global_notes')
      .upsert(payload, { onConflict: 'id' })

    if (error) throw error
  }

  async updateCalculatorItems(items: CalculatorItem[]) {
    const user = this.userSubject.value
    if (!user || this.isGuestSession) return

    const { data: existing } = await this.supabase
      .from('calculator_data')
      .select('id')
      .limit(1)
      .single()

    const payload: { user_id: string, items: CalculatorItem[], id?: string } = {
      user_id: user.id,
      items
    }

    if (existing) {
      payload.id = (existing as CalculatorDataRow).id
    }

    const { error } = await this.supabase
      .from('calculator_data')
      .upsert(payload, { onConflict: 'id' })

    if (error) throw error
  }

  // Configuro la sottoscrizione realtime per aggiornamenti live
  private setupRealtimeSubscription() {
    if (this.realtimeChannel) return

    const user = this.userSubject.value
    if (!user || this.isGuestSession) return

    this.realtimeChannel = this.supabase
      .channel('public:data')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'monthly_reports', filter: `user_id=eq.${user.id}` },
        (payload) => {
          this.handleReportChange(payload)
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'global_notes', filter: `user_id=eq.${user.id}` },
        (payload) => {
          if (payload.new && typeof payload.new === 'object' && 'notes' in payload.new) {
            this.globalNotesSubject.next((payload.new as GlobalNotesRow).notes)
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'calculator_data', filter: `user_id=eq.${user.id}` },
        (payload) => {
          if (payload.new && typeof payload.new === 'object' && 'items' in payload.new) {
            this.calculatorItemsSubject.next((payload.new as CalculatorDataRow).items)
          }
        }
      )
      .subscribe()
  }

  // Gestisco i cambiamenti ai reports ricevuti via realtime
  private handleReportChange(payload: { eventType: string, new: Record<string, unknown>, old: Record<string, unknown> }) {
    const currentReports = this.reportsSubject.value

    if (payload.eventType === 'INSERT') {
      const newReport = this.mapReportRowToModel(payload.new as unknown as MonthlyReportRow)
      this.reportsSubject.next([...currentReports, newReport].sort(this.sortReports))
    } else if (payload.eventType === 'UPDATE') {
      const updatedReport = this.mapReportRowToModel(payload.new as unknown as MonthlyReportRow)
      const index = currentReports.findIndex(r => r.year === updatedReport.year && r.month === updatedReport.month)
      if (index > -1) {
        const updatedReports = [...currentReports]
        updatedReports[index] = updatedReport
        this.reportsSubject.next(updatedReports)
      } else {
        this.reportsSubject.next([...currentReports, updatedReport].sort(this.sortReports))
      }
    } else if (payload.eventType === 'DELETE') {
      // Ricarico tutti i dati per sicurezza in caso di eliminazione
      this.loadInitialData()
    }
  }

  // Mappo la riga DB (snake_case) al modello applicativo (camelCase)
  private mapReportRowToModel(row: MonthlyReportRow): MonthlyReport {
    return {
      ...row,
      salary13: row.salary_13,
      salary14: row.salary_14,
      incomes: row.incomes || []
    }
  }

  private sortReports(a: MonthlyReport, b: MonthlyReport) {
    return new Date(b.year, b.month - 1).getTime() - new Date(a.year, a.month - 1).getTime()
  }

  private cleanup() {
    if (this.realtimeChannel) {
      this.supabase.removeChannel(this.realtimeChannel)
      this.realtimeChannel = null
    }
    this.reportsSubject.next([])
    this.globalNotesSubject.next('')
    this.calculatorItemsSubject.next([])
  }
}
