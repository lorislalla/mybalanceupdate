import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../services/supabase.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent {
  loading = false;
  error = '';

  constructor(private supabase: SupabaseService) {}

  async signInWithGoogle() {
    try {
      this.loading = true;
      await this.supabase.signInWithGoogle();
    } catch (error: any) {
      this.error = error.error_description || error.message;
      this.loading = false;
    }
  }
}
