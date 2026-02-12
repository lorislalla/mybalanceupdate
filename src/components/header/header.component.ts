import { Component, ChangeDetectionStrategy, input, output, signal } from '@angular/core'
import { CommonModule } from '@angular/common'
import { View } from '../../types/view.type'

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule]
})
export class HeaderComponent {
  // Ricevo la vista corrente dal componente padre
  currentView = input.required<View>()

  // Emetto il cambio vista e l'apertura delle note globali
  viewChanged = output<View>()
  openGlobalNotes = output<void>()

  // Stato del menu mobile
  isMenuOpen = signal(false)

  setView(view: View) {
    this.viewChanged.emit(view)
    this.isMenuOpen.set(false)
  }
}
