# PantryFlow

**First public starter · local-first · an applied human–AI collaboration project**

PantryFlow turns a manually recorded pantry into explainable meal options and an editable shopping list. It is an early working slice of a longer idea, built to make the next decision smaller.

## The proposal: a gentler first step

You want to cook healthier, yet figuring out what to make can take more effort than the cooking itself. PantryFlow starts with that planning friction instead of assuming a clever recipe suggestion will solve it. This is an applied human–AI collaboration project: the person knows their appetite, constraints and ingredients; the software should make the next decision easier to see and easier to change. The aim is a repeatable kitchen-sized loop that helps turn an intention into a meal.

**Illustrative scenario (not a description of your kitchen):** Imagine a weeknight when the question is less "How do I sauté?" than "Where do I begin?" You open the page and record 80 g of spinach in the freezer and 140 g of dry pasta in the pantry. The spinach-and-tomato pasta card shows those amounts as covered, then names the tomato, olive oil and garlic still needed. You can open the ingredient-by-ingredient explanation before choosing anything. Seeing a short, measured gap feels different from staring at a long list of recipes and hoping one happens to fit.

If you have kale instead of spinach, a possible swap appears beside the original ingredient. It remains a suggestion until you choose to include it in the plan. That distinction matters: a swap can change taste, allergens or suitability for someone's preferences. In the same spirit, you can record a date printed on a package and a separate CHECK date that you set as a reminder. If a confirmed meal uses an item recorded in the freezer, the page prompts you to plan safe handling without inventing a thawing time.

Confirming a meal produces a list with missing quantities rather than vague ingredient names. You can rename an entry, change its amount, tick it off, remove it or add something unrelated to the recipe. Your edits stay put if you change the pantry later; you rebuild the list only by confirming a meal again. Cooking does not silently deduct stock. When you know what you used, you update the inventory yourself. The ten original sample recipes give this interaction a real set of meals to test without borrowing recipe prose or product data.

The longer collaboration could eventually help enter receipts or photos, consider preferences, support voice and offer opt-in reminders about shopping or defrost preparation. Each new capability should answer three practical questions: who supplied the information, how can a mistake be corrected, and when does the cook get the final say? This public starter makes those questions tangible. Try the small loop now; let the experience, rather than an imagined fully automated kitchen, guide what earns a place next.

## Run locally

Requires **Node.js 20.19+** and npm.

```sh
npm install
npm run dev
```

Open the local URL Vite prints (normally `http://127.0.0.1:5173/`). Start with an empty inventory and add your own items. `npm test` runs the matching, storage and browser-flow tests; `npm run build` type-checks and bundles the static site into `dist/`. The app uses vanilla TypeScript, Vite and browser `localStorage`; it needs no account or backend.

The same `npm ci`, test and build commands run in [GitHub Actions](.github/workflows/ci.yml) on pushes and pull requests.

## What this slice does

1. Record, edit and remove any named item in **Pantry**, **Fridge** or **Freezer**, with measured amounts. Suggested names map to a small ingredient catalog; unknown names remain in your inventory. Printed label dates and user-set CHECK dates are separate fields.
2. Compare ten [original example recipes](data/PROVENANCE.md). Each card explains exact stock, possible measured substitutes, incompatible units and remaining quantities. Ranking uses fewest ingredients to buy, then smallest remaining fraction, fewest suggested swaps and listed time.
3. Review the steps, choose whether suggested swaps count, and **confirm** a meal. Confirmation creates an editable, quantity-based shopping list. Existing list edits are replaced only after a confirmation prompt; no stock is automatically consumed. A freezer match triggers a safe-handling reminder, not a timed thaw prediction.

The source includes no external recipe or product dataset. The site makes no automatic photo, voice or pantry-data uploads. [Privacy](docs/privacy.md), [food-safety boundaries](docs/food-safety.md), [data rights](docs/data-rights.md) and the [roadmap](docs/roadmap.md) describe how this slice can grow responsibly. The root [MIT license](LICENSE) covers code; recipe and future product data have separate rights.

## Research informing later milestones

- [Google ML Kit guides](https://developers.google.com/ml-kit/guides) and [Text Recognition v2](https://developers.google.com/ml-kit/vision/text-recognition/v2): possible **future**, user-corrected receipt or label entry on supported devices.
- [Open Food Facts API](https://openfoodfacts.github.io/openfoodfacts-server/api/) and its [terms of use](https://world.openfoodfacts.org/terms-of-use): product lookup would require explicit licensing, attribution and provenance work.
- [FoodOn](https://github.com/FoodOntology/foodon): a reference for thinking about food identifiers and relationships, subject to its own terms before reuse.
- [SQLite FTS5](https://sqlite.org/fts5.html) and [scikit-learn TF-IDF vectorizer](https://scikit-learn.org/stable/modules/generated/sklearn.feature_extraction.text.TfidfVectorizer.html): candidate retrieval approaches to evaluate before adding a larger catalog.
- FDA guidance on [storing food safely](https://www.fda.gov/consumers/consumer-updates/are-you-storing-food-safely) and [safe food handling](https://www.fda.gov/food/buy-store-serve-safe-food/safe-food-handling): boundaries for dates, storage and thaw planning.
- [grocy](https://github.com/grocy/grocy) and [Mealie](https://github.com/mealie-recipes/mealie): ecosystem references only; their code, assets and recipe text were not copied into this MIT starter.
