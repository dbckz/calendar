// Pure ranking logic for the Command Center "Top Tasks" widget.
// Ordering rules (highest priority first):
//   1. Hard-deadline tasks come first (metadata.deadlineType === 'hard').
//   2. Then by due date, earliest first (tasks with no due date sort last).
//   3. AI-delegable tasks sort last within a tie (they can be handed off).

import { CalendarEvent, TaskMetadata } from '@/types';

export function rankTasks(
  tasks: CalendarEvent[],
  metadataByGid: Record<string, TaskMetadata>
): CalendarEvent[] {
  const isHard = (t: CalendarEvent) => metadataByGid[t.id]?.deadlineType === 'hard';
  const isDelegable = (t: CalendarEvent) => metadataByGid[t.id]?.aiDelegable === true;

  // Compare due dates: earlier first, undefined last.
  const compareDue = (a: CalendarEvent, b: CalendarEvent): number => {
    if (!a.dueOn && !b.dueOn) return 0;
    if (!a.dueOn) return 1;
    if (!b.dueOn) return -1;
    return a.dueOn.localeCompare(b.dueOn);
  };

  return [...tasks].sort((a, b) => {
    // 1. Hard deadline first
    const hardA = isHard(a);
    const hardB = isHard(b);
    if (hardA !== hardB) return hardA ? -1 : 1;

    // 2. Due date
    const dueCmp = compareDue(a, b);
    if (dueCmp !== 0) return dueCmp;

    // 3. Delegable last
    const delA = isDelegable(a);
    const delB = isDelegable(b);
    if (delA !== delB) return delA ? 1 : -1;

    return 0;
  });
}
