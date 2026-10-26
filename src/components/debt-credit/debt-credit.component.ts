import { Component, ChangeDetectionStrategy, computed, effect, inject, signal } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { StorageService } from '../../services/storage.service'
import { DebtCreditItem } from '../../models/financial-data.model'
import { MoneyInputDirective } from '../monthly-report/money-input.directive'

@Component({
  selector: 'app-debt-credit',
  templateUrl: './debt-credit.component.html',
  styleUrl: './debt-credit.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, MoneyInputDirective]
})
export class DebtCreditComponent {
  private storageService = inject(StorageService)
  loadState = this.storageService.debtCreditLoadState
  items = computed(() => this.storageService.appData().debtCreditItems || [])
  total = computed(() => this.calculateTotal(this.items()))
  person = signal('')
  amount = signal<number | null>(null)
  reason = signal('')
  editingId = signal<string | null>(null)
  saving = signal(false)
  error = signal('')
  copyStatus = signal<'idle' | 'copied' | 'error'>('idle')

  constructor() {
    effect(() => {
      this.total()
      this.copyStatus.set('idle')
    })
  }

  calculateTotal(items: DebtCreditItem[]): number {
    return items.reduce((sum, item) => sum + Math.round(item.amount * 100), 0) / 100
  }

  isValidAmount(value: number | null): value is number {
    return value !== null && Number.isFinite(value) && value !== 0 &&
      Number.isSafeInteger(Math.round(value * 100)) && Math.abs(value * 100 - Math.round(value * 100)) < 0.000001
  }

  async saveItem() {
    const amount = this.amount()
    if (!this.person().trim() || !this.isValidAmount(amount) || this.saving()) return
    const id = this.editingId()
    const item = { id: id || crypto.randomUUID(), person: this.person().trim(), amount, reason: this.reason().trim() }
    const items = id ? this.items().map(current => current.id === id ? item : current) : [...this.items(), item]
    if (await this.persist(items)) this.cancelEdit()
  }

  editItem(item: DebtCreditItem) {
    this.editingId.set(item.id)
    this.person.set(item.person)
    this.amount.set(item.amount)
    this.reason.set(item.reason)
    this.error.set('')
  }

  cancelEdit() {
    this.editingId.set(null)
    this.person.set('')
    this.amount.set(null)
    this.reason.set('')
  }

  async removeItem(id: string) {
    if (this.saving()) return
    if (await this.persist(this.items().filter(item => item.id !== id))) {
      if (this.editingId() === id) this.cancelEdit()
    }
  }

  private async persist(items: DebtCreditItem[]): Promise<boolean> {
    if (this.storageService.debtCreditLoadState() !== 'ready') return false
    this.saving.set(true)
    this.error.set('')
    try {
      await this.storageService.updateDebtCreditItems(items)
      return true
    } catch {
      this.error.set('Salvataggio non riuscito. I dati precedenti sono conservati: riprova.')
      return false
    } finally {
      this.saving.set(false)
    }
  }

  signedAmount(amount: number): string {
    return (amount > 0 ? '+' : '') + amount.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false })
  }

  async copyBalance() {
    try {
      await navigator.clipboard.writeText(this.signedAmount(this.total()))
      this.copyStatus.set('copied')
    } catch {
      this.copyStatus.set('error')
    }
  }
}
