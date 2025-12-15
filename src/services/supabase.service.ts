import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, User, RealtimeChannel } from '@supabase/supabase-js';
import { environment } from '../environments/environment';
import { MonthlyReport } from '../models/financial-data.model';
import { BehaviorSubject, from, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient;
  private userSubject = new BehaviorSubject<User | null>(null);
  user$ = this.userSubject.asObservable();
  
  private realtimeChannel: RealtimeChannel | null = null;
  private reportsSubject = new BehaviorSubject<MonthlyReport[]>([]);
  public reports$ = this.reportsSubject.asObservable();

  private globalNotesSubject = new BehaviorSubject<string>('');
  public globalNotes$ = this.globalNotesSubject.asObservable();

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
    this.initializeAuth();
  }

  private async initializeAuth() {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (session?.user) {
      this.userSubject.next(session.user);
      this.loadInitialData();
      this.setupRealtimeSubscription();
    }

    this.supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      this.userSubject.next(user);
      if (user) {
        this.loadInitialData();
        this.setupRealtimeSubscription();
      } else {
        this.cleanup();
      }
    });
  }

  async signInWithGoogle() {
    const { error } = await this.supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    });
    if (error) throw error;
  }

  async signOut() {
    const { error } = await this.supabase.auth.signOut();
    if (error) throw error;
  }

  // --- Data Methods ---

  private async loadInitialData() {
    if (!this.userSubject.value) return;

    // Load Reports
    const { data: reports, error: reportsError } = await this.supabase
      .from('monthly_reports')
      .select('*')
      .order('year', { ascending: false })
      .order('month', { ascending: false });

    if (reportsError) {
      console.error('Error loading reports:', reportsError);
    } else {
      this.reportsSubject.next(reports || []);
    }

    // Load Global Notes
    const { data: notes, error: notesError } = await this.supabase
      .from('global_notes')
      .select('*')
      .limit(1)
      .single();

    if (notesError && notesError.code !== 'PGRST116') { // Ignore 'not found' error
      console.error('Error loading global notes:', notesError);
    } else {
      this.globalNotesSubject.next(notes?.notes || '');
    }
  }

  async upsertReport(report: MonthlyReport) {
    const user = this.userSubject.value;
    if (!user) return;

    // Ensure expenses is JSON-ready (should be already, but safety first)
    const { data, error } = await this.supabase
      .from('monthly_reports')
      .upsert({
        user_id: user.id,
        year: report.year,
        month: report.month,
        payday: report.payday,
        balance: report.balance,
        notes: report.notes,
        expenses: report.expenses
      }, { onConflict: 'user_id, year, month' })
      .select()
      .single();

    if (error) throw error;
  }

  async updateGlobalNotes(notes: string) {
    const user = this.userSubject.value;
    if (!user) return;
    
    // First try to find existing record to get ID, or just upsert based on user_id if we had a unique constraint on user_id (checking schema)
    // The schema doesn't strictly enforce unique user_id for global_notes but logic implies one per user.
    // Let's get the ID if we have it, or insert.
    
    const { data: existing } = await this.supabase
        .from('global_notes')
        .select('id')
        .limit(1)
        .single();
        
    const payload: any = {
        user_id: user.id,
        notes: notes
    };
    
    if (existing) {
        payload.id = existing.id;
    }

    const { error } = await this.supabase
      .from('global_notes')
      .upsert(payload, { onConflict: 'id' });

    if (error) throw error;
  }

  // --- Realtime ---

  private setupRealtimeSubscription() {
    if (this.realtimeChannel) return; // Already subscribed

    const user = this.userSubject.value;
    if (!user) return;

    this.realtimeChannel = this.supabase
      .channel('public:data')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'monthly_reports', filter: `user_id=eq.${user.id}` },
        (payload) => {
            this.handleReportChange(payload);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'global_notes', filter: `user_id=eq.${user.id}` },
        (payload) => {
            if (payload.new && 'notes' in payload.new) {
                this.globalNotesSubject.next((payload.new as any).notes);
            }
        }
      )
      .subscribe();
  }

  private handleReportChange(payload: any) {
    const currentReports = this.reportsSubject.value;
    
    if (payload.eventType === 'INSERT') {
        const newReport = payload.new as MonthlyReport;
        this.reportsSubject.next([...currentReports, newReport].sort(this.sortReports));
    } else if (payload.eventType === 'UPDATE') {
        const updatedReport = payload.new as MonthlyReport;
        const index = currentReports.findIndex(r => r.year === updatedReport.year && r.month === updatedReport.month);
        if (index > -1) {
            const updatedReports = [...currentReports];
            updatedReports[index] = updatedReport;
            this.reportsSubject.next(updatedReports);
        } else {
             // Fallback if not found locally
            this.reportsSubject.next([...currentReports, updatedReport].sort(this.sortReports));
        }
    } else if (payload.eventType === 'DELETE') {
        const oldRecord = payload.old; // May only contain ID
        // Since we key by year/month usually, but here we might need to match by ID if possible or refetch.
        // If we don't have ID in MonthlyReport interface, we might need to reload. 
        // For simplicity, let's reload all on delete to be safe, or check if we can match.
        // Our interface doesn't strictly have 'id' but the DB does.
        // Let's just reload to be safe.
        this.loadInitialData();
    }
  }

  private sortReports(a: MonthlyReport, b: MonthlyReport) {
    return new Date(b.year, b.month - 1).getTime() - new Date(a.year, a.month - 1).getTime();
  }

  private cleanup() {
    if (this.realtimeChannel) {
      this.supabase.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
    this.reportsSubject.next([]);
    this.globalNotesSubject.next('');
  }
}
