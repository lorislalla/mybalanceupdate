import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StorageService } from '../../services/storage.service';
import { GeminiService } from '../../services/gemini.service';
import { FileHandlerService } from '../../services/file-handler.service';
import { AppData, MonthlyReport } from '../../models/financial-data.model';

type Tab = 'import' | 'export';

@Component({
  selector: 'app-import-export',
  templateUrl: './import-export.component.html',
  imports: [CommonModule, FormsModule]
})
export class ImportExportComponent {
  private storageService = inject(StorageService);
  private geminiService = inject(GeminiService);
  private fileHandlerService = inject(FileHandlerService);

  activeTab = signal<Tab>('import');
  
  // Import signals
  textToParse = signal('');
  userInstructions = signal('');
  isLoading = signal(false);
  errorMessage = signal('');
  successMessage = signal('');
  
  // API Key management
  apiKey = signal('');
  showApiKeyInput = signal(false);

  constructor() {
    // Pre-fill if exists
    const stored = this.geminiService.getStoredApiKey();
    if (stored) {
        this.apiKey.set(stored);
    } else {
        this.showApiKeyInput.set(true);
    }
  }

  toggleApiKeyInput() {
    this.showApiKeyInput.update(v => !v);
  }

  saveApiKey() {
    if (this.apiKey()) {
        this.geminiService.setApiKey(this.apiKey());
        this.successMessage.set('API Key salvata con successo.');
        this.showApiKeyInput.set(false);
        setTimeout(() => this.successMessage.set(''), 3000);
    }
  }

  setActiveTab(tab: Tab) {
    this.activeTab.set(tab);
  }

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      try {
        const text = await this.fileHandlerService.readFileAsText(file);
        this.textToParse.set(text);
        this.successMessage.set(`File ${file.name} caricato con successo.`);
        this.errorMessage.set('');
      } catch (error) {
        console.error('Error reading file:', error);
        this.errorMessage.set('Errore durante la lettura del file.');
        this.successMessage.set('');
      }
    }
  }

  async handleImport() {
    if (!this.textToParse()) {
      this.errorMessage.set('Per favore, inserisci del testo o carica un file da analizzare.');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    try {
      const parsedReports = await this.geminiService.parseFinancialData(this.textToParse(), this.userInstructions());
      this.storageService.importData(parsedReports);
      this.successMessage.set(`Importazione completata! ${parsedReports.length} resoconti sono stati aggiunti o aggiornati.`);
      this.textToParse.set('');
      this.userInstructions.set('');
    } catch (error: any) {
      this.errorMessage.set(error.message || 'Si è verificato un errore sconosciuto.');
    } finally {
      this.isLoading.set(false);
    }
  }

  exportData(format: 'json' | 'csv') {
    const data = this.storageService.appData();
    if (format === 'json') {
      this.downloadFile(JSON.stringify(data, null, 2), 'bilancio-mensile.json', 'application/json');
    } else if (format === 'csv') {
      this.downloadFile(this.convertToCSV(data), 'bilancio-mensile.csv', 'text/csv');
    }
  }

  private convertToCSV(data: AppData): string {
    const headers = ['Anno', 'Mese', 'Data Stipendio', 'Saldo', 'Descrizione Spesa', 'Importo Spesa', 'Note Mese'];
    let csvContent = headers.join(',') + '\n';

    data.reports.forEach(report => {
      if (report.expenses.length > 0) {
        report.expenses.forEach(expense => {
          const row = [
            report.year,
            report.month,
            report.payday,
            report.balance,
            `"${expense.description.replace(/"/g, '""')}"`,
            expense.amount,
            `"${(report.notes || '').replace(/"/g, '""')}"`
          ];
          csvContent += row.join(',') + '\n';
        });
      } else {
         const row = [
            report.year,
            report.month,
            report.payday,
            report.balance,
            '',
            '',
            `"${(report.notes || '').replace(/"/g, '""')}"`
          ];
          csvContent += row.join(',') + '\n';
      }
    });

    return csvContent;
  }
  
  private downloadFile(content: string, fileName: string, contentType: string) {
    const a = document.createElement("a");
    const file = new Blob([content], { type: contentType });
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}
