import type { PriorityMatchRow } from '@/lib/api';
import type { ProposedBlock } from '@/lib/scheduling/types';

export type Step = 'type' | 'priorities' | 'reminders' | 'prep' | 'tasks' | 'review' | 'done';

export const STEP_LABELS: Record<Exclude<Step, 'done'>, string> = {
  type: 'Type',
  priorities: 'Priorities',
  reminders: 'Reminders',
  prep: 'Prep',
  tasks: 'Tasks',
  review: 'Review',
};

// Row state for the reminders-triage step: one Google Tasks reminder plus the
// user's (AI-seeded, fully editable) decision about whether to keep it as a
// reminder or convert it into an Asana task, and — when converting — the
// destination workspace/project/type/due and the editable name & notes.
export interface ReminderTriageRow {
  id: string; // Google Task id
  name: string; // editable task name (prefilled from the reminder text)
  notes: string; // editable notes (prefilled from the reminder's notes)
  action: 'keep' | 'convert';
  integrationId: string; // chosen Asana integration/workspace
  projectGid: string; // '' = no project
  taskType: string; // '' = no type / not applicable for this workspace
  dueOn: string; // yyyy-MM-dd, '' = no due date
}

// A single untyped task, resolved with its integration's writable Type labels.
export interface UntypedTask {
  gid: string;
  integrationId: string;
  title: string;
  description?: string;
  integrationName?: string;
  allowedTypes: string[]; // exact Asana enum labels we can write for this integration
}

// Row state for the type-review step: an untyped task plus the currently chosen
// label ('' = leave untyped, i.e. don't write).
export interface TypeRow extends UntypedTask {
  chosen: string;
}

export interface EditableProposal extends ProposedBlock {
  accepted: boolean;
}

// Step-1 row state: one per typed priority line.
export interface MatchRow {
  text: string;
  match: PriorityMatchRow['match'];
  createIntegrationId: string; // unmatched rows: which Asana integration to create in
  createProjectGid: string; // unmatched rows: which Asana project to create in (required)
  category: string; // unmatched, or matched-without-category: chosen quota category
  include: boolean; // unmatched rows: create + pin this one
}

// Metadata resolved alongside the priority match, shared by the priorities step.
export interface MatchMeta {
  asanaIntegrations: Array<{ id: string; name: string }>;
  categories: string[];
  projects: import('@/types').AsanaProject[];
  aiUnavailable: boolean;
}
