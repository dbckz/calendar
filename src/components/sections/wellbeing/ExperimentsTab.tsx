'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { ChevronDown, ChevronRight, Loader2, Plus, Trash2 } from 'lucide-react';

import { api } from '@/lib/api';
import type { Experiment, ExperimentStatus, ExperimentVerdict } from '@/types/wellbeing';

// The point of the tab, stated once at the top of an empty list: reading about
// an intervention is not trying it, and trying it without deciding in advance
// how to judge it is not learning anything.
const EMPTY_HINT =
  'An experiment is one change, run deliberately for a fixed stretch, with the way you’ll judge it written down before you start. Without a protocol you can’t tell whether you really did it; without a measure you can’t tell whether it worked.';

const STATUS_STYLE: Record<ExperimentStatus, { label: string; className: string }> = {
  planned: { label: 'Planned', className: 'bg-gray-100 text-gray-600' },
  running: { label: 'Running', className: 'bg-blue-100 text-blue-700' },
  complete: { label: 'Complete', className: 'bg-emerald-100 text-emerald-700' },
  abandoned: { label: 'Abandoned', className: 'bg-gray-100 text-gray-500' },
};

const VERDICT_STYLE: Record<ExperimentVerdict, { label: string; className: string }> = {
  worked: { label: 'Worked', className: 'bg-emerald-500 text-white' },
  mixed: { label: 'Mixed', className: 'bg-amber-500 text-white' },
  'no-effect': { label: 'No effect', className: 'bg-gray-500 text-white' },
  inconclusive: { label: 'Inconclusive', className: 'bg-indigo-500 text-white' },
};

const VERDICTS = Object.keys(VERDICT_STYLE) as ExperimentVerdict[];

export function ExperimentsTab() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.getExperiments();
      setExperiments(res.experiments);
      setError(null);
    } catch (err) {
      console.error('Failed to load experiments:', err);
      setError('Could not load your experiments.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Active work first, history underneath — the tab is opened to run something,
  // not to browse what already finished.
  const groups = useMemo(
    () => [
      { title: 'Running', items: experiments.filter(e => e.status === 'running') },
      { title: 'Planned', items: experiments.filter(e => e.status === 'planned') },
      {
        title: 'Finished',
        items: experiments.filter(e => e.status === 'complete' || e.status === 'abandoned'),
      },
    ],
    [experiments]
  );

  if (isLoading) return <p className="max-w-3xl mx-auto p-6 text-sm text-gray-500">Loading…</p>;

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          {experiments.length} experiment{experiments.length === 1 ? '' : 's'}
        </p>
        <button
          type="button"
          onClick={() => setFormOpen(o => !o)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-600"
        >
          <Plus className="h-4 w-4" />
          New experiment
        </button>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {error}
        </p>
      )}

      {formOpen && (
        <NewExperimentForm
          onCancel={() => setFormOpen(false)}
          onCreated={() => {
            setFormOpen(false);
            load();
          }}
        />
      )}

      {experiments.length === 0 && !formOpen ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <p className="text-sm font-medium text-gray-700">No experiments yet.</p>
          <p className="mt-1 text-sm leading-relaxed text-gray-500">{EMPTY_HINT}</p>
        </div>
      ) : (
        groups
          .filter(group => group.items.length > 0)
          .map(group => (
            <section key={group.title} className="mt-6">
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
                {group.title}
              </h3>
              <ul className="space-y-3">
                {group.items.map(experiment => (
                  <ExperimentCard key={experiment.id} experiment={experiment} onChanged={load} />
                ))}
              </ul>
            </section>
          ))
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// New experiment
// ---------------------------------------------------------------------------

const FIELD_CLASS =
  'w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400';

function NewExperimentForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [hypothesis, setHypothesis] = useState('');
  const [protocol, setProtocol] = useState('');
  const [measure, setMeasure] = useState('');
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await api.createExperiment({
        title,
        hypothesis,
        protocol,
        measure,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        // Dated from today or earlier, it is already under way — saying so here
        // saves a "start it" click that would only ever be clicked.
        status: startDate && startDate <= format(new Date(), 'yyyy-MM-dd') ? 'running' : 'planned',
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the experiment');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="space-y-3">
        <Field label="What are you trying?">
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="No screens for the first hour after waking"
            className={FIELD_CLASS}
          />
        </Field>
        <Field label="What do you expect to change?" hint="The hypothesis, in one line.">
          <input
            type="text"
            value={hypothesis}
            onChange={e => setHypothesis(e.target.value)}
            placeholder="Mornings feel less scattered and the pages get written"
            className={FIELD_CLASS}
          />
        </Field>
        <Field label="Exactly what will you do?" hint="Concrete enough to follow on a bad day.">
          <textarea
            value={protocol}
            onChange={e => setProtocol(e.target.value)}
            rows={2}
            placeholder="Phone stays in the kitchen overnight. No laptop before 8am."
            className={FIELD_CLASS}
          />
        </Field>
        <Field label="How will you judge it?" hint="Decide now, not at the end.">
          <input
            type="text"
            value={measure}
            onChange={e => setMeasure(e.target.value)}
            placeholder="Morning-pages rate over the four weeks, plus the daily check-in score"
            className={FIELD_CLASS}
          />
        </Field>
        <div className="flex flex-wrap gap-3">
          <Field label="Start">
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className={FIELD_CLASS}
            />
          </Field>
          <Field label="End" hint="A fixed end date is what makes it an experiment.">
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className={FIELD_CLASS}
            />
          </Field>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-2 text-sm text-gray-500 transition-colors hover:bg-gray-100"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!title.trim() || isSaving}
          className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block flex-1 min-w-[9rem]">
      <span className="block text-xs font-medium text-gray-700">{label}</span>
      {hint && <span className="block text-[11px] text-gray-400">{hint}</span>}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// One experiment
// ---------------------------------------------------------------------------

function ExperimentCard({
  experiment,
  onChanged,
}: {
  experiment: Experiment;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(experiment.status === 'running');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t save');
    } finally {
      setBusy(false);
    }
  };

  const status = STATUS_STYLE[experiment.status];
  const daysLeft =
    experiment.status === 'running' && experiment.endDate
      ? differenceInCalendarDays(parseISO(experiment.endDate), new Date())
      : null;

  return (
    <li className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          aria-expanded={expanded}
          className="mt-0.5 text-gray-400 transition-colors hover:text-gray-600"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-gray-900">{experiment.title}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${status.className}`}
            >
              {status.label}
            </span>
            {experiment.verdict && (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  VERDICT_STYLE[experiment.verdict].className
                }`}
              >
                {VERDICT_STYLE[experiment.verdict].label}
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-gray-400">
            {experiment.startDate ? format(parseISO(experiment.startDate), 'd MMM') : 'No start date'}
            {experiment.endDate ? ` – ${format(parseISO(experiment.endDate), 'd MMM')}` : ''}
            {daysLeft !== null &&
              (daysLeft >= 0
                ? ` · ${daysLeft} day${daysLeft === 1 ? '' : 's'} to go`
                : ` · ended ${-daysLeft} day${daysLeft === -1 ? '' : 's'} ago`)}
            {experiment.checkIns.length > 0 &&
              ` · ${experiment.checkIns.length} check-in${experiment.checkIns.length === 1 ? '' : 's'}`}
          </div>
        </div>

        <button
          type="button"
          onClick={() => run(() => api.deleteExperiment(experiment.id))}
          disabled={busy}
          aria-label="Delete experiment"
          className="text-gray-300 transition-colors hover:text-rose-500 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {expanded && (
        <div className="mt-3 space-y-3 pl-7">
          <Detail label="Hypothesis" value={experiment.hypothesis} />
          <Detail label="Protocol" value={experiment.protocol} />
          <Detail label="How it’s judged" value={experiment.measure} />

          {experiment.checkIns.length > 0 && <CheckInHistory experiment={experiment} />}

          {experiment.status === 'planned' && (
            <button
              type="button"
              onClick={() => run(() => api.updateExperiment(experiment.id, { status: 'running' }))}
              disabled={busy}
              className="rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              Start it
            </button>
          )}

          {(experiment.status === 'running' || experiment.status === 'planned') && (
            <>
              <CheckInForm
                onSubmit={(rating, note) =>
                  run(() => api.checkInExperiment(experiment.id, { rating, note }))
                }
                busy={busy}
              />
              <ConcludeForm
                onConclude={(verdict, reflection) =>
                  run(() =>
                    api.updateExperiment(experiment.id, { status: 'complete', verdict, reflection })
                  )
                }
                onAbandon={() =>
                  run(() => api.updateExperiment(experiment.id, { status: 'abandoned' }))
                }
                busy={busy}
              />
            </>
          )}

          {experiment.reflection && (
            <Detail label="What you concluded" value={experiment.reflection} />
          )}

          {(experiment.status === 'complete' || experiment.status === 'abandoned') && (
            <button
              type="button"
              onClick={() =>
                run(() => api.updateExperiment(experiment.id, { status: 'running', verdict: '' }))
              }
              disabled={busy}
              className="rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              Reopen
            </button>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )}
    </li>
  );
}

function Detail({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-gray-400">{label}</div>
      <p className="text-sm text-gray-700 whitespace-pre-wrap">{value}</p>
    </div>
  );
}

// Ratings as a row of bars, oldest to newest — enough to see a trend without a
// chart library, and it degrades gracefully when only notes were recorded.
function CheckInHistory({ experiment }: { experiment: Experiment }) {
  const rated = experiment.checkIns.filter(c => typeof c.rating === 'number');
  const latest = experiment.checkIns.slice(-3).reverse();

  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-gray-400">Check-ins</div>
      {rated.length > 0 && (
        <div className="mt-1 flex items-end gap-1" aria-hidden>
          {rated.map((c, i) => (
            <div
              key={i}
              title={`${c.rating}/5`}
              className="w-2 rounded-sm bg-blue-400"
              style={{ height: `${((c.rating as number) / 5) * 24 + 4}px` }}
            />
          ))}
        </div>
      )}
      <ul className="mt-1.5 space-y-1">
        {latest.map((c, i) => (
          <li key={i} className="text-xs text-gray-600">
            <span className="text-gray-400">{format(parseISO(c.at), 'd MMM')}</span>
            {typeof c.rating === 'number' && <span className="ml-1.5 tabular-nums">{c.rating}/5</span>}
            {c.note && <span className="ml-1.5">{c.note}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CheckInForm({
  onSubmit,
  busy,
}: {
  onSubmit: (rating: number | undefined, note: string) => void;
  busy: boolean;
}) {
  const [rating, setRating] = useState<number | undefined>(undefined);
  const [note, setNote] = useState('');

  const submit = () => {
    onSubmit(rating, note);
    setRating(undefined);
    setNote('');
  };

  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 p-2.5">
      <div className="text-[11px] font-medium text-gray-600">How’s it going?</div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-md border border-gray-200 text-xs font-medium">
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(r => (r === n ? undefined : n))}
              aria-pressed={rating === n}
              className={`px-2 py-1 transition-colors ${
                rating === n ? 'bg-blue-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Anything worth remembering"
          className="min-w-[10rem] flex-1 rounded-md border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-orange-400"
        />
        <button
          type="button"
          onClick={submit}
          disabled={busy || (rating === undefined && !note.trim())}
          className="rounded-md bg-gray-800 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Log
        </button>
      </div>
    </div>
  );
}

function ConcludeForm({
  onConclude,
  onAbandon,
  busy,
}: {
  onConclude: (verdict: ExperimentVerdict, reflection: string) => void;
  onAbandon: () => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [verdict, setVerdict] = useState<ExperimentVerdict | null>(null);
  const [reflection, setReflection] = useState('');

  if (!open) {
    return (
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
        >
          Call it
        </button>
        <button
          type="button"
          onClick={onAbandon}
          disabled={busy}
          className="rounded-md border border-transparent px-2.5 py-1 text-xs text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600 disabled:opacity-50"
        >
          Abandon
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 p-2.5">
      <div className="text-[11px] font-medium text-gray-600">Did it work?</div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {VERDICTS.map(v => (
          <button
            key={v}
            type="button"
            onClick={() => setVerdict(v)}
            aria-pressed={verdict === v}
            className={`rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
              verdict === v
                ? VERDICT_STYLE[v].className + ' border-transparent'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            {VERDICT_STYLE[v].label}
          </button>
        ))}
      </div>
      <textarea
        value={reflection}
        onChange={e => setReflection(e.target.value)}
        rows={2}
        placeholder="What actually happened, and would you keep it?"
        className="mt-2 w-full rounded-md border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-orange-400"
      />
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-2 py-1 text-xs text-gray-500 transition-colors hover:text-gray-700"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => verdict && onConclude(verdict, reflection)}
          disabled={!verdict || busy}
          className="rounded-md bg-orange-500 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Save verdict
        </button>
      </div>
    </div>
  );
}
