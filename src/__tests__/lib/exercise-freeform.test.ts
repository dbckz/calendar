import {
  buildFreeformPrompt,
  fallbackDraft,
  inferType,
  parseFreeform,
  validateFreeform,
} from '@/lib/exercise-freeform';

describe('inferType', () => {
  it('reads the obvious session type from the text', () => {
    expect(inferType('Ran 5k round the park')).toBe('run');
    expect(inferType('Five-a-side after work')).toBe('football');
    expect(inferType('Bouldering session at the wall')).toBe('climbing');
    expect(inferType('Did some bench press and rows')).toBe('gym');
  });

  it('prefers the specific word over the general one', () => {
    // "parkrun" contains "run", but it is the more precise signal.
    expect(inferType('Bushy parkrun, 24:10')).toBe('run');
  });

  it('falls back to "other" rather than guessing', () => {
    expect(inferType('Moved house all afternoon')).toBe('other');
  });
});

describe('validateFreeform', () => {
  const TEXT = '3 sets of 10 chest press at 40kg, then a 2 minute plank';

  it('reads a session with its exercises', () => {
    const draft = validateFreeform(
      [
        {
          type: 'gym',
          label: 'Hotel gym',
          durationMinutes: 45,
          intensity: 'moderate',
          notes: 'Meeting overran so improvised.',
          exercises: [
            { name: 'Chest press', sets: 3, reps: 10, weightKg: 40, loadText: '40kg' },
            { name: 'Plank', sets: 1, holdSeconds: 120, bodyweight: true },
          ],
        },
      ],
      TEXT,
      '2026-08-07'
    );

    expect(draft).toEqual({
      date: '2026-08-07',
      type: 'gym',
      label: 'Hotel gym',
      durationMinutes: 45,
      intensity: 'moderate',
      notes: 'Meeting overran so improvised.',
      exercises: [
        {
          name: 'Chest press',
          sets: 3,
          reps: 10,
          weightKg: 40,
          loadText: '40kg',
          done: true,
        },
        { name: 'Plank', sets: 1, holdSeconds: 120, bodyweight: true, done: true },
      ],
    });
  });

  it('keeps the caller’s date, not the model’s', () => {
    const draft = validateFreeform([{ type: 'run', date: '1999-01-01' }], TEXT, '2026-08-07');
    expect(draft?.date).toBe('2026-08-07');
  });

  it('drops figures that are not usable numbers', () => {
    const draft = validateFreeform(
      [
        {
          type: 'gym',
          durationMinutes: 'about an hour',
          distanceKm: -3,
          intensity: 'brutal',
          exercises: [{ name: 'Lat pulldown', sets: 3, reps: null, weightKg: 0 }],
        },
      ],
      TEXT,
      '2026-08-07'
    );

    expect(draft?.durationMinutes).toBeUndefined();
    expect(draft?.distanceKm).toBeUndefined();
    expect(draft?.intensity).toBeUndefined();
    expect(draft?.exercises[0]).toEqual({ name: 'Lat pulldown', sets: 3, done: true });
  });

  it('drops nameless exercises and falls back to an inferred type', () => {
    const draft = validateFreeform(
      [{ exercises: [{ sets: 3, reps: 10 }, { name: 'Ab wheel', sets: 3, reps: 8 }] }],
      'Ran to the gym then did some ab wheel',
      '2026-08-07'
    );

    expect(draft?.type).toBe('run');
    expect(draft?.exercises).toHaveLength(1);
    expect(draft?.exercises[0].name).toBe('Ab wheel');
  });

  it('returns null when there is no record at all', () => {
    expect(validateFreeform([], TEXT, '2026-08-07')).toBeNull();
  });
});

describe('fallbackDraft', () => {
  it('keeps the whole text as the session notes and invents no exercises', () => {
    const draft = fallbackDraft('  Cycled to Richmond and back.  ', '2026-08-07');
    expect(draft).toEqual({
      date: '2026-08-07',
      type: 'cycle',
      notes: 'Cycled to Richmond and back.',
      exercises: [],
    });
  });
});

describe('buildFreeformPrompt', () => {
  it('carries the text and the date', () => {
    const prompt = buildFreeformPrompt('Swam 30 lengths', '2026-08-07');
    expect(prompt).toContain('Swam 30 lengths');
    expect(prompt).toContain('Date: 2026-08-07');
  });
});

describe('parseFreeform', () => {
  it('uses the model’s reading when it returns one', async () => {
    const run = jest.fn().mockResolvedValue(
      JSON.stringify([{ type: 'swim', durationMinutes: 40, exercises: [] }])
    );
    const { draft, parsed } = await parseFreeform('Swam 30 lengths', '2026-08-07', { run });

    expect(parsed).toBe(true);
    expect(draft.type).toBe('swim');
    expect(draft.durationMinutes).toBe(40);
  });

  it('falls back rather than losing the session when the model fails', async () => {
    const run = jest.fn().mockRejectedValue(new Error('Claude CLI not found'));
    const { draft, parsed } = await parseFreeform('Swam 30 lengths', '2026-08-07', { run });

    expect(parsed).toBe(false);
    expect(draft.type).toBe('swim');
    expect(draft.notes).toBe('Swam 30 lengths');
  });

  it('falls back when the model returns nothing parseable', async () => {
    const run = jest.fn().mockResolvedValue('I could not read that.');
    const { parsed, draft } = await parseFreeform('Swam 30 lengths', '2026-08-07', { run });

    expect(parsed).toBe(false);
    expect(draft.notes).toBe('Swam 30 lengths');
  });

  it('refuses empty text rather than logging a blank session', async () => {
    await expect(parseFreeform('   ', '2026-08-07', { run: jest.fn() })).rejects.toThrow(
      /Nothing to log/
    );
  });
});
