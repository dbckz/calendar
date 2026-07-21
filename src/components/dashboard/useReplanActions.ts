'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { api, type ReplanAnalyzeResponse, type ReplanConfirmResult, type ReplanAdditionResult } from '@/lib/api';

// Per-missed-row action: reschedule to the proposed slot, or mark done.
export type MoveMode = 'reschedule' | 'done';
// Per-stale-row action: leave untouched, mark done, or dismiss (delete record).
export type StaleMode = 'leave' | 'done' | 'dismiss';
// Per-unplaceable-row action: defer to next week (default), leave unscheduled,
// or move into the evening overflow slot (only when one was found).
export type UnplaceableMode = 'defer' | 'leave' | 'overflow';

// Shared state + confirm logic for the replan "plan view" (moves / stale /
// additions / deletions / unplaceable / kept). Extracted from ReplanWeekModal so
// the daily-review flow can reuse the exact same review + confirm behaviour.
// Resets whenever `data` changes (a fresh analyze).
export function useReplanActions(data: ReplanAnalyzeResponse | null, onApplied?: () => void) {
  const [included, setIncluded] = useState<Set<string>>(new Set());
  const [moveMode, setMoveMode] = useState<Record<string, MoveMode>>({});
  const [staleMode, setStaleMode] = useState<Record<string, StaleMode>>({});
  const [unplaceableMode, setUnplaceableMode] = useState<Record<string, UnplaceableMode>>({});
  const [additionIncluded, setAdditionIncluded] = useState<Set<string>>(new Set());
  const [additionResults, setAdditionResults] = useState<Record<string, ReplanAdditionResult>>({});
  const [deletionIncluded, setDeletionIncluded] = useState<Set<string>>(new Set());
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [results, setResults] = useState<Record<string, ReplanConfirmResult>>({});
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed defaults on each fresh analyze.
  useEffect(() => {
    if (!data) return;
    setIncluded(new Set(data.moves.map(m => m.googleEventId)));
    setMoveMode(Object.fromEntries(data.moves.map(m => [m.googleEventId, 'reschedule' as MoveMode])));
    setStaleMode(Object.fromEntries((data.stale ?? []).map(s => [s.googleEventId, 'leave' as StaleMode])));
    // Default every unplaceable row to "defer to next week".
    setUnplaceableMode(
      Object.fromEntries((data.unplaceable ?? []).map(u => [u.googleEventId, 'defer' as UnplaceableMode]))
    );
    setAdditionIncluded(new Set((data.additions ?? []).map(a => a.id)));
    setAdditionResults({});
    setDeletionIncluded(new Set((data.deletions ?? []).map(d => d.googleEventId)));
    setShowUnchanged(false);
    setIsConfirming(false);
    setResults({});
    setDone(false);
    setError(null);
  }, [data]);

  const stale = useMemo(() => data?.stale ?? [], [data]);
  const additions = useMemo(() => data?.additions ?? [], [data]);
  const deletions = useMemo(() => data?.deletions ?? [], [data]);

  const hasResults =
    Object.keys(results).length > 0 || Object.keys(additionResults).length > 0;

  // Partition the confirm payload from the per-row choices.
  const payload = useMemo(() => {
    const moves: Array<{ googleEventId: string; googleIntegrationId?: string; date: string; start: string; durationMinutes: number }> = [];
    const doneIds: string[] = [];
    const dismissIds: string[] = [];
    const defer: Array<{ taskIds: string[]; googleEventId?: string }> = [];
    const leaveUnscheduled: string[] = [];
    if (data) {
      for (const m of data.moves) {
        if (!included.has(m.googleEventId)) continue;
        if (m.reason === 'missed' && moveMode[m.googleEventId] === 'done') {
          doneIds.push(m.googleEventId);
        } else {
          moves.push({
            googleEventId: m.googleEventId,
            googleIntegrationId: m.googleIntegrationId,
            date: m.newDate,
            start: m.newStart,
            durationMinutes: m.durationMinutes,
          });
        }
      }
      for (const s of stale) {
        const mode = staleMode[s.googleEventId];
        if (mode === 'done') doneIds.push(s.googleEventId);
        else if (mode === 'dismiss') dismissIds.push(s.googleEventId);
      }
      // Unplaceable rows: overflow → a move into the evening slot; defer → park
      // the tasks; leave → clear any override.
      for (const u of data.unplaceable) {
        const mode = unplaceableMode[u.googleEventId] ?? 'defer';
        if (mode === 'overflow' && u.overflowOption) {
          moves.push({
            googleEventId: u.googleEventId,
            googleIntegrationId: u.googleIntegrationId,
            date: u.overflowOption.date,
            start: u.overflowOption.start,
            durationMinutes: u.overflowOption.durationMinutes,
          });
        } else if (mode === 'leave') {
          leaveUnscheduled.push(u.googleEventId);
        } else {
          defer.push({ taskIds: u.deferTaskIds ?? [], googleEventId: u.googleEventId });
        }
      }
    }
    const additionBlocks = additions.filter(a => additionIncluded.has(a.id));
    const deletionBlocks = deletions
      .filter(d => deletionIncluded.has(d.googleEventId))
      .map(d => ({ googleEventId: d.googleEventId, googleIntegrationId: d.googleIntegrationId }));
    return { moves, doneIds, dismissIds, defer, leaveUnscheduled, additionBlocks, deletionBlocks };
  }, [data, included, moveMode, stale, staleMode, unplaceableMode, additions, additionIncluded, deletions, deletionIncluded]);

  const actionCount =
    payload.moves.length +
    payload.doneIds.length +
    payload.dismissIds.length +
    payload.defer.length +
    payload.leaveUnscheduled.length +
    payload.additionBlocks.length +
    payload.deletionBlocks.length;

  const toggle = useCallback((id: string) =>
    setIncluded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    }), []);

  const toggleAddition = useCallback((id: string) =>
    setAdditionIncluded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    }), []);

  const toggleDeletion = useCallback((id: string) =>
    setDeletionIncluded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    }), []);

  const confirm = useCallback(async () => {
    if (!data || actionCount === 0) return;
    setIsConfirming(true);
    setError(null);
    try {
      const { results: res, doneResults, deferResults, additionResults: addRes } = await api.confirmReplan(
        payload.moves,
        payload.doneIds,
        payload.dismissIds,
        payload.additionBlocks,
        payload.deletionBlocks,
        undefined,
        undefined,
        payload.defer,
        payload.leaveUnscheduled
      );
      const map: Record<string, ReplanConfirmResult> = {};
      for (const r of [...res, ...doneResults]) map[r.googleEventId] = r;
      // Fold defer / leave results (which carry an optional googleEventId) into
      // the same per-row map so unplaceable rows can show a status icon.
      for (const r of deferResults ?? []) {
        if (r.googleEventId) map[r.googleEventId] = { googleEventId: r.googleEventId, success: r.success, error: r.error };
      }
      setResults(map);
      const addMap: Record<string, ReplanAdditionResult> = {};
      for (const r of addRes ?? []) addMap[r.id] = r;
      setAdditionResults(addMap);
      if ([...res, ...doneResults, ...(deferResults ?? []), ...(addRes ?? [])].some(r => r.success)) onApplied?.();
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply changes');
    } finally {
      setIsConfirming(false);
    }
  }, [data, actionCount, payload, onApplied]);

  return {
    // per-row selection state
    included,
    moveMode,
    setMoveMode,
    staleMode,
    setStaleMode,
    unplaceableMode,
    setUnplaceableMode,
    additionIncluded,
    additionResults,
    deletionIncluded,
    showUnchanged,
    setShowUnchanged,
    toggle,
    toggleAddition,
    toggleDeletion,
    // results / status
    results,
    hasResults,
    actionCount,
    isConfirming,
    done,
    error,
    confirm,
  };
}

export type ReplanActions = ReturnType<typeof useReplanActions>;
