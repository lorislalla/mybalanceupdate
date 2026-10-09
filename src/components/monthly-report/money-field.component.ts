import { ChangeDetectionStrategy, Component, effect, ElementRef, input, output, signal, untracked, viewChild } from '@angular/core'
import { DecimalPipe } from '@angular/common'
import { FormsModule, NgModel } from '@angular/forms'
import { MoneyInputDirective } from './money-input.directive'

@Component({
  selector: 'app-money-field',
  imports: [FormsModule, MoneyInputDirective, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isEditing()) {
      <label>
      <span class="label">{{ label() }}</span>
      <span class="input-wrap">
        <span aria-hidden="true">€</span>
        <input #amountInput type="text" appMoneyInput inputmode="decimal" autocomplete="off"
          [aria-label]="label()" [ngModel]="draft()" (ngModelChange)="draft.set($event)"
          (input)="dirty.set(true)"
          #model="ngModel" placeholder="Inserisci importo" [attr.aria-invalid]="model.invalid"
          (keydown.enter)="!model.invalid && save(); $event.preventDefault()"
          (keydown.escape)="cancel(); $event.preventDefault()" />
      </span>
      </label>
      <div class="actions">
        <button type="button" aria-label="Annulla" title="Annulla" (click)="cancel()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg></button>
        <button type="button" aria-label="Salva" title="Salva" [disabled]="model.invalid" (click)="save()" class="save"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg></button>
      </div>
      @if (model.invalid) { <p role="alert">Inserisci un importo valido, con al massimo due decimali.</p> }
    } @else {
      <span class="label">{{ label() }}</span>
      <div class="read-value">
        @if (value() !== 0) {
          <strong class="currency-value" [class.income]="kind() === 'income' && value() > 0" [class.negative]="value() < 0">{{ value() | number: '1.2-2' }} €</strong>
        } @else { <span class="empty-value">Non inserito</span> }
        <button type="button" [aria-label]="(value() === 0 ? 'Inserisci ' : 'Modifica ') + label()" [title]="(value() === 0 ? 'Inserisci ' : 'Modifica ') + label()" (click)="startEditing()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            @if (value() === 0) { <path d="M12 5v14M5 12h14" /> }
            @else { <path d="m16 3 5 5-12 12-6 1 1-6zM14 5l5 5" /> }
          </svg>
        </button>
      </div>
    }
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .read-value { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; }
    .read-value button { margin-left: auto; }
    .currency-value { font-size: 16px; font-weight: 600; font-variant-numeric: tabular-nums; color: #e2e8f0; overflow-wrap: anywhere; }
    .currency-value.income { color: #6ee7b7; }
    .currency-value.negative { color: #fda4af; }
    .empty-value { color: #94a3b8; font-size: 14px; }
    .label { display: block; margin-bottom: 4px; color: #b7c3d6; font-size: 14px; }
    .input-wrap { display: flex; align-items: center; gap: 8px; padding: 0 12px; background: #111b2c; border: 1px solid #475569; border-radius: 8px; }
    .input-wrap > span { color: #94a3b8; }
    input { width: 100%; min-width: 0; min-height: 38px; padding: 6px 0; background: transparent; color: #f1f5f9; border: 0; font-size: 16px; text-align: right; font-variant-numeric: tabular-nums; }
    .input-wrap:focus-within { border-color: #a5b4fc; outline: 2px solid #6366f1; outline-offset: 2px; }
    input:focus { outline: none; }
    .actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
    button { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 32px; min-height: 32px; padding: 0; border-radius: 6px; border: 1px solid #475569; color: #e2e8f0; cursor: pointer; background: #1b273a; }
    button svg { width: 18px; height: 18px; }
    button:hover { background: #334155; }
    .save { background: #4f46e5; border-color: #6366f1; color: white; }
    button:disabled { opacity: .5; cursor: not-allowed; }
    button:focus-visible { outline: 2px solid #a5b4fc; outline-offset: 3px; }
    p { margin-top: 8px; font-size: 13px; color: #fda4af; }
    @media (max-width: 860px), (pointer: coarse) { button { width: 36px; min-height: 36px; } }
  `
})
export class MoneyFieldComponent {
  label = input.required<string>()
  value = input(0)
  kind = input<'balance' | 'income'>('balance')
  month = input.required<string>()
  valueSaved = output<number>()
  draft = signal<number | null>(null)
  private model = viewChild<NgModel>('model')
  private amountInput = viewChild<ElementRef<HTMLInputElement>>('amountInput')
  isEditing = signal(false)
  dirty = signal(false)

  constructor() {
    let displayedMonth = ''
    effect(() => {
      const month = this.month()
      const value = this.value() || null
      const model = this.model()
      untracked(() => {
        if (month !== displayedMonth || !this.dirty()) {
          if (month !== displayedMonth) this.isEditing.set(false)
          this.draft.set(value)
          model?.reset(value)
          this.dirty.set(false)
        }
        displayedMonth = month
      })
    })
    effect(() => {
      const input = this.amountInput()?.nativeElement
      if (input) queueMicrotask(() => {
        if (input.isConnected) { input.focus(); input.select() }
      })
    })
  }

  startEditing() {
    this.draft.set(this.value() || null)
    this.dirty.set(false)
    this.isEditing.set(true)
  }

  save() {
    const value = this.draft() ?? 0
    this.valueSaved.emit(value)
    this.dirty.set(false)
    this.draft.set(value || null)
    this.model()?.reset(value || null)
    this.isEditing.set(false)
  }
  cancel() {
    this.dirty.set(false)
    this.draft.set(this.value() || null)
    this.model()?.reset(this.value() || null)
    this.isEditing.set(false)
  }
}
