import { NextRequest, NextResponse } from 'next/server';

import { parseSheetMarkdown } from '@/lib/exercise-parse';
import { upsertSessionByImportKey } from '@/lib/storage/exercise';

// POST /api/exercise/import-sheet
//   { markdown: "<the training log as a markdown table>", defaultYear?: 2026,
//     dryRun?: true }
//
// Imports the training-log spreadsheet. The route takes the sheet's CONTENT
// rather than fetching it: the app's own Google token only carries `drive.file`
// (per-file access to documents it created), so it cannot read a pre-existing
// sheet. Passing the content in keeps the import runnable and repeatable
// without widening the app's Drive scope.
//
// Idempotent — each session is keyed by `sheet:<date>`, so re-running after
// adding rows updates rather than duplicates.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const markdown = typeof body.markdown === 'string' ? body.markdown : '';
    if (!markdown.trim()) {
      return NextResponse.json({ error: 'markdown is required' }, { status: 400 });
    }

    const defaultYear =
      typeof body.defaultYear === 'number' ? body.defaultYear : new Date().getFullYear();
    const parsed = parseSheetMarkdown(markdown, defaultYear);

    if (body.dryRun) {
      // Lets the parse be checked against the sheet before anything is written.
      return NextResponse.json({
        dryRun: true,
        sessions: parsed.length,
        exercises: parsed.reduce((n, s) => n + s.exercises.length, 0),
        parsed,
      });
    }

    let created = 0;
    let updated = 0;
    for (const session of parsed) {
      const result = await upsertSessionByImportKey(`sheet:${session.date}`, {
        date: session.date,
        // The log is strength-led; a session whose exercises are all cardio is
        // labelled from its content rather than assumed.
        type: sessionType(session.exercises),
        ...(session.label ? { label: session.label } : {}),
        // A sheet row is a record of exercises actually done, so each entry is
        // marked done — that's what the "exercises done" count reads.
        exercises: session.exercises.map(e => ({ ...e, done: true })),
        planned: false,
        completed: true,
        source: 'sheet',
      });
      if (result.created) created++;
      else updated++;
    }

    return NextResponse.json({ sessions: parsed.length, created, updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to import the training log';
    console.error('Error importing exercise sheet:', error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// Deliberately specific: a bare "row" would catch "Cable high row", which is a
// back exercise, not the rowing machine.
const CARDIO = /\b(run|running|jog|treadmill|parkrun|cycle|cycling|bike|swim|swimming|rowing|erg)\b/i;

// Name the session from what it actually contained, so the Exercise tab's
// by-type breakdown means something.
function sessionType(exercises: Array<{ name: string }>): string {
  if (exercises.length === 0) return 'session';
  const cardio = exercises.filter(e => CARDIO.test(e.name)).length;
  if (cardio === exercises.length) return 'run';
  if (cardio > 0) return 'strength + cardio';
  return 'strength';
}
