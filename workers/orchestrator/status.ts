import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from './config';

const STALE_HEARTBEAT_MS = 30 * 60 * 1000; // 30 minutes
const HISTORY_LIMIT = 50;

export interface RunningState {
  pid: number;
  startedAt: string;
  heartbeatAt: string;
}

export interface CurrentTask {
  gid: string;
  title: string;
}

export interface HistoryEntry {
  ranAt: string;
  taskGid: string | null;
  title: string | null;
  finalStatus: string;
  summary: string;
}

export interface OrchestratorStatus {
  lastRunAt: string | null;
  running: RunningState | null;
  currentTask?: CurrentTask;
  history: HistoryEntry[];
  pausedUntil?: string | null;
}

function defaultStatus(): OrchestratorStatus {
  return { lastRunAt: null, running: null, history: [], pausedUntil: null };
}

export async function readStatus(): Promise<OrchestratorStatus> {
  try {
    const raw = await readFile(config.statusPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<OrchestratorStatus>;
    return {
      lastRunAt: parsed.lastRunAt ?? null,
      running: parsed.running ?? null,
      currentTask: parsed.currentTask,
      history: Array.isArray(parsed.history) ? parsed.history : [],
      pausedUntil: parsed.pausedUntil ?? null,
    };
  } catch {
    return defaultStatus();
  }
}

export async function writeStatus(status: OrchestratorStatus): Promise<void> {
  await mkdir(path.dirname(config.statusPath), { recursive: true });
  await writeFile(config.statusPath, `${JSON.stringify(status, null, 2)}\n`, 'utf8');
}

function pidIsAlive(pid: number): boolean {
  if (!pid || pid === process.pid) return pid === process.pid;
  try {
    // Signal 0 performs error checking without actually sending a signal.
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // ESRCH: no such process. EPERM: process exists but owned by another user.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * A `running` lock is considered stale (safe to steal) when the owning process
 * is dead or its heartbeat is older than STALE_HEARTBEAT_MS.
 */
export function isLockStale(running: RunningState | null, now = Date.now()): boolean {
  if (!running) return true;
  if (!pidIsAlive(running.pid)) return true;
  const heartbeat = Date.parse(running.heartbeatAt);
  if (Number.isNaN(heartbeat)) return true;
  return now - heartbeat > STALE_HEARTBEAT_MS;
}

/**
 * Attempt to claim the run lock. Returns the fresh status on success, or null
 * when another live orchestrator already holds a non-stale lock.
 */
export async function acquireLock(): Promise<OrchestratorStatus | null> {
  const status = await readStatus();

  if (status.running && !isLockStale(status.running)) {
    return null;
  }

  const nowIso = new Date().toISOString();
  status.running = {
    pid: process.pid,
    startedAt: nowIso,
    heartbeatAt: nowIso,
  };
  status.lastRunAt = nowIso;
  delete status.currentTask;
  await writeStatus(status);
  return status;
}

export async function setCurrentTask(task: CurrentTask | null): Promise<void> {
  const status = await readStatus();
  if (status.running && status.running.pid === process.pid) {
    status.running.heartbeatAt = new Date().toISOString();
  }
  if (task) {
    status.currentTask = task;
  } else {
    delete status.currentTask;
  }
  await writeStatus(status);
}

export async function heartbeat(): Promise<void> {
  const status = await readStatus();
  if (status.running && status.running.pid === process.pid) {
    status.running.heartbeatAt = new Date().toISOString();
    await writeStatus(status);
  }
}

export async function appendHistory(entry: HistoryEntry): Promise<void> {
  const status = await readStatus();
  status.history = [entry, ...status.history].slice(0, HISTORY_LIMIT);
  await writeStatus(status);
}

export async function releaseLock(): Promise<void> {
  const status = await readStatus();
  status.running = null;
  delete status.currentTask;
  await writeStatus(status);
}

// Record (or clear) a usage-limit backoff window. The pacer skips ticks until
// `pausedUntil` has passed.
export async function setPausedUntil(iso: string | null): Promise<void> {
  const status = await readStatus();
  status.pausedUntil = iso;
  await writeStatus(status);
}
