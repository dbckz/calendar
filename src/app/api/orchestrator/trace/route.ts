import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { AGENT_RUNS_DIR } from '@/lib/data-paths';

// GET ?file=<basename> - Read a per-run JSONL trace and return its parsed events.
// Tolerant of a trailing partial line (the runner appends live). Returns an
// empty list when the file is missing/unreadable, like the status route.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const file = searchParams.get('file');
    if (!file) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }

    // Basename only — reject any path traversal.
    const base = path.basename(file);
    if (base !== file || file.includes('..') || file.includes('/')) {
      return NextResponse.json({ error: 'invalid file' }, { status: 400 });
    }

    let raw: string;
    try {
      raw = await readFile(path.join(AGENT_RUNS_DIR, base), 'utf8');
    } catch {
      return NextResponse.json({ events: [] });
    }

    const events: unknown[] = [];
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        events.push(JSON.parse(trimmed));
      } catch {
        // Trailing partial line during a live run — ignore.
      }
    }
    return NextResponse.json({ events });
  } catch (error) {
    console.error('Error reading delegation trace:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to read trace' },
      { status: 500 }
    );
  }
}
