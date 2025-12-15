import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class FileHandlerService {

  constructor() { }

  readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve(reader.result as string);
      };
      reader.onerror = (error) => {
        reject(error);
      };
      reader.readAsText(file);
    });
  }
}
