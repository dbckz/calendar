import type { PriorityMatchRow } from '@/lib/api';
import type { ProposedBlock } from '@/lib/scheduling/types';

export type Step = 'type' | 'priorities' | 'prep' | 'tasks' | 'review' | 'done';

export const STEP_LABELS: Record<Exclude<Step, 'done'>, string> = {
  type: 'Type',
  priorities: 'Priorities',
  prep: 'Prep',
  tasks: 'Tasks',
  review: 'Review',
};

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
