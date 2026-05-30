import { useMemo, useState, type FormEvent } from 'react';
import {
  computeRecipeNutrition,
  formatNutrition,
  type NutritionLine,
} from '@meal-tracking/nutrition-engine';
import type {
  MealType,
  Nutrition,
  RecipeInput,
} from '@meal-tracking/shared';
import { recipeInputSchema } from '@meal-tracking/shared';
import { useSaveRecipe } from '../query/recipes.js';
import { ApiError } from '../api/client.js';
import { IngredientPicker } from './IngredientPicker.js';

/**
 * Recipe editor (STEP-37, FR-1/FR-4, AD-5).
 *
 * Nutrition is recomputed LIVE in the browser via the shared engine
 * (computeRecipeNutrition) on every ingredient/quantity/unit/servings change
 * (AC-4.4) — never via a server round-trip. The component NEVER rounds: it
 * renders through formatNutrition, the engine's single display-rounding
 * boundary (S-6), and surfaces the engine's completeness flag so missing data
 * shows an "incomplete" indicator rather than misleading zeros (S-6). Saving
 * goes through the TanStack Query mutation, which invalidates the recipes list
 * so the saved recipe appears in the library (AC-1.1). No emojis (S-7).
 */

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/**
 * An ingredient line as the editor holds it: the recipe usage
 * (ingredientId/quantity/unitCode for the save payload) PLUS the resolved
 * per-`referenceGrams` nutrition and conversion data the engine needs to
 * compute live in the browser without a fetch. `key` is a stable local id for
 * React list rendering and removal (a recipe may use one ingredient twice).
 */
export interface EditorIngredientLine {
  key: string;
  ingredientId: string;
  name: string;
  quantity: number;
  unitCode: string;
  nutrition: Nutrition;
  referenceGrams: number;
  gramEquivalents: Record<string, number>;
  gramWeightPerQty: number | null;
}

export interface RecipeEditorProps {
  /** Recipe id when editing an existing recipe; absent when creating. */
  recipeId?: string;
  initialName?: string;
  initialMealType?: MealType;
  initialServings?: number;
  initialNotes?: string;
  initialSourceLink?: string;
  initialTags?: string[];
  initialIngredients?: EditorIngredientLine[];
  /** Called after a successful save (e.g. to close the editor). */
  onSaved?: () => void;
}

/** Map editor lines to the engine's NutritionLine shape for live recompute. */
function toEngineLines(lines: EditorIngredientLine[]): NutritionLine[] {
  return lines.map((l) => ({
    quantity: l.quantity,
    unitCode: l.unitCode,
    ingredient: {
      id: l.ingredientId,
      nutrition: l.nutrition,
      referenceGrams: l.referenceGrams,
      gramEquivalents: l.gramEquivalents,
      gramWeightPerQty: l.gramWeightPerQty,
    },
  }));
}

let lineCounter = 0;
function nextLineKey(): string {
  lineCounter += 1;
  return `line-${lineCounter}`;
}

export function RecipeEditor({
  recipeId,
  initialName = '',
  initialMealType = 'breakfast',
  initialServings = 1,
  initialNotes = '',
  initialSourceLink = '',
  initialTags = [],
  initialIngredients = [],
  onSaved,
}: RecipeEditorProps): JSX.Element {
  const [name, setName] = useState(initialName);
  const [mealType, setMealType] = useState<MealType>(initialMealType);
  const [servings, setServings] = useState(initialServings);
  const [notes, setNotes] = useState(initialNotes);
  const [sourceLink, setSourceLink] = useState(initialSourceLink);
  const [tagsText, setTagsText] = useState(initialTags.join(', '));
  const [lines, setLines] = useState<EditorIngredientLine[]>(initialIngredients);
  const [formError, setFormError] = useState<string | null>(null);

  const save = useSaveRecipe();

  // Live recompute: any change to lines or servings re-derives nutrition via
  // the shared engine (AC-4.4). useMemo keeps it cheap but the source of truth
  // is always the engine, never a cached/rounded copy (S-6).
  const recipeNutrition = useMemo(
    () => computeRecipeNutrition(toEngineLines(lines), Math.max(servings, 1)),
    [lines, servings],
  );
  const perServing = formatNutrition(recipeNutrition.perServing);
  const total = formatNutrition(recipeNutrition.total);
  const { complete, missing } = recipeNutrition.completeness;

  function updateLine(key: string, patch: Partial<EditorIngredientLine>): void {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    );
  }

  function removeLine(key: string): void {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  function addLine(line: Omit<EditorIngredientLine, 'key'>): void {
    setLines((prev) => [...prev, { ...line, key: nextLineKey() }]);
  }

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    setFormError(null);

    const candidate: RecipeInput = {
      name: name.trim(),
      mealType,
      servings,
      notes: notes.trim() === '' ? null : notes.trim(),
      sourceLink: sourceLink.trim() === '' ? null : sourceLink.trim(),
      ingredients: lines.map((l) => ({
        ingredientId: l.ingredientId,
        quantity: l.quantity,
        unitCode: l.unitCode,
      })),
      tags: tagsText
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0),
    };

    // Validate against the shared Zod schema before the network call (S-3) so
    // obvious problems are surfaced inline rather than as a 400.
    const parsed = recipeInputSchema.safeParse(candidate);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Recipe is invalid');
      return;
    }

    save.mutate(
      { input: parsed.data, recipeId },
      {
        onSuccess: () => {
          onSaved?.();
        },
      },
    );
  }

  const saveErrorMessage =
    save.error instanceof ApiError
      ? save.error.message
      : save.error?.message ?? null;

  return (
    <form
      className="recipe-editor"
      aria-label={recipeId ? 'Edit recipe' : 'New recipe'}
      onSubmit={handleSubmit}
    >
      <div className="recipe-editor__fields">
        <label>
          Name
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>

        <label>
          Meal type
          <select
            value={mealType}
            onChange={(e) => setMealType(e.target.value as MealType)}
          >
            {MEAL_TYPES.map((mt) => (
              <option key={mt} value={mt}>
                {mt}
              </option>
            ))}
          </select>
        </label>

        <label>
          Servings
          <input
            type="number"
            min={1}
            step={1}
            value={servings}
            onChange={(e) => {
              const next = Number.parseInt(e.target.value, 10);
              setServings(Number.isNaN(next) ? 1 : next);
            }}
          />
        </label>

        <label>
          Source link
          <input
            type="url"
            value={sourceLink}
            onChange={(e) => setSourceLink(e.target.value)}
          />
        </label>

        <label>
          Tags (comma separated)
          <input
            type="text"
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
          />
        </label>

        <label>
          Notes
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
      </div>

      <fieldset className="recipe-editor__ingredients">
        <legend>Ingredients</legend>
        {lines.length === 0 ? (
          <p>No ingredients yet. Add one below.</p>
        ) : (
          <ul aria-label="Recipe ingredients">
            {lines.map((line) => {
              const lineMissing = missing.some(
                (m) => m.ingredientId === line.ingredientId,
              );
              return (
                <li key={line.key}>
                  <span>{line.name}</span>
                  <label>
                    Quantity
                    <input
                      type="number"
                      min={0}
                      step="any"
                      aria-label={`Quantity for ${line.name}`}
                      value={line.quantity}
                      onChange={(e) => {
                        const next = Number.parseFloat(e.target.value);
                        updateLine(line.key, {
                          quantity: Number.isNaN(next) ? 0 : next,
                        });
                      }}
                    />
                  </label>
                  <label>
                    Unit
                    <input
                      type="text"
                      aria-label={`Unit for ${line.name}`}
                      value={line.unitCode}
                      onChange={(e) =>
                        updateLine(line.key, { unitCode: e.target.value })
                      }
                    />
                  </label>
                  {lineMissing ? (
                    <span role="note" className="recipe-editor__line-incomplete">
                      incomplete data
                    </span>
                  ) : null}
                  <button type="button" onClick={() => removeLine(line.key)}>
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <IngredientPicker onAdd={addLine} />
      </fieldset>

      <section
        className="recipe-editor__nutrition"
        aria-label="Per-serving nutrition"
      >
        <h3>Per serving</h3>
        {!complete ? (
          <p role="note" className="recipe-editor__incomplete">
            Nutrition is incomplete: some ingredients are missing data and are
            excluded from these totals (not counted as zero).
          </p>
        ) : null}
        <dl>
          <div>
            <dt>Calories</dt>
            <dd aria-label="Per-serving calories">{perServing.calories}</dd>
          </div>
          <div>
            <dt>Protein (g)</dt>
            <dd>{perServing.proteinG}</dd>
          </div>
          <div>
            <dt>Carbs (g)</dt>
            <dd>{perServing.carbsG}</dd>
          </div>
          <div>
            <dt>Fat (g)</dt>
            <dd>{perServing.fatG}</dd>
          </div>
          <div>
            <dt>Fiber (g)</dt>
            <dd>{perServing.fiberG}</dd>
          </div>
        </dl>
      </section>

      <section
        className="recipe-editor__total"
        aria-label="Recipe total nutrition"
      >
        <h3>Recipe total</h3>
        <p>
          Total calories: <span aria-label="Total calories">{total.calories}</span>
        </p>
      </section>

      {formError ? <p role="alert">{formError}</p> : null}
      {saveErrorMessage ? (
        <p role="alert">Could not save recipe: {saveErrorMessage}</p>
      ) : null}

      <button type="submit" disabled={save.isPending}>
        {save.isPending ? 'Saving...' : 'Save recipe'}
      </button>
    </form>
  );
}
