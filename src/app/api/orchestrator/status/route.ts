import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { ORCHESTRATOR_STATUS_FILE } from '@/lib/data-paths';
import { OrchestratorStatus } from '@/types';

const EMPTY_STATUS: OrchestratorStatus = {
  lastRunAt: null,
  running: null,
  history: [],
};

// GET - Read the orchestrator worker's status file. Returns an empty default
// when the worker has never run (file missing) or the file is unreadable.
export async function GET() {
  try {
    const raw = await readFile(ORCHESTRATOR_STATUS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<OrchestratorStatus>;
    const status: OrchestratorStatus = {
      lastRunAt: parsed.lastRunAt ?? null,
      running: parsed.running ?? null,
      currentTask: parsed.currentTask,
      history: Array.isArray(parsed.history) ? parsed.history : [],
    };
    return NextResponse.json(status);
  } catch {
    return NextResponse.json(EMPTY_STATUS);
  }
}
