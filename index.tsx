
import { bootstrapApplication } from '@angular/platform-browser';
import { provideZonelessChangeDetection, LOCALE_ID } from '@angular/core';
import { AppComponent } from './src/app.component';
import { provideHttpClient } from '@angular/common/http';
import { registerLocaleData } from '@angular/common';
import localeIt from '@angular/common/locales/it';

registerLocaleData(localeIt, 'it-IT');

bootstrapApplication(AppComponent, {
  providers: [
    provideZonelessChangeDetection(),
    provideHttpClient(),
    { provide: LOCALE_ID, useValue: 'it-IT' }
  ]
}).catch(err => console.error(err));

// AI Studio always uses an `index.tsx` file for all project types.