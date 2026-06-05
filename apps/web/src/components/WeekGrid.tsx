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
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
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

/** Display label for a single plan entry (recipe name, freeform title, or tombstone). */
function entryLabel(entry: PlanEntry): string {
  if (entry.freeformTitle) return entry.freeformTitle;
  if (entry.recipeId) return entry.recipeName ?? 'Recipe';
  return 'Recipe removed';
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
  // The tap-to-assign selection: the recipe id picked by a tap, awaiting a
  // day/slot tap to place it (AC-4.4). Null when nothing is selected.
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const save = useSavePlanEntry();
  // Hooks must be called unconditionally and in a stable order, so the two
  // sensors are created explicitly rather than mapped over PLANNER_SENSORS
  // (which exists for the structural test). They carry the same config.
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: POINTER_ACTIVATION,
  });
  const keyboardSensor = useSensor(KeyboardSensor);
  const sensors = useSensors(pointerSensor, keyboardSensor);

  // A single assignment entry point shared by drag-drop, keyboard-drop, and
  // tap-to-assign: build a recipe-only PlanEntryInput (XOR, S-1) for the target
  // day/slot and POST it via the week-keyed mutation (AC-4.3, AD-4).
  function assign(recipeId: string, dayOfWeek: number, slot: MealSlot): void {
    const candidate: PlanEntryInput = {
      weekStart,
      dayOfWeek,
      mealSlot: slot,
      recipeId,
    };
    const parsed = planEntryInputSchema.safeParse(candidate);
    if (!parsed.success) return;
    save.mutate({ input: parsed.data });
    setSelectedRecipeId(null);
  }

  function handleDragEnd(event: DragEndEvent): void {
    const recipeId = event.active.data.current?.recipeId as string | undefined;
    const overId = event.over?.id;
    if (!recipeId || overId == null) return;
    const target = parseSlotDroppableId(String(overId));
    if (!target) return;
    assign(recipeId, target.dayOfWeek, target.slot);
  }

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
      `}</style>
      <div className="weekly-planner__edit-layout">
        <RecipePalette
          renderCard={(recipe) => (
            <DraggableRecipeCard
              recipe={recipe}
              selected={selectedRecipeId === recipe.id}
              onSelect={() =>
                setSelectedRecipeId((id) =>
                  id === recipe.id ? null : recipe.id,
                )
              }
            />
          )}
        />

        <div>
          {selectedRecipeId ? (
            <p role="status">
              Recipe selected. Tap a day and slot to assign it.
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
                        hasSelection={selectedRecipeId !== null}
                        onTapAssign={() =>
                          selectedRecipeId &&
                          assign(selectedRecipeId, dayOfWeek, slot)
                        }
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
