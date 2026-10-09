import { DestroyRef, Injectable, inject, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { SupabaseService } from '../../services/supabase.service'
import { ChartId, ChartPreferences, ChartSettings, defaultPreferences, normalizePreferences } from './chart-data'

interface CachedPreferences { preferences: ChartPreferences; pending: boolean }
export type SaveStatus = 'ready' | 'saving' | 'synced' | 'local' | 'error' | 'unsaved'

@Injectable({ providedIn: 'root' })
export class ChartPreferencesService {
  private supabase = inject(SupabaseService)
  private destroyRef = inject(DestroyRef)
  preferences = signal(defaultPreferences())
  status = signal<SaveStatus>('ready')
  guest = signal(false)
  private userId: string | null = null
  private pending = false
  private saving = false
  private generation = 0

  constructor() {
    this.supabase.user$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(user => {
      if (user?.id === this.userId) return
      this.userId = user?.id ?? null
      this.generation++
      this.saving = false
      this.pending = false
      this.guest.set(this.supabase.isGuest)
      this.preferences.set(defaultPreferences())
      this.status.set('ready')
      if (!user) return
      const local = this.readCache()
      const remote = normalizePreferences(user.user_metadata?.['mybalance_chart_preferences'])
      const selected = local && (local.pending || local.preferences.updatedAt > remote.updatedAt) ? local.preferences : remote
      this.preferences.set(selected)
      this.pending = local?.pending ?? false
      this.status.set(this.guest() ? 'local' : this.pending ? 'error' : 'ready')
      if (!this.guest()) void this.refresh(this.generation)
    })
    const online = () => { if (this.pending) void this.retry() }
    const storage = (event: StorageEvent) => {
      if (event.key !== this.cacheKey()) return
      const cache = this.readCache()
      if (cache && cache.preferences.updatedAt > this.preferences().updatedAt) {
        this.preferences.set(cache.preferences)
        this.pending = cache.pending
        this.status.set(this.guest() ? 'local' : cache.pending ? 'error' : 'synced')
      }
    }
    window.addEventListener('online', online)
    window.addEventListener('storage', storage)
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('online', online)
      window.removeEventListener('storage', storage)
    })
  }

  private cacheKey() { return `mybalance:charts:v1:${this.userId}` }
  private readCache(): CachedPreferences | null {
    try {
      const value = JSON.parse(localStorage.getItem(this.cacheKey()) || 'null')
      if (!value || typeof value.pending !== 'boolean') return null
      return { preferences: normalizePreferences(value.preferences), pending: value.pending }
    } catch { return null }
  }
  private writeCache(): boolean {
    try {
      localStorage.setItem(this.cacheKey(), JSON.stringify({ preferences: this.preferences(), pending: this.pending }))
      return true
    } catch { return false }
  }
  private async refresh(generation: number) {
    try {
      const remote = normalizePreferences(await this.supabase.getChartPreferences())
      if (generation !== this.generation) return
      if (this.pending || this.preferences().updatedAt > remote.updatedAt) {
        this.pending = true
        await this.retry()
      } else {
        this.preferences.set(remote)
        this.writeCache()
        this.status.set(remote.updatedAt ? 'synced' : 'ready')
      }
    } catch {
      if (generation === this.generation && this.pending) this.status.set('error')
    }
  }

  async save(id: ChartId, settings: ChartSettings) {
    if (!this.userId || this.saving) return
    const current = this.preferences()
    this.preferences.set(normalizePreferences({
      version: 1, updatedAt: Math.max(Date.now(), current.updatedAt + 1),
      charts: { ...current.charts, [id]: { ...settings } }
    }))
    this.pending = !this.guest()
    const persisted = this.writeCache()
    if (this.guest()) {
      this.status.set(persisted ? 'local' : 'unsaved')
      return
    }
    await this.retry()
  }

  async retry() {
    if (!this.userId) return
    if (this.guest()) { this.status.set(this.writeCache() ? 'local' : 'unsaved'); return }
    if (this.saving || !this.pending) return
    const generation = this.generation
    const snapshot = this.preferences()
    this.saving = true
    this.status.set('saving')
    try {
      await this.supabase.updateChartPreferences(snapshot)
      if (generation !== this.generation) return
      // A newer change received from another tab must remain pending.
      this.pending = this.preferences().updatedAt !== snapshot.updatedAt
      this.writeCache()
      this.status.set(this.pending ? 'error' : 'synced')
    } catch {
      if (generation === this.generation) this.status.set(this.writeCache() ? 'error' : 'unsaved')
    } finally {
      if (generation === this.generation) this.saving = false
    }
  }
}
