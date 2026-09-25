import {
  getIngredient,
  normalizeIngredientName,
  SUBSTITUTIONS,
  UNIT_INFO,
  type BaseUnit,
  type IngredientId,
  type Unit
} from "./ingredients";
import { RECIPES, type Recipe, type RecipeIngredient } from "./recipes";

export const LOCATIONS = ["Pantry", "Fridge", "Freezer"] as const;
export type Location = (typeof LOCATIONS)[number];

export function isLocation(value: unknown): value is Location {
  return LOCATIONS.some((location) => location === value);
}

export interface PantryItem {
  id: string;
  name: string;
  quantity: number;
  unit: Unit;
  location: Location;
  labelDate: string | null;
  checkDate: string | null;
}

export interface ShoppingItem {
  id: string;
  name: string;
  quantity: number;
  unit: Unit;
  checked: boolean;
  source: "recipe" | "manual";
}

export interface PlannedMeal {
  recipeId: string;
  allowSwaps: boolean;
  usesFreezer: boolean;
  confirmedAt: string;
}

export interface AppState {
  version: 1;
  inventory: PantryItem[];
  plan: PlannedMeal | null;
  shopping: ShoppingItem[];
}

export interface Allocation {
  stockId: string;
  name: string;
  location: Location;
  quantity: number;
  unit: BaseUnit;
}

export interface IngredientNeed {
  ingredient: RecipeIngredient;
  exact: Allocation[];
  swaps: Allocation[];
  missingQuantity: number;
  category: "available" | "substitutable" | "missing";
  hasUnitMismatch: boolean;
}

export interface Assessment {
  recipe: Recipe;
  needs: IngredientNeed[];
  availableCount: number;
  substitutableCount: number;
  swapCount: number;
  missingCount: number;
  missingFraction: number;
}

export function emptyState(): AppState {
  return { version: 1, inventory: [], plan: null, shopping: [] };
}

export function toBaseQuantity(quantity: number, unit: Unit): { quantity: number; unit: BaseUnit } {
  const info = UNIT_INFO[unit];
  return { quantity: quantity * info.multiplier, unit: info.base };
}

export function formatQuantity(quantity: number, unit: Unit): string {
  const formatted = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(quantity);
  return `${formatted} ${unit}`;
}

function rounded(quantity: number): number {
  return Math.round(quantity * 1000) / 1000;
}

export function assessRecipe(recipe: Recipe, inventory: readonly PantryItem[], allowSwaps = true): Assessment {
  const stock = inventory.map((item) => {
    const base = toBaseQuantity(item.quantity, item.unit);
    return { item, ingredientId: normalizeIngredientName(item.name), base, remaining: base.quantity };
  }).sort((a, b) => Number(a.item.location === "Freezer") - Number(b.item.location === "Freezer"));
  const needs: IngredientNeed[] = recipe.ingredients.map((ingredient) => ({
    ingredient,
    exact: [],
    swaps: [],
    missingQuantity: ingredient.quantity,
    category: "missing",
    hasUnitMismatch: false
  }));

  function allocate(id: IngredientId, need: IngredientNeed, into: Allocation[], amount: number): number {
    let remaining = amount;
    for (const entry of stock) {
      if (entry.ingredientId !== id || entry.base.unit !== need.ingredient.unit || entry.remaining <= 0) {
        continue;
      }
      const used = Math.min(remaining, entry.remaining);
      if (used <= 0) {
        break;
      }
      into.push({
        stockId: entry.item.id,
        name: entry.item.name,
        location: entry.item.location,
        quantity: rounded(used),
        unit: need.ingredient.unit
      });
      entry.remaining = rounded(entry.remaining - used);
      remaining = rounded(remaining - used);
      if (remaining <= 0) {
        break;
      }
    }
    return remaining;
  }

  // Reserve every exact match before a suggestion can borrow the same stock.
  for (const need of needs) {
    need.missingQuantity = allocate(need.ingredient.ingredientId, need, need.exact, need.ingredient.quantity);
  }

  for (const need of needs) {
    if (allowSwaps && need.missingQuantity > 0) {
      for (const substituteId of SUBSTITUTIONS[need.ingredient.ingredientId] ?? []) {
        need.missingQuantity = allocate(substituteId, need, need.swaps, need.missingQuantity);
        if (need.missingQuantity <= 0) {
          break;
        }
      }
    }
    need.hasUnitMismatch = stock.some(
      (entry) => entry.ingredientId === need.ingredient.ingredientId && entry.base.unit !== need.ingredient.unit
    );
    need.category = need.missingQuantity > 0 ? "missing" : need.swaps.length > 0 ? "substitutable" : "available";
  }

  return {
    recipe,
    needs,
    availableCount: needs.filter((need) => need.category === "available").length,
    substitutableCount: needs.filter((need) => need.category === "substitutable").length,
    swapCount: needs.filter((need) => need.swaps.length > 0).length,
    missingCount: needs.filter((need) => need.category === "missing").length,
    missingFraction: needs.reduce((total, need) => total + need.missingQuantity / need.ingredient.quantity, 0)
  };
}

export function rankRecipes(inventory: readonly PantryItem[]): Assessment[] {
  return RECIPES.map((recipe) => assessRecipe(recipe, inventory)).sort(
    (a, b) =>
      a.missingCount - b.missingCount ||
      a.missingFraction - b.missingFraction ||
      a.swapCount - b.swapCount ||
      a.recipe.minutes - b.recipe.minutes ||
      a.recipe.title.localeCompare(b.recipe.title)
  );
}

export function shoppingFor(assessment: Assessment, newId: () => string): ShoppingItem[] {
  return assessment.needs
    .filter((need) => need.missingQuantity > 0)
    .map((need) => ({
      id: newId(),
      name: getIngredient(need.ingredient.ingredientId).name,
      quantity: need.missingQuantity,
      unit: need.ingredient.unit,
      checked: false,
      source: "recipe" as const
    }));
}
