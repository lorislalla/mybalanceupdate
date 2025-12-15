import { Component, ChangeDetectionStrategy, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StorageService } from '../../services/storage.service';
import { CalculatorItem } from '../../models/financial-data.model';

@Component({
  selector: 'app-calculator',
  templateUrl: './calculator.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule]
})
export class CalculatorComponent {
  private storageService = inject(StorageService);

  // Directly access items from storage signal
  items = computed(() => this.storageService.appData().calculatorItems || []);

  total = computed(() => {
    return this.items().reduce((acc, item) => acc + item.amount, 0);
  });

  // Local state for new item
  newItemDescription = signal('');
  newItemAmount = signal<number | null>(null);

  addItem() {
    const description = this.newItemDescription().trim();
    const amount = this.newItemAmount();

    if (description && amount !== null) {
      const newItem: CalculatorItem = {
        id: crypto.randomUUID(),
        description,
        amount
      };

      const currentItems = this.items();
      this.storageService.updateCalculatorItems([...currentItems, newItem]);

      // Reset form
      this.newItemDescription.set('');
      this.newItemAmount.set(null);
    }
  }

  updateItem(id: string, field: 'description' | 'amount', value: any) {
    const currentItems = this.items().map(item => {
      if (item.id === id) {
        return { ...item, [field]: value };
      }
      return item;
    });
    this.storageService.updateCalculatorItems(currentItems);
  }

  removeItem(id: string) {
    const currentItems = this.items().filter(item => item.id !== id);
    this.storageService.updateCalculatorItems(currentItems);
  }
}
