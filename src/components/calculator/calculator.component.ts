import { Component, ChangeDetectionStrategy, ElementRef, inject, signal, computed, effect } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop'
import { StorageService } from '../../services/storage.service'
import { CalculatorItem } from '../../models/financial-data.model'
import { MoneyInputDirective } from '../monthly-report/money-input.directive'

@Component({
  selector: 'app-calculator',
  templateUrl: './calculator.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, DragDropModule, MoneyInputDirective],
  styleUrl: './calculator.component.css'
})
export class CalculatorComponent {
  private storageService = inject(StorageService)
  private element = inject<ElementRef<HTMLElement>>(ElementRef)

  // Stato locale per il form di aggiunta
  newDescription = signal('')
  newAmount = signal<number | null>(null)
  newColor = signal('#6366f1')
  editingId = signal<string | null>(null)
  copyStatus = signal<'idle' | 'copied' | 'error'>('idle')

  // Calcolo gli items e il totale dal servizio di storage
  items = computed(() => this.storageService.appData().calculatorItems || [])
  total = computed(() => this.items().reduce((sum, item) => sum + (item.amount || 0), 0))

  constructor() {
    effect(() => {
      this.total()
      this.copyStatus.set('idle')
    })
  }

  async copyRoundedTotal() {
    try {
      await navigator.clipboard.writeText(String(Math.round(this.total() / 100) * 100))
      this.copyStatus.set('copied')
    } catch {
      this.copyStatus.set('error')
    }
  }

  addItem() {
    const amount = this.newAmount()
    if (!this.newDescription().trim() || !this.isValidAmount(amount)) return

    const newItem: CalculatorItem = {
      id: this.editingId() || crypto.randomUUID(),
      description: this.newDescription().trim(),
      amount,
      color: this.newColor()
    }

    this.storageService.updateCalculatorItems(this.editingId()
      ? this.items().map(item => item.id === newItem.id ? newItem : item)
      : [...this.items(), newItem])
    this.cancelEdit()
  }

  editItem(item: CalculatorItem) {
    this.editingId.set(item.id)
    this.newDescription.set(item.description)
    this.newAmount.set(item.amount)
    this.newColor.set(item.color || '#6366f1')
    this.element.nativeElement.querySelector<HTMLInputElement>('#new-calculator-description')?.focus()
  }

  cancelEdit() {
    this.editingId.set(null)
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
    if (this.editingId() === id) this.cancelEdit()
  }

  updateAmount(id: string, value: number | null) {
    if (this.isValidAmount(value)) this.updateItem(id, 'amount', value)
  }

  isValidAmount(value: number | null): value is number {
    return Number.isSafeInteger(value)
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
    this.moveItem(event.previousIndex, event.currentIndex)
  }

  moveItem(from: number, to: number, event?: KeyboardEvent) {
    event?.preventDefault()
    if (from === to || to < 0 || to >= this.items().length) return
    const items = [...this.items()]
    moveItemInArray(items, from, to)
    this.storageService.updateCalculatorItems(items)
  }
}
