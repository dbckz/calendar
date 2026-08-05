'use client';

import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';

import { api } from '@/lib/api';
import { goalSections } from '@/lib/life-sections';
import { periodLabel, quarterKeyForMonth } from '@/lib/goal-periods';
import type { AsanaProject } from '@/types';
import type { Goal, GoalEvidenceKind, GoalPeriodKind } from '@/types/life';

const EVIDENCE_OPTIONS: Array<{ kind: GoalEvidenceKind; label: string; hint: string }> = [
  { kind: 'manual', label: 'Self-reported', hint: 'You type the figure in at check-in time.' },
  {
    kind: 'asana-project',
    label: 'Asana project',
    hint: 'Counts tasks completed in the project during the period.',
  },
  {
    kind: 'calendar-category',
    label: 'Calendar category',
    hint: 'Counts time booked against a time-tracking category.',
  },
  { kind: 'exercise', label: 'Exercise log', hint: 'Counts sessions (or minutes) logged.' },
];

interface GoalEditorModalProps {
  // Absent for a new goal.
  goal?: Goal | null;
  defaultSectionId: string;
  defaultPeriodKind: GoalPeriodKind;
  defaultPeriodKey: string;
  // Quarterly goals in the same section+quarter, offered as parents for a
  // monthly goal.
  parentCandidates: Goal[];
  onClose: () => void;
  onSaved: () => void;
}

export function GoalEditorModal({
  goal,
  defaultSectionId,
  defaultPeriodKind,
  defaultPeriodKey,
  parentCandidates,
  onClose,
  onSaved,
}: GoalEditorModalProps) {
  const [sectionId, setSectionId] = useState(goal?.sectionId ?? defaultSectionId);
  const [title, setTitle] = useState(goal?.title ?? '');
  const [detail, setDetail] = useState(goal?.detail ?? '');
  const [targetValue, setTargetValue] = useState(goal?.target ? String(goal.target.value) : '');
  const [targetUnit, setTargetUnit] = useState(goal?.target?.unit ?? '');
  const [evidenceKind, setEvidenceKind] = useState<GoalEvidenceKind>(goal?.evidence.kind ?? 'manual');
  const [evidenceRef, setEvidenceRef] = useState(goal?.evidence.ref ?? '');
  const [evidenceUnit, setEvidenceUnit] = useState<'count' | 'minutes'>(goal?.evidence.unit ?? 'count');
  const [parentGoalId, setParentGoalId] = useState(goal?.parentGoalId ?? '');
  const [projects, setProjects] = useState<AsanaProject[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Period is fixed for an existing goal — moving a goal between months would
  // rewrite history rather than edit it.
  const periodKind = goal?.periodKind ?? defaultPeriodKind;
  const periodKey = goal?.periodKey ?? defaultPeriodKey;

  useEffect(() => {
    if (evidenceKind !== 'asana-project' || projects.length > 0) return;
    api
      .getAsanaProjects()
      .then(res => setProjects(res.projects))
      .catch(err => console.error('Failed to load Asana projects:', err));
  }, [evidenceKind, projects.length]);

  const eligibleParents = useMemo(
    () =>
      parentCandidates.filter(
        p =>
          p.periodKind === 'quarter' &&
          p.sectionId === sectionId &&
          p.periodKey === quarterKeyForMonth(periodKey)
      ),
    [parentCandidates, sectionId, periodKey]
  );

  // Switching section can strip the selected parent of its validity.
  useEffect(() => {
    if (parentGoalId && !eligibleParents.some(p => p.id === parentGoalId)) setParentGoalId('');
  }, [eligibleParents, parentGoalId]);

  const save = async () => {
    if (!title.trim()) {
      setError('Give the goal a title.');
      return;
    }
    setSaving(true);
    setError(null);

    const parsedTarget = Number(targetValue);
    const payload = {
      title: title.trim(),
      detail: detail.trim() || undefined,
      target:
        targetValue.trim() && Number.isFinite(parsedTarget) && parsedTarget > 0
          ? { value: parsedTarget, unit: targetUnit.trim() || undefined }
          : undefined,
      evidence: {
        kind: evidenceKind,
        ...(evidenceKind !== 'manual' && evidenceRef.trim() ? { ref: evidenceRef.trim() } : {}),
        ...(evidenceKind === 'calendar-category' || evidenceKind === 'exercise'
          ? { unit: evidenceUnit }
          : {}),
      },
    };

    try {
      if (goal) {
        await api.updateGoal(goal.id, {
          ...payload,
          // '' clears the parent server-side.
          parentGoalId: periodKind === 'month' ? parentGoalId : '',
        });
      } else {
        await api.createGoal({
          sectionId,
          periodKind,
          periodKey,
          ...payload,
          ...(periodKind === 'month' && parentGoalId ? { parentGoalId } : {}),
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the goal.');
    } finally {
      setSaving(false);
    }
  };

  const evidenceHint = EVIDENCE_OPTIONS.find(o => o.kind === evidenceKind)?.hint;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">
            {goal ? 'Edit goal' : `New ${periodKind === 'month' ? 'monthly' : 'quarterly'} goal`}
            <span className="ml-2 text-sm font-normal text-gray-500">
              {periodLabel(periodKind, periodKey)}
            </span>
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="Close">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {!goal && (
            <Field label="Life area" htmlFor="goal-section">
              <select
                id="goal-section"
                value={sectionId}
                onChange={e => setSectionId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
              >
                {goalSections().map(s => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Goal" htmlFor="goal-title">
            <input
              id="goal-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="What are you aiming for?"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
              autoFocus
            />
          </Field>

          <Field label="Detail (optional)" htmlFor="goal-detail">
            <textarea
              id="goal-detail"
              value={detail}
              onChange={e => setDetail(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Target number (optional)" htmlFor="goal-target">
              <input
                id="goal-target"
                type="number"
                min="0"
                value={targetValue}
                onChange={e => setTargetValue(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
              />
            </Field>
            <Field label="Unit" htmlFor="goal-unit">
              <input
                id="goal-unit"
                value={targetUnit}
                onChange={e => setTargetUnit(e.target.value)}
                placeholder="sessions, posts, hours"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
              />
            </Field>
          </div>
          <p className="-mt-2 text-xs text-gray-500">
            A target is what makes pacing possible. Without one the goal is tracked by check-ins alone.
          </p>

          <Field label="Progress comes from" htmlFor="goal-evidence">
            <select
              id="goal-evidence"
              value={evidenceKind}
              onChange={e => {
                setEvidenceKind(e.target.value as GoalEvidenceKind);
                setEvidenceRef('');
              }}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
            >
              {EVIDENCE_OPTIONS.map(o => (
                <option key={o.kind} value={o.kind}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          {evidenceHint && <p className="-mt-2 text-xs text-gray-500">{evidenceHint}</p>}

          {evidenceKind === 'asana-project' && (
            <Field label="Project" htmlFor="goal-project">
              <select
                id="goal-project"
                value={evidenceRef}
                onChange={e => setEvidenceRef(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
              >
                <option value="">Choose a project…</option>
                {projects.map(p => (
                  <option key={p.gid} value={p.gid}>
                    {p.name} ({p.integrationName})
                  </option>
                ))}
              </select>
            </Field>
          )}

          {(evidenceKind === 'calendar-category' || evidenceKind === 'exercise') && (
            <div className="grid grid-cols-2 gap-3">
              <Field
                label={evidenceKind === 'exercise' ? 'Session type (blank = all)' : 'Category'}
                htmlFor="goal-ref"
              >
                <input
                  id="goal-ref"
                  value={evidenceRef}
                  onChange={e => setEvidenceRef(e.target.value)}
                  placeholder={evidenceKind === 'exercise' ? 'run' : 'Deep work'}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
                />
              </Field>
              <Field label="Count" htmlFor="goal-evidence-unit">
                <select
                  id="goal-evidence-unit"
                  value={evidenceUnit}
                  onChange={e => setEvidenceUnit(e.target.value as 'count' | 'minutes')}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
                >
                  <option value="count">Occurrences</option>
                  <option value="minutes">Minutes</option>
                </select>
              </Field>
            </div>
          )}

          {periodKind === 'month' && (
            <Field label="Sits under quarterly goal (optional)" htmlFor="goal-parent">
              <select
                id="goal-parent"
                value={parentGoalId}
                onChange={e => setParentGoalId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
                disabled={eligibleParents.length === 0}
              >
                <option value="">
                  {eligibleParents.length === 0
                    ? 'No quarterly goals in this area yet'
                    : 'Not linked to a quarterly goal'}
                </option>
                {eligibleParents.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 rounded-md hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save goal'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-xs font-semibold text-gray-600 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}
