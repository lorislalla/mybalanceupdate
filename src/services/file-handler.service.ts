import { Injectable } from '@angular/core'

@Injectable({
  providedIn: 'root'
})
export class FileHandlerService {
  // Leggo il contenuto di un file come testo (usato per import e restore backup)
  readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        resolve(reader.result as string)
      }
      reader.onerror = (error) => {
        reject(error)
      }
      reader.readAsText(file)
    })
  }
}
