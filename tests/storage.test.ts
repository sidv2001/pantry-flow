import { describe, expect, it } from "vitest";
import { emptyState } from "../src/domain";
import { clearState, loadState, saveState, STORAGE_KEY, type StorageLike } from "../src/storage";

function memoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); }
  };
}

describe("local persistence", () => {
  it("round-trips locations, both distinct date fields, a confirmed meal and edited shopping", () => {
    const storage = memoryStorage();
    const state = emptyState();
    state.inventory.push({
      id: "stock-1", name: "oats", quantity: 0.5, unit: "kg", location: "Pantry",
      labelDate: "2026-10-01", checkDate: "2026-09-29"
    });
    state.plan = { recipeId: "apple-oat-bowl", allowSwaps: false, usesFreezer: false, confirmedAt: "2026-09-25T20:00:00.000Z" };
    state.shopping.push({ id: "shop-1", name: "apples", quantity: 3, unit: "each", checked: true, source: "manual" });
    saveState(storage, state);
    expect(loadState(storage)).toEqual(state);
    clearState(storage);
    expect(loadState(storage)).toEqual(emptyState());
  });

  it("does not overwrite malformed, unsupported or invalid saved data", () => {
    const storage = memoryStorage();
    for (const raw of [
      "{not json",
      JSON.stringify({ version: 2, inventory: [], plan: null, shopping: [] }),
      JSON.stringify({
        version: 1,
        inventory: [{ id: "bad", name: "milk", quantity: -1, unit: "ml", location: "Fridge", labelDate: null, checkDate: null }],
        plan: null,
        shopping: []
      })
    ]) {
      storage.setItem(STORAGE_KEY, raw);
      expect(() => loadState(storage)).toThrow();
      expect(storage.getItem(STORAGE_KEY)).toBe(raw);
    }
  });

  it("surfaces a full or unavailable browser store instead of reporting a save", () => {
    const storage = {
      getItem: () => null,
      setItem: () => { throw new Error("quota"); },
      removeItem: () => { throw new Error("blocked"); }
    };
    expect(() => saveState(storage, emptyState())).toThrow("Not saved");
    expect(() => clearState(storage)).toThrow("Could not clear");
  });
});
