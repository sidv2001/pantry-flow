import { describe, expect, it } from "vitest";
import { assessRecipe, rankRecipes, shoppingFor, type PantryItem } from "../src/domain";
import { getIngredient, normalizeIngredientName, type IngredientId } from "../src/ingredients";
import { parseRecipeCatalog, RECIPES, type Recipe } from "../src/recipes";

function pantry(
  name: string,
  quantity: number,
  unit: PantryItem["unit"] = "g",
  location: PantryItem["location"] = "Pantry"
): PantryItem {
  return { id: `${name}-${quantity}-${unit}-${location}`, name, quantity, unit, location, labelDate: null, checkDate: null };
}

function recipe(...ingredients: { ingredientId: IngredientId; quantity: number; unit: "g" | "ml" | "each" }[]): Recipe {
  return { id: "test-meal", title: "Test meal", description: "An original test meal.", servings: 2, minutes: 10, ingredients, steps: ["Mix."] };
}

describe("authored recipe catalog", () => {
  it("contains ten distinct, measured recipes with original instructions", () => {
    expect(RECIPES).toHaveLength(10);
    expect(new Set(RECIPES.map((entry) => entry.id)).size).toBe(10);
    for (const entry of RECIPES) {
      expect(entry.ingredients.length).toBeGreaterThanOrEqual(4);
      expect(entry.steps.length).toBeGreaterThanOrEqual(3);
      for (const part of entry.ingredients) {
        expect(getIngredient(part.ingredientId).unit).toBe(part.unit);
      }
    }
  });

  it("rejects bad ingredient references instead of ranking an invalid catalog", () => {
    expect(() =>
      parseRecipeCatalog([{
        id: "bad",
        title: "Bad",
        description: "Invalid",
        servings: 2,
        minutes: 10,
        ingredients: [{ ingredientId: "not-known", quantity: 1, unit: "g" }],
        steps: ["Mix."]
      }])
    ).toThrow("Invalid ingredient");
  });
});

describe("manual inventory matching", () => {
  it("normalizes known aliases but preserves an unknown item's own key", () => {
    expect(normalizeIngredientName("  Garbanzo beans! ")).toBe("chickpeas");
    expect(normalizeIngredientName("OATS")).toBe("rolled-oats");
    expect(normalizeIngredientName("Purple yams")).toBe("custom:purple yams");
  });

  it("combines quantities across locations and converts kg to g", () => {
    const result = assessRecipe(recipe({ ingredientId: "rolled-oats", quantity: 180, unit: "g" }), [
      pantry("oats", 0.1, "kg", "Pantry"),
      pantry("rolled oats", 80, "g", "Fridge")
    ]);
    expect(result.availableCount).toBe(1);
    expect(result.needs[0].exact.map((part) => [part.quantity, part.location])).toEqual([
      [100, "Pantry"],
      [80, "Fridge"]
    ]);
    expect(result.missingCount).toBe(0);
  });

  it("converts liters to milliliters and reports an incompatible recorded unit", () => {
    const result = assessRecipe(recipe({ ingredientId: "milk", quantity: 250, unit: "ml" }), [
      pantry("milk", 0.2, "l", "Fridge"),
      pantry("milk", 1, "each", "Fridge")
    ]);
    expect(result.needs[0].exact[0].quantity).toBe(200);
    expect(result.needs[0].missingQuantity).toBe(50);
    expect(result.needs[0].hasUnitMismatch).toBe(true);
  });

  it("uses an explicitly suggested substitute only for a remaining quantity", () => {
    const meal = recipe({ ingredientId: "spinach", quantity: 80, unit: "g" });
    const stock = [pantry("spinach", 30), pantry("kale", 20, "g", "Freezer")];
    const suggested = assessRecipe(meal, stock);
    const originalOnly = assessRecipe(meal, stock, false);
    expect(suggested.needs[0]).toMatchObject({
      category: "missing",
      missingQuantity: 30,
      exact: [{ quantity: 30 }],
      swaps: [{ quantity: 20, location: "Freezer" }]
    });
    expect(originalOnly.needs[0].missingQuantity).toBe(50);
    expect(originalOnly.needs[0].swaps).toHaveLength(0);
    expect(shoppingFor(suggested, () => "shop-1")).toEqual([
      { id: "shop-1", name: "spinach", quantity: 30, unit: "g", checked: false, source: "recipe" }
    ]);
    expect(shoppingFor(originalOnly, () => "shop-2")[0].quantity).toBe(50);
  });

  it("classifies a complete swap and prefers non-frozen stock when both are recorded", () => {
    const meal = recipe({ ingredientId: "spinach", quantity: 80, unit: "g" });
    const suggested = assessRecipe(meal, [pantry("kale", 80, "g", "Freezer")]);
    expect(suggested).toMatchObject({ availableCount: 0, substitutableCount: 1, swapCount: 1, missingCount: 0 });
    expect(suggested.needs[0].category).toBe("substitutable");

    const exact = assessRecipe(meal, [
      pantry("spinach", 80, "g", "Freezer"),
      pantry("spinach", 80, "g", "Fridge")
    ]);
    expect(exact.needs[0].exact.map((part) => part.location)).toEqual(["Fridge"]);
  });

  it("never spends the same stock twice across exact and substitute needs", () => {
    const result = assessRecipe(recipe(
      { ingredientId: "rice", quantity: 100, unit: "g" },
      { ingredientId: "quinoa", quantity: 100, unit: "g" }
    ), [pantry("quinoa", 100)]);
    expect(result.needs.map((need) => [need.category, need.missingQuantity])).toEqual([
      ["missing", 100],
      ["available", 0]
    ]);
  });

  it("ranks fewer missing ingredients ahead of swaps and shows a complete match first", () => {
    const inventory = [
      pantry("rolled oats", 80),
      pantry("milk", 250, "ml", "Fridge"),
      pantry("apple", 1, "each"),
      pantry("peanut butter", 20)
    ];
    const ranked = rankRecipes(inventory);
    expect(ranked[0].recipe.id).toBe("apple-oat-bowl");
    expect(ranked[0]).toMatchObject({ availableCount: 4, substitutableCount: 0, missingCount: 0 });
  });
});
