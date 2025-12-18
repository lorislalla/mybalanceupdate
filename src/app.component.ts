import { Component, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from './components/header/header.component';
import { MonthlyReportComponent } from './components/monthly-report/monthly-report.component';
import { SummaryViewComponent } from './components/summary-view/summary-view.component';
import { ImportExportComponent } from './components/import-export/import-export.component';
import { GlobalNotesComponent } from './components/global-notes/global-notes.component';
import { LoginComponent } from './components/login/login.component';
import { CalculatorComponent } from './components/calculator/calculator.component';
import { SupabaseService } from './services/supabase.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { SwUpdate } from '@angular/service-worker';
import { filter, interval } from 'rxjs';

type View = 'monthly' | 'summary' | 'import-export' | 'calculator';

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
    CalculatorComponent
  ],
})
export class AppComponent {
  currentView = signal<View>('monthly');
  showGlobalNotes = signal(false);
  
  // Create a signal from the user observable
  user = toSignal(this.supabase.user$);
  updateAvailable = signal(false);

  constructor(private supabase: SupabaseService, private swUpdate: SwUpdate) {
    if (this.swUpdate.isEnabled) {
      this.swUpdate.versionUpdates
        .pipe(filter(evt => evt.type === 'VERSION_READY'))
        .subscribe(() => {
          this.updateAvailable.set(true);
        });

      // Check for updates on load
      this.swUpdate.checkForUpdate();

      // Check for updates every minute (60 * 1000 ms)
      interval(60 * 1000).subscribe(() => {
        this.swUpdate.checkForUpdate();
      });
    }
  }

  applyUpdate() {
    this.swUpdate.activateUpdate().then(() => {
      window.location.reload();
    });
  }

  handleViewChange(view: View) {
    this.currentView.set(view);
  }

  toggleGlobalNotes(show: boolean) {
    this.showGlobalNotes.set(show);
  }
}

