/**
 * Tests for the pure "Plan my week" scheduling engine.
 * All Dates are built with the local Date constructor so the tests are
 * timezone-independent.
 */
import { proposeBlocks } from '@/lib/scheduling/engine';
import type { CandidateTask, ProposeBlocksInput } from '@/lib/scheduling/types';
import type { WorkflowConfig } from '@/lib/workflow-config-storage';

const ALL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// A Monday.
const WEEK_START = new Date(2026, 6, 13, 0, 0, 0, 0); // 2026-07-13
const dateStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function makeConfig(overrides: {
  quotas?: WorkflowConfig['taskQuotas'];
  typeMapping?: WorkflowConfig['typeMapping'];
  scheduling?: Partial<WorkflowConfig['scheduling']>;
} = {}): WorkflowConfig {
  return {
    taskQuotas: overrides.quotas ?? {
      Deep: { weeklyCount: 2, targetLength: '1h', preferredTimes: ['09:00-11:00'] },
    },
    typeMapping: overrides.typeMapping ?? { Deep: ['deep'] },
    scheduling: {
      maxTasksPerDay: 4,
      bufferBetweenTasks: '30min',
      workingDays: ALL_DAYS,
      workingHours: { start: '09:00', end: '17:00' },
      ...overrides.scheduling,
    },
    lastUpdated: '2026-07-12T00:00:00.000Z',
  };
}

function task(overrides: Partial<CandidateTask> & { gid: string }): CandidateTask {
  return {
    title: `Task ${overrides.gid}`,
    typeSignals: ['deep'],
    integrationId: 'asana-1',
    ...overrides,
  };
}

function makeInput(overrides: Partial<ProposeBlocksInput> = {}): ProposeBlocksInput {
  return {
    config: makeConfig(),
    busyIntervals: [],
    candidateTasks: [],
    existingScheduledCounts: {},
    existingBlocksByDate: {},
    weekStart: WEEK_START,
    now: WEEK_START, // Monday 00:00, no now-cutoff within the week
    ...overrides,
  };
}

describe('proposeBlocks - basics', () => {
  it('places a candidate task in its preferred window', () => {
    const proposals = proposeBlocks(
      makeInput({
        config: makeConfig({ quotas: { Deep: { weeklyCount: 1, targetLength: '1h', preferredTimes: ['09:00-11:00'] } } }),
        candidateTasks: [task({ gid: 'a' })],
      })
    );
    expect(proposals).toHaveLength(1);
    expect(proposals[0].category).toBe('Deep');
    expect(proposals[0].task?.gid).toBe('a');
    expect(proposals[0].date).toBe(dateStr(WEEK_START));
    expect(proposals[0].start).toBe('09:00');
    expect(proposals[0].durationMinutes).toBe(60);
  });

  it('emits a reserved block when quota remains but no task is available', () => {
    const proposals = proposeBlocks(
      makeInput({ candidateTasks: [task({ gid: 'a' })] }) // weeklyCount 2, only 1 task
    );
    expect(proposals).toHaveLength(2);
    expect(proposals[0].task?.gid).toBe('a');
    expect(proposals[1].task).toBeUndefined();
    expect(proposals[1].reason).toMatch(/reserved/i);
  });

  it('with no candidates at all, fills the whole quota with reserved blocks', () => {
    const proposals = proposeBlocks(makeInput());
    expect(proposals).toHaveLength(2);
    expect(proposals.every(p => p.task === undefined)).toBe(true);
  });

  it('skips categories with no weeklyCount', () => {
    const proposals = proposeBlocks(
      makeInput({
        config: makeConfig({
          quotas: { Todos: { targetLength: '30min', preferredTimes: [] } },
          typeMapping: { Todos: ['todo'] },
        }),
        candidateTasks: [task({ gid: 'a', typeSignals: ['todo'] })],
      })
    );
    expect(proposals).toHaveLength(0);
  });
});

describe('proposeBlocks - buffer collisions', () => {
  it('respects buffer against existing busy intervals', () => {
    // Busy 09:00-10:00, buffer 30min, duration 1h, preferred 09:00-12:00.
    // Earliest valid start is 10:30.
    const proposals = proposeBlocks(
      makeInput({
        config: makeConfig({ quotas: { Deep: { weeklyCount: 1, targetLength: '1h', preferredTimes: ['09:00-12:00'] } } }),
        candidateTasks: [task({ gid: 'a' })],
        busyIntervals: [
          { start: new Date(2026, 6, 13, 9, 0), end: new Date(2026, 6, 13, 10, 0) },
        ],
      })
    );
    expect(proposals[0].start).toBe('10:30');
  });

  it('keeps buffer between two proposals in the same run', () => {
    // Restrict to a single working day so the spread heuristic can't fan the
    // second block onto another day — this isolates same-day buffer behavior.
    const proposals = proposeBlocks(
      makeInput({
        config: makeConfig({
          quotas: { Deep: { weeklyCount: 2, targetLength: '1h', preferredTimes: ['09:00-14:00'] } },
          scheduling: { workingDays: ['Monday'] },
        }),
        candidateTasks: [task({ gid: 'a' }), task({ gid: 'b' })],
      })
    );
    expect(proposals).toHaveLength(2);
    const sameDay = proposals.filter(p => p.date === dateStr(WEEK_START));
    // Both fit on Monday within 09:00-14:00: 09:00-10:00 then 10:30-11:30.
    expect(sameDay.map(p => p.start).sort()).toEqual(['09:00', '10:30']);
  });
});

describe('proposeBlocks - maxTasksPerDay', () => {
  it('does not exceed maxTasksPerDay on a single working day', () => {
    const proposals = proposeBlocks(
      makeInput({
        config: makeConfig({
          quotas: { Deep: { weeklyCount: 3, targetLength: '1h', preferredTimes: [] } },
          scheduling: { maxTasksPerDay: 1, workingDays: ['Monday'] },
        }),
        candidateTasks: [task({ gid: 'a' }), task({ gid: 'b' }), task({ gid: 'c' })],
      })
    );
    expect(proposals).toHaveLength(1);
  });

  it('counts existing blocks toward maxTasksPerDay', () => {
    const proposals = proposeBlocks(
      makeInput({
        config: makeConfig({
          quotas: { Deep: { weeklyCount: 2, targetLength: '1h', preferredTimes: [] } },
          scheduling: { maxTasksPerDay: 2, workingDays: ['Monday'] },
        }),
        candidateTasks: [task({ gid: 'a' }), task({ gid: 'b' })],
        existingBlocksByDate: { [dateStr(WEEK_START)]: 1 },
      })
    );
    expect(proposals).toHaveLength(1); // 1 existing + 1 new = max 2
  });
});

describe('proposeBlocks - preferred windows outside working hours', () => {
  it('honours a preferred window that sits outside working hours', () => {
    const proposals = proposeBlocks(
      makeInput({
        config: makeConfig({
          quotas: { Deep: { weeklyCount: 1, targetLength: '2h', preferredTimes: ['21:00-23:00'] } },
          scheduling: { workingHours: { start: '09:00', end: '17:00' } },
        }),
        candidateTasks: [task({ gid: 'a' })],
      })
    );
    expect(proposals[0].start).toBe('21:00');
    expect(proposals[0].reason).toMatch(/preferred/i);
  });
});

describe('proposeBlocks - week boundary', () => {
  it('never proposes a block outside the 7-day week', () => {
    const weekEnd = dateStr(new Date(2026, 6, 19)); // Sunday
    const startStr = dateStr(WEEK_START);
    const proposals = proposeBlocks(
      makeInput({
        config: makeConfig({
          quotas: { Deep: { weeklyCount: 20, targetLength: '1h', preferredTimes: [] } },
          scheduling: { maxTasksPerDay: 10 },
        }),
        candidateTasks: [],
      })
    );
    expect(proposals.length).toBeGreaterThan(0);
    for (const p of proposals) {
      expect(p.date >= startStr && p.date <= weekEnd).toBe(true);
    }
  });
});

describe('proposeBlocks - now cutoff', () => {
  it('only proposes slots at or after now, mid-week', () => {
    const now = new Date(2026, 6, 15, 12, 0); // Wednesday noon
    const proposals = proposeBlocks(
      makeInput({
        config: makeConfig({
          quotas: { Deep: { weeklyCount: 1, targetLength: '1h', preferredTimes: [] } },
          scheduling: { workingDays: ['Monday', 'Tuesday', 'Wednesday'] },
        }),
        candidateTasks: [task({ gid: 'a' })],
        now,
      })
    );
    expect(proposals).toHaveLength(1);
    // Monday/Tuesday are in the past; Wednesday preferred none -> working hours,
    // but only >= 12:00.
    expect(proposals[0].date).toBe('2026-07-15');
    expect(proposals[0].start >= '12:00').toBe(true);
  });
});

describe('proposeBlocks - existing scheduled counts', () => {
  it('reduces remaining quota by already-scheduled counts', () => {
    const proposals = proposeBlocks(
      makeInput({
        candidateTasks: [task({ gid: 'a' }), task({ gid: 'b' })],
        existingScheduledCounts: { Deep: 2 }, // weeklyCount 2 already met
      })
    );
    expect(proposals).toHaveLength(0);
  });
});

describe('proposeBlocks - ranking', () => {
  it('schedules hard-deadline tasks before softer ones', () => {
    const proposals = proposeBlocks(
      makeInput({
        config: makeConfig({ quotas: { Deep: { weeklyCount: 1, targetLength: '1h', preferredTimes: [] } } }),
        candidateTasks: [
          task({ gid: 'soft', deadlineType: 'soft' }),
          task({ gid: 'hard', deadlineType: 'hard' }),
        ],
      })
    );
    expect(proposals[0].task?.gid).toBe('hard');
  });

  it('processes hard-deadline categories first', () => {
    const proposals = proposeBlocks(
      makeInput({
        config: makeConfig({
          quotas: {
            A: { weeklyCount: 1, targetLength: '1h', preferredTimes: [] },
            B: { weeklyCount: 1, targetLength: '1h', preferredTimes: [] },
          },
          typeMapping: { A: ['a'], B: ['b'] },
          scheduling: { workingDays: ['Monday'] },
        }),
        candidateTasks: [
          task({ gid: 'a1', typeSignals: ['a'] }),
          task({ gid: 'b1', typeSignals: ['b'], deadlineType: 'hard' }),
        ],
      })
    );
    // Category B (has a hard-deadline task) is scheduled into the earliest slot.
    const first = proposals.find(p => p.start === '09:00');
    expect(first?.category).toBe('B');
  });

  it('processes Writing/Deep Work first, even ahead of a hard-deadline category', () => {
    const proposals = proposeBlocks(
      makeInput({
        config: makeConfig({
          quotas: {
            'Writing/Deep Work': { weeklyCount: 1, targetLength: '1h', preferredTimes: [] },
            B: { weeklyCount: 1, targetLength: '1h', preferredTimes: [] },
          },
          typeMapping: { 'Writing/Deep Work': ['deep'], B: ['b'] },
          scheduling: { workingDays: ['Monday'] },
        }),
        candidateTasks: [
          task({ gid: 'd1', typeSignals: ['deep'] }),
          task({ gid: 'b1', typeSignals: ['b'], deadlineType: 'hard' }),
        ],
      })
    );
    // Deep work claims the earliest slot despite B having a hard deadline.
    const first = proposals.find(p => p.start === '09:00');
    expect(first?.category).toBe('Writing/Deep Work');
  });
});

describe('proposeBlocks - soft day spread', () => {
  const distinctDates = (proposals: { date: string }[]) =>
    new Set(proposals.map(p => p.date));

  it('spreads same-category blocks across distinct days', () => {
    const proposals = proposeBlocks(
      makeInput({
        config: makeConfig({
          quotas: { Deep: { weeklyCount: 3, targetLength: '1h', preferredTimes: [] } },
        }),
        candidateTasks: [task({ gid: 'a' }), task({ gid: 'b' }), task({ gid: 'c' })],
      })
    );
    expect(proposals).toHaveLength(3);
    expect(distinctDates(proposals).size).toBe(3);
  });

  it('doubles up on a day only when forced by too few working days', () => {
    const proposals = proposeBlocks(
      makeInput({
        config: makeConfig({
          quotas: { Deep: { weeklyCount: 3, targetLength: '1h', preferredTimes: [] } },
          scheduling: { workingDays: ['Monday', 'Tuesday'] },
        }),
        candidateTasks: [task({ gid: 'a' }), task({ gid: 'b' }), task({ gid: 'c' })],
      })
    );
    expect(proposals).toHaveLength(3);
    // Two days, three blocks -> one day gets two, the other one.
    expect(distinctDates(proposals).size).toBe(2);
  });

  it('keeps each block in its preferred window while spreading across days', () => {
    const proposals = proposeBlocks(
      makeInput({
        config: makeConfig({
          quotas: { Deep: { weeklyCount: 2, targetLength: '1h', preferredTimes: ['09:00-11:00'] } },
        }),
        candidateTasks: [task({ gid: 'a' }), task({ gid: 'b' })],
      })
    );
    expect(proposals).toHaveLength(2);
    // Both land at 09:00 (their preferred time), but on distinct days rather
    // than doubling up on Monday.
    expect(proposals.every(p => p.start === '09:00')).toBe(true);
    expect(distinctDates(proposals).size).toBe(2);
  });

  it('seeds spread from existingCategoryCountsByDate', () => {
    const mondayStr = dateStr(WEEK_START);
    const tuesdayStr = dateStr(new Date(2026, 6, 14));
    const proposals = proposeBlocks(
      makeInput({
        config: makeConfig({
          quotas: { Deep: { weeklyCount: 1, targetLength: '1h', preferredTimes: [] } },
        }),
        candidateTasks: [task({ gid: 'a' })],
        existingCategoryCountsByDate: { [mondayStr]: { Deep: 1 } },
      })
    );
    expect(proposals).toHaveLength(1);
    // Monday already has a Deep block, so the new one avoids it.
    expect(proposals[0].date).toBe(tuesdayStr);
  });

  it('skips a day that is full per maxTasksPerDay even at spread level 0', () => {
    const mondayStr = dateStr(WEEK_START);
    const tuesdayStr = dateStr(new Date(2026, 6, 14));
    const proposals = proposeBlocks(
      makeInput({
        config: makeConfig({
          quotas: { Deep: { weeklyCount: 1, targetLength: '1h', preferredTimes: [] } },
          scheduling: { maxTasksPerDay: 1, workingDays: ['Monday', 'Tuesday'] },
        }),
        candidateTasks: [task({ gid: 'a' })],
        existingBlocksByDate: { [mondayStr]: 1 }, // Monday full
      })
    );
    expect(proposals).toHaveLength(1);
    expect(proposals[0].date).toBe(tuesdayStr);
  });

  it('works without existingCategoryCountsByDate (back-compat)', () => {
    const proposals = proposeBlocks(
      makeInput({
        config: makeConfig({
          quotas: { Deep: { weeklyCount: 1, targetLength: '1h', preferredTimes: ['09:00-11:00'] } },
        }),
        candidateTasks: [task({ gid: 'a' })],
      })
    );
    expect(proposals).toHaveLength(1);
    expect(proposals[0].date).toBe(dateStr(WEEK_START));
    expect(proposals[0].start).toBe('09:00');
  });
});

describe('proposeBlocks - priority ranking', () => {
  it('schedules an isPriority task ahead of a harder-deadline non-priority task', () => {
    const proposals = proposeBlocks(
      makeInput({
        config: makeConfig({ quotas: { Deep: { weeklyCount: 1, targetLength: '1h', preferredTimes: [] } } }),
        candidateTasks: [
          task({ gid: 'hard', deadlineType: 'hard' }),
          task({ gid: 'prio', deadlineType: 'soft', isPriority: true }),
        ],
      })
    );
    expect(proposals[0].task?.gid).toBe('prio');
  });
});

describe('proposeBlocks - grouped blocks', () => {
  // A grouped Engagement-style category: 3 blocks/week, where every block shares
  // the SAME full agenda of all selected tasks rather than one task per block.
  const groupedConfig = () =>
    makeConfig({
      quotas: {
        Engage: { weeklyCount: 3, targetLength: '1h', grouped: true, preferredTimes: ['13:00-17:00'] },
      },
      typeMapping: { Engage: ['engage'] },
    });
  const engageTask = (gid: string) => task({ gid, typeSignals: ['engage'] });

  it('places weeklyCount blocks with no single task, each carrying the full agenda', () => {
    const proposals = proposeBlocks(
      makeInput({
        config: groupedConfig(),
        candidateTasks: ['a', 'b', 'c', 'd', 'e'].map(engageTask),
      })
    );
    // 3 blocks (weeklyCount), never one-per-task.
    expect(proposals).toHaveLength(3);
    for (const p of proposals) {
      expect(p.task).toBeUndefined();
      expect(Array.isArray(p.tasks)).toBe(true);
    }
    // Every block lists the identical full set of selected tasks.
    for (const p of proposals) {
      expect(p.tasks!.map(t => t.gid).sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    }
    // Reason reflects the full agenda size, not a per-block bucket.
    expect(proposals.every(p => p.reason.includes('5 tasks on the agenda'))).toBe(true);
  });

  it('places in the afternoon preferred window', () => {
    const proposals = proposeBlocks(
      makeInput({ config: groupedConfig(), candidateTasks: [engageTask('a')] })
    );
    expect(proposals.every(p => p.start >= '13:00')).toBe(true);
  });

  it('gives every one of the N blocks the same single-task agenda', () => {
    const proposals = proposeBlocks(
      makeInput({ config: groupedConfig(), candidateTasks: [engageTask('a')] })
    );
    expect(proposals).toHaveLength(3);
    // All three blocks carry the same one selected task.
    expect(proposals.every(p => p.tasks!.length === 1 && p.tasks![0].gid === 'a')).toBe(true);
  });

  it('schedules N reserved-style blocks with no tasks when none are selected', () => {
    const proposals = proposeBlocks(
      makeInput({ config: groupedConfig(), candidateTasks: [] })
    );
    expect(proposals).toHaveLength(3);
    expect(proposals.every(p => p.tasks!.length === 0)).toBe(true);
  });

  it('reduces block count by existing scheduled blocks, keeping the full agenda in each', () => {
    const proposals = proposeBlocks(
      makeInput({
        config: groupedConfig(),
        candidateTasks: ['a', 'b'].map(engageTask),
        existingScheduledCounts: { Engage: 1 },
      })
    );
    expect(proposals).toHaveLength(2); // 3 - 1 already scheduled
    for (const p of proposals) {
      expect(p.tasks!.map(t => t.gid).sort()).toEqual(['a', 'b']);
    }
  });
});

describe('proposeBlocks - determinism', () => {
  it('produces identical output across runs', () => {
    const build = () =>
      proposeBlocks(
        makeInput({
          candidateTasks: [task({ gid: 'a' }), task({ gid: 'b' })],
        })
      );
    expect(build()).toEqual(build());
  });
});
