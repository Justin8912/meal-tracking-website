import { useMemo, useState, type FormEvent } from 'react';
import {
  computeRecipeNutrition,
  formatNutrition,
  type MacroKey,
  type NutritionLine,
} from '@meal-tracking/nutrition-engine';
import type {
  MealType,
  Nutrition,
  RecipeInput,
} from '@meal-tracking/shared';
import { recipeInputSchema } from '@meal-tracking/shared';
import { useSaveRecipe } from '../query/recipes.js';
import { useTags } from '../query/tags.js';
import { ApiError } from '../api/client.js';
import { IngredientPicker, INGREDIENT_UNITS } from './IngredientPicker.js';
import { MacroBar } from './MacroBar.js';

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
  /** Raw text the user is typing; parsed to quantity at save time. */
  quantityText?: string;
  unitCode: string;
  nutrition: Nutrition;
  referenceGrams: number;
  gramEquivalents: Record<string, number>;
  gramWeightPerQty: number | null;
  /**
   * Macros the source did not provide (absent = unknown, not zero — S-6). The
   * engine flags these `missing-macros` so the placeholder 0 in `nutrition`
   * never reads as a real total (Bundle 5 limitation guard).
   */
  absentMacros?: MacroKey[];
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
    quantity: l.quantityText !== undefined
      ? (Number.parseFloat(l.quantityText) || l.quantity)
      : l.quantity,
    unitCode: l.unitCode,
    ingredient: {
      id: l.ingredientId,
      nutrition: l.nutrition,
      referenceGrams: l.referenceGrams,
      gramEquivalents: l.gramEquivalents,
      gramWeightPerQty: l.gramWeightPerQty,
      absentMacros: l.absentMacros,
    },
  }));
}

let lineCounter = 0;
function nextLineKey(): string {
  lineCounter += 1;
  return `line-${lineCounter}`;
}

function TagPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (tags: string[]) => void;
}): JSX.Element {
  const tagsQuery = useTags();
  const workspaceTags = tagsQuery.data ?? [];
  const available = workspaceTags.filter((t) => !selected.includes(t.label));

  function add(label: string): void {
    if (label && !selected.includes(label)) {
      onChange([...selected, label]);
    }
  }

  function remove(label: string): void {
    onChange(selected.filter((t) => t !== label));
  }

  return (
    <div className="tag-picker">
      {selected.length > 0 ? (
        <div className="tag-picker__chips">
          {selected.map((label) => (
            <span key={label} className="tag-picker__chip">
              {label}
              <button
                type="button"
                className="tag-picker__chip-remove"
                aria-label={`Remove tag ${label}`}
                onClick={() => remove(label)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {available.length > 0 ? (
        <select
          className="tag-picker__select"
          value=""
          aria-label="Add tag"
          onChange={(e) => {
            add(e.target.value);
            e.target.value = '';
          }}
        >
          <option value="" disabled>Add a tag…</option>
          {available.map((t) => (
            <option key={t.id} value={t.label}>{t.label}</option>
          ))}
        </select>
      ) : (
        <p className="tag-picker__empty-hint">
          No tags yet — create them in Manage tags.
        </p>
      )}
    </div>
  );
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
  const [servingsText, setServingsText] = useState(String(initialServings));
  const [notes, setNotes] = useState(initialNotes);
  const [sourceLink, setSourceLink] = useState(initialSourceLink);
  const [selectedTags, setSelectedTags] = useState<string[]>(initialTags);
  const [lines, setLines] = useState<EditorIngredientLine[]>(initialIngredients);
  const [formError, setFormError] = useState<string | null>(null);

  const save = useSaveRecipe();

  // Live recompute: any change to lines or servings re-derives nutrition via
  // the shared engine (AC-4.4). useMemo keeps it cheap but the source of truth
  // is always the engine, never a cached/rounded copy (S-6).
  const recipeNutrition = useMemo(
    () => computeRecipeNutrition(
      toEngineLines(lines),
      Math.max(Number.parseInt(servingsText, 10) || 1, 1),
    ),
    [lines, servingsText],
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
      servings: Number.parseInt(servingsText, 10),
      notes: notes.trim() === '' ? null : notes.trim(),
      sourceLink: sourceLink.trim() === '' ? null : sourceLink.trim(),
      ingredients: lines.map((l) => ({
        ingredientId: l.ingredientId,
        quantity: l.quantityText !== undefined
          ? Number.parseFloat(l.quantityText)
          : l.quantity,
        unitCode: l.unitCode,
      })),
      tags: selectedTags,
    };

    // Validate against the shared Zod schema before the network call (S-3) so
    // obvious problems are surfaced inline rather than as a 400. Map raw Zod
    // messages to user-friendly text so we never show schema internals.
    const parsed = recipeInputSchema.safeParse(candidate);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const friendlyMessage = (() => {
        if (!issue) return 'Recipe is invalid';
        // ingredients array minimum
        if (issue.path[0] === 'ingredients') return 'Please add at least one ingredient';
        // name required
        if (issue.path[0] === 'name') return 'Recipe name is required';
        // servings out of range
        if (issue.path[0] === 'servings') return 'Servings must be at least 1';
        return issue.message;
      })();
      setFormError(friendlyMessage);
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
            value={servingsText}
            onChange={(e) => setServingsText(e.target.value)}
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

        <div className="recipe-editor__field-group">
          <span className="recipe-editor__field-label">Tags</span>
          <TagPicker selected={selectedTags} onChange={setSelectedTags} />
        </div>

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
                      value={line.quantityText ?? String(line.quantity)}
                      onChange={(e) =>
                        updateLine(line.key, { quantityText: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Unit
                    <select
                      aria-label={`Unit for ${line.name}`}
                      value={line.unitCode}
                      onChange={(e) =>
                        updateLine(line.key, { unitCode: e.target.value })
                      }
                    >
                      {INGREDIENT_UNITS.map((u) => (
                        <option key={u.code} value={u.code}>{u.label}</option>
                      ))}
                    </select>
                  </label>
                  {lineMissing ? (
                    <span role="note" className="recipe-editor__line-incomplete">
                      incomplete data
                    </span>
                  ) : null}
                  <button type="button" className="btn btn--danger" onClick={() => removeLine(line.key)}>
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
        <dl className="macro-bars">
          <MacroBar
            variant="calories"
            label="Calories"
            value={perServing.calories}
            valueAriaLabel="Per-serving calories"
          />
          <MacroBar variant="protein" label="Protein (g)" value={perServing.proteinG} />
          <MacroBar variant="carbs" label="Carbs (g)" value={perServing.carbsG} />
          <MacroBar variant="fat" label="Fat (g)" value={perServing.fatG} />
          <MacroBar variant="fiber" label="Fiber (g)" value={perServing.fiberG} />
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
