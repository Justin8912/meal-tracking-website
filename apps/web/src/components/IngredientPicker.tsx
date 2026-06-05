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

/** The units available in the recipe editor, matching the seeded units table. */
export const INGREDIENT_UNITS: Array<{ code: string; label: string }> = [
  { code: 'g',      label: 'gram' },
  { code: 'oz',     label: 'ounce' },
  { code: 'tsp',    label: 'teaspoon' },
  { code: 'tbsp',   label: 'tablespoon' },
  { code: 'fl oz',  label: 'fluid ounce' },
  { code: 'cup',    label: 'cup' },
  { code: 'quart',  label: 'quart' },
  { code: 'qty',    label: 'quantity' },
];

/** Convert oz to grams on the frontend so the engine always receives grams for weight units. */
function resolveWeightUnit(quantity: number, unitCode: string): [number, string] {
  if (unitCode === 'oz') return [quantity * 28.3495, 'g'];
  return [quantity, unitCode];
}

/** Build the editor line from a saved ingredient, quantity, and unit. */
function lineFromSaved(
  saved: SavedIngredient,
  quantity: number,
  unitCode: string,
): Omit<EditorIngredientLine, 'key'> {
  return {
    ingredientId: saved.id,
    name: saved.name,
    quantity,
    unitCode,
    nutrition: toEngineNutrition(saved.nutrition),
    referenceGrams: saved.referenceGrams,
    gramEquivalents: saved.unitGramEquivalents,
    gramWeightPerQty: saved.gramWeightPerQty,
    // Custom ingredients are user-defined — blank fields are intentional, not
    // unknown/absent. Only flag absent macros for USDA-sourced ingredients where
    // we know the API omitted data.
    absentMacros: saved.source === 'custom' ? [] : absentMacrosOf(saved.nutrition),
  };
}

/** Units available when adding a saved ingredient to a recipe. Custom
 *  ingredients are restricted to their preferred unit; USDA ingredients allow all. */
function availableUnitsFor(item: SavedIngredient): Array<{ code: string; label: string }> {
  if (item.source === 'custom') {
    return INGREDIENT_UNITS.filter((u) => u.code === item.preferredUnit);
  }
  return INGREDIENT_UNITS;
}

/** A saved ingredient row — shows name + source badge, then a quantity+unit
 *  confirm step before adding. Custom ingredients also have a delete button. */
function SavedIngredientRow({
  item,
  onAdd,
}: {
  item: SavedIngredient;
  onAdd: (quantity: number, unitCode: string) => void;
}): JSX.Element {
  const deleteIngredient = useDeleteIngredient();
  const [confirming, setConfirming] = useState(false);
  const [quantity, setQuantity] = useState('1');
  const [unitCode, setUnitCode] = useState(item.preferredUnit);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const units = availableUnitsFor(item);

  if (confirming) {
    return (
      <li className="ingredient-picker__saved-confirm">
        <span className="ingredient-picker__saved-confirm-name">{item.name}</span>
        <input
          type="number"
          min={0}
          step="any"
          value={quantity}
          aria-label="Amount"
          onChange={(e) => setQuantity(e.target.value)}
          className="ingredient-picker__amount-input"
        />
        <select
          value={unitCode}
          aria-label="Unit"
          onChange={(e) => setUnitCode(e.target.value)}
          className="ingredient-picker__unit-select"
        >
          {units.map((u) => (
            <option key={u.code} value={u.code}>{u.label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            const q = Number.parseFloat(quantity);
            if (!Number.isNaN(q) && q > 0) {
              const [resolvedQty, resolvedUnit] = resolveWeightUnit(q, unitCode);
              onAdd(resolvedQty, resolvedUnit);
              setConfirming(false);
              setQuantity('1');
              setUnitCode(item.preferredUnit);
            }
          }}
        >
          Add
        </button>
        <button type="button" onClick={() => setConfirming(false)}>Cancel</button>
      </li>
    );
  }

  return (
    <li>
      <span>{item.name}</span>
      <span> ({item.source === 'custom' ? 'custom' : 'usda'})</span>
      <button type="button" onClick={() => setConfirming(true)} aria-label={`Add ${item.name}`}>
        Add
      </button>
      {confirmDelete ? (
        <span className="ingredient-picker__delete-confirm">
          <span>Remove permanently?</span>
          <button
            type="button"
            className="ingredient-picker__delete-yes"
            disabled={deleteIngredient.isPending}
            onClick={() =>
              deleteIngredient.mutate(item.id, {
                onSuccess: () => setConfirmDelete(false),
                onError: () => setConfirmDelete(false),
              })
            }
          >
            {deleteIngredient.isPending ? '...' : 'Yes, remove'}
          </button>
          <button type="button" onClick={() => setConfirmDelete(false)}>Cancel</button>
          {deleteIngredient.error ? (
            <span className="ingredient-picker__delete-error">
              {deleteIngredient.error.message}
            </span>
          ) : null}
        </span>
      ) : (
        <button
          type="button"
          className="ingredient-picker__delete-btn"
          aria-label={`Delete ${item.name}`}
          title="Remove this ingredient from your saved list"
          onClick={() => setConfirmDelete(true)}
        >
          ×
        </button>
      )}
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
  // Quantity and unit for the selected USDA food (AD-4). Defaults to 100g.
  const [confirmQty, setConfirmQty] = useState(100);
  const [confirmUnit, setConfirmUnit] = useState('g');
  const snapshot = useSnapshotUsdaIngredient();

  const [showCustom, setShowCustom] = useState(false);

  function handleSelect(item: UsdaSearchItem): void {
    setSelected(item);
    setConfirmQty(100);
    setConfirmUnit('g');
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
          const [qty, unit] = resolveWeightUnit(confirmQty, confirmUnit);
          onAdd(lineFromSaved(saved, qty, unit));
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
              onAdd={(qty, unit) => onAdd(lineFromSaved(item, qty, unit))}
            />
          ))}
        </ul>
      ) : null}

      {search.data && search.data.length > 0 ? (
        <ul aria-label="Search results">
          {search.data.map((item) => {
            const p = item.per100g;
            const macros = [
              p.calories !== undefined ? `${Math.round(p.calories)} kcal` : null,
              p.proteinG !== undefined ? `${p.proteinG.toFixed(1)}g P` : null,
              p.carbsG !== undefined ? `${p.carbsG.toFixed(1)}g C` : null,
              p.fatG !== undefined ? `${p.fatG.toFixed(1)}g F` : null,
            ].filter(Boolean).join(' · ');
            return (
              <li key={item.fdcId}>
                <div className="ingredient-picker__result-info">
                  <span className="ingredient-picker__result-name">
                    {item.description}
                  </span>
                  <span className="ingredient-picker__result-meta">
                    {item.dataType}
                    {macros ? ` · ${macros} per 100g` : ''}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleSelect(item)}
                  aria-label={`Select ${item.description}`}
                >
                  Add
                </button>
              </li>
            );
          })}
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
          <div className="ingredient-picker__amount-row">
            <label>
              Amount
              <input
                type="number"
                min={0}
                step="any"
                value={confirmQty}
                onChange={(e) => {
                  const next = Number.parseFloat(e.target.value);
                  setConfirmQty(Number.isNaN(next) ? 0 : next);
                }}
                onKeyDown={onEnter(confirmUsda)}
                className="ingredient-picker__amount-input"
              />
            </label>
            <label>
              Unit
              <select
                value={confirmUnit}
                onChange={(e) => setConfirmUnit(e.target.value)}
                className="ingredient-picker__unit-select"
              >
                {INGREDIENT_UNITS.map((u) => (
                  <option key={u.code} value={u.code}>{u.label}</option>
                ))}
              </select>
            </label>
          </div>
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
            onAdd(lineFromSaved(saved, 1, saved.preferredUnit));
            setShowCustom(false);
          }}
        />
      ) : null}
    </div>
  );
}

function CustomIngredientForm({
  onAdded,
}: {
  onAdded: (saved: SavedIngredient) => void;
}): JSX.Element {
  const [name, setName] = useState('');
  const [servingAmount, setServingAmount] = useState('1');
  const [servingUnit, setServingUnit] = useState('g');
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

  function submitCustom(): void {
    const amount = parseNum(servingAmount) ?? 1;

    // Derive the engine fields from the chosen serving unit + amount.
    // For non-gram units we use a virtual-gram model (referenceGrams=1) so
    // the user never needs to know gram weights. The preferred unit recorded
    // on the ingredient restricts the recipe editor to that unit only.
    let referenceGrams: number;
    let gramWeightPerQty: number | undefined;
    let unitGramEquivalents: Record<string, number> | undefined;

    if (servingUnit === 'g') {
      referenceGrams = amount;
    } else if (servingUnit === 'oz') {
      // oz is a universal weight unit — convert to real grams so the engine's
      // built-in 28.3495 g/oz fallback handles recipe usage without any override.
      referenceGrams = amount * 28.3495;
    } else if (servingUnit === 'qty') {
      referenceGrams = 1;
      gramWeightPerQty = 1 / amount;
    } else {
      // Volume units (tsp, tbsp, fl oz, cup, quart)
      referenceGrams = 1;
      unitGramEquivalents = { [servingUnit]: 1 / amount };
    }

    create.mutate(
      {
        name: name.trim(),
        referenceGrams,
        calories: parseNum(calories),
        proteinG: parseNum(proteinG),
        carbsG: parseNum(carbsG),
        fatG: parseNum(fatG),
        fiberG: parseNum(fiberG),
        gramWeightPerQty,
        unitGramEquivalents,
        preferredUnit: servingUnit,
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
        Name
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </label>

      <p className="ingredient-picker__custom-section">Serving size</p>
      <div className="ingredient-picker__serving-row">
        <input
          type="number"
          min={0.01}
          step="any"
          value={servingAmount}
          aria-label="Serving amount"
          onChange={(e) => setServingAmount(e.target.value)}
          className="ingredient-picker__amount-input"
        />
        <select
          value={servingUnit}
          aria-label="Serving unit"
          onChange={(e) => setServingUnit(e.target.value)}
          className="ingredient-picker__unit-select"
        >
          {INGREDIENT_UNITS.map((u) => (
            <option key={u.code} value={u.code}>{u.label}</option>
          ))}
        </select>
      </div>

      <p className="ingredient-picker__custom-section">
        Nutrition per serving
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
      </div>

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
