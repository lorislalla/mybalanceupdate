import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop'
import { StorageService } from '../../services/storage.service'
import { CalculatorItem } from '../../models/financial-data.model'

@Component({
  selector: 'app-calculator',
  templateUrl: './calculator.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, DragDropModule]
})
export class CalculatorComponent {
  private storageService = inject(StorageService)

  // Stato locale per il form di aggiunta
  newDescription = signal('')
  newAmount = signal<number | null>(null)
  newColor = signal('#6366f1')

  // Calcolo gli items e il totale dal servizio di storage
  items = computed(() => this.storageService.appData().calculatorItems || [])
  total = computed(() => this.items().reduce((sum, item) => sum + (item.amount || 0), 0))

  addItem() {
    if (!this.newDescription() || !this.newAmount()) return

    const newItem: CalculatorItem = {
      id: crypto.randomUUID(),
      description: this.newDescription(),
      amount: this.newAmount()!,
      color: this.newColor()
    }

    this.storageService.updateCalculatorItems([...this.items(), newItem])
    this.newDescription.set('')
    this.newAmount.set(null)
    this.newColor.set('#6366f1')
  }

  // Aggiorno un singolo campo di un item (descrizione, importo, colore)
  updateItem(id: string, field: keyof CalculatorItem, value: string | number) {
    const updated = this.items().map(item =>
      item.id === id ? { ...item, [field]: value } : item
    )
    this.storageService.updateCalculatorItems(updated)
  }

  removeItem(id: string) {
    const filtered = this.items().filter(item => item.id !== id)
    this.storageService.updateCalculatorItems(filtered)
  }

  // Gestisco il riordinamento con drag & drop
  drop(event: CdkDragDrop<CalculatorItem[]>) {
    const items = [...this.items()]
    moveItemInArray(items, event.previousIndex, event.currentIndex)
    this.storageService.updateCalculatorItems(items)
  }
}
