import { Component, ChangeDetectionStrategy, output, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

type View = 'monthly' | 'summary' | 'import-export' | 'calculator';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  imports: [CommonModule]
})
export class HeaderComponent {
  viewChanged = output<View>();
  globalNotesToggled = output<void>();
  currentView = input.required<View>();
  
  isMenuOpen = signal(false);

  setView(view: View) {
    this.viewChanged.emit(view);
    this.isMenuOpen.set(false); // Chiude il menu dopo la navigazione
  }

  showGlobalNotes() {
    this.globalNotesToggled.emit();
  }

  toggleMenu() {
    this.isMenuOpen.set(!this.isMenuOpen());
  }
}
