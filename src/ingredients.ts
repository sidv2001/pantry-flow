export const BASE_UNITS = ["g", "ml", "each"] as const;
export type BaseUnit = (typeof BASE_UNITS)[number];

export const UNIT_INFO = {
  g: { base: "g", multiplier: 1 },
  kg: { base: "g", multiplier: 1000 },
  ml: { base: "ml", multiplier: 1 },
  l: { base: "ml", multiplier: 1000 },
  each: { base: "each", multiplier: 1 }
} as const satisfies Record<string, { base: BaseUnit; multiplier: number }>;

export type Unit = keyof typeof UNIT_INFO;

export function isUnit(value: unknown): value is Unit {
  return typeof value === "string" && Object.hasOwn(UNIT_INFO, value);
}

export function isBaseUnit(value: unknown): value is BaseUnit {
  return value === "g" || value === "ml" || value === "each";
}

export const INGREDIENTS = [
  { id: "rolled-oats", name: "rolled oats", unit: "g", aliases: ["oats"] },
  { id: "milk", name: "milk", unit: "ml", aliases: ["dairy milk"] },
  { id: "oat-milk", name: "unsweetened oat milk", unit: "ml", aliases: ["oat milk"] },
  { id: "apple", name: "apple", unit: "each", aliases: ["apples"] },
  { id: "peanut-butter", name: "peanut butter", unit: "g", aliases: [] },
  { id: "yogurt", name: "plain yogurt", unit: "g", aliases: ["yogurt"] },
  { id: "plant-yogurt", name: "unsweetened plant yogurt", unit: "g", aliases: ["plant yogurt"] },
  { id: "berries", name: "mixed berries", unit: "g", aliases: ["berries"] },
  { id: "banana", name: "banana", unit: "each", aliases: ["bananas"] },
  { id: "rice", name: "rice (dry)", unit: "g", aliases: ["rice", "dry rice"] },
  { id: "quinoa", name: "quinoa (dry)", unit: "g", aliases: ["quinoa", "dry quinoa"] },
  { id: "chickpeas", name: "chickpeas (drained)", unit: "g", aliases: ["chickpeas", "garbanzo beans"] },
  { id: "white-beans", name: "white beans (drained)", unit: "g", aliases: ["white beans", "cannellini beans"] },
  { id: "spinach", name: "spinach", unit: "g", aliases: [] },
  { id: "kale", name: "kale", unit: "g", aliases: [] },
  { id: "lemon", name: "lemon", unit: "each", aliases: ["lemons"] },
  { id: "olive-oil", name: "olive oil", unit: "ml", aliases: [] },
  { id: "canola-oil", name: "canola oil", unit: "ml", aliases: [] },
  { id: "red-lentils", name: "red lentils (dry)", unit: "g", aliases: ["red lentils", "dry red lentils"] },
  { id: "carrot", name: "carrot", unit: "g", aliases: ["carrots"] },
  { id: "onion", name: "onion", unit: "g", aliases: ["onions"] },
  { id: "garlic", name: "garlic (clove)", unit: "each", aliases: ["garlic", "garlic cloves"] },
  { id: "tortilla", name: "whole-wheat tortilla", unit: "each", aliases: ["tortilla", "whole wheat tortillas"] },
  { id: "cucumber", name: "cucumber", unit: "g", aliases: ["cucumbers"] },
  { id: "tomato", name: "tomato", unit: "g", aliases: ["tomatoes"] },
  { id: "pasta", name: "pasta (dry)", unit: "g", aliases: ["pasta", "dry pasta"] },
  { id: "black-beans", name: "black beans (drained)", unit: "g", aliases: ["black beans"] },
  { id: "bell-pepper", name: "bell pepper", unit: "g", aliases: ["bell peppers"] },
  { id: "frozen-peas", name: "frozen peas", unit: "g", aliases: ["peas"] },
  { id: "tofu", name: "firm tofu", unit: "g", aliases: ["tofu"] },
  { id: "bread", name: "whole-wheat bread (slice)", unit: "each", aliases: ["whole wheat bread", "bread slices"] }
] as const satisfies readonly { id: string; name: string; unit: BaseUnit; aliases: readonly string[] }[];

export type IngredientId = (typeof INGREDIENTS)[number]["id"];
export type Ingredient = (typeof INGREDIENTS)[number];

const byId = new Map<string, Ingredient>(INGREDIENTS.map((ingredient) => [ingredient.id, ingredient]));
const byName = new Map<string, IngredientId>();

function nameKey(name: string): string {
  return name.normalize("NFKC").trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

for (const ingredient of INGREDIENTS) {
  for (const name of [ingredient.name, ...ingredient.aliases]) {
    const key = nameKey(name);
    const existing = byName.get(key);
    if (existing && existing !== ingredient.id) {
      throw new Error(`Ingredient alias "${name}" belongs to two ingredients.`);
    }
    byName.set(key, ingredient.id);
  }
}

export function isIngredientId(value: unknown): value is IngredientId {
  return typeof value === "string" && byId.has(value);
}

export function getIngredient(id: IngredientId): Ingredient {
  const ingredient = byId.get(id);
  if (!ingredient) {
    throw new Error(`Unknown ingredient: ${id}`);
  }
  return ingredient;
}

export function normalizeIngredientName(name: string): string {
  const key = nameKey(name);
  return key ? byName.get(key) ?? `custom:${key}` : "";
}

export const SUBSTITUTIONS: Partial<Record<IngredientId, readonly IngredientId[]>> = {
  milk: ["oat-milk"],
  "oat-milk": ["milk"],
  yogurt: ["plant-yogurt"],
  "plant-yogurt": ["yogurt"],
  rice: ["quinoa"],
  quinoa: ["rice"],
  chickpeas: ["white-beans"],
  "white-beans": ["chickpeas"],
  spinach: ["kale"],
  kale: ["spinach"],
  "olive-oil": ["canola-oil"],
  "canola-oil": ["olive-oil"]
};
