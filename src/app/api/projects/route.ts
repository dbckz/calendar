import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';

import { scanProjects } from '@/lib/projects/scan';
import { summariseProjects } from '@/lib/projects/summarise';

const run = promisify(execFile);

// GET /api/projects?includeDormant=1&refresh=1
//
// The side-project repos, what has happened in them lately, and a one-line
// summary of each. Summaries are cached against the last commit SHA, so a
// normal load costs a git scan and nothing else.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const includeDormant = searchParams.get('includeDormant') === '1';
    const refresh = searchParams.get('refresh') === '1';

    const all = await scanProjects();
    const visible = includeDormant ? all : all.filter(p => !p.dormant);

    // Commit subjects are fetched lazily, only for projects that actually need
    // a new summary — on the cached path that is none of them.
    const summaries = await summariseProjects(
      visible,
      async project => {
        try {
          const { stdout } = await run(
            'git',
            ['-C', project.path, 'log', '--since=60.days', '--format=%s', '-n', '12'],
            { timeout: 10_000 }
          );
          return stdout.trim().split('\n').filter(Boolean);
        } catch {
          return [];
        }
      },
      { refresh }
    );

    return NextResponse.json({
      projects: visible.map(p => ({ ...p, summary: summaries[p.name] ?? null })),
      dormantCount: all.length - visible.length,
    });
  } catch (error) {
    console.error('Error scanning projects:', error);
    return NextResponse.json({ error: 'Failed to scan projects' }, { status: 500 });
  }
}
