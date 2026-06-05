import type { ReactNode } from 'react';

/**
 * MacroBar (prototype "MacroBar", artifacts/food-tracker.jsx ~145).
 *
 * A small labeled nutrition row: an uppercase label on the left, the value on
 * the right, and a thin colored track beneath whose fill is proportional to a
 * per-macro reference maximum. It is PURELY presentational — it renders the
 * value it is GIVEN and never rounds (display rounding stays in the engine's
 * formatNutrition boundary, S-5/S-6). The track width is a visual cue only and
 * is hidden from assistive tech (aria-hidden); the value itself stays in the
 * accessible <dt>/<dd> pair so the existing accessible names are preserved.
 *
 * Rendered as a <dl> child <div> so it slots into the nutrition definition lists
 * the views already expose (RecipeEditor, PlannedMealDetail,
 * WeeklyNutritionSummary) without changing their <dt>/<dd> semantics. No emojis
 * (S-7).
 */

/** The macros that get a colored bar, mapped to the prototype's per-macro hues. */
export type MacroVariant = 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber';

/** Per-macro reference maxima used only to scale the visual fill (prototype values). */
const MACRO_MAX: Record<MacroVariant, number> = {
  calories: 1000,
  protein: 50,
  carbs: 70,
  fat: 40,
  fiber: 15,
};

export interface MacroBarProps {
  /** The macro this bar represents; selects the fill color + reference max. */
  variant: MacroVariant;
  /** The visible label text (e.g. "Protein (g)"). */
  label: ReactNode;
  /**
   * The displayed value, ALREADY formatted by the engine's formatNutrition. Used
   * both as the visible value and, when numeric, to size the fill.
   */
  value: number | string;
  /** Optional accessible name for the value cell (preserves existing labels). */
  valueAriaLabel?: string;
}

export function MacroBar({
  variant,
  label,
  value,
  valueAriaLabel,
}: MacroBarProps): JSX.Element {
  const numeric = typeof value === 'number' ? value : Number.parseFloat(value);
  const max = MACRO_MAX[variant];
  const pct =
    Number.isFinite(numeric) && max > 0
      ? Math.max(0, Math.min((numeric / max) * 100, 100))
      : 0;

  return (
    <div className="macro-bar">
      <dt className="macro-bar__label">{label}</dt>
      <dd className="macro-bar__value" aria-label={valueAriaLabel}>
        {value}
      </dd>
      <div className={`macro-bar__track macro-bar__track--${variant}`} aria-hidden>
        <div className="macro-bar__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
