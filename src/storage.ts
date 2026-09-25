import { emptyState, isLocation, type AppState, type PantryItem, type PlannedMeal, type ShoppingItem } from "./domain";
import { isUnit } from "./ingredients";
import { RECIPES } from "./recipes";
import { isIsoDate, isNonEmptyString, isPositiveNumber, isRecord } from "./validation";

export const STORAGE_KEY = "pantry-flow-v1";
export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export class PersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PersistenceError";
  }
}

function parseInventoryItem(value: unknown): PantryItem {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.name) ||
    !isPositiveNumber(value.quantity) ||
    value.quantity < 0.001 ||
    !isUnit(value.unit) ||
    !isLocation(value.location) ||
    !(value.labelDate === null || isIsoDate(value.labelDate)) ||
    !(value.checkDate === null || isIsoDate(value.checkDate))
  ) {
    throw new PersistenceError("Saved pantry data has an invalid item; it was left untouched.");
  }
  return {
    id: value.id,
    name: value.name,
    quantity: value.quantity,
    unit: value.unit,
    location: value.location,
    labelDate: value.labelDate,
    checkDate: value.checkDate
  };
}

function parseShoppingItem(value: unknown): ShoppingItem {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.name) ||
    !isPositiveNumber(value.quantity) ||
    value.quantity < 0.001 ||
    !isUnit(value.unit) ||
    typeof value.checked !== "boolean" ||
    (value.source !== "recipe" && value.source !== "manual")
  ) {
    throw new PersistenceError("Saved shopping data has an invalid item; it was left untouched.");
  }
  return {
    id: value.id,
    name: value.name,
    quantity: value.quantity,
    unit: value.unit,
    checked: value.checked,
    source: value.source
  };
}

function parsePlan(value: unknown): PlannedMeal | null {
  if (value === null) {
    return null;
  }
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.recipeId) ||
    !RECIPES.some((recipe) => recipe.id === value.recipeId) ||
    typeof value.allowSwaps !== "boolean" ||
    typeof value.usesFreezer !== "boolean" ||
    !isNonEmptyString(value.confirmedAt) ||
    !Number.isFinite(Date.parse(value.confirmedAt))
  ) {
    throw new PersistenceError("Saved meal plan is invalid; it was left untouched.");
  }
  return {
    recipeId: value.recipeId,
    allowSwaps: value.allowSwaps,
    usesFreezer: value.usesFreezer,
    confirmedAt: value.confirmedAt
  };
}

function parseState(value: unknown): AppState {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.inventory) || !Array.isArray(value.shopping)) {
    throw new PersistenceError("Saved pantry format is unsupported; it was left untouched.");
  }
  const inventory = value.inventory.map(parseInventoryItem);
  const shopping = value.shopping.map(parseShoppingItem);
  if (
    new Set(inventory.map((item) => item.id)).size !== inventory.length ||
    new Set(shopping.map((item) => item.id)).size !== shopping.length
  ) {
    throw new PersistenceError("Saved pantry data contains duplicate items; it was left untouched.");
  }
  return { version: 1, inventory, plan: parsePlan(value.plan), shopping };
}

export function loadState(storage: StorageLike): AppState {
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    throw new PersistenceError("Browser storage is unavailable. No pantry data was loaded or changed.");
  }
  if (raw === null) {
    return emptyState();
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new PersistenceError("Saved pantry data cannot be read; it was left untouched.");
  }
  return parseState(value);
}

export function saveState(storage: StorageLike, state: AppState): void {
  const validState = parseState(state);
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(validState));
  } catch {
    throw new PersistenceError("Not saved: browser storage is unavailable or full. Changes may be lost on reload.");
  }
}

export function clearState(storage: StorageLike): void {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    throw new PersistenceError("Could not clear browser storage. Existing data was left untouched.");
  }
}
