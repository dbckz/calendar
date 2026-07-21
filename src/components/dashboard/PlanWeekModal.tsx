'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  X,
  CalendarClock,
  Loader2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

import {
  api,
  type ProposeWeekResponse,
  type ProposeWeekRequest,
  type QuotaSummaryRow,
  type ConfirmWeekResult,
  type PrepCandidatesResponse,
  type WeekCandidateCategory,
  type SpareCapacity,
} from '@/lib/api';
import type { ProposedBlock } from '@/lib/scheduling/types';
import type { AsanaProject, CalendarEvent } from '@/types';
import type { AsanaTypeFieldInfo } from '@/components/CreateAsanaTaskModal';

import {
  type Step,
  STEP_LABELS,
  type UntypedTask,
  type TypeRow,
  type EditableProposal,
  type MatchRow,
  type MatchMeta,
} from './plan-week/types';
import { TypeStep } from './plan-week/TypeStep';
import { PrioritiesStep } from './plan-week/PrioritiesStep';
import { PrepStep } from './plan-week/PrepStep';
import { TasksStep } from './plan-week/TasksStep';
import { ReviewStep } from './plan-week/ReviewStep';

interface PlanWeekModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplied?: () => void; // called after a successful confirm so the caller can refresh
  // Incomplete Asana tasks + per-integration Type field info, used by the "type
  // unclassified tasks" pre-step to find untyped tasks and write labels back.
  asanaTasks?: CalendarEvent[];
  typeFieldInfoByIntegration?: Map<string, AsanaTypeFieldInfo>;
}

export function PlanWeekModal({
  isOpen,
  onClose,
  onApplied,
  asanaTasks,
  typeFieldInfoByIntegration,
}: PlanWeekModalProps) {
  const [step, setStep] = useState<Step>('priorities');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 0 — type unclassified tasks. Incomplete tasks whose Asana "Type" custom
  // field is empty, but whose integration has writable Type labels. These are
  // invisible to the allocation categories until typed.
  const untypedTasks = useMemo<UntypedTask[]>(() => {
    if (!asanaTasks || !typeFieldInfoByIntegration) return [];
    const out: UntypedTask[] = [];
    for (const t of asanaTasks) {
      if (t.completed || !t.integrationId) continue;
      const info = typeFieldInfoByIntegration.get(t.integrationId);
      if (!info || info.enumOptions.size === 0) continue;
      const typeValue = t.customFields?.find(cf => cf.name.toLowerCase() === 'type')?.displayValue;
      if (typeValue) continue; // already typed
      out.push({
        gid: t.id,
        integrationId: t.integrationId,
        title: t.title,
        description: t.description,
        integrationName: t.integrationName,
        allowedTypes: Array.from(info.enumOptions.keys()).sort(),
      });
    }
    return out;
  }, [asanaTasks, typeFieldInfoByIntegration]);

  const hasTypeStep = untypedTasks.length > 0;

  // The type step is prepended only when there are untyped tasks to classify.
  const stepOrder = useMemo<Exclude<Step, 'done'>[]>(
    () =>
      hasTypeStep
        ? ['type', 'priorities', 'prep', 'tasks', 'review']
        : ['priorities', 'prep', 'tasks', 'review'],
    [hasTypeStep]
  );

  // Step 0 — type review
  const [typeRows, setTypeRows] = useState<TypeRow[] | null>(null); // null = not yet classified
  const [typeLoading, setTypeLoading] = useState(false);
  const [typeError, setTypeError] = useState<string | null>(null);
  const [isApplyingTypes, setIsApplyingTypes] = useState(false);

  // Step 1 — priorities
  const [priorityText, setPriorityText] = useState('');
  const [matchRows, setMatchRows] = useState<MatchRow[] | null>(null); // null = input phase
  const [matchMeta, setMatchMeta] = useState<MatchMeta>({
    asanaIntegrations: [],
    categories: [],
    projects: [],
    aiUnavailable: false,
  });
  const [createdTasks, setCreatedTasks] = useState<
    Array<{ text: string; gid: string; title: string; integrationId: string }>
  >([]);
  const [priorityIds, setPriorityIds] = useState<string[]>([]);
  const [categoryOverrides, setCategoryOverrides] = useState<Record<string, string>>({});

  // Step 2 — prep
  const [prepData, setPrepData] = useState<PrepCandidatesResponse | null>(null);
  const [prepBusy, setPrepBusy] = useState(false);
  const [showOtherMeetings, setShowOtherMeetings] = useState(false);
  const [prepEngaged, setPrepEngaged] = useState(false);
  // Per-meeting prep-length overrides, keyed by eventId. Only explicit picks are
  // stored; a meeting without an entry defaults to 15 mins.
  const [prepDurations, setPrepDurations] = useState<Record<string, number>>({});
  // Per-meeting prep-DAY overrides (yyyy-MM-dd), keyed by eventId. Only explicit
  // picks are stored; a meeting without an entry uses the default day-before →
  // day-of placement.
  const [prepDays, setPrepDays] = useState<Record<string, string>>({});

  // Step 3 — tasks
  const [taskCats, setTaskCats] = useState<WeekCandidateCategory[] | null>(null);
  const [selections, setSelections] = useState<Record<string, Set<string>>>({});
  const [tasksEngaged, setTasksEngaged] = useState(false);
  // Per-week block-length overrides (mins), keyed by category. Now used only for
  // GROUPED categories (shared containers); single-task categories override per
  // task via taskDurationOverrides below. Only holds explicit user picks.
  const [taskDurations, setTaskDurations] = useState<Record<string, number>>({});
  // Per-task block-length overrides (mins), keyed by candidate id (gid/adhocId),
  // for single-task (non-grouped) categories. Only holds explicit picks; a task
  // not present here uses its category's default block length.
  const [taskDurationOverrides, setTaskDurationOverrides] = useState<Record<string, number>>({});

  // Step 3 — "Must do this week": task ids (gid/adhocId) the user flagged as
  // must-do. Flagging auto-selects the task and bypasses the selection cap; the
  // ids are sent to the propose route to mark them isPriority (sorted first,
  // never dropped). Reset on open.
  const [mustDoIds, setMustDoIds] = useState<Set<string>>(new Set());
  // Ids of Asana tasks currently being marked done from the wizard (spinner).
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());

  // Step 3 — "Add more tasks": set when the user returns to the tasks step from
  // review to spend spare capacity. Lifts the per-category selection cap so
  // explicit over-quota picks are allowed, and shows a banner on the tasks step.
  const [addMoreMode, setAddMoreMode] = useState(false);

  // Step 4 — review / done
  const [proposals, setProposals] = useState<EditableProposal[]>([]);
  const [quotaSummary, setQuotaSummary] = useState<QuotaSummaryRow[]>([]);
  const [spareCapacity, setSpareCapacity] = useState<SpareCapacity | null>(null);
  // Working days (yyyy-MM-dd) with no exercise placement — the review step warns
  // per day since exercise is the number-one priority ritual.
  const [exerciseMissingDays, setExerciseMissingDays] = useState<string[]>([]);
  const [weekLabel, setWeekLabel] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);
  const [results, setResults] = useState<Record<string, ConfirmWeekResult>>({});

  // Reset everything whenever the modal opens fresh.
  useEffect(() => {
    if (!isOpen) return;
    setStep(hasTypeStep ? 'type' : 'priorities');
    setTypeRows(null);
    setTypeLoading(false);
    setTypeError(null);
    setIsApplyingTypes(false);
    setIsLoading(false);
    setError(null);
    setPriorityText('');
    setMatchRows(null);
    setMatchMeta({ asanaIntegrations: [], categories: [], projects: [], aiUnavailable: false });
    setCreatedTasks([]);
    setPriorityIds([]);
    setCategoryOverrides({});
    setPrepData(null);
    setPrepBusy(false);
    setShowOtherMeetings(false);
    setPrepEngaged(false);
    setPrepDurations({});
    setPrepDays({});
    setTaskCats(null);
    setSelections({});
    setTasksEngaged(false);
    setTaskDurations({});
    setTaskDurationOverrides({});
    setMustDoIds(new Set());
    setCompletingIds(new Set());
    setAddMoreMode(false);
    setProposals([]);
    setQuotaSummary([]);
    setSpareCapacity(null);
    setExerciseMissingDays([]);
    setWeekLabel('');
    setIsConfirming(false);
    setResults({});
    // Only re-run on open/close; hasTypeStep is read fresh to pick the first step
    // but must not reset an in-progress wizard when the untyped set changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Escape closes.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // --- Step 0 actions (type unclassified tasks) ---

  // Classify the untyped tasks. Grouped by integration (allowed labels differ per
  // workspace), one headless call each, run concurrently server-side. Each row is
  // pre-filled with Claude's suggestion (blank if the model omitted/invalidated
  // it, so the user picks). A classifier failure still lets the user type by hand.
  const runTypeClassifier = useCallback(async () => {
    setTypeLoading(true);
    setTypeError(null);
    try {
      const groups = new Map<string, { integrationId: string; allowedTypes: string[]; tasks: Array<{ gid: string; title: string; description?: string; integrationName?: string }> }>();
      for (const t of untypedTasks) {
        let g = groups.get(t.integrationId);
        if (!g) {
          g = { integrationId: t.integrationId, allowedTypes: t.allowedTypes, tasks: [] };
          groups.set(t.integrationId, g);
        }
        g.tasks.push({ gid: t.gid, title: t.title, description: t.description, integrationName: t.integrationName });
      }
      const { suggestions } = await api.classifyTaskTypes([...groups.values()]);
      const byGid = new Map(suggestions.map(s => [s.gid, s.type]));
      setTypeRows(
        untypedTasks.map(t => {
          const suggested = byGid.get(t.gid);
          return { ...t, chosen: suggested && t.allowedTypes.includes(suggested) ? suggested : '' };
        })
      );
    } catch (err) {
      // Degrade gracefully: no suggestions, but the user can still classify manually.
      setTypeRows(untypedTasks.map(t => ({ ...t, chosen: '' })));
      setTypeError(err instanceof Error ? err.message : 'Failed to suggest types');
    } finally {
      setTypeLoading(false);
    }
  }, [untypedTasks]);

  // Write each kept (non-blank) label to its Asana task's Type field, then advance
  // to the priorities step. On partial failure we surface a count and stay put so
  // the user can retry or Skip; on success we refresh so newly-typed tasks appear
  // in the allocation categories.
  const applyTypes = useCallback(async () => {
    if (!typeRows || !typeFieldInfoByIntegration) return;
    const toWrite = typeRows.filter(r => r.chosen);
    if (toWrite.length === 0) {
      setStep('priorities');
      return;
    }
    setIsApplyingTypes(true);
    setError(null);
    try {
      const outcomes = await Promise.allSettled(
        toWrite.map(r => {
          const info = typeFieldInfoByIntegration.get(r.integrationId);
          const optionGid = info?.enumOptions.get(r.chosen);
          if (!info || !optionGid) {
            return Promise.reject(new Error(`No Type option for "${r.chosen}"`));
          }
          return api.updateAsanaTask(r.gid, r.integrationId, {
            customFields: { [info.fieldGid]: optionGid },
          });
        })
      );
      const failed = outcomes.filter(o => o.status === 'rejected').length;
      onApplied?.(); // refresh so applied types show up in the allocation categories
      if (failed > 0) {
        setError(`${failed} of ${toWrite.length} type update${toWrite.length === 1 ? '' : 's'} failed — retry, or Skip to continue.`);
        return; // stay on the type step
      }
      setStep('priorities');
    } finally {
      setIsApplyingTypes(false);
    }
  }, [typeRows, typeFieldInfoByIntegration, onApplied]);

  // --- Data fetching per step ---

  const fetchPrep = useCallback(async (durations = prepDurations, days = prepDays) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getPrepCandidates(undefined, durations, days);
      setPrepData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load meeting prep');
    } finally {
      setIsLoading(false);
    }
  }, [prepDurations, prepDays]);

  // Changing a prep row's length/day updates LOCAL state only — no refetch on
  // every change (that felt like a page reload). The proposed slots are
  // re-computed once, from both maps, when the user clicks Next off the prep step
  // (see advancePrep). The per-row proposed-slot text may be briefly stale after
  // a change; a note tells the user slots finalize on Next.
  const changePrepDuration = useCallback((eventId: string, durationMinutes: number) => {
    setPrepDurations(prev => ({ ...prev, [eventId]: durationMinutes }));
  }, []);

  const changePrepDay = useCallback((eventId: string, date: string) => {
    setPrepDays(prev => ({ ...prev, [eventId]: date }));
  }, []);

  // Next off the prep step: re-propose prep slots once with the full duration/day
  // maps (showing the button's busy state while it runs) so acceptedPrepBlocks
  // are fresh before advancing to the tasks step.
  const advancePrep = useCallback(async () => {
    await fetchPrep(prepDurations, prepDays);
    setPrepEngaged(true);
    setStep('tasks');
  }, [fetchPrep, prepDurations, prepDays]);

  const fetchTasks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getWeekCandidates({
        priorityGids: priorityIds.length ? priorityIds : undefined,
        categoryOverrides: Object.keys(categoryOverrides).length ? categoryOverrides : undefined,
      });
      setTaskCats(data.categories);
      // Pre-check priorities (capped at each category's remaining quota).
      const sel: Record<string, Set<string>> = {};
      for (const c of data.categories) {
        if (c.autoSelect) continue;
        const picked = new Set<string>();
        let count = 0;
        for (const cand of c.candidates) {
          // No-quota categories have no cap (remainingQuota === null).
          if (cand.isPriority && (c.remainingQuota === null || count < c.remainingQuota)) {
            picked.add(cand.id);
            count++;
          }
        }
        sel[c.category] = picked;
      }
      setSelections(sel);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load task candidates');
    } finally {
      setIsLoading(false);
    }
  }, [priorityIds, categoryOverrides]);

  const acceptedPrepBlocks = useMemo(
    () => (prepData?.meetings ?? []).filter(m => m.needsPrep && m.block).map(m => m.block!),
    [prepData]
  );

  const fetchReview = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setResults({});
    try {
      const body: ProposeWeekRequest = {};
      if (priorityIds.length) body.priorityGids = priorityIds;
      if (mustDoIds.size) body.mustDoIds = Array.from(mustDoIds);
      if (Object.keys(categoryOverrides).length) body.categoryOverrides = categoryOverrides;
      if (prepEngaged) body.prepBlocks = acceptedPrepBlocks;
      if (tasksEngaged && taskCats) {
        const selObj: Record<string, string[]> = {};
        for (const c of taskCats) {
          if (c.autoSelect) continue;
          selObj[c.category] = Array.from(selections[c.category] ?? []);
        }
        body.selections = selObj;
      }
      if (Object.keys(taskDurations).length) body.durationOverrides = taskDurations;
      if (Object.keys(taskDurationOverrides).length) body.taskDurationOverrides = taskDurationOverrides;
      const data: ProposeWeekResponse = await api.proposeWeeklyPlan(body);
      // Overflow blocks are OPTIONAL — default them to rejected so the user opts in.
      setProposals(data.proposals.map(p => ({ ...p, accepted: !p.overflow })));
      setQuotaSummary(data.quotaSummary);
      setSpareCapacity(data.spareCapacity ?? null);
      setExerciseMissingDays(data.exerciseMissingDays ?? []);
      setWeekLabel(
        `${format(parseISO(data.weekStart), 'MMM d')} – ${format(parseISO(data.weekEnd), 'MMM d')}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to build your plan');
    } finally {
      setIsLoading(false);
    }
  }, [priorityIds, mustDoIds, categoryOverrides, prepEngaged, acceptedPrepBlocks, tasksEngaged, taskCats, selections, taskDurations, taskDurationOverrides]);

  // Lazy-fetch on entering a step. Prep/tasks fetch once (cached); review
  // re-proposes each entry since it depends on prior steps' choices.
  useEffect(() => {
    if (!isOpen) return;
    if (step === 'type' && typeRows === null && !typeLoading) runTypeClassifier();
    else if (step === 'prep' && prepData === null) fetchPrep();
    else if (step === 'tasks' && taskCats === null) fetchTasks();
    else if (step === 'review') fetchReview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, isOpen]);

  // --- Step 1 actions ---

  const runMatch = useCallback(async () => {
    const items = priorityText
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);
    if (items.length === 0) {
      setStep('prep');
      return;
    }
    setIsLoading(true);
    setError(null);
    setCreatedTasks([]);
    try {
      // Projects are needed so a newly-created task can be filed under a
      // required Asana project. Fetch alongside the match; a projects failure
      // shouldn't block matching.
      const [res, projectsRes] = await Promise.all([
        api.matchPriorities(items),
        api.getAsanaProjects().catch(() => ({ projects: [] as AsanaProject[] })),
      ]);
      const defaultIntegrationId = res.asanaIntegrations[0]?.id ?? '';
      const rows: MatchRow[] = res.results.map(r => ({
        text: r.text,
        match: r.match,
        createIntegrationId: defaultIntegrationId,
        createProjectGid: '',
        category: r.match?.category ?? res.categories[0] ?? '',
        include: true,
      }));
      setMatchRows(rows);
      setMatchMeta({
        asanaIntegrations: res.asanaIntegrations,
        categories: res.categories,
        projects: projectsRes.projects,
        aiUnavailable: !!res.aiUnavailable,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to match priorities');
    } finally {
      setIsLoading(false);
    }
  }, [priorityText]);

  const confirmPriorities = useCallback(async () => {
    if (!matchRows) return;
    setIsLoading(true);
    setError(null);
    try {
      const unmatchedIncluded = matchRows.filter(r => !r.match && r.include);
      // A project is required for each new task whenever the chosen integration
      // has projects to file under. Guard here as a backstop to the disabled Next.
      const missingProject = unmatchedIncluded.some(
        r =>
          matchMeta.projects.some(p => p.integrationId === r.createIntegrationId) &&
          !r.createProjectGid
      );
      if (missingProject) {
        setError('Choose a project for each new task before continuing.');
        setIsLoading(false);
        return;
      }
      let created = createdTasks;
      if (unmatchedIncluded.length > 0 && createdTasks.length === 0) {
        const res = await api.createPriorityTasks(
          unmatchedIncluded.map(r => ({
            text: r.text,
            integrationId: r.createIntegrationId,
            ...(r.createProjectGid ? { projectGid: r.createProjectGid } : {}),
          }))
        );
        created = res.created;
        setCreatedTasks(created);
      }

      const ids: string[] = [];
      const overrides: Record<string, string> = {};
      for (const r of matchRows) {
        if (r.match) {
          ids.push(r.match.gid);
          // Task's Asana Type doesn't map to a quota category → carry the pick.
          if (!r.match.category) overrides[r.match.gid] = r.category;
        }
      }
      for (const c of created) {
        const row = matchRows.find(r => r.text === c.text);
        ids.push(c.gid);
        if (row) overrides[c.gid] = row.category;
      }

      setPriorityIds(ids);
      setCategoryOverrides(overrides);
      setTaskCats(null); // priorities changed → re-fetch candidates
      setStep('prep');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create Asana tasks');
    } finally {
      setIsLoading(false);
    }
  }, [matchRows, createdTasks, matchMeta.projects]);

  // --- Step 2 actions ---

  const setPrepDecision = useCallback(
    async (title: string, needsPrep: boolean) => {
      setPrepBusy(true);
      setError(null);
      try {
        await api.setPrepDecision(title, needsPrep);
        const data = await api.getPrepCandidates(undefined, prepDurations, prepDays);
        setPrepData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update prep decision');
      } finally {
        setPrepBusy(false);
      }
    },
    [prepDurations, prepDays]
  );

  // --- Step 3 actions ---

  // remainingQuota === null means no cap (no-quota catch-all category). A must-do
  // task is always admissible even when the cap is hit.
  const toggleSelection = (category: string, id: string, remainingQuota: number | null) => {
    setSelections(prev => {
      const set = new Set(prev[category] ?? []);
      if (set.has(id)) set.delete(id);
      else if (remainingQuota === null || set.size < remainingQuota || mustDoIds.has(id)) set.add(id);
      return { ...prev, [category]: set };
    });
  };

  // Flag / unflag a task as "must do this week". Flagging auto-selects it,
  // bypassing the category's selection cap; unflagging leaves the selection as-is.
  const toggleMustDo = (category: string, id: string) => {
    const wasFlagged = mustDoIds.has(id);
    setMustDoIds(prev => {
      const next = new Set(prev);
      if (wasFlagged) next.delete(id);
      else next.add(id);
      return next;
    });
    if (!wasFlagged) {
      setSelections(prev => {
        const set = new Set(prev[category] ?? []);
        set.add(id);
        return { ...prev, [category]: set };
      });
    }
  };

  // Mark an Asana-backed candidate complete in Asana, then drop it from the wizard
  // (candidates, selections, must-do, per-task overrides).
  const completeAsana = useCallback(async (id: string, gid: string, integrationId: string) => {
    setCompletingIds(prev => new Set(prev).add(id));
    setError(null);
    try {
      await api.completeAsanaTaskInWizard(gid, integrationId);
      setTaskCats(prev =>
        prev
          ? prev.map(c => ({ ...c, candidates: c.candidates.filter(cd => cd.id !== id) }))
          : prev
      );
      setSelections(prev => {
        const next: Record<string, Set<string>> = {};
        for (const [cat, set] of Object.entries(prev)) {
          const s = new Set(set);
          s.delete(id);
          next[cat] = s;
        }
        return next;
      });
      setMustDoIds(prev => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
      setTaskDurationOverrides(prev => {
        if (!(id in prev)) return prev;
        const rest = { ...prev };
        delete rest[id];
        return rest;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark task done in Asana');
    } finally {
      setCompletingIds(prev => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    }
  }, []);

  // Return to the tasks step from review to spend spare capacity. Selections are
  // preserved (kept in state); addMoreMode lifts the per-category selection cap so
  // the user can pick beyond a quota, and those extra picks get scheduled.
  const addMoreTasks = useCallback(() => {
    setAddMoreMode(true);
    setStep('tasks');
  }, []);

  // --- Step 4 actions ---

  // Normal (working-hours) proposals, grouped by date. Overflow proposals are
  // rendered in their own opt-in section, so they're excluded here.
  const grouped = useMemo(() => {
    const map = new Map<string, EditableProposal[]>();
    for (const p of proposals) {
      if (p.overflow) continue;
      const list = map.get(p.date) ?? [];
      list.push(p);
      map.set(p.date, list);
    }
    return [...map.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, items]) => ({
        date,
        items: items.sort((a, b) => (a.start < b.start ? -1 : 1)),
      }));
  }, [proposals]);

  // Optional evening-overflow proposals, sorted by date then start.
  const overflowProposals = useMemo(
    () =>
      proposals
        .filter(p => p.overflow)
        .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.start < b.start ? -1 : 1)),
    [proposals]
  );

  const acceptedCount = proposals.filter(p => p.accepted).length;
  const hasResults = Object.keys(results).length > 0;

  const toggleAccept = (id: string) =>
    setProposals(prev => prev.map(p => (p.id === id ? { ...p, accepted: !p.accepted } : p)));

  const editStart = (id: string, start: string) =>
    setProposals(prev => prev.map(p => (p.id === id ? { ...p, start } : p)));

  const confirm = useCallback(async () => {
    const accepted = proposals.filter(p => p.accepted);
    if (accepted.length === 0) return;
    setIsConfirming(true);
    setError(null);
    try {
      const blocks: ProposedBlock[] = accepted.map(p => ({
        id: p.id,
        category: p.category,
        task: p.task,
        tasks: p.tasks,
        date: p.date,
        start: p.start,
        durationMinutes: p.durationMinutes,
        reason: p.reason,
        kind: p.kind,
        meeting: p.meeting,
        title: p.title,
      }));
      const { results: res } = await api.confirmWeeklyPlan(blocks);
      const map: Record<string, ConfirmWeekResult> = {};
      for (const r of res) map[r.id] = r;
      setResults(map);
      if (res.some(r => r.success)) onApplied?.();
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm plan');
    } finally {
      setIsConfirming(false);
    }
  }, [proposals, onApplied]);

  // --- Navigation ---

  const handleNext = useCallback(() => {
    switch (step) {
      case 'type':
        applyTypes();
        break;
      case 'priorities':
        if (matchRows === null) runMatch();
        else confirmPriorities();
        break;
      case 'prep':
        advancePrep();
        break;
      case 'tasks':
        setTasksEngaged(true);
        setStep('review');
        break;
      case 'review':
        confirm();
        break;
    }
  }, [step, matchRows, runMatch, confirmPriorities, confirm, applyTypes, advancePrep]);

  const handleSkip = useCallback(() => {
    switch (step) {
      case 'type':
        setStep('priorities');
        break;
      case 'priorities':
        setPriorityIds([]);
        setCategoryOverrides({});
        setTaskCats(null);
        setStep('prep');
        break;
      case 'prep':
        setPrepEngaged(false);
        setStep('tasks');
        break;
      case 'tasks':
        setTasksEngaged(false);
        setStep('review');
        break;
    }
  }, [step]);

  const handleBack = useCallback(() => {
    switch (step) {
      case 'priorities':
        if (matchRows !== null) setMatchRows(null); // matched → input phase
        break;
      case 'prep':
        setStep('priorities');
        break;
      case 'tasks':
        setStep('prep');
        break;
      case 'review':
        setStep('tasks');
        break;
    }
  }, [step, matchRows]);

  if (!isOpen) return null;

  const activeIndex = step === 'done' ? stepOrder.length : stepOrder.indexOf(step);
  const canBack =
    (step === 'priorities' && matchRows !== null) ||
    step === 'prep' ||
    step === 'tasks' ||
    step === 'review';
  const canSkip =
    step === 'type' || step === 'priorities' || step === 'prep' || step === 'tasks';

  const projectsForIntegration = (integrationId: string) =>
    matchMeta.projects.filter(p => p.integrationId === integrationId);

  // Every included new task must have a project chosen (when its integration has
  // projects to choose from). Blocks Next on the priorities step until satisfied.
  const prioritiesReady =
    matchRows === null ||
    matchRows.every(
      r =>
        !!r.match ||
        !r.include ||
        projectsForIntegration(r.createIntegrationId).length === 0 ||
        r.createProjectGid !== ''
    );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-orange-500" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Plan my week</h2>
              {weekLabel && <p className="text-xs text-gray-400">{weekLabel}</p>}
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* Step dots */}
            <div className="hidden sm:flex items-center gap-1.5">
              {stepOrder.map((s, i) => (
                <div key={s} className="flex items-center gap-1.5" title={STEP_LABELS[s]}>
                  <span
                    className={`w-2 h-2 rounded-full transition-colors ${
                      i < activeIndex
                        ? 'bg-orange-400'
                        : i === activeIndex
                          ? 'bg-orange-500 ring-2 ring-orange-200'
                          : 'bg-gray-200'
                    }`}
                  />
                </div>
              ))}
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {error && (
            <div className="mb-4 flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
            </div>
          ) : (
            <>
              {step === 'type' && (
                <TypeStep
                  untypedTasks={untypedTasks}
                  typeRows={typeRows}
                  setTypeRows={setTypeRows}
                  typeLoading={typeLoading}
                  typeError={typeError}
                />
              )}
              {step === 'priorities' && (
                <PrioritiesStep
                  matchRows={matchRows}
                  setMatchRows={setMatchRows}
                  priorityText={priorityText}
                  setPriorityText={setPriorityText}
                  matchMeta={matchMeta}
                  createdTasks={createdTasks}
                />
              )}
              {step === 'prep' && (
                <PrepStep
                  prepData={prepData}
                  prepBusy={prepBusy}
                  isLoading={isLoading}
                  showOtherMeetings={showOtherMeetings}
                  setShowOtherMeetings={setShowOtherMeetings}
                  prepDurations={prepDurations}
                  prepDays={prepDays}
                  setPrepDecision={setPrepDecision}
                  changePrepDuration={changePrepDuration}
                  changePrepDay={changePrepDay}
                />
              )}
              {step === 'tasks' && (
                <TasksStep
                  taskCats={taskCats}
                  selections={selections}
                  taskDurations={taskDurations}
                  setTaskDurations={setTaskDurations}
                  taskDurationOverrides={taskDurationOverrides}
                  setTaskDurationOverrides={setTaskDurationOverrides}
                  mustDoIds={mustDoIds}
                  completingIds={completingIds}
                  addMoreMode={addMoreMode}
                  spareCapacity={spareCapacity}
                  toggleSelection={toggleSelection}
                  toggleMustDo={toggleMustDo}
                  completeAsana={completeAsana}
                />
              )}
              {(step === 'review' || step === 'done') && (
                <ReviewStep
                  proposals={proposals}
                  grouped={grouped}
                  overflowProposals={overflowProposals}
                  mustDoIds={mustDoIds}
                  taskCats={taskCats}
                  exerciseMissingDays={exerciseMissingDays}
                  quotaSummary={quotaSummary}
                  results={results}
                  hasResults={hasResults}
                  spareCapacity={spareCapacity}
                  toggleAccept={toggleAccept}
                  editStart={editStart}
                  addMoreTasks={addMoreTasks}
                />
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-200">
          <div>
            {canBack && (
              <button
                onClick={handleBack}
                className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step === 'done' ? (
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
              >
                Done
              </button>
            ) : (
              <>
                {canSkip && (
                  <button
                    onClick={handleSkip}
                    disabled={isLoading}
                    className="px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                  >
                    Skip
                  </button>
                )}
                <button
                  onClick={handleNext}
                  disabled={
                    isLoading ||
                    prepBusy ||
                    (step === 'type' && (typeLoading || isApplyingTypes)) ||
                    (step === 'priorities' && !prioritiesReady) ||
                    (step === 'review' && (acceptedCount === 0 || isConfirming))
                  }
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {(isConfirming ||
                    isApplyingTypes ||
                    (isLoading && (step === 'priorities' || step === 'prep'))) && (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                  {step === 'type' ? (
                    <>Apply types &amp; continue</>
                  ) : step === 'review' ? (
                    <>Add {acceptedCount > 0 ? acceptedCount : ''} to calendar</>
                  ) : (
                    <>
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
