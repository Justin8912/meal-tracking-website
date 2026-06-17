import { useState } from 'react';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type SensorDescriptor,
  type SensorOptions,
} from '@dnd-kit/core';
import type {
  MealSlot,
  PlanEntry,
  PlanEntryInput,
  Recipe,
} from '@meal-tracking/shared';
import { planEntryInputSchema } from '@meal-tracking/shared';
import { ApiError } from '../api/client.js';
import { useSavePlanEntry } from '../query/plans.js';
import { RecipePalette } from './RecipePalette.js';
import { IngredientPicker } from './IngredientPicker.js';
import type { EditorIngredientLine } from './RecipeEditor.js';

/**
 * WeekGrid (FR-4, AD-5, STEP-20) — the drag/tap-to-assign edit surface.
 *
 * Wraps the recipe palette (LEFT) and the week (RIGHT) in a single dnd-kit
 * DndContext so a recipe can be assigned to a day/slot by:
 *   - DRAGGING a palette card onto a day/slot cell (pointer/touch), or
 *   - KEYBOARD drag (Space/arrows/Space via the KeyboardSensor), or
 *   - the TAP-TO-ASSIGN fallback: tap a recipe to select it, then tap a
 *     day/slot target to place it (AC-4.4, NFR-2) — so touch users are never
 *     forced into a fiddly drag.
 * Every path resolves to a POST /plans {recipeId} for the target day/slot via
 * the week-keyed save mutation (AC-4.3, AD-4). Native HTML5 DnD is never used
 * (F-2). No emojis (S-7).
 */

const DAY_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

const MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/**
 * The PointerSensor activation constraint. A touch press must be held for
 * `delay` ms AND stay within `tolerance` px before a drag starts, so a touch
 * gesture intended as a SCROLL is not hijacked into a drag (the central touch
 * risk, F-3). On mouse the same constraint acts as a small movement threshold,
 * so a click is not mistaken for a drag. Exported for the structural test.
 */
export const POINTER_ACTIVATION = {
  delay: 200,
  tolerance: 8,
} as const;

/**
 * The dnd-kit sensor descriptors for the planner: a PointerSensor (touch +
 * mouse, with the activation constraint above) and a KeyboardSensor (a11y, so
 * assignment works without a pointer — S-6). Exported so the structural test
 * can assert touch + keyboard support without simulating a raw gesture.
 */
export const PLANNER_SENSORS: SensorDescriptor<SensorOptions>[] = [
  { sensor: PointerSensor, options: { activationConstraint: POINTER_ACTIVATION } },
  { sensor: KeyboardSensor, options: {} },
];

/** Encode/decode a day/slot droppable id without colliding with a recipe id. */
function slotDroppableId(dayOfWeek: number, slot: MealSlot): string {
  return `slot:${dayOfWeek}:${slot}`;
}
function parseSlotDroppableId(
  id: string,
): { dayOfWeek: number; slot: MealSlot } | null {
  const match = /^slot:(\d):(breakfast|lunch|dinner|snack)$/.exec(id);
  if (!match) return null;
  return { dayOfWeek: Number(match[1]), slot: match[2] as MealSlot };
}

/** A configured ingredient ready to drag onto the planner grid. */
interface ConfiguredIngredient {
  localId: string;
  ingredientId: string;
  name: string;
  quantity: number;
  unitCode: string;
}

/** Union of the two draggable item types carried in dnd-kit drag data. */
type DragItemData =
  | { type: 'recipe'; recipeId: string }
  | { type: 'ingredient'; item: ConfiguredIngredient };

/** Active tap/keyboard selection — either a palette recipe or a configured ingredient. */
type Selection =
  | { type: 'recipe'; recipeId: string }
  | { type: 'ingredient'; item: ConfiguredIngredient }
  | null;

/** Display label for a single plan entry (recipe, ingredient, freeform, or tombstone). */
function entryLabel(entry: PlanEntry): string {
  if (entry.ingredientId) {
    const name = entry.ingredientName ?? 'Ingredient';
    const qty = entry.ingredientQuantity;
    const unit = entry.ingredientUnitCode;
    return qty != null ? `${name} (${qty}${unit})` : name;
  }
  if (entry.freeformTitle) return entry.freeformTitle;
  if (entry.recipeId) return entry.recipeName ?? 'Recipe';
  return 'Recipe removed';
}

let ingredientLocalIdCounter = 0;

/**
 * Ingredient palette panel: IngredientPicker at top to search and configure
 * an ingredient + quantity, then a list of configured items that can be
 * dragged to any day/slot (matching the recipe editor's ingredient workflow).
 */
function IngredientPalettePanel({
  renderIngredientCard,
}: {
  renderIngredientCard: (item: ConfiguredIngredient) => JSX.Element;
}): JSX.Element {
  const [configured, setConfigured] = useState<ConfiguredIngredient[]>([]);

  function handleAdd(line: Omit<EditorIngredientLine, 'key'>): void {
    ingredientLocalIdCounter += 1;
    setConfigured((prev) => [
      ...prev,
      {
        localId: String(ingredientLocalIdCounter),
        ingredientId: line.ingredientId,
        name: line.name,
        quantity: line.quantity,
        unitCode: line.unitCode,
      },
    ]);
  }

  return (
    <div className="weekly-planner__ingredient-palette">
      <IngredientPicker onAdd={handleAdd} />
      {configured.length > 0 ? (
        <>
          <p className="weekly-planner__ingredient-palette-hint">
            Drag or tap an item below to add it to the plan
          </p>
          <ul aria-label="Configured ingredients" className="weekly-planner__palette-list">
            {configured.map((item) => (
              <li key={item.localId}>
                {renderIngredientCard(item)}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

/**
 * A palette recipe rendered as BOTH a dnd-kit draggable AND a tap-to-select
 * button. Tapping (a plain click) selects the recipe for the tap-to-assign
 * fallback; pressing and dragging starts a drag once the pointer activation
 * constraint is met. Keyboard users activate the drag via the button + the
 * KeyboardSensor.
 */
function DraggableRecipeCard({
  recipe,
  selected,
  onSelect,
}: {
  recipe: Recipe;
  selected: boolean;
  onSelect: () => void;
}): JSX.Element {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: recipe.id,
    data: { recipeId: recipe.id },
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      {...listeners}
      {...attributes}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span>{recipe.name}</span> <span>({recipe.mealType})</span>
    </button>
  );
}

/**
 * A configured ingredient item rendered as a dnd-kit draggable AND a
 * tap-to-select button, identical pattern to DraggableRecipeCard.
 */
function DraggableIngredientCard({
  item,
  selected,
  onSelect,
}: {
  item: ConfiguredIngredient;
  selected: boolean;
  onSelect: () => void;
}): JSX.Element {
  const data: DragItemData = { type: 'ingredient', item };
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `ingredient-${item.localId}`,
    data,
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      {...listeners}
      {...attributes}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span>{item.name}</span>{' '}
      <span className="recipe-row__kcal-badge">
        {item.quantity}{item.unitCode}
      </span>
    </button>
  );
}

/**
 * A droppable day/slot target. Acts as a dnd-kit drop zone for a dragged recipe
 * AND a tap-to-assign target: when a recipe is selected via tap, clicking the
 * target assigns it (the touch fallback). When nothing is selected, the tap is
 * inert.
 */
function DroppableSlot({
  dayLabel,
  dayOfWeek,
  slot,
  entries,
  hasSelection,
  onTapAssign,
}: {
  dayLabel: string;
  dayOfWeek: number;
  slot: MealSlot;
  entries: PlanEntry[];
  hasSelection: boolean;
  onTapAssign: () => void;
}): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({
    id: slotDroppableId(dayOfWeek, slot),
    data: { dayOfWeek, slot },
  });
  const slotEntries = entries.filter((e) => e.mealSlot === slot);

  return (
    <li
      ref={setNodeRef}
      style={isOver ? { outline: '2px solid currentColor' } : undefined}
    >
      <button
        type="button"
        aria-label={`Assign to ${dayLabel} ${slot}`}
        aria-disabled={!hasSelection}
        onClick={() => {
          if (hasSelection) onTapAssign();
        }}
      >
        {slot}
      </button>
      {slotEntries.length > 0 ? (
        <ul aria-label={`${dayLabel} ${slot} meals`}>
          {slotEntries.map((entry) => (
            <li key={entry.id}>{entryLabel(entry)}</li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export interface WeekGridProps {
  weekStart: string;
  /** The active week's entries grouped by dayOfWeek. */
  byDay: Map<number, PlanEntry[]>;
}

export function WeekGrid({ weekStart, byDay }: WeekGridProps): JSX.Element {
  const [selection, setSelection] = useState<Selection>(null);
  const [paletteTab, setPaletteTab] = useState<'recipes' | 'ingredients'>('recipes');
  const save = useSavePlanEntry();
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: POINTER_ACTIVATION,
  });
  const keyboardSensor = useSensor(KeyboardSensor);
  const sensors = useSensors(pointerSensor, keyboardSensor);

  function assignRecipe(recipeId: string, dayOfWeek: number, slot: MealSlot): void {
    const input: PlanEntryInput = { weekStart, dayOfWeek, mealSlot: slot, recipeId };
    const parsed = planEntryInputSchema.safeParse(input);
    if (!parsed.success) return;
    save.mutate({ input: parsed.data });
    setSelection(null);
  }

  function assignIngredient(
    item: ConfiguredIngredient,
    dayOfWeek: number,
    slot: MealSlot,
  ): void {
    const input: PlanEntryInput = {
      weekStart,
      dayOfWeek,
      mealSlot: slot,
      ingredientId: item.ingredientId,
      ingredientQuantity: item.quantity,
      ingredientUnitCode: item.unitCode,
    };
    const parsed = planEntryInputSchema.safeParse(input);
    if (!parsed.success) return;
    save.mutate({ input: parsed.data });
    // Keep ingredient selected so the user can drop it into multiple slots.
  }

  function handleDragEnd(event: DragEndEvent): void {
    const data = event.active.data.current as DragItemData | undefined;
    const overId = event.over?.id;
    if (!data || overId == null) return;
    const target = parseSlotDroppableId(String(overId));
    if (!target) return;

    if (data.type === 'recipe') {
      assignRecipe(data.recipeId, target.dayOfWeek, target.slot);
    } else {
      assignIngredient(data.item, target.dayOfWeek, target.slot);
    }
  }

  const hasSelection = selection !== null;
  const saveErrorMessage =
    save.error instanceof ApiError
      ? save.error.message
      : save.error?.message ?? null;

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <style>{`
        .weekly-planner__edit-layout {
          display: grid;
          gap: 1rem;
          grid-template-columns: minmax(0, 1fr);
        }
        @media (min-width: 768px) {
          .weekly-planner__edit-layout {
            grid-template-columns: minmax(14rem, 20rem) minmax(0, 1fr);
          }
        }
        .weekly-planner__palette-tabs {
          display: flex;
          gap: 0;
          border-bottom: 1px solid var(--border);
          margin-bottom: 12px;
        }
        .weekly-planner__palette-tab {
          flex: 1;
          padding: 7px 12px;
          background: none;
          border: none;
          border-bottom: 2px solid transparent;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          color: var(--muted);
        }
        .weekly-planner__palette-tab[aria-selected="true"] {
          color: var(--text, #1a1a1a);
          border-bottom-color: currentColor;
        }
        .weekly-planner__ingredient-palette {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .weekly-planner__ingredient-palette-hint {
          font-size: 12px;
          color: var(--muted);
          margin: 0;
        }
      `}</style>
      <div className="weekly-planner__edit-layout">
        <aside aria-label="Palette" className="weekly-planner__palette">
          <div className="weekly-planner__palette-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={paletteTab === 'recipes'}
              className="weekly-planner__palette-tab"
              onClick={() => { setPaletteTab('recipes'); setSelection(null); }}
            >
              Recipes
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={paletteTab === 'ingredients'}
              className="weekly-planner__palette-tab"
              onClick={() => { setPaletteTab('ingredients'); setSelection(null); }}
            >
              Ingredients
            </button>
          </div>

          {paletteTab === 'recipes' ? (
            <RecipePalette
              renderCard={(recipe) => (
                <DraggableRecipeCard
                  recipe={recipe}
                  selected={
                    selection?.type === 'recipe' &&
                    selection.recipeId === recipe.id
                  }
                  onSelect={() =>
                    setSelection((s) =>
                      s?.type === 'recipe' && s.recipeId === recipe.id
                        ? null
                        : { type: 'recipe', recipeId: recipe.id },
                    )
                  }
                />
              )}
            />
          ) : (
            <IngredientPalettePanel
              renderIngredientCard={(item) => (
                <DraggableIngredientCard
                  item={item}
                  selected={
                    selection?.type === 'ingredient' &&
                    selection.item.localId === item.localId
                  }
                  onSelect={() =>
                    setSelection((s) =>
                      s?.type === 'ingredient' &&
                      s.item.localId === item.localId
                        ? null
                        : { type: 'ingredient', item },
                    )
                  }
                />
              )}
            />
          )}
        </aside>

        <div>
          {selection ? (
            <p role="status">
              {selection.type === 'recipe'
                ? 'Recipe selected — tap a day and slot to assign it.'
                : `${selection.item.name} (${selection.item.quantity}${selection.item.unitCode}) selected — tap a slot to assign.`}
            </p>
          ) : null}
          {saveErrorMessage ? (
            <p role="alert">Change not saved: {saveErrorMessage}</p>
          ) : null}
          <ol aria-label="Days of the week" className="weekly-planner__week">
            {DAY_LABELS.map((dayLabel, dayOfWeek) => {
              const entries = byDay.get(dayOfWeek) ?? [];
              return (
                <li key={dayLabel} className="weekly-planner__day">
                  <h2>{dayLabel}</h2>
                  <ul aria-label={`${dayLabel} slots`}>
                    {MEAL_SLOTS.map((slot) => (
                      <DroppableSlot
                        key={slot}
                        dayLabel={dayLabel}
                        dayOfWeek={dayOfWeek}
                        slot={slot}
                        entries={entries}
                        hasSelection={hasSelection}
                        onTapAssign={() => {
                          if (!selection) return;
                          if (selection.type === 'recipe') {
                            assignRecipe(selection.recipeId, dayOfWeek, slot);
                          } else {
                            assignIngredient(selection.item, dayOfWeek, slot);
                          }
                        }}
                      />
                    ))}
                  </ul>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </DndContext>
  );
}
