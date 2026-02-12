import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core'
import { CommonModule } from '@angular/common'
import { SupabaseService } from '../../services/supabase.service'

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule]
})
export class LoginComponent {
  private supabase = inject(SupabaseService)

  loading = signal(false)
  error = signal('')

  async signInWithGoogle() {
    try {
      this.loading.set(true)
      await this.supabase.signInWithGoogle()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Errore sconosciuto durante il login'
      this.error.set(message)
      this.loading.set(false)
    }
  }

  async signInAsGuest() {
    try {
      this.loading.set(true)
      await this.supabase.signInAsGuest()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Errore sconosciuto durante l\'accesso come ospite'
      this.error.set(message)
      this.loading.set(false)
    }
  }
}
