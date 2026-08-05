// Auto-derived goal evidence: turns a goal's declared source into an actual
// figure for its period, so progress updates itself instead of relying on a
// self-report.
//
// Every resolver degrades gracefully. A source that can't be read (Asana down,
// a deleted project, no data yet) yields a null actual and says so in the
// label — a goal never disappears because its evidence source is unavailable.
//
// Server-only: reaches into storage and the Asana API.

import { format } from 'date-fns';
import { countCompletedTasks } from './asana';
import { periodRange } from './goal-periods';
import { getEnabledAsanaIntegrations, updateIntegration } from './integration-storage';
import { refreshAsanaToken } from './asana';
import { getAllSessions } from './storage/exercise';
import { getAllWeeklyStats } from './storage/weekly-stats';
import type { Goal } from '@/types/life';

export interface ResolvedEvidence {
  actual: number | null;
  label: string;
}

export async function resolveEvidence(goal: Goal): Promise<ResolvedEvidence> {
  const { start, end } = periodRange(goal.periodKind, goal.periodKey);

  try {
    switch (goal.evidence.kind) {
      case 'manual':
        return resolveManual(goal);
      case 'exercise':
        return await resolveExercise(goal, start, end);
      case 'calendar-category':
        return await resolveCalendarCategory(goal, start, end);
      case 'asana-project':
      case 'asana-tag':
        return await resolveAsana(goal, start, end);
      default:
        return { actual: null, label: 'Unknown evidence source' };
    }
  } catch (error) {
    console.error(`Failed to resolve evidence for goal ${goal.id}:`, error);
    return { actual: null, label: 'Evidence source unavailable' };
  }
}

// Resolve a batch in parallel, keyed by goal id. Asana-backed goals each cost a
// round trip, so the Goals tab resolves them concurrently rather than in turn.
export async function resolveEvidenceForGoals(
  goals: Goal[]
): Promise<Record<string, ResolvedEvidence>> {
  const entries = await Promise.all(
    goals.map(async goal => [goal.id, await resolveEvidence(goal)] as const)
  );
  return Object.fromEntries(entries);
}

function resolveManual(goal: Goal): ResolvedEvidence {
  if (typeof goal.manualValue !== 'number') {
    return { actual: null, label: 'No figure reported yet' };
  }
  const last = goal.checkIns.filter(c => typeof c.value === 'number').at(-1);
  return {
    actual: goal.manualValue,
    label: last ? `Self-reported ${format(new Date(last.at), 'd MMM')}` : 'Self-reported',
  };
}

async function resolveExercise(goal: Goal, start: Date, end: Date): Promise<ResolvedEvidence> {
  const from = format(start, 'yyyy-MM-dd');
  const to = format(new Date(end.getTime() - 1), 'yyyy-MM-dd');
  const wanted = goal.evidence.ref?.trim().toLowerCase();

  const sessions = (await getAllSessions()).filter(
    s =>
      s.completed &&
      s.date >= from &&
      s.date <= to &&
      (!wanted || s.type.toLowerCase() === wanted)
  );

  const noun = sessions.length === 1 ? 'session' : 'sessions';
  const scope = wanted ? `"${goal.evidence.ref}" ${noun}` : noun;
  if (goal.evidence.unit === 'minutes') {
    const minutes = sessions.reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0);
    return { actual: minutes, label: `${minutes} min logged across ${sessions.length} ${scope}` };
  }
  return { actual: sessions.length, label: `${sessions.length} ${scope} logged` };
}

// Minutes booked against a time-tracking category, read out of the durable
// weekly stats the Analysis tab already maintains. Days are filtered
// individually, so a week straddling a month boundary contributes only the days
// that fall inside the period.
async function resolveCalendarCategory(
  goal: Goal,
  start: Date,
  end: Date
): Promise<ResolvedEvidence> {
  const category = goal.evidence.ref;
  if (!category) return { actual: null, label: 'No category set' };

  const from = format(start, 'yyyy-MM-dd');
  const to = format(new Date(end.getTime() - 1), 'yyyy-MM-dd');
  const stats = await getAllWeeklyStats();

  let minutes = 0;
  let activeDays = 0;
  for (const week of Object.values(stats)) {
    for (const [integrationId, integration] of Object.entries(week.integrations)) {
      if (goal.evidence.integrationId && integrationId !== goal.evidence.integrationId) continue;
      for (const day of Object.values(integration.days)) {
        if (day.date < from || day.date > to) continue;
        const dayMinutes = day.byCategory?.[category] ?? 0;
        if (dayMinutes <= 0) continue;
        minutes += dayMinutes;
        activeDays += 1;
      }
    }
  }

  if (goal.evidence.unit === 'count') {
    return { actual: activeDays, label: `${activeDays} days with "${category}" time` };
  }
  return {
    actual: minutes,
    label: `${Math.round(minutes)} min of "${category}" across ${activeDays} days`,
  };
}

// Tasks completed in an Asana project or under a tag during the period.
async function resolveAsana(goal: Goal, start: Date, end: Date): Promise<ResolvedEvidence> {
  const ref = goal.evidence.ref;
  if (!ref) return { actual: null, label: 'No Asana source set' };

  const integrations = (await getEnabledAsanaIntegrations()).filter(
    i => !!i.credentials && (!goal.evidence.integrationId || i.id === goal.evidence.integrationId)
  );
  if (integrations.length === 0) return { actual: null, label: 'No Asana workspace connected' };

  const source = goal.evidence.kind === 'asana-project' ? { projectGid: ref } : { tagGid: ref };
  const fromIso = start.toISOString();
  const toIso = end.toISOString();

  // A project/tag lives in exactly one workspace, so the others 404 or return
  // nothing; summing tolerates that without needing to know which is which.
  let total = 0;
  let reachedAny = false;
  for (const integration of integrations) {
    try {
      let credentials = integration.credentials!;
      if (credentials.expiresAt && Date.now() >= credentials.expiresAt - 60_000) {
        credentials = await refreshAsanaToken(
          credentials.refreshToken!,
          integration.clientId,
          integration.clientSecret
        );
        await updateIntegration(integration.id, { credentials });
      }
      total += await countCompletedTasks(credentials.accessToken, source, fromIso, toIso);
      reachedAny = true;
    } catch (error) {
      console.error(`Asana evidence lookup failed for ${integration.name}:`, error);
    }
  }

  if (!reachedAny) return { actual: null, label: 'Asana unavailable' };
  const where = goal.evidence.kind === 'asana-project' ? 'in project' : 'tagged';
  return { actual: total, label: `${total} task${total === 1 ? '' : 's'} completed ${where}` };
}
