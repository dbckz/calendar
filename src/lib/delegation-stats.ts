// Aggregate stats over the delegation runs, read from the per-run JSONL traces
// the orchestrator already writes (see AGENT_RUNS_DIR in lib/data-paths).
//
// Each trace ends with a `result` record carrying the outcome, wall-clock
// duration and cost, so the numbers come from what the runs actually did rather
// than from anything the app has to maintain separately.
//
// Trace files are named `<taskGid>-<startedAtMs>.jsonl`, which is where the task
// and the timestamp come from.
//
// Server-only: reads the filesystem.

import fs from 'fs';
import path from 'path';

import { AGENT_RUNS_DIR } from './data-paths';

export interface DelegationRun {
  taskGid: string;
  startedAt: string; // ISO
  success: boolean;
  durationMs?: number;
  costUsd?: number;
  turns?: number;
}

export interface DelegationStats {
  runs: number;
  // Runs that finished without an error, over runs that produced a result.
  successRate: number | null;
  // Median rather than mean: one 40-minute outlier shouldn't set the
  // expectation for a typical run.
  medianDurationMs: number | null;
  totalCostUsd: number;
  averageCostUsd: number | null;
  // Most recent first, for a compact "recent runs" list.
  recent: DelegationRun[];
}

const FILENAME = /^(\d+)-(\d+)\.jsonl$/;

// A trace whose result record never arrived — the run is still going, or it
// died. Those are excluded from the rates rather than counted as failures,
// which would make an in-progress run look like a problem.
interface ParsedTrace {
  run?: DelegationRun;
}

function parseTrace(dir: string, filename: string): ParsedTrace {
  const match = filename.match(FILENAME);
  if (!match) return {};
  const [, taskGid, startedMs] = match;

  let contents: string;
  try {
    contents = fs.readFileSync(path.join(dir, filename), 'utf-8');
  } catch {
    return {};
  }

  // The result record is the last meaningful line; scan from the end so a long
  // trace isn't parsed in full.
  const lines = contents.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line || !line.includes('"result"')) continue;
    try {
      const record = JSON.parse(line) as {
        type?: string;
        is_error?: boolean;
        duration_ms?: number;
        total_cost_usd?: number;
        num_turns?: number;
      };
      if (record.type !== 'result') continue;
      return {
        run: {
          taskGid,
          startedAt: new Date(Number(startedMs)).toISOString(),
          success: !record.is_error,
          ...(typeof record.duration_ms === 'number' ? { durationMs: record.duration_ms } : {}),
          ...(typeof record.total_cost_usd === 'number' ? { costUsd: record.total_cost_usd } : {}),
          ...(typeof record.num_turns === 'number' ? { turns: record.num_turns } : {}),
        },
      };
    } catch {
      // A truncated final line is normal for a run still being written.
      continue;
    }
  }
  return {};
}

export function summariseRuns(runs: DelegationRun[], recentLimit = 5): DelegationStats {
  const ordered = [...runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const durations = ordered
    .map(r => r.durationMs)
    .filter((d): d is number => typeof d === 'number')
    .sort((a, b) => a - b);
  const costs = ordered.map(r => r.costUsd).filter((c): c is number => typeof c === 'number');
  const totalCostUsd = costs.reduce((sum, c) => sum + c, 0);

  return {
    runs: ordered.length,
    successRate: ordered.length > 0 ? ordered.filter(r => r.success).length / ordered.length : null,
    medianDurationMs: durations.length > 0 ? median(durations) : null,
    totalCostUsd: round2(totalCostUsd),
    averageCostUsd: costs.length > 0 ? round2(totalCostUsd / costs.length) : null,
    recent: ordered.slice(0, recentLimit),
  };
}

export function readDelegationStats(dir: string = AGENT_RUNS_DIR): DelegationStats {
  let filenames: string[];
  try {
    filenames = fs.readdirSync(dir);
  } catch {
    // No runs directory yet — a fresh install, not an error.
    return summariseRuns([]);
  }

  const runs = filenames
    .filter(f => f.endsWith('.jsonl'))
    .map(f => parseTrace(dir, f).run)
    .filter((r): r is DelegationRun => !!r);

  return summariseRuns(runs);
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
