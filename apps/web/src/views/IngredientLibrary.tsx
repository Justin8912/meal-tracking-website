import { useState } from 'react';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { MacroBar } from '../components/MacroBar.js';
import {
  useIngredients,
  useDeleteIngredient,
  useUpdateIngredient,
  useUpdateIngredientNote,
  type SavedIngredient,
  type IngredientUpdateInput,
} from '../query/ingredients.js';

/**
 * Ingredient Library view.
 *
 * Lists all workspace ingredients (custom + USDA snapshots) with client-side
 * search. Clicking a row expands a detail panel showing macros, notes, and
 * actions. Custom ingredients are fully editable; USDA ingredients allow
 * note editing only (nutrition is locked to the USDA snapshot).
 */

/** Format a nullable numeric macro for display. */
function fmt(value: number | undefined, unit = 'g'): string {
  if (value === undefined) return '–';
  return `${value}${unit}`;
}

// ─── Edit form (custom ingredients only) ────────────────────────────────────

function IngredientEditForm({
  item,
  onSaved,
  onCancel,
}: {
  item: SavedIngredient;
  onSaved: () => void;
  onCancel: () => void;
}): JSX.Element {
  const update = useUpdateIngredient();

  const [name, setName] = useState(item.name);
  const [calories, setCalories] = useState(
    item.nutrition.calories !== undefined ? String(item.nutrition.calories) : '',
  );
  const [proteinG, setProteinG] = useState(
    item.nutrition.proteinG !== undefined ? String(item.nutrition.proteinG) : '',
  );
  const [carbsG, setCarbsG] = useState(
    item.nutrition.carbsG !== undefined ? String(item.nutrition.carbsG) : '',
  );
  const [fatG, setFatG] = useState(
    item.nutrition.fatG !== undefined ? String(item.nutrition.fatG) : '',
  );
  const [fiberG, setFiberG] = useState(
    item.nutrition.fiberG !== undefined ? String(item.nutrition.fiberG) : '',
  );
  const [notes, setNotes] = useState(item.notes ?? '');

  function parseNum(v: string): number | null | undefined {
    if (v.trim() === '') return undefined;
    const n = Number.parseFloat(v);
    return Number.isNaN(n) ? undefined : n;
  }

  function handleSave(): void {
    const payload: { id: string } & IngredientUpdateInput = {
      id: item.id,
      name: name.trim(),
      calories: parseNum(calories),
      proteinG: parseNum(proteinG),
      carbsG: parseNum(carbsG),
      fatG: parseNum(fatG),
      fiberG: parseNum(fiberG),
      notes: notes.trim() === '' ? null : notes.trim(),
    };
    update.mutate(payload, { onSuccess: onSaved });
  }

  return (
    <div className="ingredient-row__edit-form">
      <p className="ingredient-row__edit-label">
        Editing macros per {item.referenceGrams}g
      </p>

      <label>
        Name
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </label>

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

      <label>
        Notes
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Optional notes..."
          className="ingredient-picker__notes-textarea"
        />
      </label>

      {update.error ? (
        <p role="alert" className="ingredient-row__error">
          Could not save: {update.error.message}
        </p>
      ) : null}

      <div className="recipe-row__actions">
        <button
          type="button"
          className="btn btn--primary"
          onClick={handleSave}
          disabled={update.isPending || name.trim() === ''}
        >
          {update.isPending ? 'Saving...' : 'Save changes'}
        </button>
        <button type="button" className="btn btn--secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── USDA note-only edit ─────────────────────────────────────────────────────

function UsdaNoteEdit({
  item,
  onSaved,
  onCancel,
}: {
  item: SavedIngredient;
  onSaved: () => void;
  onCancel: () => void;
}): JSX.Element {
  const updateNote = useUpdateIngredientNote();
  const [notes, setNotes] = useState(item.notes ?? '');

  return (
    <div className="ingredient-row__edit-form">
      <label>
        Notes
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Add a note about this ingredient..."
          className="ingredient-picker__notes-textarea"
        />
      </label>
      {updateNote.error ? (
        <p role="alert" className="ingredient-row__error">
          {updateNote.error.message}
        </p>
      ) : null}
      <div className="recipe-row__actions">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() =>
            updateNote.mutate(
              { id: item.id, notes: notes.trim() === '' ? null : notes.trim() },
              { onSuccess: onSaved },
            )
          }
          disabled={updateNote.isPending}
        >
          {updateNote.isPending ? 'Saving...' : 'Save note'}
        </button>
        <button type="button" className="btn btn--secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Detail panel ────────────────────────────────────────────────────────────

function IngredientDetailPanel({
  item,
  onClose,
}: {
  item: SavedIngredient;
  onClose: () => void;
}): JSX.Element {
  const deleteIngredient = useDeleteIngredient();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const n = item.nutrition;

  if (editing) {
    return (
      <div className="recipe-row__detail">
        {item.source === 'custom' ? (
          <IngredientEditForm
            item={item}
            onSaved={() => setEditing(false)}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <UsdaNoteEdit
            item={item}
            onSaved={() => setEditing(false)}
            onCancel={() => setEditing(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="recipe-row__detail">
      {/* Source badge */}
      <p className="ingredient-row__source-line">
        <span className={`chip${item.source === 'usda' ? ' chip--tag' : ''}`}>
          {item.source === 'usda' ? 'USDA' : 'custom'}
        </span>
        {item.source === 'usda' ? (
          <span className="ingredient-row__usda-note">
            Nutrition from USDA FoodData Central &mdash; read-only
          </span>
        ) : null}
      </p>

      {/* Macro bars */}
      <div className="recipe-row__macro-bars">
        <dl className="macro-bars">
          <MacroBar variant="protein" label="Protein" value={n.proteinG ?? 0} />
          <MacroBar variant="carbs" label="Carbs" value={n.carbsG ?? 0} />
          <MacroBar variant="fat" label="Fat" value={n.fatG ?? 0} />
          <MacroBar variant="fiber" label="Fiber" value={n.fiberG ?? 0} />
        </dl>
        {n.calories !== undefined ? (
          <p className="recipe-row__kcal">{Math.round(n.calories)} kcal</p>
        ) : null}
      </div>

      {/* Macro table */}
      <div className="recipe-row__ingredient-table-wrap">
        <table className="recipe-row__ingredient-table">
          <thead>
            <tr>
              <th>Per {item.referenceGrams}g</th>
              <th>Calories</th>
              <th>Protein</th>
              <th>Carbs</th>
              <th>Fat</th>
              <th>Fiber</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{item.name}</td>
              <td className="recipe-row__td-num">
                {n.calories !== undefined ? Math.round(n.calories) : '–'}
              </td>
              <td className="recipe-row__td-num recipe-row__td-protein">
                {fmt(n.proteinG)}
              </td>
              <td className="recipe-row__td-num recipe-row__td-carbs">
                {fmt(n.carbsG)}
              </td>
              <td className="recipe-row__td-num recipe-row__td-fat">
                {fmt(n.fatG)}
              </td>
              <td className="recipe-row__td-num">
                {fmt(n.fiberG)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Notes */}
      {item.notes ? (
        <div className="recipe-row__notes">
          <p className="recipe-row__section-label">Notes</p>
          <p>{item.notes}</p>
        </div>
      ) : null}

      {/* Actions */}
      <div className="recipe-row__actions">
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => setEditing(true)}
        >
          {item.source === 'usda' ? 'Edit note' : 'Edit'}
        </button>

        {confirmDelete ? (
          <>
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => deleteIngredient.mutate(item.id, { onSuccess: onClose })}
              disabled={deleteIngredient.isPending}
            >
              {deleteIngredient.isPending ? 'Deleting...' : 'Confirm delete'}
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn--secondary"
            style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
            onClick={() => setConfirmDelete(true)}
          >
            Delete
          </button>
        )}

        {deleteIngredient.error ? (
          <p role="alert" className="ingredient-row__error">
            {deleteIngredient.error.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}

// ─── Main view ───────────────────────────────────────────────────────────────

export function IngredientLibrary(): JSX.Element {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(searchTerm, 200);

  const { data: ingredients, isLoading, isError, error } = useIngredients();

  const filtered =
    debouncedSearch.trim() === ''
      ? (ingredients ?? [])
      : (ingredients ?? []).filter((i) =>
          i.name.toLowerCase().includes(debouncedSearch.toLowerCase()),
        );

  return (
    <section aria-labelledby="ingredient-library-heading" className="meal-library">
      <h1 id="ingredient-library-heading">Ingredient Library</h1>

      <div className="meal-library__toolbar" role="search">
        <div className="meal-library__pills" />
        <div className="meal-library__toolbar-right">
          <div className="meal-library__search-wrap">
            <svg
              className="meal-library__search-icon"
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden
            >
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
              <line
                x1="11" y1="11" x2="14" y2="14"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
              />
            </svg>
            <input
              type="search"
              aria-label="Search ingredients"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search…"
              className="meal-library__search-input"
            />
          </div>
        </div>
      </div>

      {isLoading ? (
        <p role="status">Loading ingredients...</p>
      ) : isError ? (
        <p role="alert">
          Could not load ingredients: {error?.message ?? 'unknown error'}
        </p>
      ) : filtered.length === 0 ? (
        debouncedSearch.trim() !== '' ? (
          <p>No ingredients found.</p>
        ) : (
          <p>No ingredients yet. Add ingredients from a recipe to get started.</p>
        )
      ) : (
        <ul aria-label="Ingredients" className="recipe-list">
          {filtered.map((item) => {
            const isExpanded = expandedId === item.id;
            const n = item.nutrition;
            const kcal =
              n.calories !== undefined ? `${Math.round(n.calories)} kcal` : null;
            const macroSummary = [
              n.proteinG !== undefined ? `${n.proteinG.toFixed(1)}g P` : null,
              n.carbsG !== undefined ? `${n.carbsG.toFixed(1)}g C` : null,
              n.fatG !== undefined ? `${n.fatG.toFixed(1)}g F` : null,
            ]
              .filter(Boolean)
              .join(' · ');

            return (
              <li
                key={item.id}
                className={`recipe-row${isExpanded ? ' recipe-row--expanded' : ''}`}
              >
                <button
                  type="button"
                  className="recipe-row__header"
                  aria-expanded={isExpanded}
                  onClick={() =>
                    setExpandedId((id) => (id === item.id ? null : item.id))
                  }
                >
                  <span className="recipe-row__name">{item.name}</span>
                  <span className="recipe-row__meta">
                    <span className={`chip${item.source === 'usda' ? ' chip--tag' : ''}`}>
                      {item.source === 'usda' ? 'USDA' : 'custom'}
                    </span>
                    {kcal ? (
                      <span className="recipe-row__kcal-badge">{kcal}</span>
                    ) : null}
                    {macroSummary ? (
                      <span className="recipe-row__macro-summary">{macroSummary}</span>
                    ) : null}
                    <span className="recipe-row__chevron" aria-hidden>
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </span>
                </button>

                {isExpanded ? (
                  <IngredientDetailPanel
                    item={item}
                    onClose={() => setExpandedId(null)}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
