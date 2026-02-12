import { Component, ChangeDetectionStrategy, output, inject, signal } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { StorageService } from '../../services/storage.service'

@Component({
  selector: 'app-global-notes',
  templateUrl: './global-notes.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule]
})
export class GlobalNotesComponent {
  private storageService = inject(StorageService)

  close = output<void>()
  notes = signal(this.storageService.appData().globalNotes)

  saveNotes() {
    this.storageService.updateGlobalNotes(this.notes())
    this.close.emit()
  }
}
