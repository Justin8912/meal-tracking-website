import { useState, type FormEvent } from 'react';
import { ApiError } from '../api/client.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import {
  useIngredientSearch,
  useSnapshotUsdaIngredient,
  useCreateCustomIngredient,
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
    // Record which macros the API omitted so the engine flags the line
    // missing-macros rather than treating the placeholder 0 as a real total
    // (S-6, F-5).
    absentMacros: absentMacrosOf(saved.nutrition),
  };
}

export function IngredientPicker({ onAdd }: IngredientPickerProps): JSX.Element {
  const [term, setTerm] = useState('');
  const debouncedTerm = useDebouncedValue(term, 300);
  const search = useIngredientSearch(debouncedTerm);

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

  function handleConfirmUsda(event: FormEvent): void {
    event.preventDefault();
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

      {search.data && search.data.length === 0 && debouncedTerm.trim() !== '' ? (
        <p>No foods found. Try a different term or add a custom ingredient.</p>
      ) : null}

      {selected ? (
        <form
          className="ingredient-picker__confirm"
          aria-label="Confirm ingredient amount"
          onSubmit={handleConfirmUsda}
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
            />
          </label>
          {snapshot.error ? (
            <p role="alert">
              Could not add ingredient: {snapshot.error.message}
            </p>
          ) : null}
          <button type="submit" disabled={snapshot.isPending}>
            {snapshot.isPending ? 'Adding...' : 'Confirm'}
          </button>
          <button type="button" onClick={() => setSelected(null)}>
            Cancel
          </button>
        </form>
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
  const create = useCreateCustomIngredient();

  function parseNum(value: string): number | undefined {
    if (value.trim() === '') return undefined;
    const n = Number.parseFloat(value);
    return Number.isNaN(n) ? undefined : n;
  }

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    create.mutate(
      {
        name: name.trim(),
        calories: parseNum(calories),
        proteinG: parseNum(proteinG),
        carbsG: parseNum(carbsG),
        fatG: parseNum(fatG),
        fiberG: parseNum(fiberG),
      },
      { onSuccess: onAdded },
    );
  }

  return (
    <form
      className="ingredient-picker__custom"
      aria-label="Custom ingredient"
      onSubmit={handleSubmit}
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
      <label>
        Calories
        <input
          type="number"
          min={0}
          step="any"
          value={calories}
          onChange={(e) => setCalories(e.target.value)}
        />
      </label>
      <label>
        Protein (g)
        <input
          type="number"
          min={0}
          step="any"
          value={proteinG}
          onChange={(e) => setProteinG(e.target.value)}
        />
      </label>
      <label>
        Carbs (g)
        <input
          type="number"
          min={0}
          step="any"
          value={carbsG}
          onChange={(e) => setCarbsG(e.target.value)}
        />
      </label>
      <label>
        Fat (g)
        <input
          type="number"
          min={0}
          step="any"
          value={fatG}
          onChange={(e) => setFatG(e.target.value)}
        />
      </label>
      <label>
        Fiber (g)
        <input
          type="number"
          min={0}
          step="any"
          value={fiberG}
          onChange={(e) => setFiberG(e.target.value)}
        />
      </label>
      {create.error ? (
        <p role="alert">Could not create ingredient: {create.error.message}</p>
      ) : null}
      <button type="submit" disabled={create.isPending}>
        {create.isPending ? 'Creating...' : 'Create ingredient'}
      </button>
    </form>
  );
}
