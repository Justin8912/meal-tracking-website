import { useEffect, useState } from 'react';

/**
 * Debounce a rapidly-changing value (STEP-39/43, AD-5). Search and filter
 * inputs feed this so a TanStack Query key only changes after the user pauses,
 * avoiding a request per keystroke. Returns the latest value once `delayMs` has
 * elapsed without a further change.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);

  return debounced;
}
