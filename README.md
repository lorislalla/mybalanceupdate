<div align="center">

# 💰 MyBalanceUpdate

**App web per la gestione del bilancio personale mensile**

Registra stipendi, spese e entrate mese per mese. Visualizza l'andamento nel tempo con grafici interattivi. Importa dati finanziari da testo libero grazie all'AI.

[![Angular](https://img.shields.io/badge/Angular-20-DD0031?logo=angular)](https://angular.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?logo=typescript)](https://www.typescriptlang.org)
[![Supabase](https://img.shields.io/badge/Supabase-Backend-3ECF8E?logo=supabase)](https://supabase.com)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-Styling-06B6D4?logo=tailwindcss)](https://tailwindcss.com)

</div>

---

## Funzionalità

- **Resoconto Mensile** — Registra stipendio, saldo, spese ed entrate per ogni mese con form inline e drag & drop per riordinare le spese
- **Grafici Interattivi** — Visualizza l'andamento del saldo, delle entrate e delle uscite nel tempo con grafici ApexCharts espandibili e zoomabili
- **Import con AI** — Incolla testo libero o carica un file e lascia che Gemini lo analizzi per estrarre automaticamente i dati finanziari strutturati
- **Ricerca Storica** — Cerca spese o entrate per descrizione attraverso tutti i mesi registrati
- **Calcolatore Rapido** — Tieni traccia di voci con importi e colori personalizzati, riordinabili con drag & drop
- **Note Fisse** — Appunti globali sempre accessibili da qualsiasi vista
- **Export Dati** — Esporta tutti i dati in JSON (backup completo) o CSV (foglio di calcolo)
- **Sync Realtime** — Sincronizzazione in tempo reale tra dispositivi tramite Supabase Realtime
- **PWA** — Installabile come app nativa su mobile con supporto offline e notifiche di aggiornamento

## Tech Stack

| Tecnologia | Ruolo |
|---|---|
| **Angular 20** | Framework frontend con signals, `ChangeDetectionStrategy.OnPush`, standalone components |
| **TypeScript (strict)** | Tipizzazione forte con `strict`, `noImplicitAny`, `strictNullChecks` |
| **Tailwind CSS** | Utility-first CSS per styling responsive e dark mode |
| **Supabase** | Autenticazione (Google OAuth), database PostgreSQL, sottoscrizioni Realtime |
| **Google Gemini** | Parsing intelligente di testo finanziario in dati strutturati |
| **ApexCharts** | Grafici area interattivi con zoom, media mobile e tooltip |
| **Angular CDK** | Drag & drop per spese e calcolatore |
| **Service Worker** | PWA con aggiornamenti automatici |

## Struttura del Progetto

```
src/
├── app.component.ts/.html          # Componente root, routing tra viste
├── types/
│   └── view.type.ts                # Tipo condiviso per le viste
├── models/
│   └── financial-data.model.ts     # Interfacce TypeScript (Expense, Income, MonthlyReport, AppData)
├── services/
│   ├── supabase.service.ts         # Auth, CRUD e Realtime verso Supabase
│   ├── storage.service.ts          # Stato applicativo (signals) + sync con Supabase
│   ├── gemini.service.ts           # Integrazione API Google Gemini
│   └── file-handler.service.ts     # Utility per lettura file
├── components/
│   ├── header/                     # Navigazione e menu mobile
│   ├── login/                      # Schermata di login con Google
│   ├── monthly-report/             # Vista principale: resoconto mensile completo
│   ├── summary-view/               # Grafici interattivi dell'andamento
│   ├── search-expenses/            # Ricerca storica spese/entrate
│   ├── calculator/                 # Calcolatore rapido con drag & drop
│   ├── import-export/              # Import AI + export JSON/CSV
│   └── global-notes/               # Modal note fisse
└── environments/
    └── environment.ts              # Configurazione Supabase
```

### Prerequisiti

- **Node.js** (v18+)
- **Account Supabase** con progetto configurato
- **API Key Google Gemini** (opzionale, per l'import AI)

### Installazione

```bash
# Clono il repository
git clone https://github.com/lorislalla/bilancio-mensile-ai.git
cd bilancio-mensile-ai

# Installo le dipendenze
npm install

# Configuro le variabili d'ambiente
# Modifico src/environments/environment.ts con URL e Key di Supabase

# Avvio il server di sviluppo
npm run dev
```

### Database Supabase

L'app si aspetta le seguenti tabelle su Supabase:

- `monthly_reports` — Resoconti mensili (con RLS per `user_id`)
- `global_notes` — Note fisse dell'utente
- `calculator_data` — Dati del calcolatore rapido

## Architettura

L'app segue un'architettura **component-based** con gestione dello stato tramite **Angular Signals**:

1. **`SupabaseService`** gestisce autenticazione, CRUD e sottoscrizioni Realtime
2. **`StorageService`** mantiene lo stato locale come `WritableSignal<AppData>` e sincronizza con Supabase
3. I **componenti** leggono lo stato tramite `computed()` signals e agiscono tramite i metodi dello StorageService
4. Le **sottoscrizioni Realtime** aggiornano automaticamente lo stato locale quando i dati cambiano su altri dispositivi

## Cose imparate

- Gestione dello stato con **Angular Signals** (signals, computed, effect) al posto di RxJS per lo stato locale
- Implementazione di **sottoscrizioni Realtime** con Supabase per sincronizzazione multi-dispositivo
- Integrazione di **Google Gemini** per parsing intelligente di testo non strutturato
- Pattern **optimistic update**: aggiorno lo stato locale immediatamente e sincronizzo in background
- Configurazione **TypeScript strict mode** con la risoluzione di tutti i possibili errori di tipizzazione

---

<div align="center">

Sviluppato da [Loris Lalla](https://github.com/lorislalla) | [CV](https://lorislalla.vercel.app)

</div>
