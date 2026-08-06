/**
 * The one rule for which Type labels a task in a given integration can be given,
 * and where a chosen label is written (Asana field vs the app-local store).
 */
import { typeChoicesFor, typeLabelsOf } from '@/lib/type-choices';

// Client-shaped Type field info (label -> enum option gid), as `useAsanaTasks`
// and the create/edit modals carry it.
const asanaInfo = (labels: string[]) => ({
  fieldGid: `field-${labels.join('-')}`,
  enumOptions: new Map(labels.map(l => [l, `gid-${l}`])),
});

// Grooming-shaped Type field info (an `options` array), the other shape the
// helper must read.
const groomingInfo = (labels: string[]) => ({
  fieldGid: `field-${labels.join('-')}`,
  options: labels.map(l => ({ label: l, gid: `gid-${l}` })),
});

describe('typeLabelsOf', () => {
  it('reads labels from the client enumOptions shape', () => {
    expect(typeLabelsOf(asanaInfo(['Focus', 'Admin']))).toEqual(['Focus', 'Admin']);
  });

  it('reads labels from the grooming options shape', () => {
    expect(typeLabelsOf(groomingInfo(['Focus', 'Admin']))).toEqual(['Focus', 'Admin']);
  });
});

describe('typeChoicesFor — Asana-writable target', () => {
  it('offers the integration\'s own labels (sorted) and targets Asana', () => {
    const map = new Map([['om', asanaInfo(['Focus', 'Admin', 'Outreach'])]]);
    expect(typeChoicesFor('om', map)).toEqual({
      labels: ['Admin', 'Focus', 'Outreach'],
      writeTarget: 'asana',
    });
  });

  it('does not fold in other integrations\' labels when it has its own', () => {
    const map = new Map([
      ['om', asanaInfo(['Focus'])],
      ['other', asanaInfo(['Something Else'])],
    ]);
    expect(typeChoicesFor('om', map)).toEqual({ labels: ['Focus'], writeTarget: 'asana' });
  });
});

describe('typeChoicesFor — local union target', () => {
  it('offers the sorted, de-duplicated union of every OTHER integration and targets local', () => {
    const map = new Map([
      ['dbc', asanaInfo([])], // present but with no writable labels of its own
      ['om', asanaInfo(['Focus', 'Admin'])],
      ['work', asanaInfo(['Admin', 'Meeting'])],
    ]);
    expect(typeChoicesFor('dbc', map)).toEqual({
      labels: ['Admin', 'Focus', 'Meeting'],
      writeTarget: 'local',
    });
  });

  it('resolves local for an integration entirely absent from the map', () => {
    const map = new Map([['om', asanaInfo(['Focus'])]]);
    expect(typeChoicesFor('dbc', map)).toEqual({ labels: ['Focus'], writeTarget: 'local' });
  });

  it('works with the grooming options shape too', () => {
    const map = new Map([
      ['om', groomingInfo(['Focus', 'Admin'])],
      ['work', groomingInfo(['Meeting'])],
    ]);
    expect(typeChoicesFor('dbc', map)).toEqual({
      labels: ['Admin', 'Focus', 'Meeting'],
      writeTarget: 'local',
    });
  });
});

describe('typeChoicesFor — empty union (feature unavailable)', () => {
  it('returns no labels when there are no other integrations to draw from', () => {
    const map = new Map([['dbc', asanaInfo([])]]);
    expect(typeChoicesFor('dbc', map)).toEqual({ labels: [], writeTarget: 'local' });
  });

  it('returns no labels for an undefined map', () => {
    expect(typeChoicesFor('dbc', undefined)).toEqual({ labels: [], writeTarget: 'local' });
  });

  it('returns no labels for an undefined integration id', () => {
    const map = new Map([['om', asanaInfo(['Focus'])]]);
    // No target integration → own labels empty → union of "every other" (all) →
    // but with no id to exclude, the sole integration's labels form the union.
    expect(typeChoicesFor(undefined, map)).toEqual({ labels: ['Focus'], writeTarget: 'local' });
  });
});
