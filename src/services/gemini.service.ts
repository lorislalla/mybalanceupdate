import { Injectable } from '@angular/core';
import { GoogleGenAI, Type } from '@google/genai';
import { MonthlyReport } from '../models/financial-data.model';

@Injectable({
  providedIn: 'root'
})
export class GeminiService {
  private ai: GoogleGenAI | null = null;
  private apiKeyKey = 'GEMINI_API_KEY';

  constructor() {
    const storedKey = this.getStoredApiKey();
    if (storedKey) {
      this.ai = new GoogleGenAI({ apiKey: storedKey });
    }
  }

  setApiKey(key: string) {
    if (!key) return;
    localStorage.setItem(this.apiKeyKey, key);
    this.ai = new GoogleGenAI({ apiKey: key });
  }

  getStoredApiKey(): string | null {
    return localStorage.getItem(this.apiKeyKey);
  }

  hasApiKey(): boolean {
    return !!this.ai;
  }

  async parseFinancialData(textToParse: string, userInstructions: string): Promise<MonthlyReport[]> {
    const model = 'gemini-2.5-flash';

    const schema = {
      type: Type.OBJECT,
      properties: {
        reports: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              year: { type: Type.NUMBER, description: "L'anno del resoconto, es. 2024" },
              month: { type: Type.NUMBER, description: "Il mese del resoconto (1 per Gennaio, 12 per Dicembre)" },
              payday: { type: Type.STRING, description: "La data dello stipendio in formato YYYY-MM-DD." },
              balance: { type: Type.NUMBER, description: "Il saldo del conto il giorno dello stipendio." },
              salary: { type: Type.NUMBER, description: "Lo stipendio netto mensile se indicato separatamente." },
              salary13: { type: Type.NUMBER, description: "Importo della tredicesima mensilità (solitamente Dicembre)." },
              salary14: { type: Type.NUMBER, description: "Importo della quattordicesima mensilità (solitamente Giugno)." },
              expenses: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    description: { type: Type.STRING, description: "Descrizione della spesa." },
                    amount: { type: Type.NUMBER, description: "Costo della spesa." }
                  },
                  required: ["description", "amount"]
                }
              },
              notes: { type: Type.STRING, description: "Eventuali note per il mese." }
            },
            required: ["year", "month", "payday", "balance"]
          }
        }
      },
      required: ["reports"]
    };

    const prompt = `
Sei un assistente esperto nell'analisi di dati finanziari. Il tuo compito è analizzare il testo fornito e estrarre i dati finanziari secondo le istruzioni dell'utente.
Devi strutturare l'output rigorosamente secondo lo schema JSON fornito. I dati rappresentano resoconti finanziari mensili.

Testo fornito da analizzare:
---
${textToParse}
---

Istruzioni dell'utente per l'analisi:
---
${userInstructions || 'Nessuna istruzione specifica fornita. Analizza il testo basandoti sulla sua struttura comune.'}
---

Analizza il testo e restituisci i dati come oggetto JSON contenente un array di resoconti mensili.
Se una spesa non ha un importo valido, ignorala. Assicurati che ogni resoconto abbia anno, mese, data stipendio e saldo.
`;

    if (!this.ai) {
        throw new Error("API Key Gemini non configurata. Inseriscila nella sezione dedicata.");
    }

    try {
      const response = await this.ai.models.generateContent({
        model: model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      });
      
      const jsonStr = response.text.trim();
      const parsedData = JSON.parse(jsonStr);
      
      // Basic validation
      if (parsedData && Array.isArray(parsedData.reports)) {
          return parsedData.reports as MonthlyReport[];
      } else {
          throw new Error("Formato JSON non valido dall'API.");
      }

    } catch (error) {
      console.error("Errore durante la chiamata all'API Gemini:", error);
      throw new Error("Impossibile analizzare i dati. Controlla il testo e le istruzioni e riprova.");
    }
  }
}
