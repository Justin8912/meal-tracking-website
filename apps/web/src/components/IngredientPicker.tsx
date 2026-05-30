import type { EditorIngredientLine } from './RecipeEditor.js';

/**
 * Ingredient picker (placeholder for STEP-37; full implementation in STEP-39).
 *
 * The real picker (STEP-39) does a debounced USDA search via TanStack Query,
 * lets the user confirm a pre-filled gram weight (AD-4), provides a
 * custom-ingredient form posting to /ingredients, and degrades to the custom
 * path on a search error (AC-2.3). This stub establishes the onAdd contract the
 * RecipeEditor consumes so the editor can be built and tested first.
 */
export interface IngredientPickerProps {
  /** Called when the user confirms an ingredient line to add to the recipe. */
  onAdd: (line: Omit<EditorIngredientLine, 'key'>) => void;
}

export function IngredientPicker(_props: IngredientPickerProps): JSX.Element {
  return <div className="ingredient-picker" />;
}
