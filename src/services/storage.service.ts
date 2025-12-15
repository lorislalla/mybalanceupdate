import { Injectable, signal, effect, WritableSignal, computed } from '@angular/core';
import { AppData, MonthlyReport } from '../models/financial-data.model';
import { SupabaseService } from './supabase.service';

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  // We keep the appData signal structure for compatibility with existing components
  appData: WritableSignal<AppData> = signal({ reports: [], globalNotes: '' });

  constructor(private supabase: SupabaseService) {
    // Subscribe to Supabase data streams
    this.supabase.reports$.subscribe(reports => {
      this.appData.update(current => ({ ...current, reports }));
    });

    this.supabase.globalNotes$.subscribe(globalNotes => {
      this.appData.update(current => ({ ...current, globalNotes }));
    });
  }

  getReport(year: number, month: number): MonthlyReport | undefined {
    return this.appData().reports.find(r => r.year === year && r.month === month);
  }

  async updateReport(report: MonthlyReport) {
    // Optimistic update locally
    this.appData.update(data => {
      const index = data.reports.findIndex(r => r.year === report.year && r.month === report.month);
      const reports = [...data.reports];
      if (index > -1) {
        reports[index] = report;
      } else {
        reports.push(report);
      }
       // Sort reports by date for consistency
       reports.sort((a, b) => new Date(b.year, b.month - 1).getTime() - new Date(a.year, a.month - 1).getTime());
       return { ...data, reports };
    });

    // Send to Supabase
    try {
      await this.supabase.upsertReport(report);
    } catch (e) {
      console.error('Error syncing report to Supabase:', e);
      // TODO: Revert optimistic update if needed or show error
    }
  }

  async importData(reports: MonthlyReport[]) {
    // For import, we loop and upsert. This might be heavy if many, but fine for now.
    for (const report of reports) {
        // Ensure IDs if missing just in case
        const reportToSave = {
            ...report,
            expenses: report.expenses?.map(e => ({...e, id: e.id || crypto.randomUUID()})) || []
        };
        await this.updateReport(reportToSave);
    }
  }

  async updateGlobalNotes(notes: string) {
    this.appData.update(data => ({ ...data, globalNotes: notes }));
    try {
        await this.supabase.updateGlobalNotes(notes);
    } catch (e) {
        console.error('Error syncing global notes:', e);
    }
  }
}