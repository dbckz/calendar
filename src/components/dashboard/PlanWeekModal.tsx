'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  X,
  CalendarClock,
  Loader2,
  Check,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Star,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

import {
  api,
  type ProposeWeekResponse,
  type ProposeWeekRequest,
  type QuotaSummaryRow,
  type ConfirmWeekResult,
  type PriorityMatchRow,
  type PrepCandidatesResponse,
  type WeekCandidateCategory,
} from '@/lib/api';
import type { ProposedBlock } from '@/lib/scheduling/types';
import type { AsanaProject, CalendarEvent } from '@/types';
import type { AsanaTypeFieldInfo } from '@/components/CreateAsanaTaskModal';

interface PlanWeekModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplied?: () => void; // called after a successful confirm so the caller can refresh
  // Incomplete Asana tasks + per-integration Type field info, used by the "type
  // unclassified tasks" pre-step to find untyped tasks and write labels back.
  asanaTasks?: CalendarEvent[];
  typeFieldInfoByIntegration?: Map<string, AsanaTypeFieldInfo>;
}

type Step = 'type' | 'priorities' | 'prep' | 'tasks' | 'review' | 'done';

const STEP_LABELS: Record<Exclude<Step, 'done'>, string> = {
  type: 'Type',
  priorities: 'Priorities',
  prep: 'Prep',
  tasks: 'Tasks',
  review: 'Review',
};

// A single untyped task, resolved with its integration's writable Type labels.
interface UntypedTask {
  gid: string;
  integrationId: string;
  title: string;
  description?: string;
  integrationName?: string;
  allowedTypes: string[]; // exact Asana enum labels we can write for this integration
}

// Row state for the type-review step: an untyped task plus the currently chosen
// label ('' = leave untyped, i.e. don't write).
interface TypeRow extends UntypedTask {
  chosen: string;
}

// Deterministic pastel-ish colour per category, so a category always reads the
// same across the modal.
const CATEGORY_COLORS = [
  { bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-400' },
  { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-400' },
  { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-400' },
  { bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-400' },
  { bg: 'bg-pink-100', text: 'text-pink-700', dot: 'bg-pink-400' },
  { bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-400' },
];

function categoryColor(category: string) {
  let hash = 0;
  for (let i = 0; i < category.length; i++) hash = (hash * 31 + category.charCodeAt(i)) | 0;
  return CATEGORY_COLORS[Math.abs(hash) % CATEGORY_COLORS.length];
}

function timeRange(start: string, durationMinutes: number): string {
  const [h, m] = start.split(':').map(Number);
  const startDate = new Date(2000, 0, 1, h, m);
  const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);
  return `${start}–${format(endDate, 'HH:mm')}`;
}

// Standard block-length options (minutes) for the tasks step.
const BLOCK_LENGTH_OPTIONS = [15, 30, 45, 60, 90, 120, 180];

// Human label for a block length in minutes: "15 mins", "1 hour", "1.5 hours".
function blockLengthLabel(mins: number): string {
  if (mins < 60) return `${mins} mins`;
  if (mins % 60 === 0) {
    const hours = mins / 60;
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }
  // Clean half-hour multiples read as "1.5 hours"; anything else as "1h 20m".
  if (mins % 30 === 0) return `${mins / 60} hours`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// Build the ordered option list for a category, always including its default so
// a non-standard configured length stays selectable (labelled "… (default)").
function blockLengthOptions(defaultMins: number): Array<{ value: number; label: string }> {
  const values = BLOCK_LENGTH_OPTIONS.includes(defaultMins)
    ? BLOCK_LENGTH_OPTIONS
    : [...BLOCK_LENGTH_OPTIONS, defaultMins].sort((a, b) => a - b);
  return values.map(v => ({
    value: v,
    label: v === defaultMins && !BLOCK_LENGTH_OPTIONS.includes(defaultMins)
      ? `${blockLengthLabel(v)} (default)`
      : blockLengthLabel(v),
  }));
}

interface EditableProposal extends ProposedBlock {
  accepted: boolean;
}

// Step-1 row state: one per typed priority line.
interface MatchRow {
  text: string;
  match: PriorityMatchRow['match'];
  createIntegrationId: string; // unmatched rows: which Asana integration to create in
  createProjectGid: string; // unmatched rows: which Asana project to create in (required)
  category: string; // unmatched, or matched-without-category: chosen quota category
  include: boolean; // unmatched rows: create + pin this one
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
  const [matchMeta, setMatchMeta] = useState<{
    asanaIntegrations: Array<{ id: string; name: string }>;
    categories: string[];
    projects: AsanaProject[];
    aiUnavailable: boolean;
  }>({ asanaIntegrations: [], categories: [], projects: [], aiUnavailable: false });
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
  const [prepDuration, setPrepDuration] = useState(15); // prep block length, mins

  // Step 3 — tasks
  const [taskCats, setTaskCats] = useState<WeekCandidateCategory[] | null>(null);
  const [selections, setSelections] = useState<Record<string, Set<string>>>({});
  const [tasksEngaged, setTasksEngaged] = useState(false);
  // Per-week block-length overrides (mins), keyed by category. Only holds
  // explicit user picks; a category not present here uses its configured default.
  const [taskDurations, setTaskDurations] = useState<Record<string, number>>({});

  // Step 4 — review / done
  const [proposals, setProposals] = useState<EditableProposal[]>([]);
  const [quotaSummary, setQuotaSummary] = useState<QuotaSummaryRow[]>([]);
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
    setPrepDuration(15);
    setTaskCats(null);
    setSelections({});
    setTasksEngaged(false);
    setTaskDurations({});
    setProposals([]);
    setQuotaSummary([]);
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

  const fetchPrep = useCallback(async (durationMinutes = prepDuration) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getPrepCandidates(undefined, durationMinutes);
      setPrepData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load meeting prep');
    } finally {
      setIsLoading(false);
    }
  }, [prepDuration]);

  // Changing the per-meeting prep length re-proposes slots (blocks are longer).
  const changePrepDuration = useCallback(
    (durationMinutes: number) => {
      setPrepDuration(durationMinutes);
      fetchPrep(durationMinutes);
    },
    [fetchPrep]
  );

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
      const data: ProposeWeekResponse = await api.proposeWeeklyPlan(body);
      setProposals(data.proposals.map(p => ({ ...p, accepted: true })));
      setQuotaSummary(data.quotaSummary);
      setWeekLabel(
        `${format(parseISO(data.weekStart), 'MMM d')} – ${format(parseISO(data.weekEnd), 'MMM d')}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to build your plan');
    } finally {
      setIsLoading(false);
    }
  }, [priorityIds, categoryOverrides, prepEngaged, acceptedPrepBlocks, tasksEngaged, taskCats, selections, taskDurations]);

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
        const data = await api.getPrepCandidates(undefined, prepDuration);
        setPrepData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update prep decision');
      } finally {
        setPrepBusy(false);
      }
    },
    [prepDuration]
  );

  // --- Step 3 actions ---

  // remainingQuota === null means no cap (no-quota catch-all category).
  const toggleSelection = (category: string, id: string, remainingQuota: number | null) => {
    setSelections(prev => {
      const set = new Set(prev[category] ?? []);
      if (set.has(id)) set.delete(id);
      else if (remainingQuota === null || set.size < remainingQuota) set.add(id);
      return { ...prev, [category]: set };
    });
  };

  // --- Step 4 actions ---

  const grouped = useMemo(() => {
    const map = new Map<string, EditableProposal[]>();
    for (const p of proposals) {
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
        setPrepEngaged(true);
        setStep('tasks');
        break;
      case 'tasks':
        setTasksEngaged(true);
        setStep('review');
        break;
      case 'review':
        confirm();
        break;
    }
  }, [step, matchRows, runMatch, confirmPriorities, confirm, applyTypes]);

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
              {step === 'type' && renderTypes()}
              {step === 'priorities' && renderPriorities()}
              {step === 'prep' && renderPrep()}
              {step === 'tasks' && renderTasks()}
              {(step === 'review' || step === 'done') && renderReview()}
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
                  {(isConfirming || isApplyingTypes || (isLoading && step === 'priorities')) && (
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

  // --- Step renderers (closures over state) ---

  function renderTypes() {
    if (typeLoading || typeRows === null) {
      return (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
          <p className="text-sm text-gray-500">
            Suggesting a Type for {untypedTasks.length} untyped task
            {untypedTasks.length === 1 ? '' : 's'}…
          </p>
        </div>
      );
    }

    const setChosen = (gid: string, value: string) =>
      setTypeRows(prev => (prev ? prev.map(r => (r.gid === gid ? { ...r, chosen: value } : r)) : prev));

    const keptCount = typeRows.filter(r => r.chosen).length;

    // Light grouping by integration keeps a long list scannable when more than
    // one Asana workspace is involved.
    const byIntegration = new Map<string, TypeRow[]>();
    for (const r of typeRows) {
      const key = r.integrationName || 'Asana';
      const list = byIntegration.get(key) ?? [];
      list.push(r);
      byIntegration.set(key, list);
    }
    const groups = [...byIntegration.entries()];
    const showGroupHeaders = groups.length > 1;

    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-600">
          {typeRows.length} task{typeRows.length === 1 ? '' : 's'} have no Type yet, so they&apos;re
          invisible to your weekly allocation. Review the suggested Type for each — override or leave
          untyped as needed — then apply.
        </p>
        {typeError && (
          <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>Couldn&apos;t auto-suggest types ({typeError}). Set them manually below.</span>
          </div>
        )}

        <div className="space-y-4">
          {groups.map(([name, rows]) => (
            <div key={name}>
              {showGroupHeaders && (
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">
                  {name}
                </h3>
              )}
              <ul className="space-y-1.5">
                {rows.map(r => (
                  <li key={r.gid} className="flex items-center gap-3">
                    <span className="text-sm text-gray-700 truncate flex-1" title={r.title}>
                      {r.title}
                    </span>
                    <select
                      value={r.chosen}
                      onChange={e => setChosen(r.gid, e.target.value)}
                      className={`text-xs border rounded px-1.5 py-1 outline-none focus:ring-2 focus:ring-orange-500 flex-shrink-0 max-w-[45%] ${
                        r.chosen ? 'border-gray-300 text-gray-700' : 'border-gray-200 text-gray-400'
                      }`}
                    >
                      <option value="">— leave untyped —</option>
                      {r.allowedTypes.map(t => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="text-xs text-gray-400">
          {keptCount} of {typeRows.length} will be written to Asana; the rest stay untyped. Skip to
          continue without typing.
        </p>
      </div>
    );
  }

  function renderPriorities() {
    if (matchRows === null) {
      return (
        <div>
          <p className="text-sm text-gray-600 mb-3">
            What matters most this week? These get matched against your Asana tasks (or created as
            new ones) and scheduled first.
          </p>
          <textarea
            value={priorityText}
            onChange={e => setPriorityText(e.target.value)}
            rows={6}
            placeholder={'One priority per line…\ne.g. Finish grant report\nPrep board deck'}
            className="w-full text-sm border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none resize-none"
          />
          <p className="mt-2 text-xs text-gray-400">
            Leave blank and press Skip (or Next) to plan without pinned priorities.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {matchMeta.aiUnavailable && (
          <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>
              AI matching is unavailable right now — every line will be created as a new Asana task.
            </span>
          </div>
        )}
        {matchRows.map((row, i) => {
          const color = row.category ? categoryColor(row.category) : null;
          return (
            <div key={i} className="rounded-lg border border-gray-200 p-3">
              <div className="flex items-start gap-2">
                {!row.match && (
                  <input
                    type="checkbox"
                    checked={row.include}
                    onChange={() =>
                      setMatchRows(prev =>
                        prev!.map((r, j) => (j === i ? { ...r, include: !r.include } : r))
                      )
                    }
                    className="mt-1 w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{row.text}</p>
                  {row.match ? (
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-700">
                        <Check className="w-3 h-3" />
                        Matched: {row.match.title}
                      </span>
                      {row.match.category ? (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${color!.bg} ${color!.text}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${color!.dot}`} />
                          {row.match.category}
                        </span>
                      ) : (
                        <label className="flex items-center gap-1 text-[11px] text-gray-500">
                          Category
                          {renderCategorySelect(row.category, val =>
                            setMatchRows(prev =>
                              prev!.map((r, j) => (j === i ? { ...r, category: val } : r))
                            )
                          )}
                        </label>
                      )}
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-[11px] text-gray-400">New Asana task</span>
                      {matchMeta.asanaIntegrations.length > 1 && (
                        <select
                          value={row.createIntegrationId}
                          onChange={e =>
                            setMatchRows(prev =>
                              prev!.map((r, j) =>
                                // Integration change invalidates the chosen project.
                                j === i
                                  ? { ...r, createIntegrationId: e.target.value, createProjectGid: '' }
                                  : r
                              )
                            )
                          }
                          className="text-xs border border-gray-300 rounded px-1.5 py-1 outline-none focus:ring-2 focus:ring-orange-500"
                        >
                          {matchMeta.asanaIntegrations.map(intg => (
                            <option key={intg.id} value={intg.id}>
                              {intg.name}
                            </option>
                          ))}
                        </select>
                      )}
                      {(() => {
                        const rowProjects = projectsForIntegration(row.createIntegrationId);
                        if (rowProjects.length === 0) return null;
                        const needsProject = row.include && !row.createProjectGid;
                        return (
                          <label className="flex items-center gap-1 text-[11px] text-gray-500">
                            Project
                            <select
                              value={row.createProjectGid}
                              onChange={e =>
                                setMatchRows(prev =>
                                  prev!.map((r, j) =>
                                    j === i ? { ...r, createProjectGid: e.target.value } : r
                                  )
                                )
                              }
                              className={`text-xs border rounded px-1.5 py-1 outline-none focus:ring-2 focus:ring-orange-500 ${
                                needsProject ? 'border-red-400' : 'border-gray-300'
                              }`}
                            >
                              <option value="">Select project…</option>
                              {rowProjects.map(p => (
                                <option key={p.gid} value={p.gid}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        );
                      })()}
                      <label className="flex items-center gap-1 text-[11px] text-gray-500">
                        Category
                        {renderCategorySelect(row.category, val =>
                          setMatchRows(prev =>
                            prev!.map((r, j) => (j === i ? { ...r, category: val } : r))
                          )
                        )}
                      </label>
                      {row.include &&
                        projectsForIntegration(row.createIntegrationId).length > 0 &&
                        !row.createProjectGid && (
                          <p className="w-full text-[11px] text-red-500">
                            Choose a project for this new task.
                          </p>
                        )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {createdTasks.length > 0 && (
          <p className="text-xs text-gray-400">
            {createdTasks.length} new task{createdTasks.length === 1 ? '' : 's'} already created in
            Asana — they won&apos;t be recreated.
          </p>
        )}
      </div>
    );
  }

  function renderCategorySelect(value: string, onChange: (v: string) => void) {
    return (
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="text-xs border border-gray-300 rounded px-1.5 py-1 outline-none focus:ring-2 focus:ring-orange-500"
      >
        {matchMeta.categories.map(c => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    );
  }

  function renderPrep() {
    if (!prepData) {
      return (
        <p className="text-sm text-gray-400 italic py-8 text-center">No meeting data available.</p>
      );
    }
    const suggested = prepData.meetings.filter(m => m.needsPrep && m.block);
    const others = prepData.meetings.filter(m => !m.needsPrep);

    return (
      <div className={`space-y-5 ${prepBusy ? 'opacity-60 pointer-events-none' : ''}`}>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          Prep time per meeting
          <select
            value={prepDuration}
            onChange={e => changePrepDuration(Number(e.target.value))}
            disabled={prepBusy || isLoading}
            className="text-sm border border-gray-300 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:opacity-50"
          >
            <option value={15}>15 mins</option>
            <option value={30}>30 mins</option>
            <option value={60}>1 hour</option>
          </select>
        </label>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
            Suggested prep
          </h3>
          {suggested.length === 0 ? (
            <p className="text-sm text-gray-400 italic">
              No meetings this week look like they need prep.
            </p>
          ) : (
            <ul className="space-y-2">
              {suggested.map(m => {
                const b = m.block!;
                return (
                  <li
                    key={m.eventId}
                    className="flex items-start gap-3 rounded-lg border border-gray-200 p-3"
                  >
                    <input
                      type="checkbox"
                      checked
                      onChange={() => setPrepDecision(m.title, false)}
                      className="mt-0.5 w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">{m.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        <span className="font-medium text-slate-600">
                          {format(parseISO(b.date), 'EEE')} {timeRange(b.start, b.durationMinutes)}
                        </span>{' '}
                        · {m.reason}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {prepData.unplaced.length > 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
            <p className="text-xs font-medium text-amber-800 mb-1">Couldn&apos;t fit prep for:</p>
            <ul className="text-xs text-amber-700 space-y-0.5">
              {prepData.unplaced.map(u => (
                <li key={u.key}>{u.title}</li>
              ))}
            </ul>
          </div>
        )}

        {others.length > 0 && (
          <div>
            <button
              onClick={() => setShowOtherMeetings(v => !v)}
              className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-400 hover:text-gray-600"
            >
              <ChevronRight
                className={`w-3.5 h-3.5 transition-transform ${showOtherMeetings ? 'rotate-90' : ''}`}
              />
              Other meetings ({others.length})
            </button>
            {showOtherMeetings && (
              <ul className="mt-2 space-y-2">
                {others.map(m => (
                  <li
                    key={m.eventId}
                    className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3"
                  >
                    <input
                      type="checkbox"
                      checked={false}
                      onChange={() => setPrepDecision(m.title, true)}
                      className="mt-0.5 w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700">{m.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {format(parseISO(m.date), 'EEE')} {m.start} · add a prep block
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderTasks() {
    if (!taskCats) {
      return (
        <p className="text-sm text-gray-400 italic py-8 text-center">No candidates available.</p>
      );
    }
    if (taskCats.length === 0) {
      return (
        <p className="text-sm text-gray-400 italic py-8 text-center">
          No quota categories to fill this week.
        </p>
      );
    }
    return (
      <div className="space-y-5">
        {taskCats.map(cat => {
          const color = categoryColor(cat.category);
          const picked = selections[cat.category] ?? new Set<string>();
          // No-quota categories have no cap; autoSelect never applies to them.
          const autoN = cat.remainingQuota === null
            ? cat.candidates.length
            : Math.min(cat.remainingQuota, cat.candidates.length);
          const defaultDuration = cat.targetLengthMinutes || 30;
          return (
            <div key={cat.category} className="rounded-lg border border-gray-200 p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${color.bg} ${color.text}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${color.dot}`} />
                  {cat.category}
                </span>
                <div className="flex items-center gap-3">
                  {cat.autoSelect ? (
                    <span className="text-[11px] text-gray-400">
                      Auto-picking {autoN} task{autoN === 1 ? '' : 's'}
                    </span>
                  ) : cat.remainingQuota === null ? (
                    <span className="text-[11px] text-gray-400">
                      Pick any · {picked.size} selected
                    </span>
                  ) : (
                    <span className="text-[11px] text-gray-400">
                      Pick up to {cat.remainingQuota} · {picked.size} selected
                    </span>
                  )}
                  <label className="flex items-center gap-1.5 text-[11px] text-gray-500">
                    Block length
                    <select
                      value={taskDurations[cat.category] ?? defaultDuration}
                      onChange={e =>
                        setTaskDurations(prev => ({ ...prev, [cat.category]: Number(e.target.value) }))
                      }
                      className="text-sm border border-gray-300 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    >
                      {blockLengthOptions(defaultDuration).map(o => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              {cat.candidates.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No candidate tasks.</p>
              ) : cat.autoSelect ? (
                <ul className="space-y-1">
                  {cat.candidates.slice(0, autoN).map(c => (
                    <li key={c.id} className="text-sm text-gray-500 truncate">
                      {c.title}
                    </li>
                  ))}
                </ul>
              ) : (
                <>
                  <ul className="space-y-1.5">
                    {cat.candidates.map(c => {
                      const checked = picked.has(c.id);
                      const atCap =
                        cat.remainingQuota !== null && picked.size >= cat.remainingQuota;
                      return (
                        <li key={c.id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!checked && atCap}
                            onChange={() =>
                              toggleSelection(cat.category, c.id, cat.remainingQuota)
                            }
                            className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500 disabled:opacity-40"
                          />
                          {c.isPriority && (
                            <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 flex-shrink-0" />
                          )}
                          <span className="text-sm text-gray-700 truncate flex-1">{c.title}</span>
                          {c.dueDate && (
                            <span className="text-[11px] text-gray-400 flex-shrink-0">
                              {format(parseISO(c.dueDate), 'MMM d')}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {cat.remainingQuota !== null && picked.size < cat.remainingQuota && (
                    <p className="mt-2 text-[11px] text-gray-400">
                      {cat.remainingQuota - picked.size} unpicked slot
                      {cat.remainingQuota - picked.size === 1 ? '' : 's'} will be kept as reserved
                      time.
                    </p>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  function renderReview() {
    if (proposals.length === 0) {
      return (
        <p className="text-sm text-gray-400 italic py-8 text-center">
          Nothing to schedule — quotas are already met or no free time is available this week.
        </p>
      );
    }
    return (
      <>
        {quotaSummary.some(q => q.unmet > 0) && (
          <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 p-3">
            <p className="text-xs font-medium text-amber-800 mb-1">Quota not fully met</p>
            <ul className="text-xs text-amber-700 space-y-0.5">
              {quotaSummary
                .filter(q => q.unmet > 0)
                .map(q => (
                  <li key={q.category}>
                    {q.category}: {q.existing + q.proposed}/{q.weeklyCount} scheduled ({q.unmet}{' '}
                    short)
                  </li>
                ))}
            </ul>
          </div>
        )}

        <div className="space-y-4">
          {grouped.map(group => (
            <div key={group.date}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
                {format(parseISO(group.date), 'EEEE, MMM d')}
              </h3>
              <ul className="space-y-2">
                {group.items.map(p => {
                  const isPrep = p.kind === 'prep';
                  const isGrouped = Array.isArray(p.tasks);
                  const color = categoryColor(p.category);
                  const result = results[p.id];
                  const label = isPrep
                    ? p.meeting?.title ?? 'Prep'
                    : isGrouped
                      ? `${p.tasks!.length} task${p.tasks!.length === 1 ? '' : 's'}`
                      : p.task
                        ? p.task.title
                        : 'Reserved';
                  return (
                    <li
                      key={p.id}
                      className={`flex items-center gap-3 rounded-lg border p-3 ${
                        p.accepted ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={p.accepted}
                        onChange={() => toggleAccept(p.id)}
                        disabled={hasResults}
                        className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {isPrep ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                              Prep
                            </span>
                          ) : (
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${color.bg} ${color.text}`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${color.dot}`} />
                              {p.category}
                            </span>
                          )}
                          <span
                            className="text-sm font-medium text-gray-800 truncate"
                            title={p.reason}
                          >
                            {label}
                          </span>
                        </div>
                        {/* Grouped block: list its assigned tasks as an agenda. */}
                        {isGrouped && p.tasks!.length > 0 && (
                          <ul className="mt-1.5 space-y-0.5 pl-1">
                            {p.tasks!.map((t, i) => (
                              <li key={t.gid ?? t.adhocId ?? i} className="text-xs text-gray-500 truncate">
                                • {t.title}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <input
                        type="time"
                        value={p.start}
                        onChange={e => editStart(p.id, e.target.value)}
                        disabled={hasResults}
                        className="text-sm border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
                        title={timeRange(p.start, p.durationMinutes)}
                      />
                      {result &&
                        (result.success ? (
                          <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        ) : (
                          <AlertTriangle
                            className="w-4 h-4 text-red-500 flex-shrink-0"
                            aria-label={result.error}
                          />
                        ))}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </>
    );
  }
}
