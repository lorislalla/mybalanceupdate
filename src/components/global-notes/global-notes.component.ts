import { Component, ChangeDetectionStrategy, output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StorageService } from '../../services/storage.service';

@Component({
  selector: 'app-global-notes',
  templateUrl: './global-notes.component.html',
  imports: [CommonModule, FormsModule]
})
export class GlobalNotesComponent {
  close = output<void>();
  storageService = inject(StorageService);
  notes = signal(this.storageService.appData().globalNotes);

  saveNotes() {
    this.storageService.updateGlobalNotes(this.notes());
    this.close.emit();
  }
}
