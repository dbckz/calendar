/**
 * When the weekly planning nudges fire. Both are derived from the week state,
 * not the clock alone, so a week already reviewed or planned never nags — and at
 * most one nudge lands per logical day.
 */
import { selectNudge, NUDGE_CONTENT, type NudgeInput } from '@/lib/planning-nudge';

// Friday 2026-07-24 and Sunday 2026-07-26.
const FRIDAY_EVENING = new Date(2026, 6, 24, 17, 30);
const FRIDAY_AFTERNOON = new Date(2026, 6, 24, 15, 0);
const SUNDAY_EVENING = new Date(2026, 6, 26, 18, 0);
const SUNDAY_MORNING = new Date(2026, 6, 26, 9, 0);
const SATURDAY_EVENING = new Date(2026, 6, 25, 18, 0);

const input = (over: Partial<NudgeInput> = {}): NudgeInput => ({
  action: 'wrap-up',
  now: FRIDAY_EVENING,
  nextWeekPlanned: false,
  logicalToday: '2026-07-24',
  ...over,
});

describe('selectNudge — wrap-up', () => {
  it('fires on the last working day from 17:00 when the review is pending', () => {
    expect(selectNudge(input())).toBe('wrap-up');
  });

  it('stays quiet before 17:00', () => {
    expect(selectNudge(input({ now: FRIDAY_AFTERNOON }))).toBeNull();
  });

  it('stays quiet once the review is done (the state has moved on)', () => {
    expect(selectNudge(input({ action: 'replan' }))).toBeNull();
    expect(selectNudge(input({ action: 'plan-this-week' }))).toBeNull();
  });
});

describe('selectNudge — plan next week', () => {
  it('fires on Sunday evening when next week is still unplanned', () => {
    expect(
      selectNudge(input({ action: 'plan-next-week', now: SUNDAY_EVENING, logicalToday: '2026-07-26' }))
    ).toBe('plan-next-week');
  });

  it('stays quiet once next week has a plan', () => {
    expect(
      selectNudge(
        input({
          action: 'plan-next-week',
          now: SUNDAY_EVENING,
          logicalToday: '2026-07-26',
          nextWeekPlanned: true,
        })
      )
    ).toBeNull();
  });

  it('is Sunday evening only — not Sunday morning, not Saturday', () => {
    expect(
      selectNudge(input({ action: 'plan-next-week', now: SUNDAY_MORNING, logicalToday: '2026-07-26' }))
    ).toBeNull();
    expect(
      selectNudge(input({ action: 'plan-next-week', now: SATURDAY_EVENING, logicalToday: '2026-07-25' }))
    ).toBeNull();
  });
});

describe('selectNudge — once per logical day', () => {
  it('does not fire twice on the same logical day', () => {
    expect(selectNudge(input({ lastNudgedDay: '2026-07-24' }))).toBeNull();
  });

  it('fires again the next day', () => {
    expect(
      selectNudge({
        action: 'plan-next-week',
        now: SUNDAY_EVENING,
        nextWeekPlanned: false,
        lastNudgedDay: '2026-07-24',
        logicalToday: '2026-07-26',
      })
    ).toBe('plan-next-week');
  });
});

describe('nudge copy', () => {
  it('has a title and body for each kind', () => {
    expect(NUDGE_CONTENT['wrap-up'].title).toMatch(/wrap up/i);
    expect(NUDGE_CONTENT['plan-next-week'].body).toBeTruthy();
  });
});
