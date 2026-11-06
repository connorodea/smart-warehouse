/** A malformed order-history CSV. `row` is the 1-based line number in the input text. */
export class CsvError extends Error {
  constructor(
    public readonly row: number,
    detail: string,
  ) {
    super(`row ${row}: ${detail}`);
    this.name = 'CsvError';
  }
}

/** One order line = one pallet of one SKU. */
export interface OrderLine {
  sku: string;
}

export interface Order {
  id: string;
  /** Seconds from the start of the run. */
  t: number;
  lines: OrderLine[];
}

/** Columns the order-history CSV must have (any order; extra columns are ignored). */
export const ORDER_CSV_COLUMNS = ['order_id', 'time_s', 'sku'] as const;

/**
 * Parse the owner's order-history CSV (spec section 4, "Demand").
 *
 * - Line 1 is a header naming at least `order_id`, `time_s`, `sku`.
 * - Each later non-blank line is one order line: one pallet of `sku` for `order_id`,
 *   released at `time_s` seconds after the run starts.
 * - Rows with the same `order_id` are lines of one order and must share `time_s`.
 * - Fields are split on commas; quoted fields are not supported in v1 (a `"` is an error).
 *
 * Throws `CsvError` naming the row for any malformed row.
 */
export function parseOrdersCsv(text: string): Order[] {
  const lines = text.split(/\r?\n/);
  const header = (lines[0] as string).split(',').map((h) => h.trim());
  const col = new Map(header.map((h, i) => [h, i]));
  const missing = ORDER_CSV_COLUMNS.filter((c) => !col.has(c));
  if (missing.length > 0) throw new CsvError(1, `header is missing column(s): ${missing.join(', ')}`);

  const byId = new Map<string, Order>();
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i] as string;
    const row = i + 1;
    if (raw.trim() === '') continue;
    if (raw.includes('"')) throw new CsvError(row, 'quoted fields are not supported');
    const cells = raw.split(',').map((c) => c.trim());
    if (cells.length !== header.length) {
      throw new CsvError(row, `expected ${header.length} fields, found ${cells.length}`);
    }
    const get = (c: (typeof ORDER_CSV_COLUMNS)[number]) => cells[col.get(c) as number] as string;
    const id = get('order_id');
    const sku = get('sku');
    const timeText = get('time_s');
    const t = Number(timeText);
    if (id === '') throw new CsvError(row, 'order_id is empty');
    if (sku === '') throw new CsvError(row, 'sku is empty');
    if (timeText === '' || !Number.isFinite(t) || t < 0) {
      throw new CsvError(row, `time_s "${timeText}" is not a number of seconds >= 0`);
    }
    const existing = byId.get(id);
    if (existing === undefined) {
      byId.set(id, { id, t, lines: [{ sku }] });
    } else if (existing.t !== t) {
      throw new CsvError(row, `order "${id}" already has time_s ${existing.t}, this row says ${t}`);
    } else {
      existing.lines.push({ sku });
    }
  }
  return [...byId.values()];
}
