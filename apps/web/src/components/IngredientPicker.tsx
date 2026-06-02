import { useState, type KeyboardEvent } from 'react';
import { ApiError } from '../api/client.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import {
  useIngredientSearch,
  useIngredients,
  useSnapshotUsdaIngredient,
  useCreateCustomIngredient,
  useDeleteIngredient,
  toEngineNutrition,
  absentMacrosOf,
  type SavedIngredient,
  type UsdaSearchItem,
} from '../query/ingredients.js';
import type { EditorIngredientLine } from './RecipeEditor.js';

/**
 * Ingredient picker (STEP-39, FR-2/FR-3, AD-3/AD-4).
 *
 * Debounced USDA search via TanStack Query against /ingredients/search renders
 * matches (AC-2.1). Selecting a match pre-fills the gram weight for the chosen
 * usage and lets the user confirm/override it (AD-4); confirming snapshots the
 * food into an owned ingredient and adds the line. A custom-ingredient form
 * posts to /ingredients (AC-3.1). When search errors, a clear message plus the
 * always-available custom-entry path keep the user unblocked (AC-2.3). The API
 * validates payloads against the shared schemas (S-3). No emojis (S-7).
 */
export interface IngredientPickerProps {
  /** Called when the user confirms an ingredient line to add to the recipe. */
  onAdd: (line: Omit<EditorIngredientLine, 'key'>) => void;
}

/** Build the editor line from a saved ingredient and the confirmed grams. */
function lineFromSaved(
  saved: SavedIngredient,
  grams: number,
): Omit<EditorIngredientLine, 'key'> {
  return {
    ingredientId: saved.id,
    name: saved.name,
    // The confirmed grams are the usage; unit 'g' passes straight through the
    // engine against the ingredient's reference-grams nutrition basis (AD-4).
    quantity: grams,
    unitCode: 'g',
    nutrition: toEngineNutrition(saved.nutrition),
    referenceGrams: saved.referenceGrams,
    gramEquivalents: saved.unitGramEquivalents,
    gramWeightPerQty: saved.gramWeightPerQty,
    // Custom ingredients are user-defined — blank fields are intentional, not
    // unknown/absent. Only flag absent macros for USDA-sourced ingredients where
    // we know the API omitted data. This prevents the "incomplete data" badge
    // on a custom ingredient the user fully filled out.
    absentMacros: saved.source === 'custom' ? [] : absentMacrosOf(saved.nutrition),
  };
}

/** A saved ingredient row — same visual style as USDA results, with a delete
 *  trash-can button for custom ingredients (confirm before deleting). */
function SavedIngredientRow({
  item,
  onAdd,
}: {
  item: SavedIngredient;
  onAdd: () => void;
}): JSX.Element {
  const deleteIngredient = useDeleteIngredient();
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <li>
      <span>{item.name}</span>
      <span> ({item.source === 'custom' ? 'custom' : 'saved'})</span>
      <button type="button" onClick={onAdd} aria-label={`Add ${item.name}`}>
        Add
      </button>
      {item.source === 'custom' ? (
        confirmDelete ? (
          <span className="ingredient-picker__delete-confirm">
            <span>Remove permanently?</span>
            <button
              type="button"
              className="ingredient-picker__delete-yes"
              disabled={deleteIngredient.isPending}
              onClick={() => deleteIngredient.mutate(item.id, { onSuccess: () => setConfirmDelete(false) })}
            >
              {deleteIngredient.isPending ? '...' : 'Yes, remove'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="ingredient-picker__delete-btn"
            aria-label={`Delete custom ingredient ${item.name}`}
            title="Remove this custom ingredient permanently"
            onClick={() => setConfirmDelete(true)}
          >
            ×
          </button>
        )
      ) : null}
    </li>
  );
}

export function IngredientPicker({ onAdd }: IngredientPickerProps): JSX.Element {
  const [term, setTerm] = useState('');
  const debouncedTerm = useDebouncedValue(term, 300);
  const search = useIngredientSearch(debouncedTerm);
  // Workspace's already-saved ingredients (custom + USDA snapshots). Filtered
  // client-side against the search term so custom ingredients appear in search
  // results without a separate server round-trip (AC-3.3).
  const savedQuery = useIngredients();
  const savedMatches: SavedIngredient[] = debouncedTerm.trim().length > 0
    ? (savedQuery.data ?? []).filter((i) =>
        i.name.toLowerCase().includes(debouncedTerm.toLowerCase()),
      )
    : [];

  const [selected, setSelected] = useState<UsdaSearchItem | null>(null);
  // Pre-filled, confirmable gram weight for the selected USDA food (AD-4). The
  // 100g reference is a sensible default the user can override before adding.
  const [grams, setGrams] = useState(100);
  const snapshot = useSnapshotUsdaIngredient();

  const [showCustom, setShowCustom] = useState(false);

  function handleSelect(item: UsdaSearchItem): void {
    setSelected(item);
    setGrams(100);
  }

  // Enter inside a picker input must NOT submit the surrounding recipe <form>
  // (that would reload the page and drop the in-progress recipe). The picker
  // uses no <form> elements; this triggers the local action instead.
  function onEnter(action: () => void) {
    return (event: KeyboardEvent): void => {
      if (event.key === 'Enter') {
        event.preventDefault();
        action();
      }
    };
  }

  function confirmUsda(): void {
    if (!selected) return;
    snapshot.mutate(
      { fdcId: selected.fdcId },
      {
        onSuccess: (saved) => {
          onAdd(lineFromSaved(saved, grams));
          setSelected(null);
          setTerm('');
        },
      },
    );
  }

  const searchErrorMessage =
    search.error instanceof ApiError
      ? search.error.message
      : search.error?.message ?? null;

  return (
    <div className="ingredient-picker">
      <label>
        Search foods
        <input
          type="search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={onEnter(() => {})}
          placeholder="e.g. chicken breast"
        />
      </label>

      {search.isFetching ? <p role="status">Searching...</p> : null}

      {searchErrorMessage ? (
        <p role="alert">
          Could not search foods: {searchErrorMessage} You can still add a custom
          ingredient below.
        </p>
      ) : null}

      {/* Saved ingredients (custom + previously snapshotted) that match the
          search term — shown above USDA results so custom ingredients are easy
          to find and reuse (AC-3.3). Styled identically to USDA results; custom
          ingredients also show a delete trash-can button. */}
      {savedMatches.length > 0 ? (
        <ul aria-label="Search results">
          {savedMatches.map((item) => (
            <SavedIngredientRow
              key={item.id}
              item={item}
              onAdd={() => onAdd(lineFromSaved(item, item.referenceGrams))}
            />
          ))}
        </ul>
      ) : null}

      {search.data && search.data.length > 0 ? (
        <ul aria-label="Search results">
          {search.data.map((item) => (
            <li key={item.fdcId}>
              <span>{item.description}</span>
              <span> ({item.dataType})</span>
              <button
                type="button"
                onClick={() => handleSelect(item)}
                aria-label={`Select ${item.description}`}
              >
                Add
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {search.data && search.data.length === 0 && savedMatches.length === 0 && debouncedTerm.trim() !== '' ? (
        <p>No foods found. Try a different term or add a custom ingredient.</p>
      ) : null}

      {selected ? (
        <div
          className="ingredient-picker__confirm"
          role="group"
          aria-label="Confirm ingredient amount"
        >
          <p>Adding: {selected.description}</p>
          <label>
            Gram weight
            <input
              type="number"
              min={0}
              step="any"
              value={grams}
              onChange={(e) => {
                const next = Number.parseFloat(e.target.value);
                setGrams(Number.isNaN(next) ? 0 : next);
              }}
              onKeyDown={onEnter(confirmUsda)}
            />
          </label>
          {snapshot.error ? (
            <p role="alert">
              Could not add ingredient: {snapshot.error.message}
            </p>
          ) : null}
          <button
            type="button"
            onClick={confirmUsda}
            disabled={snapshot.isPending}
          >
            {snapshot.isPending ? 'Adding...' : 'Confirm'}
          </button>
          <button type="button" onClick={() => setSelected(null)}>
            Cancel
          </button>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setShowCustom((v) => !v)}
        aria-expanded={showCustom}
      >
        Add a custom ingredient
      </button>

      {showCustom ? (
        <CustomIngredientForm
          onAdded={(saved) => {
            onAdd(lineFromSaved(saved, saved.referenceGrams));
            setShowCustom(false);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Custom-ingredient form (FR-3, AC-3.1). A name plus manually-entered nutrition
 * on a reference-grams basis; the API requires at least one nutrition fact
 * (S-3). On success the saved ingredient is handed back to the picker.
 */
/** Available volume units (matches the seeded units table). */
const VOLUME_UNITS = ['tsp', 'tbsp', 'fl oz', 'cup', 'quart'] as const;

/**
 * Custom-ingredient form (FR-3, AC-3.1).
 *
 * Collects a name, macros (all optional — leaving fields blank is intentional,
 * NOT "missing data"), and optional measurement info so the ingredient can be
 * used in volume/qty units within a recipe:
 *   - Reference serving size (grams) — the gram basis for the macros (default 100g).
 *     E.g. "28g" if the label says "per 1 oz".
 *   - Grams per qty (optional) — for count-based units. E.g. "50" for an egg
 *     so "2 qty" correctly converts to 100g.
 *   - Volume gram-equivalents (optional) — how many grams per cup/tbsp/tsp/etc.
 *     E.g. flour: 125g/cup. Unlocks volume-unit selection in the recipe editor.
 */
function CustomIngredientForm({
  onAdded,
}: {
  onAdded: (saved: SavedIngredient) => void;
}): JSX.Element {
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [proteinG, setProteinG] = useState('');
  const [carbsG, setCarbsG] = useState('');
  const [fatG, setFatG] = useState('');
  const [fiberG, setFiberG] = useState('');
  // Measurement fields
  const [referenceGrams, setReferenceGrams] = useState('100');
  const [gramsPerQty, setGramsPerQty] = useState('');
  // Volume gram-equivalents keyed by unit code
  const [volumeGrams, setVolumeGrams] = useState<Record<string, string>>({});
  const [showVolume, setShowVolume] = useState(false);

  const create = useCreateCustomIngredient();

  function parseNum(value: string): number | undefined {
    if (value.trim() === '') return undefined;
    const n = Number.parseFloat(value);
    return Number.isNaN(n) ? undefined : n;
  }

  function submitCustom(): void {
    // Build unitGramEquivalents from only the volume units the user filled in.
    const unitGramEquivalents: Record<string, number> = {};
    for (const [unit, val] of Object.entries(volumeGrams)) {
      const n = parseNum(val);
      if (n !== undefined && n > 0) unitGramEquivalents[unit] = n;
    }

    create.mutate(
      {
        name: name.trim(),
        referenceGrams: parseNum(referenceGrams) ?? 100,
        calories: parseNum(calories),
        proteinG: parseNum(proteinG),
        carbsG: parseNum(carbsG),
        fatG: parseNum(fatG),
        fiberG: parseNum(fiberG),
        gramWeightPerQty: parseNum(gramsPerQty),
        unitGramEquivalents:
          Object.keys(unitGramEquivalents).length > 0
            ? unitGramEquivalents
            : undefined,
      },
      { onSuccess: onAdded },
    );
  }

  return (
    <div
      className="ingredient-picker__custom"
      role="group"
      aria-label="Custom ingredient"
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitCustom();
        }
      }}
    >
      <label>
        Custom ingredient name
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </label>

      {/* Nutrition — per the reference serving size below */}
      <p className="ingredient-picker__custom-section">
        Nutrition facts (per serving)
      </p>
      <div className="ingredient-picker__custom-grid">
        <label>
          Calories
          <input type="number" min={0} step="any" value={calories}
            onChange={(e) => setCalories(e.target.value)} />
        </label>
        <label>
          Protein (g)
          <input type="number" min={0} step="any" value={proteinG}
            onChange={(e) => setProteinG(e.target.value)} />
        </label>
        <label>
          Carbs (g)
          <input type="number" min={0} step="any" value={carbsG}
            onChange={(e) => setCarbsG(e.target.value)} />
        </label>
        <label>
          Fat (g)
          <input type="number" min={0} step="any" value={fatG}
            onChange={(e) => setFatG(e.target.value)} />
        </label>
        <label>
          Fiber (g)
          <input type="number" min={0} step="any" value={fiberG}
            onChange={(e) => setFiberG(e.target.value)} />
        </label>
        <label>
          Serving size (g)
          <input type="number" min={1} step="any" value={referenceGrams}
            onChange={(e) => setReferenceGrams(e.target.value)}
            title="How many grams is one serving? Nutrition values above are per this amount." />
        </label>
      </div>

      {/* Optional: grams per count unit (qty) */}
      <label>
        Grams per piece / count (optional)
        <input
          type="number"
          min={0}
          step="any"
          value={gramsPerQty}
          placeholder="e.g. 50 for an egg"
          onChange={(e) => setGramsPerQty(e.target.value)}
          title='Allows you to enter "2 qty" in a recipe. Leave blank if not applicable.'
        />
      </label>

      {/* Optional: volume gram-equivalents */}
      <button
        type="button"
        className="ingredient-picker__toggle-volume"
        onClick={() => setShowVolume((v) => !v)}
        aria-expanded={showVolume}
      >
        {showVolume ? 'Hide' : 'Add'} volume conversions (optional)
      </button>
      {showVolume ? (
        <div className="ingredient-picker__volume-grid">
          <p className="ingredient-picker__custom-section">
            How many grams per volume unit? (leave blank if not applicable)
          </p>
          {VOLUME_UNITS.map((unit) => (
            <label key={unit}>
              {unit}
              <input
                type="number"
                min={0}
                step="any"
                value={volumeGrams[unit] ?? ''}
                placeholder="grams"
                onChange={(e) =>
                  setVolumeGrams((prev) => ({ ...prev, [unit]: e.target.value }))
                }
              />
            </label>
          ))}
        </div>
      ) : null}

      {create.error ? (
        <p role="alert">Could not create ingredient: {create.error.message}</p>
      ) : null}
      <button
        type="button"
        onClick={submitCustom}
        disabled={create.isPending}
      >
        {create.isPending ? 'Creating...' : 'Create ingredient'}
      </button>
    </div>
  );
}
