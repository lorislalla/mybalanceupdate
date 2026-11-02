import { Component, ChangeDetectionStrategy, ElementRef, inject, signal, computed, effect } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop'
import { StorageService } from '../../services/storage.service'
import { CalculatorItem } from '../../models/financial-data.model'
import { MoneyInputDirective } from '../monthly-report/money-input.directive'
import { DebtCreditComponent } from '../debt-credit/debt-credit.component'
import { calculatorItems, storedCalculatorItems } from './calculator-items'

@Component({
  selector: 'app-calculator',
  templateUrl: './calculator.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, DragDropModule, MoneyInputDirective, DebtCreditComponent],
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
  composerOpen = signal(false)
  copyStatus = signal<'idle' | 'copied' | 'error'>('idle')

  // Calcolo gli items e il totale dal servizio di storage
  items = computed(() => calculatorItems(this.storageService.appData().calculatorItems || [], this.storageService.appData().debtCreditItems || []))
  debtState = this.storageService.debtCreditLoadState
  debtsExpanded = signal(false)
  total = computed(() => this.items().reduce((sum, item) => sum + Math.round((item.amount || 0) * 100), 0) / 100)

  constructor() {
    effect(() => {
      this.total()
      this.copyStatus.set('idle')
    })
  }

  async copyRoundedTotal() {
    if (this.debtState && this.debtState() !== 'ready') return
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

    this.persist(this.editingId()
      ? this.items().map(item => item.id === newItem.id ? newItem : item)
      : [...this.items(), newItem])
    this.cancelEdit()
  }

  editItem(item: CalculatorItem) {
    if (item.source === 'debt-credit') return
    this.composerOpen.set(true)
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
    this.persist(updated)
  }

  removeItem(id: string) {
    if (this.items().find(item => item.id === id)?.source === 'debt-credit') return
    const filtered = this.items().filter(item => item.id !== id)
    this.persist(filtered)
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
    this.persist(items)
  }

  private persist(items: CalculatorItem[]) {
    this.storageService.updateCalculatorItems(storedCalculatorItems(items))
  }
}
