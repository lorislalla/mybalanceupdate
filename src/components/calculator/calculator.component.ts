import { Component, ChangeDetectionStrategy, ElementRef, inject, signal, computed } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop'
import { StorageService } from '../../services/storage.service'
import { CalculatorItem } from '../../models/financial-data.model'

@Component({
  selector: 'app-calculator',
  templateUrl: './calculator.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, DragDropModule],
  styles: [
    `
      .cdk-drag-preview {
        box-sizing: border-box;
        border-radius: 6px;
        box-shadow: 0 5px 5px -3px rgba(0, 0, 0, 0.2), 0 8px 10px 1px rgba(0, 0, 0, 0.14), 0 3px 14px 2px rgba(0, 0, 0, 0.12);
        opacity: 0.95;
      }
      .cdk-drag-placeholder {
        opacity: 0.3;
        background: #374151;
        border: 2px dashed #4b5563;
        border-radius: 6px;
      }
      .cdk-drag-animating {
        transition: transform 250ms cubic-bezier(0, 0, 0.2, 1);
      }
      .cdk-drop-list-dragging .cdk-drag {
        transition: transform 250ms cubic-bezier(0, 0, 0.2, 1);
      }
      .no-spin::-webkit-inner-spin-button,
      .no-spin::-webkit-outer-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }
      .no-spin {
        -moz-appearance: textfield;
      }
    `
  ]
})
export class CalculatorComponent {
  private storageService = inject(StorageService)
  private element = inject<ElementRef<HTMLElement>>(ElementRef)

  // Stato locale per il form di aggiunta
  newDescription = signal('')
  newAmount = signal('')
  newColor = signal('#6366f1')

  // Calcolo gli items e il totale dal servizio di storage
  items = computed(() => this.storageService.appData().calculatorItems || [])
  total = computed(() => this.items().reduce((sum, item) => sum + (item.amount || 0), 0))

  addItem() {
    const amount = this.parseAmount(this.newAmount())
    if (!this.newDescription() || amount === null) return

    const newItem: CalculatorItem = {
      id: crypto.randomUUID(),
      description: this.newDescription(),
      amount,
      color: this.newColor()
    }

    this.storageService.updateCalculatorItems([...this.items(), newItem])
    this.newDescription.set('')
    this.newAmount.set('')
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

  updateAmount(id: string, value: string) {
    const amount = this.parseAmount(value)
    if (amount !== null) this.updateItem(id, 'amount', amount)
  }

  isValidAmount(value: string) {
    return this.parseAmount(value) !== null
  }

  private parseAmount(value: string): number | null {
    const normalized = value.trim().replace(',', '.')
    if (!normalized) return null

    const amount = Number(normalized)
    return Number.isFinite(amount) ? amount : null
  }

  selectAmount(event: Event) {
    const input = event.target as HTMLInputElement
    input.select()
  }

  focusAdjacentAmount(event: KeyboardEvent) {
    const inputs = Array.from(this.element.nativeElement.querySelectorAll<HTMLInputElement>('[data-calculator-amount]'))
    const currentIndex = inputs.indexOf(event.target as HTMLInputElement)
    if (currentIndex < 0 || inputs.length < 2) return

    event.preventDefault()
    const direction = event.shiftKey ? -1 : 1
    const nextIndex = (currentIndex + direction + inputs.length) % inputs.length
    inputs[nextIndex].focus()
  }

  // Gestisco il riordinamento con drag & drop
  drop(event: CdkDragDrop<CalculatorItem[]>) {
    const items = [...this.items()]
    moveItemInArray(items, event.previousIndex, event.currentIndex)
    this.storageService.updateCalculatorItems(items)
  }
}
