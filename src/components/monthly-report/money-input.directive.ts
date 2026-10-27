import { booleanAttribute, Directive, ElementRef, forwardRef, inject, Input } from '@angular/core'
import { AbstractControl, ControlValueAccessor, NG_VALIDATORS, NG_VALUE_ACCESSOR, ValidationErrors, Validator } from '@angular/forms'

export function parseMoneyAmount(text: string, integerOnly = false): number | null {
  let value = text.trim()
  if (!value) return null
  if (integerOnly) {
    if (!/^-?\d+$/.test(value)) return null
    const amount = Number(value)
    return Number.isSafeInteger(amount) ? amount : null
  }
  if (/^[+-]?\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(value)) value = value.replaceAll('.', '')
  if (!/^[+-]?\d+([.,]\d{1,2})?$/.test(value)) return null
  const amount = Number(value.replace(',', '.'))
  return Number.isFinite(amount) ? amount : null
}

export function integerAmountValidator(control: AbstractControl): ValidationErrors | null {
  return control.value == null || Number.isSafeInteger(control.value) ? null : { integerAmount: true }
}

@Directive({
  selector: 'input[appMoneyInput]',
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => MoneyInputDirective), multi: true },
    { provide: NG_VALIDATORS, useExisting: forwardRef(() => MoneyInputDirective), multi: true }
  ],
  host: { '(input)': 'onInput()', '(blur)': 'onBlur()', '(keydown)': 'onKeyDown($event)', '(beforeinput)': 'onBeforeInput($event)' }
})
export class MoneyInputDirective implements ControlValueAccessor, Validator {
  @Input({ transform: booleanAttribute }) integerOnly = false
  private element = inject<ElementRef<HTMLInputElement>>(ElementRef)
  private onChange: (value: number | null) => void = () => {}
  private onTouched = () => {}
  private onValidatorChange = () => {}

  writeValue(value: number | null) {
    this.element.nativeElement.value = value == null ? '' : this.integerOnly
      ? String(value).replace('.', ',')
      : value.toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  }

  registerOnChange(fn: (value: number | null) => void) { this.onChange = fn }
  registerOnTouched(fn: () => void) { this.onTouched = fn }
  registerOnValidatorChange(fn: () => void) { this.onValidatorChange = fn }
  setDisabledState(disabled: boolean) { this.element.nativeElement.disabled = disabled }

  validate(): ValidationErrors | null {
    const value = this.element.nativeElement.value
    return value.trim() && parseMoneyAmount(value, this.integerOnly) === null ? { money: true } : null
  }

  private acceptsInsertion(text: string): boolean {
    const input = this.element.nativeElement
    const start = input.selectionStart ?? input.value.length
    const end = input.selectionEnd ?? start
    return /^-?\d*$/.test(input.value.slice(0, start) + text + input.value.slice(end))
  }

  onKeyDown(event: KeyboardEvent) {
    if (!this.integerOnly || event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.key.length !== 1) return
    if (!this.acceptsInsertion(event.key)) event.preventDefault()
  }

  onBeforeInput(event: InputEvent) {
    if (!this.integerOnly || event.isComposing || event.inputType !== 'insertText' || event.data == null) return
    if (!this.acceptsInsertion(event.data)) event.preventDefault()
  }

  onInput() {
    this.onChange(parseMoneyAmount(this.element.nativeElement.value, this.integerOnly))
    this.onValidatorChange()
  }

  onBlur() {
    const value = this.element.nativeElement.value
    if (!this.validate()) this.writeValue(parseMoneyAmount(value, this.integerOnly))
    this.onTouched()
  }
}
