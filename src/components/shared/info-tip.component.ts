import { ChangeDetectionStrategy, Component, ElementRef, HostListener, input, signal, viewChild } from '@angular/core'

@Component({
  selector: 'app-info-tip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button #trigger type="button" [attr.popovertarget]="id" [attr.aria-label]="'Spiegazione: ' + label()" [attr.aria-expanded]="opened()"
      (pointerenter)="showOnHover($event)" (pointerleave)="leave($event)" (blur)="hide()">
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="10" cy="10" r="7"/><path stroke-linecap="round" d="M10 9v5M10 6v.2"/></svg>
    </button>
    <div #panel [id]="id" popover="auto" role="tooltip" class="tip" (beforetoggle)="beforeToggle($event)" (toggle)="onToggle()" (pointerenter)="cancelHide()" (pointerleave)="leave($event)">
      <strong>{{ label() }}</strong><p>{{ text() }}</p>
    </div>
  `,
  styles: `
    :host { display: inline-flex; flex: 0 0 auto; vertical-align: middle; }
    button { display: inline-grid; place-items: center; width: 24px; height: 24px; padding: 4px; border: 0; border-radius: 50%; color: #94a3b8; background: transparent; cursor: pointer; }
    button svg { width: 14px; height: 14px; stroke-width: 1.5; }
    button:hover, button[aria-expanded=true] { color: #c7d2fe; background: #6366f11a; }
    button:focus-visible { outline: 2px solid #a5b4fc; outline-offset: 1px; }
    .tip { position: fixed; inset: auto; margin: 0; box-sizing: border-box; width: min(300px, calc(100vw - 24px)); padding: 12px; border: 1px solid #64748b; border-radius: 8px; background: #0f172a; color: #e2e8f0; box-shadow: 0 8px 24px #0008; font-size: 13px; line-height: 1.5; overflow-wrap: anywhere; }
    .tip strong { display: block; margin-bottom: 4px; }
    .tip p { margin: 0; }
  `
})
export class InfoTipComponent {
  label = input.required<string>()
  text = input.required<string>()
  id = 'info-' + crypto.randomUUID()
  opened = signal(false)
  private trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger')
  private panel = viewChild<ElementRef<HTMLElement>>('panel')
  private hideTimer: ReturnType<typeof setTimeout> | undefined

  showOnHover(event: PointerEvent) {
    if (event.pointerType !== 'mouse') return
    this.cancelHide()
    this.panel()?.nativeElement.showPopover()
    this.position()
  }

  leave(event: PointerEvent) {
    if (event.pointerType !== 'mouse') return
    this.cancelHide()
    this.hideTimer = setTimeout(() => this.hide(), 150)
  }

  cancelHide() {
    clearTimeout(this.hideTimer)
  }

  hide() {
    this.cancelHide()
    const panel = this.panel()?.nativeElement
    if (panel?.isConnected && panel.matches(':popover-open')) panel.hidePopover()
  }

  onToggle() {
    this.opened.set(this.panel()?.nativeElement.matches(':popover-open') ?? false)
    if (this.opened()) this.position()
  }

  beforeToggle(event: Event) {
    if ((event as ToggleEvent).newState !== 'open') return
    this.cancelHide()
    queueMicrotask(() => this.position())
  }

  @HostListener('window:resize')
  onResize() {
    if (this.opened()) this.position()
  }

  private position() {
    const panel = this.panel()?.nativeElement
    const trigger = this.trigger()?.nativeElement
    if (!panel || !trigger) return
    const rect = trigger.getBoundingClientRect()
    panel.style.left = Math.max(12, Math.min(rect.right - panel.offsetWidth, innerWidth - panel.offsetWidth - 12)) + 'px'
    panel.style.top = Math.max(12, rect.bottom + panel.offsetHeight + 6 <= innerHeight ? rect.bottom + 6 : rect.top - panel.offsetHeight - 6) + 'px'
  }

  ngOnDestroy() {
    this.cancelHide()
  }
}
