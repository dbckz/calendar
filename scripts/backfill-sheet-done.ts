// One-off backfill: mark every exercise in a completed sheet-imported session
// as done.
//
// Sheet-imported sessions (source 'sheet') are a record of what was actually
// done, so their entries should carry done:true. The importer historically
// left the flag unset, which the strict "exercises done" count now reads as
// zero. This sets done:true on any such entry that lacks it, once.
//
// Idempotent: an entry already done:true is untouched, so re-running changes
// nothing and reports zero. Run with:
//
//   npx tsx scripts/backfill-sheet-done.ts
//
// Uses the real data directory unless CALENDAR_DB_PATH is set.

import { getAllSessions } from '../src/lib/storage/exercise';
import { writeAllDomains } from '../src/lib/storage/db';
import { DATA_DIR } from '../src/lib/data-paths';

async function main() {
  const sessions = await getAllSessions();

  let entriesChanged = 0;
  let sessionsChanged = 0;

  const next = sessions.map(session => {
    if (!(session.completed && session.source === 'sheet' && session.exercises?.length)) {
      return session;
    }
    let touched = false;
    const exercises = session.exercises.map(entry => {
      if (entry.done === true) return entry;
      entriesChanged += 1;
      touched = true;
      return { ...entry, done: true };
    });
    if (!touched) return session;
    sessionsChanged += 1;
    return { ...session, exercises, updatedAt: new Date().toISOString() };
  });

  if (entriesChanged === 0) {
    console.log(`No changes needed — every sheet session's exercises are already done:true.`);
    console.log(`Data dir: ${DATA_DIR}`);
    return;
  }

  writeAllDomains({ exerciseSessions: next });
  console.log(
    `Backfilled done:true on ${entriesChanged} entr${entriesChanged === 1 ? 'y' : 'ies'} ` +
      `across ${sessionsChanged} sheet session${sessionsChanged === 1 ? '' : 's'}.`
  );
  console.log(`Data dir: ${DATA_DIR}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
