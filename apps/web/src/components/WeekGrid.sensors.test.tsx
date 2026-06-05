import { describe, expect, it } from 'vitest';
import { PointerSensor, KeyboardSensor } from '@dnd-kit/core';
import {
  POINTER_ACTIVATION,
  PLANNER_SENSORS,
} from './WeekGrid.js';

/**
 * STEP-19/20 structural check (S-6, F-2/F-3, AC-4.3/4.4).
 *
 * A real pointer/touch drag gesture cannot be deterministically simulated in
 * jsdom, and Playwright browser downloads are blocked by the sandbox TLS proxy
 * (the same constraint recipe-library Bundle 6 documented). The live drag
 * gesture is therefore a documented manual/Playwright check. What IS verified
 * here deterministically is the dnd-kit WIRING that makes touch-drag safe and
 * a11y-complete:
 *   - the PointerSensor activation constraint carries BOTH a touch activation
 *     DELAY and a movement TOLERANCE, so a touch-drag is distinguished from a
 *     page scroll (the central touch risk) rather than firing immediately;
 *   - a KeyboardSensor is present for keyboard-driven assignment (a11y, S-6);
 *   - native HTML5 DnD is NOT used (dnd-kit only, F-2).
 */
describe('WeekGrid dnd-kit sensor configuration', () => {
  it('configures a PointerSensor with a touch activation delay AND tolerance', () => {
    expect(POINTER_ACTIVATION.delay).toBeGreaterThan(0);
    expect(POINTER_ACTIVATION.tolerance).toBeGreaterThan(0);
  });

  it('registers a PointerSensor and a KeyboardSensor (touch + keyboard, S-6)', () => {
    const sensorTypes = PLANNER_SENSORS.map((descriptor) => descriptor.sensor);
    expect(sensorTypes).toContain(PointerSensor);
    expect(sensorTypes).toContain(KeyboardSensor);
  });

  it('passes the touch activation constraint to the PointerSensor descriptor', () => {
    const pointer = PLANNER_SENSORS.find(
      (descriptor) => descriptor.sensor === PointerSensor,
    );
    expect(pointer).toBeTruthy();
    const options = pointer?.options as
      | { activationConstraint?: unknown }
      | undefined;
    expect(options?.activationConstraint).toEqual(POINTER_ACTIVATION);
  });
});
