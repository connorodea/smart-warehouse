import { describe, expect, it } from 'vitest';
import { validateLayout } from '../src';
import valid from '../fixtures/valid.tiny-loop.fixture.json';
import schema from '../fixtures/invalid.schema.fixture.json';
import duplicateId from '../fixtures/invalid.duplicate-id.fixture.json';
import unknownRef from '../fixtures/invalid.unknown-ref.fixture.json';
import zeroLengthEdge from '../fixtures/invalid.zero-length-edge.fixture.json';
import rackFaceUnreachable from '../fixtures/invalid.rack-face-unreachable.fixture.json';
import dockNotConnected from '../fixtures/invalid.dock-not-connected.fixture.json';
import stationUnreachable from '../fixtures/invalid.station-unreachable.fixture.json';
import fleetEmpty from '../fixtures/invalid.fleet-empty.fixture.json';
import missingOwnerInput from '../fixtures/invalid.missing-owner-input.fixture.json';
import ownerInputSource from '../fixtures/invalid.owner-input-source.fixture.json';

type Fixture = { _fixture: string; expectValid: boolean; expectReasons: string[]; layout: unknown };

const invalid: Record<string, Fixture> = {
  schema,
  duplicateId,
  unknownRef,
  zeroLengthEdge,
  rackFaceUnreachable,
  dockNotConnected,
  stationUnreachable,
  fleetEmpty,
  missingOwnerInput,
  ownerInputSource,
};

describe('fixtures', () => {
  it('every fixture is marked test-only', () => {
    for (const f of [valid, ...Object.values(invalid)] as Fixture[]) expect(f._fixture).toBe('test-only');
  });

  it('the valid fixture validates and round-trips unchanged', () => {
    const r = validateLayout(valid.layout);
    expect(r).toEqual({ ok: true, layout: valid.layout });
  });

  for (const [name, f] of Object.entries(invalid)) {
    it(`${name}: rejected with exactly the expected reasons`, () => {
      expect(f.expectValid).toBe(false);
      const r = validateLayout(f.layout);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.reasons).toEqual(f.expectReasons);
    });
  }
});
