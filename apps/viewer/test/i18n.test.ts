import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../src/locales/en.json';

const SRC = join(__dirname, '..', 'src');
const CJK = /[㐀-鿿豈-﫿　-〿＀-￯]/;

// Files still carrying Chinese text, owned by later spec §9 step 3 units (scene split, fake-KPI removal).
const PENDING = new Set(['core/WarehouseScene.ts', 'core/constants.ts']);

function walk(dir: string, rel = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const r = rel ? `${rel}/${e.name}` : e.name;
    return e.isDirectory() ? walk(join(dir, e.name), r) : [r];
  });
}

function has(obj: unknown, path: string): boolean {
  let cur: unknown = obj;
  for (const p of path.split('.')) {
    if (typeof cur !== 'object' || cur === null || !(p in cur)) return false;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === 'string';
}

const files = walk(SRC).filter((f) => /\.(vue|ts|json)$/.test(f));

describe('viewer i18n', () => {
  it.each(files.filter((f) => !PENDING.has(f)))('%s has no CJK text', (f) => {
    const text = readFileSync(join(SRC, f), 'utf8');
    const line = text.split('\n').findIndex((l) => CJK.test(l));
    expect(line === -1 ? null : `${f}:${line + 1}`).toBeNull();
  });

  it('every t()/$t() key used in src exists in locales/en.json', () => {
    const missing: string[] = [];
    for (const f of files.filter((x) => /\.(vue|ts)$/.test(x))) {
      const text = readFileSync(join(SRC, f), 'utf8');
      for (const m of text.matchAll(/\$?\bt\(\s*['"`]([\w.]+)['"`]/g)) {
        if (!has(en, m[1])) missing.push(`${f}: ${m[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('pending files still exist (drop them from PENDING when translated)', () => {
    for (const f of PENDING) expect(files).toContain(f);
  });
});
