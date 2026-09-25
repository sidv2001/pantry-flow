/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import pageHtml from "../index.html?raw";
import { mountApp } from "../src/app";
import { loadState, STORAGE_KEY, type StorageLike } from "../src/storage";

function memoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); }
  };
}

function find<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing test element: ${selector}`);
  }
  return element;
}

function showApp(storage: StorageLike, newId: () => string, confirm: (message: string) => boolean = () => true): void {
  document.body.innerHTML = new DOMParser().parseFromString(pageHtml, "text/html").body.innerHTML;
  mountApp(storage, {
    newId,
    confirm,
    now: () => new Date("2026-09-25T20:00:00.000Z")
  });
}

function submit(selector: string): void {
  find<HTMLFormElement>(selector).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

function addPantry(name: string, amount: string, unit: string, location: string): void {
  find<HTMLInputElement>("#inventory-name").value = name;
  find<HTMLInputElement>("#inventory-quantity").value = amount;
  find<HTMLSelectElement>("#inventory-unit").value = unit;
  find<HTMLSelectElement>("#inventory-location").value = location;
  submit("#inventory-form");
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe("pantry-to-meal-to-shopping flow", () => {
  it("records distinct dates and freezer stock, confirms a meal, then keeps edited quantities across reload", () => {
    const storage = memoryStorage();
    let nextId = 0;
    const newId = () => `id-${++nextId}`;
    showApp(storage, newId);
    expect(find("#inventory-list").textContent).toContain("Your shelves are empty");
    find<HTMLInputElement>("#label-date").value = "2026-10-01";
    find<HTMLInputElement>("#check-date").value = "2026-09-29";
    addPantry("spinach", "80", "g", "Freezer");

    expect(find("#inventory-list").textContent).toContain("Freezer · 1");
    expect(find("#inventory-list").textContent).toContain("Printed label date: 2026-10-01");
    expect(find("#inventory-list").textContent).toContain("Your CHECK date: 2026-09-29");
    find<HTMLButtonElement>('button[data-recipe-id="spinach-tomato-pasta"]').click();
    expect(find("#recipe-detail").textContent).toContain("140 g pasta (dry)");
    find<HTMLButtonElement>("#recipe-detail button.button-primary").click();

    expect(find("#confirmed-meal").textContent).toContain("A freezer item was part of the match");
    const pastaRow = Array.from(document.querySelectorAll<HTMLFormElement>(".shopping-item"))
      .find((row) => row.querySelector<HTMLInputElement>('input[type="text"]')?.value === "pasta (dry)");
    expect(pastaRow).toBeDefined();
    const pastaAmount = pastaRow?.querySelector<HTMLInputElement>('input[type="number"]');
    if (!pastaRow || !pastaAmount) {
      throw new Error("Expected pasta shopping row.");
    }
    pastaAmount.value = "200";
    pastaRow.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    const updatedPasta = Array.from(document.querySelectorAll<HTMLFormElement>(".shopping-item"))
      .find((row) => row.querySelector<HTMLInputElement>('input[type="text"]')?.value === "pasta (dry)");
    const bought = updatedPasta?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (!bought) {
      throw new Error("Expected purchased checkbox.");
    }
    bought.checked = true;
    bought.dispatchEvent(new Event("change", { bubbles: true }));

    find<HTMLInputElement>("#shopping-name").value = "herbal tea";
    find<HTMLInputElement>("#shopping-quantity").value = "2";
    submit("#shopping-form");
    expect(loadState(storage).shopping.find((item) => item.name === "herbal tea")).toMatchObject({
      quantity: 2, unit: "each", source: "manual"
    });

    showApp(storage, newId);
    expect(find("#inventory-list").textContent).toContain("Your CHECK date: 2026-09-29");
    expect(find("#confirmed-meal").textContent).toContain("A freezer item was part of the match");
    expect(loadState(storage).shopping.find((item) => item.name === "pasta (dry)")).toMatchObject({
      quantity: 200, checked: true
    });
    expect(find("#shopping-count").textContent).toContain("1 of 5 items checked");
  });

  it("previews original ingredients unless a suggested swap is explicitly accepted", () => {
    const storage = memoryStorage();
    let nextId = 0;
    showApp(storage, () => `id-${++nextId}`);
    addPantry("kale", "80", "g", "Freezer");
    find<HTMLButtonElement>('button[data-recipe-id="spinach-tomato-pasta"]').click();
    expect(find(".preview").textContent).toContain("80 g spinach");

    const swap = find<HTMLInputElement>(".swap-choice input");
    swap.checked = true;
    swap.dispatchEvent(new Event("change", { bubbles: true }));
    expect(find(".preview").textContent).not.toContain("spinach");
    find<HTMLButtonElement>("#recipe-detail button.button-primary").click();

    expect(loadState(storage).plan).toMatchObject({ recipeId: "spinach-tomato-pasta", allowSwaps: true, usesFreezer: true });
    expect(loadState(storage).shopping.map((item) => item.name)).not.toContain("spinach");
  });

  it("edits and removes stock, and asks before replacing an edited shopping list", () => {
    const storage = memoryStorage();
    let nextId = 0;
    let accept = true;
    showApp(storage, () => `id-${++nextId}`, () => accept);
    addPantry("tomato", "180", "g", "Pantry");
    find<HTMLButtonElement>('[aria-label="Edit tomato in Pantry"]').click();
    find<HTMLInputElement>("#inventory-quantity").value = "200";
    find<HTMLSelectElement>("#inventory-location").value = "Fridge";
    find<HTMLInputElement>("#check-date").value = "2026-10-02";
    submit("#inventory-form");
    expect(loadState(storage).inventory).toMatchObject([{
      name: "tomato", quantity: 200, location: "Fridge", checkDate: "2026-10-02"
    }]);
    find<HTMLButtonElement>('[aria-label="Remove tomato from Fridge"]').click();
    expect(loadState(storage).inventory).toHaveLength(0);

    find<HTMLInputElement>("#shopping-name").value = "market bread";
    find<HTMLInputElement>("#shopping-quantity").value = "2";
    submit("#shopping-form");
    find<HTMLButtonElement>('button[data-recipe-id="apple-oat-bowl"]').click();
    accept = false;
    find<HTMLButtonElement>("#recipe-detail button.button-primary").click();
    expect(loadState(storage).shopping.map((item) => item.name)).toEqual(["market bread"]);
    accept = true;
    find<HTMLButtonElement>("#recipe-detail button.button-primary").click();
    expect(loadState(storage).shopping.map((item) => item.name)).not.toContain("market bread");
    expect(loadState(storage).plan?.recipeId).toBe("apple-oat-bowl");
  });

  it("renders a custom ingredient as text and never interprets its markup", () => {
    const storage = memoryStorage();
    showApp(storage, () => "custom-id");
    addPantry('<img src=x onerror=alert(1)>', "1", "each", "Pantry");
    expect(find("#inventory-list").textContent).toContain("<img src=x onerror=alert(1)>");
    expect(document.querySelector("#inventory-list img")).toBeNull();
  });

  it("shows a storage failure rather than pretending an entry was saved", () => {
    const storage: StorageLike = {
      getItem: () => null,
      setItem: () => { throw new Error("quota reached"); },
      removeItem: () => {}
    };
    showApp(storage, () => "new-id");
    addPantry("spinach", "80", "g", "Fridge");
    expect(find("#notice").getAttribute("role")).toBe("alert");
    expect(find("#notice").textContent).toContain("Not saved");
    expect(find("#inventory-list").textContent).toContain("spinach");
  });

  it("leaves unreadable saved data untouched and exposes an explicit recovery control", () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, "{broken");
    showApp(storage, () => "new-id");
    expect(find<HTMLElement>("#fatal-error").hidden).toBe(false);
    expect(find<HTMLElement>("#app-content").hidden).toBe(true);
    expect(find<HTMLButtonElement>("#clear-data").hidden).toBe(true);
    expect(storage.getItem(STORAGE_KEY)).toBe("{broken");
  });

  it("provides a named, captioned diagram and a visible text version", () => {
    showApp(memoryStorage(), () => "new-id");
    expect(find<SVGElement>(".flow-svg").getAttribute("aria-labelledby")).toBe("flow-title flow-desc");
    expect(find("figure figcaption").textContent).toContain("One small decision");
    expect(find(".flow-text").textContent).toContain("After cooking");
  });
});
