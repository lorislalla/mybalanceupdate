import { Directive, ElementRef, forwardRef, inject } from '@angular/core'
import { ControlValueAccessor, NG_VALIDATORS, NG_VALUE_ACCESSOR, ValidationErrors, Validator } from '@angular/forms'

export function parseMoneyAmount(text: string): number | null {
  let value = text.trim()
  if (!value) return null
  if (/^-?\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(value)) value = value.replaceAll('.', '')
  if (!/^-?\d+([.,]\d{1,2})?$/.test(value)) return null
  const amount = Number(value.replace(',', '.'))
  return Number.isFinite(amount) ? amount : null
}

@Directive({
  selector: 'input[appMoneyInput]',
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => MoneyInputDirective), multi: true },
    { provide: NG_VALIDATORS, useExisting: forwardRef(() => MoneyInputDirective), multi: true }
  ],
  host: { '(input)': 'onInput()', '(blur)': 'onBlur()' }
})
export class MoneyInputDirective implements ControlValueAccessor, Validator {
  private element = inject<ElementRef<HTMLInputElement>>(ElementRef)
  private onChange: (value: number | null) => void = () => {}
  private onTouched = () => {}
  private onValidatorChange = () => {}

  writeValue(value: number | null) {
    this.element.nativeElement.value = value == null ? '' : value.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  registerOnChange(fn: (value: number | null) => void) { this.onChange = fn }
  registerOnTouched(fn: () => void) { this.onTouched = fn }
  registerOnValidatorChange(fn: () => void) { this.onValidatorChange = fn }
  setDisabledState(disabled: boolean) { this.element.nativeElement.disabled = disabled }

  validate(): ValidationErrors | null {
    const value = this.element.nativeElement.value
    return value.trim() && parseMoneyAmount(value) === null ? { money: true } : null
  }

  onInput() {
    this.onChange(parseMoneyAmount(this.element.nativeElement.value))
    this.onValidatorChange()
  }

  onBlur() {
    const value = this.element.nativeElement.value
    if (!this.validate()) this.writeValue(parseMoneyAmount(value))
    this.onTouched()
  }
}
