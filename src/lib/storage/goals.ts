// Monthly and quarterly goals, stored as one `goals` domain in the user-data
// store (see ./db). Goals are section-scoped and monthly goals may nest under a
// quarterly goal in the same section.
//
// Nesting is validated on write rather than trusted from the client: a parent
// must be a quarterly goal, in the same section, whose quarter contains the
// child's month. That keeps the rollup in the Goals section honest.

import { randomUUID } from 'crypto';
import { readAllDomains, writeAllDomains } from './db';
import { isValidSectionId } from '../life-sections';
import { isValidPeriodKey, quarterKeyForMonth } from '../goal-periods';
import { sanitizeMilestones } from '../goal-plan';
import type {
  Goal,
  GoalCheckIn,
  GoalMilestone,
  GoalPeriodKind,
  GoalStatus,
} from '@/types/life';

// Read/written as its own `goals` domain rather than through getUserData(),
// which rebuilds a whitelisted UserData object and would drop this one.
export async function getAllGoals(): Promise<Goal[]> {
  const raw = readAllDomains().goals;
  if (!Array.isArray(raw)) return [];
  // Tolerant load: a malformed entry is dropped rather than crashing the tab, and
  // a malformed plan is cleaned off an otherwise-good goal rather than losing it.
  return raw
    .filter(
      (g): g is Goal =>
        !!g &&
        typeof g === 'object' &&
        typeof (g as Goal).id === 'string' &&
        typeof (g as Goal).title === 'string' &&
        typeof (g as Goal).sectionId === 'string'
    )
    .map(sanitizeGoalPlan);
}

// Clean a goal's stored plan on read: keep only well-formed, in-period
// milestones. A goal whose plan is emptied by this loses `plan`/`planSource` so
// it reads as unplanned rather than carrying an empty array.
function sanitizeGoalPlan(goal: Goal): Goal {
  if (!goal.plan) return goal;
  const plan = sanitizeMilestones(goal.plan, {
    periodKind: goal.periodKind,
    periodKey: goal.periodKey,
    target: goal.target?.value,
    unit: goal.target?.unit,
  });
  if (plan.length === 0) {
    const rest = { ...goal };
    delete rest.plan;
    delete rest.planSource;
    return rest;
  }
  return { ...goal, plan, planSource: goal.planSource ?? 'manual' };
}

async function writeGoals(goals: Goal[]): Promise<void> {
  writeAllDomains({ goals });
}

export interface GoalQuery {
  sectionId?: string;
  periodKind?: GoalPeriodKind;
  periodKey?: string;
  // Omit to get every status; the Goals tab asks for 'active' by default.
  status?: GoalStatus;
}

export async function queryGoals(query: GoalQuery = {}): Promise<Goal[]> {
  const all = await getAllGoals();
  return all.filter(g => {
    if (query.sectionId && g.sectionId !== query.sectionId) return false;
    if (query.periodKind && g.periodKind !== query.periodKind) return false;
    if (query.periodKey && g.periodKey !== query.periodKey) return false;
    if (query.status && g.status !== query.status) return false;
    return true;
  });
}

export async function getGoal(id: string): Promise<Goal | null> {
  return (await getAllGoals()).find(g => g.id === id) ?? null;
}

export interface CreateGoalInput {
  sectionId: string;
  periodKind: GoalPeriodKind;
  periodKey: string;
  title: string;
  detail?: string;
  parentGoalId?: string;
  target?: { value: number; unit?: string };
  evidence?: Goal['evidence'];
  plan?: GoalMilestone[];
  planSource?: Goal['planSource'];
}

// Throws on an unknown section, a malformed period key, or an invalid parent —
// the API layer turns these into 400s so a bad client never writes junk.
export async function createGoal(input: CreateGoalInput, now = new Date().toISOString()): Promise<Goal> {
  const title = input.title.trim();
  if (!title) throw new Error('Goal title is required');
  if (!isValidSectionId(input.sectionId)) throw new Error(`Unknown section: ${input.sectionId}`);
  if (!isValidPeriodKey(input.periodKind, input.periodKey)) {
    throw new Error(`Invalid ${input.periodKind} key: ${input.periodKey}`);
  }

  const goals = await getAllGoals();
  if (input.parentGoalId) await assertValidParent(goals, input, input.parentGoalId);

  const plan = sanitizeMilestones(input.plan, {
    periodKind: input.periodKind,
    periodKey: input.periodKey,
    target: input.target?.value,
    unit: input.target?.unit,
  });

  const goal: Goal = {
    id: randomUUID(),
    sectionId: input.sectionId,
    periodKind: input.periodKind,
    periodKey: input.periodKey,
    title,
    ...(input.detail?.trim() ? { detail: input.detail.trim() } : {}),
    ...(input.parentGoalId ? { parentGoalId: input.parentGoalId } : {}),
    ...(input.target && input.target.value > 0 ? { target: input.target } : {}),
    evidence: input.evidence ?? { kind: 'manual' },
    ...(plan.length > 0 ? { plan, planSource: input.planSource ?? 'manual' } : {}),
    checkIns: [],
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  await writeGoals([...goals, goal]);
  return goal;
}

async function assertValidParent(
  goals: Goal[],
  child: { sectionId: string; periodKind: GoalPeriodKind; periodKey: string },
  parentId: string
): Promise<void> {
  if (child.periodKind !== 'month') throw new Error('Only monthly goals can have a parent');
  const parent = goals.find(g => g.id === parentId);
  if (!parent) throw new Error('Parent goal not found');
  if (parent.periodKind !== 'quarter') throw new Error('A parent goal must be a quarterly goal');
  if (parent.sectionId !== child.sectionId) throw new Error('Parent goal must be in the same section');
  if (parent.periodKey !== quarterKeyForMonth(child.periodKey)) {
    throw new Error("Parent goal's quarter must contain the goal's month");
  }
}

export type UpdateGoalInput = Partial<
  Pick<
    Goal,
    | 'title'
    | 'detail'
    | 'target'
    | 'evidence'
    | 'status'
    | 'reflection'
    | 'manualValue'
    | 'parentGoalId'
    | 'plan'
    | 'planSource'
  >
>;

export async function updateGoal(
  id: string,
  patch: UpdateGoalInput,
  now = new Date().toISOString()
): Promise<Goal | null> {
  const goals = await getAllGoals();
  const existing = goals.find(g => g.id === id);
  if (!existing) return null;

  if (patch.parentGoalId) {
    await assertValidParent(goals, existing, patch.parentGoalId);
  }

  // The plan is cleaned separately: milestones must sit inside the goal's period
  // and ramp toward its (possibly just-changed) target, which the blanket spread
  // can't enforce.
  const scalarPatch = { ...patch };
  delete scalarPatch.plan;
  const next: Goal = { ...existing, ...stripUndefined(scalarPatch), updatedAt: now };

  if (patch.plan !== undefined) {
    const target = patch.target?.value ?? existing.target?.value;
    const unit = patch.target?.unit ?? existing.target?.unit;
    const plan = sanitizeMilestones(patch.plan, {
      periodKind: existing.periodKind,
      periodKey: existing.periodKey,
      target,
      unit,
    });
    if (plan.length > 0) {
      next.plan = plan;
      next.planSource = patch.planSource ?? existing.planSource ?? 'manual';
    } else {
      delete next.plan;
      delete next.planSource;
    }
  }

  // Clearing the parent is expressed as an explicit null/'' from the client.
  if (patch.parentGoalId === '' || patch.parentGoalId === null) delete next.parentGoalId;
  if (patch.status && patch.status !== 'active' && !existing.closedAt) next.closedAt = now;
  if (patch.status === 'active') delete next.closedAt;

  await writeGoals(goals.map(g => (g.id === id ? next : g)));
  return next;
}

// Deleting a quarterly goal orphans its children rather than cascading — losing
// a month's goals because a quarter was tidied up would be the worse surprise.
export async function deleteGoal(id: string): Promise<boolean> {
  const goals = await getAllGoals();
  if (!goals.some(g => g.id === id)) return false;
  const remaining = goals
    .filter(g => g.id !== id)
    .map(g => (g.parentGoalId === id ? stripParent(g) : g));
  await writeGoals(remaining);
  return true;
}

function stripParent(goal: Goal): Goal {
  const next = { ...goal };
  delete next.parentGoalId;
  return next;
}

export async function addCheckIn(
  goalId: string,
  checkIn: Omit<GoalCheckIn, 'at'> & { at?: string },
  now = new Date().toISOString()
): Promise<Goal | null> {
  const goals = await getAllGoals();
  const existing = goals.find(g => g.id === goalId);
  if (!existing) return null;

  const entry: GoalCheckIn = {
    at: checkIn.at ?? now,
    status: checkIn.status,
    source: checkIn.source,
    ...(checkIn.note?.trim() ? { note: checkIn.note.trim() } : {}),
    ...(typeof checkIn.value === 'number' ? { value: checkIn.value } : {}),
  };

  const next: Goal = {
    ...existing,
    checkIns: [...existing.checkIns, entry],
    // A check-in that carries a figure IS the manual reading, so a manual goal
    // needs no separate save step.
    ...(typeof entry.value === 'number' ? { manualValue: entry.value } : {}),
    updatedAt: now,
  };

  await writeGoals(goals.map(g => (g.id === goalId ? next : g)));
  return next;
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}
