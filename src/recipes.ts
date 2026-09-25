import rawRecipes from "../data/recipes.json";
import { getIngredient, isBaseUnit, isIngredientId, type BaseUnit, type IngredientId } from "./ingredients";
import { isNonEmptyString, isPositiveNumber, isRecord } from "./validation";

export interface RecipeIngredient {
  ingredientId: IngredientId;
  quantity: number;
  unit: BaseUnit;
}

export interface Recipe {
  id: string;
  title: string;
  description: string;
  servings: number;
  minutes: number;
  ingredients: RecipeIngredient[];
  steps: string[];
}

export function parseRecipeCatalog(value: unknown): Recipe[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("The recipe catalog must be a nonempty list.");
  }

  const ids = new Set<string>();
  return value.map((entry, index) => {
    if (
      !isRecord(entry) ||
      !isNonEmptyString(entry.id) ||
      !isNonEmptyString(entry.title) ||
      !isNonEmptyString(entry.description) ||
      !Number.isInteger(entry.servings) ||
      !isPositiveNumber(entry.servings) ||
      !Number.isInteger(entry.minutes) ||
      !isPositiveNumber(entry.minutes) ||
      !Array.isArray(entry.ingredients) ||
      entry.ingredients.length === 0 ||
      !Array.isArray(entry.steps) ||
      entry.steps.length === 0 ||
      !entry.steps.every(isNonEmptyString)
    ) {
      throw new Error(`Invalid recipe at position ${index + 1}.`);
    }
    if (ids.has(entry.id)) {
      throw new Error(`Duplicate recipe id: ${entry.id}`);
    }
    ids.add(entry.id);

    const ingredientIds = new Set<IngredientId>();
    const ingredients: RecipeIngredient[] = entry.ingredients.map((part: unknown) => {
      if (
        !isRecord(part) ||
        !isIngredientId(part.ingredientId) ||
        !isPositiveNumber(part.quantity) ||
        !isBaseUnit(part.unit) ||
        getIngredient(part.ingredientId).unit !== part.unit
      ) {
        throw new Error(`Invalid ingredient in recipe "${entry.id}".`);
      }
      if (ingredientIds.has(part.ingredientId)) {
        throw new Error(`Repeated ingredient in recipe "${entry.id}".`);
      }
      ingredientIds.add(part.ingredientId);
      return { ingredientId: part.ingredientId, quantity: part.quantity, unit: part.unit };
    });

    return {
      id: entry.id,
      title: entry.title,
      description: entry.description,
      servings: entry.servings,
      minutes: entry.minutes,
      ingredients,
      steps: entry.steps
    };
  });
}

export const RECIPES = parseRecipeCatalog(rawRecipes);
