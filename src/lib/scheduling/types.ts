// Types for the "Plan my week" auto-scheduling engine.
// Kept separate from the pure engine logic so routes and UI can import them
// without pulling in the algorithm.

import type { BestTime, DeadlineType, EnergyLevel } from '@/types';
import type { WorkflowConfig } from '@/lib/workflow-config-storage';

// A merged busy interval on the user's timeline. Absolute times.
export interface BusyInterval {
  start: Date;
  end: Date;
}

// A candidate task the engine may place on the calendar. Either an Asana task
// (gid + Asana integrationId) or an ad-hoc task (adhocId). `typeSignals` are the
// same signals the capacity lib classifies on (Asana "Type" custom-field value,
// or ad-hoc taskType id + label) and drive which quota category the task counts
// toward.
export interface CandidateTask {
  gid?: string; // Asana task GID
  adhocId?: string; // ad-hoc task id
  title: string;
  integrationId?: string; // Asana integration id (for time-tracking attribution)
  dueDate?: string; // yyyy-MM-dd
  typeSignals: string[];
  deadlineType?: DeadlineType;
  bestTime?: BestTime;
  energyLevel?: EnergyLevel;
  effortMinutes?: number;
}

// A single proposed calendar block. `task` is omitted for a "reserved" block
// (quota remains but no matching candidate task was available).
export interface ProposedBlock {
  id: string;
  category: string;
  task?: {
    gid?: string;
    adhocId?: string;
    title: string;
    integrationId?: string;
  };
  date: string; // yyyy-MM-dd
  start: string; // HH:mm (local)
  durationMinutes: number;
  reason: string;
}

export interface ProposeBlocksInput {
  config: WorkflowConfig;
  busyIntervals: BusyInterval[];
  candidateTasks: CandidateTask[];
  // Per-category count of blocks already scheduled this week (reduces remaining
  // weekly quota). Keyed by category name.
  existingScheduledCounts: Record<string, number>;
  // Per-date count of blocks already scheduled (for maxTasksPerDay). Keyed by
  // yyyy-MM-dd.
  existingBlocksByDate: Record<string, number>;
  weekStart: Date; // local midnight of the week's Monday
  now: Date;
}
