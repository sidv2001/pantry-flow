import {
  assessRecipe,
  formatQuantity,
  isLocation,
  LOCATIONS,
  rankRecipes,
  shoppingFor,
  type AppState,
  type IngredientNeed,
  type PantryItem,
  type ShoppingItem
} from "./domain";
import { getIngredient, INGREDIENTS, isUnit, normalizeIngredientName, UNIT_INFO, type Unit } from "./ingredients";
import { RECIPES } from "./recipes";
import { clearState, loadState, PersistenceError, saveState, type StorageLike } from "./storage";
import { isIsoDate, isPositiveNumber } from "./validation";

interface AppOptions {
  newId?: () => string;
  confirm?: (message: string) => boolean;
  now?: () => Date;
}

function required<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing application element: ${selector}`);
  }
  return element;
}

function make<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text?: string
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

function plural(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function amountInput(value: number, label: string): HTMLInputElement {
  const input = make("input");
  input.type = "number";
  input.min = "0.001";
  input.step = "any";
  input.required = true;
  input.value = String(value);
  input.setAttribute("inputmode", "decimal");
  input.setAttribute("aria-label", label);
  input.addEventListener("input", () => input.setCustomValidity(""));
  return input;
}

function unitSelect(selected: Unit, label: string): HTMLSelectElement {
  const select = make("select");
  select.setAttribute("aria-label", label);
  for (const unit of Object.keys(UNIT_INFO)) {
    if (!isUnit(unit)) {
      continue;
    }
    const option = make("option", "", unit);
    option.value = unit;
    select.append(option);
  }
  select.value = selected;
  return select;
}

function field(label: string, input: HTMLElement): HTMLLabelElement {
  const wrapper = make("label", "field");
  wrapper.append(make("span", "field-label", label), input);
  return wrapper;
}

function readName(input: HTMLInputElement): string | null {
  const name = input.value.trim();
  if (!name) {
    input.setCustomValidity("Enter an item name.");
    input.reportValidity();
    return null;
  }
  input.setCustomValidity("");
  return name;
}

function readAmount(input: HTMLInputElement): number | null {
  const quantity = Number(input.value);
  if (!input.value.trim() || !isPositiveNumber(quantity) || quantity < 0.001 || !input.checkValidity()) {
    input.setCustomValidity("Enter an amount of at least 0.001 in the selected unit.");
    input.reportValidity();
    return null;
  }
  input.setCustomValidity("");
  return quantity;
}

function needExplanation(need: IngredientNeed): string {
  const unit = need.ingredient.unit;
  const parts = [`${formatQuantity(need.ingredient.quantity, unit)} needed`];
  if (need.exact.length > 0) {
    parts.push(`recorded ${need.exact.map((part) => `${formatQuantity(part.quantity, unit)} in ${part.location}`).join(" + ")}`);
  }
  if (need.swaps.length > 0) {
    parts.push(`possible swap: ${need.swaps.map((part) => `${formatQuantity(part.quantity, unit)} ${part.name} in ${part.location}`).join(" + ")}`);
  }
  if (need.missingQuantity > 0) {
    parts.push(`${formatQuantity(need.missingQuantity, unit)} still to buy${need.swaps.length > 0 ? " with this suggested swap" : ""}`);
  }
  if (need.hasUnitMismatch) {
    parts.push("another entry uses a different kind of unit; measure it before counting it");
  }
  return `${parts.join("; ")}.`;
}

export function mountApp(storage?: StorageLike, options: AppOptions = {}): void {
  const appContent = required<HTMLElement>("#app-content");
  const fatal = required<HTMLElement>("#fatal-error");
  const fatalMessage = required<HTMLElement>("#fatal-message");
  const resetUnreadable = required<HTMLButtonElement>("#reset-unreadable");
  const notice = required<HTMLElement>("#notice");
  const clearButton = required<HTMLButtonElement>("#clear-data");
  const confirmAction = options.confirm ?? ((message: string) => window.confirm(message));
  const newId = options.newId ?? (() => globalThis.crypto.randomUUID());
  const now = options.now ?? (() => new Date());

  function setNotice(message: string, error = false): void {
    notice.textContent = message;
    notice.classList.toggle("is-error", error);
    notice.setAttribute("role", error ? "alert" : "status");
  }

  let store: StorageLike;
  try {
    store = storage ?? window.localStorage;
  } catch {
    appContent.hidden = true;
    fatal.hidden = false;
    fatalMessage.textContent = "Browser storage is unavailable. Enable local storage to use this starter.";
    resetUnreadable.hidden = true;
    clearButton.hidden = true;
    return;
  }

  let state: AppState;
  try {
    state = loadState(store);
  } catch (error) {
    if (!(error instanceof PersistenceError)) {
      throw error;
    }
    appContent.hidden = true;
    fatal.hidden = false;
    fatalMessage.textContent = error.message;
    clearButton.hidden = true;
    resetUnreadable.addEventListener("click", () => {
      if (!confirmAction("Permanently clear this browser's PantryFlow data and start again?")) {
        return;
      }
      try {
        clearState(store);
        window.location.reload();
      } catch (clearError) {
        if (!(clearError instanceof PersistenceError)) {
          throw clearError;
        }
        setNotice(clearError.message, true);
      }
    });
    return;
  }
  fatal.hidden = true;
  appContent.hidden = false;
  clearButton.hidden = false;

  const inventoryForm = required<HTMLFormElement>("#inventory-form");
  const inventoryName = required<HTMLInputElement>("#inventory-name");
  const inventoryQuantity = required<HTMLInputElement>("#inventory-quantity");
  const inventoryUnit = required<HTMLSelectElement>("#inventory-unit");
  const inventoryLocation = required<HTMLSelectElement>("#inventory-location");
  const labelDate = required<HTMLInputElement>("#label-date");
  const checkDate = required<HTMLInputElement>("#check-date");
  const inventorySubmit = required<HTMLButtonElement>("#inventory-submit");
  const cancelInventoryEdit = required<HTMLButtonElement>("#cancel-inventory-edit");
  const inventoryFormHeading = required<HTMLElement>("#inventory-form-heading");
  const knownIngredients = required<HTMLDataListElement>("#known-ingredients");
  const inventoryList = required<HTMLElement>("#inventory-list");
  const inventoryCount = required<HTMLElement>("#inventory-count");
  const recipeList = required<HTMLElement>("#recipe-list");
  const recipeDetail = required<HTMLElement>("#recipe-detail");
  const confirmedMeal = required<HTMLElement>("#confirmed-meal");
  const shoppingList = required<HTMLElement>("#shopping-list");
  const shoppingCount = required<HTMLElement>("#shopping-count");
  const shoppingForm = required<HTMLFormElement>("#shopping-form");
  const shoppingName = required<HTMLInputElement>("#shopping-name");
  const shoppingQuantity = required<HTMLInputElement>("#shopping-quantity");
  const shoppingUnit = required<HTMLSelectElement>("#shopping-unit");

  let editingId: string | null = null;
  let activeRecipeId: string | null = null;
  let allowSwapsDraft = false;

  for (const ingredient of INGREDIENTS) {
    const option = make("option");
    option.value = ingredient.name;
    knownIngredients.append(option);
  }

  function resetInventoryForm(): void {
    inventoryForm.reset();
    inventoryName.setCustomValidity("");
    inventoryQuantity.setCustomValidity("");
    editingId = null;
    inventorySubmit.textContent = "Add to pantry";
    inventoryFormHeading.textContent = "Add a pantry item";
    cancelInventoryEdit.hidden = true;
  }

  function renderInventory(): void {
    inventoryCount.textContent = plural(state.inventory.length, "item");
    inventoryList.replaceChildren();
    if (state.inventory.length === 0) {
      inventoryList.append(make("p", "empty-message", "Your shelves are empty here. Add a few real ingredients to see which meals get closer."));
      return;
    }

    for (const location of LOCATIONS) {
      const items = state.inventory.filter((item) => item.location === location).sort((a, b) => a.name.localeCompare(b.name));
      const group = make("section", "shelf-group");
      group.append(make("h4", "", `${location} · ${items.length}`));
      if (items.length === 0) {
        group.append(make("p", "empty-message", "Nothing recorded here yet."));
      } else {
        const list = make("ul", "shelf-list");
        for (const item of items) {
          const row = make("li");
          const info = make("div");
          info.append(make("strong", "shelf-item-name", item.name));
          info.append(make("p", "shelf-meta", `${formatQuantity(item.quantity, item.unit)} recorded`));
          for (const [label, date] of [["Printed label date", item.labelDate], ["Your CHECK date", item.checkDate]] as const) {
            if (date !== null) {
              const dateLine = make("p", "shelf-meta");
              const time = make("time", "", date);
              time.dateTime = date;
              dateLine.append(`${label}: `, time);
              info.append(dateLine);
            }
          }
          const actions = make("div", "shelf-actions");
          const edit = make("button", "text-button", "Edit");
          edit.type = "button";
          edit.setAttribute("aria-label", `Edit ${item.name} in ${location}`);
          edit.addEventListener("click", () => {
            editingId = item.id;
            inventoryName.value = item.name;
            inventoryQuantity.value = String(item.quantity);
            inventoryUnit.value = item.unit;
            inventoryLocation.value = item.location;
            labelDate.value = item.labelDate ?? "";
            checkDate.value = item.checkDate ?? "";
            inventorySubmit.textContent = "Save item";
            inventoryFormHeading.textContent = `Edit ${item.name}`;
            cancelInventoryEdit.hidden = false;
            inventoryName.focus();
          });
          const remove = make("button", "text-button danger", "Remove");
          remove.type = "button";
          remove.setAttribute("aria-label", `Remove ${item.name} from ${location}`);
          remove.addEventListener("click", () => {
            if (!confirmAction(`Remove ${item.name} from your ${location.toLowerCase()}?`)) {
              return;
            }
            if (editingId === item.id) {
              resetInventoryForm();
            }
            commit({ ...state, inventory: state.inventory.filter((entry) => entry.id !== item.id) }, "Pantry item removed.");
          });
          actions.append(edit, remove);
          row.append(info, actions);
          list.append(row);
        }
        group.append(list);
      }
      inventoryList.append(group);
    }
  }

  function renderRecipes(): void {
    recipeList.replaceChildren();
    for (const assessment of rankRecipes(state.inventory)) {
      const recipe = assessment.recipe;
      const card = make("article", "recipe-card");
      const header = make("div");
      const status = make("div", "recipe-status");
      status.append(
        make("span", "tag", `${assessment.availableCount} covered by stock`),
        make("span", "tag swap", `${assessment.swapCount} swap ${assessment.swapCount === 1 ? "idea" : "ideas"}`),
        make("span", "tag missing", `${assessment.missingCount} to buy`)
      );
      header.append(
        make("p", "recipe-meta", `${recipe.minutes} min · ${plural(recipe.servings, "serving")}`),
        make("h3", "", recipe.title),
        make("p", "", recipe.description)
      );
      const details = make("details");
      details.append(make("summary", "", "See the ingredient-by-ingredient match"));
      const needs = make("ul", "need-list");
      for (const need of assessment.needs) {
        const line = make("li");
        const category = need.category === "available" ? "Available" : need.category === "substitutable" ? "Substitutable" : "Missing";
        line.append(make("strong", "", `${getIngredient(need.ingredient.ingredientId).name} · ${category}: `), needExplanation(need));
        needs.append(line);
      }
      details.append(needs);
      const review = make("button", "button button-secondary", "Review this meal");
      review.type = "button";
      review.dataset.recipeId = recipe.id;
      review.addEventListener("click", () => {
        activeRecipeId = recipe.id;
        allowSwapsDraft = false;
        renderRecipeDetail();
        recipeDetail.querySelector<HTMLElement>("h3")?.focus();
      });
      card.append(header, status, details, review);
      recipeList.append(card);
    }
  }

  function renderRecipeDetail(): void {
    recipeDetail.replaceChildren();
    const recipe = RECIPES.find((entry) => entry.id === activeRecipeId);
    if (!recipe) {
      recipeDetail.append(make("p", "empty-message", "Choose a recipe above to see its steps and preview what its shopping list would need."));
      return;
    }
    const selectedRecipe = recipe;
    const heading = make("h3", "", recipe.title);
    heading.tabIndex = -1;
    recipeDetail.append(
      make("p", "eyebrow", "REVIEW BEFORE YOU CONFIRM"),
      heading,
      make("p", "", `${recipe.description} Makes ${plural(recipe.servings, "serving")}; about ${recipe.minutes} minutes.`)
    );
    const stepsHeading = make("h4", "", "How to make it");
    const steps = make("ol", "step-list");
    for (const step of recipe.steps) {
      steps.append(make("li", "", step));
    }
    recipeDetail.append(stepsHeading, steps);

    const suggestions = assessRecipe(recipe, state.inventory);
    if (suggestions.swapCount > 0) {
      const swapLabel = make("label", "swap-choice");
      const checkbox = make("input");
      checkbox.type = "checkbox";
      checkbox.checked = allowSwapsDraft;
      checkbox.addEventListener("change", () => {
        allowSwapsDraft = checkbox.checked;
        renderPreview();
      });
      swapLabel.append(checkbox, make("span", "", "Use the suggested swaps when calculating what to buy. I will check ingredient labels and suitability myself."));
      recipeDetail.append(swapLabel);
    } else {
      allowSwapsDraft = false;
    }

    const preview = make("div", "preview");
    recipeDetail.append(preview);
    function renderPreview(): void {
      preview.replaceChildren(make("h4", "", "Shopping preview"));
      const assessment = assessRecipe(selectedRecipe, state.inventory, allowSwapsDraft);
      if (assessment.swapCount > 0) {
        preview.append(make("p", "", `${plural(assessment.swapCount, "suggested swap")} included in this preview.`));
      }
      const missing = assessment.needs.filter((need) => need.missingQuantity > 0);
      if (missing.length === 0) {
        preview.append(make("p", "", "No recipe ingredients to add based on the amounts recorded. You can still add groceries."));
      } else {
        const list = make("ul", "preview-list");
        for (const need of missing) {
          list.append(make("li", "", `${formatQuantity(need.missingQuantity, need.ingredient.unit)} ${getIngredient(need.ingredient.ingredientId).name}`));
        }
        preview.append(list);
      }
    }
    renderPreview();

    const confirmMeal = make("button", "button button-primary", "Confirm meal & build list");
    confirmMeal.type = "button";
    confirmMeal.addEventListener("click", () => {
      if (state.shopping.length > 0 && !confirmAction("Confirming a meal replaces your current shopping list, including edits. Continue?")) {
        return;
      }
      const assessment = assessRecipe(recipe, state.inventory, allowSwapsDraft);
      const usesFreezer = assessment.needs.some((need) =>
        [...need.exact, ...need.swaps].some((part) => part.location === "Freezer")
      );
      commit({
        ...state,
        plan: { recipeId: recipe.id, allowSwaps: allowSwapsDraft, usesFreezer, confirmedAt: now().toISOString() },
        shopping: shoppingFor(assessment, newId)
      }, `${recipe.title} confirmed. The shopping list is ready to edit.`);
      const shoppingHeading = required<HTMLElement>("#shopping-heading");
      shoppingHeading.tabIndex = -1;
      shoppingHeading.focus();
    });
    recipeDetail.append(confirmMeal);
  }

  function renderConfirmedMeal(): void {
    confirmedMeal.replaceChildren();
    if (!state.plan) {
      confirmedMeal.append(make("p", "empty-message", "No meal confirmed yet. Browse the explanations above, then pick one to build a list."));
      return;
    }
    const recipe = RECIPES.find((entry) => entry.id === state.plan?.recipeId);
    if (!recipe) {
      throw new Error("A saved meal no longer exists in the recipe catalog.");
    }
    const panel = make("div", "confirmed-panel");
    panel.append(
      make("h3", "", `Planned: ${recipe.title}`),
      make("p", "", `${plural(recipe.servings, "serving")} · ${recipe.minutes} minutes · ${state.plan.allowSwaps ? "Suggested swaps accepted at confirmation" : "Original ingredients only"}.`),
      make("p", "", "This shopping list is a snapshot. Editing inventory will not erase list edits or deduct ingredients; confirm a meal again to rebuild it.")
    );
    if (state.plan.usesFreezer) {
      const note = make("aside", "safety-note");
      note.append(
        "A freezer item was part of the match when you confirmed. If it needs thawing, plan safe handling in the refrigerator or follow its package and ",
        (() => {
          const link = make("a", "", "FDA guidance");
          link.href = "https://www.fda.gov/food/buy-store-serve-safe-food/safe-food-handling";
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          return link;
        })(),
        ". Never thaw food on the counter; this app does not estimate a thaw time."
      );
      panel.append(note);
    }
    const steps = make("details");
    steps.append(make("summary", "", "See cooking steps"));
    const list = make("ol", "step-list");
    for (const step of recipe.steps) {
      list.append(make("li", "", step));
    }
    steps.append(list);
    panel.append(steps);
    confirmedMeal.append(panel);
  }

  function renderShopping(): void {
    shoppingList.replaceChildren();
    const purchased = state.shopping.filter((item) => item.checked).length;
    shoppingCount.textContent = `${purchased} of ${plural(state.shopping.length, "item")} checked`;
    if (state.shopping.length === 0) {
      shoppingList.append(make("p", "empty-message", state.plan
        ? "Nothing to buy for that meal based on the amounts recorded. Add anything else you need below."
        : "No shopping items yet. Confirm a meal or add one yourself."));
      return;
    }

    for (const item of state.shopping) {
      const row = make("form", `shopping-item${item.checked ? " is-checked" : ""}`);
      row.dataset.shoppingId = item.id;
      const name = make("input");
      name.type = "text";
      name.value = item.name;
      name.required = true;
      name.maxLength = 100;
      name.addEventListener("input", () => name.setCustomValidity(""));
      const quantity = amountInput(item.quantity, `Amount for ${item.name}`);
      const unit = unitSelect(item.unit, `Unit for ${item.name}`);
      const actions = make("div", "shopping-actions");
      const boughtLabel = make("label", "purchase-choice");
      const bought = make("input");
      bought.type = "checkbox";
      bought.checked = item.checked;
      boughtLabel.append(bought, make("span", "", `Bought ${item.name}`));
      const source = make("span", "source-note", item.source === "recipe" ? "From meal · editable" : "Added by you");
      const save = make("button", "button button-quiet", "Save edits");
      save.type = "submit";
      const remove = make("button", "text-button danger", "Remove");
      remove.type = "button";
      remove.setAttribute("aria-label", `Remove ${item.name} from shopping list`);
      remove.addEventListener("click", () => {
        if (!confirmAction(`Remove ${item.name} from your shopping list?`)) {
          return;
        }
        commit({ ...state, shopping: state.shopping.filter((entry) => entry.id !== item.id) }, "Shopping item removed.");
      });

      function saveRow(focus: "checkbox" | "button"): void {
        const editedName = readName(name);
        const editedQuantity = readAmount(quantity);
        const selectedUnit = unit.value;
        if (editedName === null || editedQuantity === null || !isUnit(selectedUnit)) {
          bought.checked = item.checked;
          if (!isUnit(selectedUnit)) {
            setNotice("Choose a valid shopping unit.", true);
          }
          return;
        }
        const shopping: ShoppingItem[] = state.shopping.map((entry) =>
          entry.id === item.id
            ? { ...entry, name: editedName, quantity: editedQuantity, unit: selectedUnit, checked: bought.checked }
            : entry
        );
        commit({ ...state, shopping }, "Shopping item saved.");
        const updated = Array.from(shoppingList.querySelectorAll<HTMLFormElement>(".shopping-item"))
          .find((entry) => entry.dataset.shoppingId === item.id);
        updated?.querySelector<HTMLElement>(focus === "checkbox" ? 'input[type="checkbox"]' : 'button[type="submit"]')?.focus();
      }
      row.addEventListener("submit", (event) => {
        event.preventDefault();
        saveRow("button");
      });
      bought.addEventListener("change", () => saveRow("checkbox"));
      actions.append(boughtLabel, source, save, remove);
      row.append(field("Item", name), field("Amount", quantity), field("Unit", unit), actions);
      shoppingList.append(row);
    }
  }

  function render(): void {
    renderInventory();
    renderRecipes();
    renderRecipeDetail();
    renderConfirmedMeal();
    renderShopping();
  }

  function commit(next: AppState, success: string): void {
    let warning: string | null = null;
    try {
      saveState(store, next);
    } catch (error) {
      if (!(error instanceof PersistenceError)) {
        throw error;
      }
      warning = error.message.startsWith("Not saved") ? error.message : `Not saved: ${error.message}`;
    }
    state = next;
    render();
    setNotice(warning ?? success, warning !== null);
  }

  inventoryName.addEventListener("input", () => inventoryName.setCustomValidity(""));
  inventoryQuantity.addEventListener("input", () => inventoryQuantity.setCustomValidity(""));
  inventoryName.addEventListener("change", () => {
    const match = INGREDIENTS.find((ingredient) => ingredient.id === normalizeIngredientName(inventoryName.value));
    if (match && !editingId) {
      inventoryUnit.value = match.unit;
    }
  });
  cancelInventoryEdit.addEventListener("click", resetInventoryForm);
  inventoryForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = readName(inventoryName);
    const quantity = readAmount(inventoryQuantity);
    if (name === null || quantity === null) {
      return;
    }
    if (!isUnit(inventoryUnit.value) || !isLocation(inventoryLocation.value)) {
      setNotice("Choose a valid unit and location.", true);
      return;
    }
    const printed = labelDate.value || null;
    const check = checkDate.value || null;
    if ((printed !== null && !isIsoDate(printed)) || (check !== null && !isIsoDate(check))) {
      setNotice("Enter valid calendar dates, or leave them blank.", true);
      return;
    }
    const item: PantryItem = {
      id: editingId ?? newId(),
      name,
      quantity,
      unit: inventoryUnit.value,
      location: inventoryLocation.value,
      labelDate: printed,
      checkDate: check
    };
    const inventory = editingId
      ? state.inventory.map((entry) => entry.id === editingId ? item : entry)
      : [...state.inventory, item];
    commit({ ...state, inventory }, `${name} ${editingId ? "updated" : "added"}. ${state.plan ? "Your shopping list stays as edited until you confirm a meal again." : ""}`.trim());
    resetInventoryForm();
  });

  shoppingName.addEventListener("input", () => shoppingName.setCustomValidity(""));
  shoppingQuantity.addEventListener("input", () => shoppingQuantity.setCustomValidity(""));
  shoppingForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = readName(shoppingName);
    const quantity = readAmount(shoppingQuantity);
    if (name === null || quantity === null) {
      return;
    }
    if (!isUnit(shoppingUnit.value)) {
      setNotice("Choose a valid shopping unit.", true);
      return;
    }
    commit({
      ...state,
      shopping: [...state.shopping, { id: newId(), name, quantity, unit: shoppingUnit.value, checked: false, source: "manual" }]
    }, `${name} added to your list.`);
    shoppingForm.reset();
    shoppingName.focus();
  });

  clearButton.addEventListener("click", () => {
    if (!confirmAction("Permanently clear your inventory, meal plan and shopping list from this browser?")) {
      return;
    }
    try {
      clearState(store);
    } catch (error) {
      if (!(error instanceof PersistenceError)) {
        throw error;
      }
      setNotice(error.message, true);
      return;
    }
    state = { version: 1, inventory: [], plan: null, shopping: [] };
    activeRecipeId = null;
    resetInventoryForm();
    shoppingForm.reset();
    render();
    setNotice("Local pantry, meal and shopping data cleared.");
  });

  render();
}
