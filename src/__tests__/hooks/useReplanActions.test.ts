/**
 * @jest-environment jsdom
 *
 * The replan "plan view" payload assembly for the couldn't-fit section's
 * "Delete task" (drop) mode: choosing 'drop' on an unplaceable row must route it
 * into the confirm payload's `drop` array (and out of `defer` / `leaveUnscheduled`).
 */
import { renderHook, act } from '@testing-library/react';

import { useReplanActions } from '@/components/dashboard/useReplanActions';
import { api, type ReplanAnalyzeResponse } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  api: { confirmReplan: jest.fn() },
}));

const confirmReplan = api.confirmReplan as jest.Mock;

// A minimal mid-week analyze result with a single unplaceable, task-backed block.
const DATA: ReplanAnalyzeResponse = {
  weekStart: '2026-07-20',
  weekEnd: '2026-07-26',
  kept: [],
  moves: [],
  stale: [],
  additions: [],
  deletions: [],
  unplaceable: [
    {
      googleEventId: 'evt-x',
      googleIntegrationId: 'gi1',
      category: 'Writing',
      titles: ['Draft the brief'],
      oldDate: '2026-07-20',
      oldStart: '09:00',
      durationMinutes: 60,
      reason: 'missed',
      deferTaskIds: ['g1'],
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  confirmReplan.mockResolvedValue({
    results: [],
    doneResults: [],
    deferResults: [],
    carryResults: [],
    displaceResults: [],
    dropResults: [{ googleEventId: 'evt-x', success: true }],
    additionResults: [],
  });
});

describe('useReplanActions — drop payload assembly', () => {
  it("routes a 'drop' unplaceable row into the confirm payload's drop array", async () => {
    const { result } = renderHook(() => useReplanActions(DATA));

    // Default is 'defer'; switch the row to 'drop'.
    act(() => {
      result.current.setUnplaceableMode(prev => ({ ...prev, 'evt-x': 'drop' }));
    });

    await act(async () => {
      await result.current.confirm();
    });

    expect(confirmReplan).toHaveBeenCalledTimes(1);
    const args = confirmReplan.mock.calls[0];
    // Trailing `drop` argument (16th positional) carries the block + its task ids.
    expect(args[15]).toEqual([
      { googleEventId: 'evt-x', googleIntegrationId: 'gi1', taskIds: ['g1'] },
    ]);
    // …and it did NOT fall through to defer (8th) or leaveUnscheduled (9th).
    expect(args[7]).toEqual([]);
    expect(args[8]).toEqual([]);
  });

  it("leaves the drop argument undefined when no row is set to 'drop'", async () => {
    const { result } = renderHook(() => useReplanActions(DATA));

    // Row stays on its 'defer' default.
    await act(async () => {
      await result.current.confirm();
    });

    const args = confirmReplan.mock.calls[0];
    expect(args[15]).toBeUndefined();
    // The block instead flows through defer.
    expect(args[7]).toEqual([{ taskIds: ['g1'], googleEventId: 'evt-x' }]);
  });
});
