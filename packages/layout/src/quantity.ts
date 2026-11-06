import { z } from 'zod';

/**
 * Provenance of every number in a layout (spec section 1, "no fixed values").
 * - `owner`: the warehouse owner entered it.
 * - `cad`: read from the owner's CAD floor plan.
 * - `derived`: computed from other owner or CAD values (the derivation lives with the producer).
 */
export const SourceSchema = z.enum(['owner', 'cad', 'derived']);
export type Source = z.infer<typeof SourceSchema>;

/** A sourced number with a fixed unit. The unit is a literal so a value in the wrong unit fails parsing. */
export const quantity = <U extends string>(unit: U) =>
  z.strictObject({
    value: z.number().finite().nonnegative(),
    unit: z.literal(unit),
    source: SourceSchema,
  });

/** A quantity that must be strictly greater than zero (speeds, rates, lengths of real things). */
export const positiveQuantity = <U extends string>(unit: U) =>
  z.strictObject({
    value: z.number().finite().positive(),
    unit: z.literal(unit),
    source: SourceSchema,
  });

/** A sourced whole-number count (no unit). */
export const CountSchema = z.strictObject({
  value: z.number().int().nonnegative(),
  source: SourceSchema,
});
export type Count = z.infer<typeof CountSchema>;

/** A sourced whole-number count that must be at least 1. */
export const PositiveCountSchema = z.strictObject({
  value: z.number().int().positive(),
  source: SourceSchema,
});
export type PositiveCount = z.infer<typeof PositiveCountSchema>;

/** A plan-view point in metres. Both coordinates share one provenance. */
export const PointSchema = z.strictObject({
  x: z.number().finite(),
  y: z.number().finite(),
  unit: z.literal('m'),
  source: SourceSchema,
});
export type Point = z.infer<typeof PointSchema>;

export const MetresSchema = quantity('m');
export const PositiveMetresSchema = positiveQuantity('m');
export const SecondsSchema = quantity('s');
export const HoursSchema = positiveQuantity('h');
export const DegreesSchema = quantity('deg');
export const PercentSchema = z.strictObject({
  value: z.number().finite().min(0).max(100),
  unit: z.literal('%'),
  source: SourceSchema,
});
export const SpeedSchema = positiveQuantity('m/s');
export const ItemsPerHourSchema = positiveQuantity('items/h');
export const MoneySchema = quantity('currency');
export const MoneyPerHourSchema = quantity('currency/h');
export const MoneyPerYearSchema = quantity('currency/year');

export type Quantity<U extends string> = { value: number; unit: U; source: Source };
