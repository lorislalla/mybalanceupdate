import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core'
import { CommonModule } from '@angular/common'
import { SwUpdate } from '@angular/service-worker'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { exhaustMap, filter, fromEvent, merge, timer } from 'rxjs'
import { View } from './types/view.type'
import { SupabaseService } from './services/supabase.service'
import { HeaderComponent } from './components/header/header.component'
import { MonthlyReportComponent } from './components/monthly-report/monthly-report.component'
import { SummaryViewComponent } from './components/summary-view/summary-view.component'
import { ImportExportComponent } from './components/import-export/import-export.component'
import { GlobalNotesComponent } from './components/global-notes/global-notes.component'
import { LoginComponent } from './components/login/login.component'
import { CalculatorComponent } from './components/calculator/calculator.component'
import { SearchExpensesComponent } from './components/search-expenses/search-expenses.component'

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    HeaderComponent,
    MonthlyReportComponent,
    SummaryViewComponent,
    ImportExportComponent,
    GlobalNotesComponent,
    LoginComponent,
    CalculatorComponent,
    SearchExpensesComponent
  ],
})
export class AppComponent {
  private supabase = inject(SupabaseService)
  private swUpdate = inject(SwUpdate)

  // Stato della vista corrente e del pannello note globali
  currentView = signal<View>('monthly')
  showGlobalNotes = signal(false)

  // Converto l'observable utente in signal per il template
  user = toSignal(this.supabase.user$)
  updateAvailable = signal(false)

  constructor() {
    if (this.swUpdate.isEnabled) {
      this.swUpdate.versionUpdates.pipe(takeUntilDestroyed()).subscribe(event => {
        if (event.type === 'VERSION_READY') {
          this.updateAvailable.set(true)
        }
      })

      merge(
        timer(0, 5 * 60_000),
        fromEvent(document, 'visibilitychange'),
        fromEvent(window, 'focus'),
        fromEvent(window, 'online'),
        fromEvent(window, 'pageshow')
      ).pipe(
        filter(() => document.visibilityState === 'visible' && !this.updateAvailable()),
        exhaustMap(() => this.swUpdate.checkForUpdate().catch(error => {
          console.warn('Controllo aggiornamenti non riuscito', error)
          return false
        })),
        takeUntilDestroyed()
      ).subscribe()
    }
  }

  applyUpdate() {
    window.location.reload()
  }

  handleViewChange(view: View) {
    this.currentView.set(view)
  }

  toggleGlobalNotes(show: boolean) {
    this.showGlobalNotes.set(show)
  }
}
