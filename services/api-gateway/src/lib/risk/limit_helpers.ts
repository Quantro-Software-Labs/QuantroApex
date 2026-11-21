import { z } from 'zod';
import type { LimitUnit } from '../db/types.js';

export { LimitUnit };

/**
 * Strict percentage input schema:
 * Accepts strictly 0 < value <= 100 representing percentage (e.g. 15 for 15%, 2 for 2%).
 * 1 means 1% (0.01), never 100%. Values <= 0 or > 100 are rejected with validation error.
 */
export const percentInputSchema = z
  .number()
  .gt(0, { message: 'Percentage must be greater than 0' })
  .lte(100.0, { message: 'Percentage must be less than or equal to 100' });

/**
 * Converts a percentage number (0 < value <= 100) to stored decimal fraction (0 < fraction <= 1.0).
 * E.g., 15 -> 0.15, 2 -> 0.02, 1 -> 0.01.
 */
export function toDecimalFraction(percentValue: number): number {
  if (percentValue <= 0 || percentValue > 100) {
    throw new Error('Percent value must be > 0 and <= 100');
  }
  return Number((percentValue / 100.0).toFixed(6));
}

/**
 * Validates a stored limit value based on its explicit unit:
 * - PERCENT: stored as fraction strictly 0 < x <= 1.0 (e.g. 0.15 for 15%).
 *   A stored value of 15 with unit PERCENT is rejected and never treated as $15.
 * - USD: stored strictly > 0.
 */
export function validateStoredLimit(value: number, unit: LimitUnit = 'PERCENT', fieldName = 'limit'): void {
  if (unit === 'PERCENT') {
    if (value <= 0 || value > 1.0) {
      throw new Error(
        `Invalid stored limit for ${fieldName} with unit PERCENT: must be a fraction 0 < x <= 1.0 (e.g., 0.15 for 15%). Got ${value}.`,
      );
    }
  } else if (unit === 'USD') {
    if (value <= 0) {
      throw new Error(`Invalid stored limit for ${fieldName} with unit USD: must be greater than 0. Got ${value}.`);
    }
  }
}

