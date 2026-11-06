import { describe, expect, it } from 'vitest';
import { CsvError, ORDER_CSV_COLUMNS, parseOrdersCsv } from '../src';

const errorOf = (text: string): CsvError => {
  try {
    parseOrdersCsv(text);
  } catch (e) {
    expect(e).toBeInstanceOf(CsvError);
    return e as CsvError;
  }
  throw new Error('expected a CsvError');
};

describe('parseOrdersCsv', () => {
  it('documents its required columns', () => {
    expect(ORDER_CSV_COLUMNS).toEqual(['order_id', 'time_s', 'sku']);
  });

  it('groups rows by order id, keeps first-seen order, ignores blank lines and extra columns', () => {
    const text = 'sku, time_s ,order_id,note\r\nA,10,O1,x\n\nB,10,O1,y\nA,5.5,O2,z\n   \n';
    expect(parseOrdersCsv(text)).toEqual([
      { id: 'O1', t: 10, lines: [{ sku: 'A' }, { sku: 'B' }] },
      { id: 'O2', t: 5.5, lines: [{ sku: 'A' }] },
    ]);
  });

  it('returns no orders for a header-only file', () => {
    expect(parseOrdersCsv('order_id,time_s,sku')).toEqual([]);
  });

  it('rejects a missing header column, naming row 1', () => {
    const e = errorOf('order_id,sku\nO1,A');
    expect(e.row).toBe(1);
    expect(e.message).toBe('row 1: header is missing column(s): time_s');
    expect(errorOf('').message).toContain('order_id, time_s, sku');
  });

  it.each([
    ['O1,"1",A', 'row 2: quoted fields are not supported'],
    ['O1,1', 'row 2: expected 3 fields, found 2'],
    [',1,A', 'row 2: order_id is empty'],
    ['O1,1,', 'row 2: sku is empty'],
    ['O1,,A', 'row 2: time_s "" is not a number of seconds >= 0'],
    ['O1,-1,A', 'row 2: time_s "-1" is not a number of seconds >= 0'],
    ['O1,abc,A', 'row 2: time_s "abc" is not a number of seconds >= 0'],
    ['O1,Infinity,A', 'row 2: time_s "Infinity" is not a number of seconds >= 0'],
  ])('rejects malformed row %j', (row, message) => {
    const e = errorOf(`order_id,time_s,sku\n${row}`);
    expect(e.row).toBe(2);
    expect(e.name).toBe('CsvError');
    expect(e.message).toBe(message);
  });

  it('rejects lines of one order with different times, naming the later row', () => {
    const e = errorOf('order_id,time_s,sku\nO1,1,A\n\nO1,2,B');
    expect(e.row).toBe(4);
    expect(e.message).toBe('row 4: order "O1" already has time_s 1, this row says 2');
  });
});
