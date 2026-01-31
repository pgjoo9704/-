
export type MealCategory = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack' | 'Other';

export interface MealLog {
  id: string;
  timestamp: number;
  foodName: string;
  proteinGrams: number;
  imageUrl?: string;
  category: MealCategory;
}

export interface DailySummary {
  date: string; // YYYY-MM-DD
  totalProtein: number;
  goal: number;
}
