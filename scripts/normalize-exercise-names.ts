// One-off migration: rewrite every stored exercise-entry name to its canonical
// spelling (see src/lib/exercise-names).
//
// The app normalises names on every future write, so this is only needed once,
// to bring the EXISTING history into line. Idempotent: an entry already in
// canonical form is left untouched, so re-running changes nothing and reports
// zero.
//
// Reports a rename tally (old → new, with counts) and lists any distinct name it
// left unchanged, so the full effect can be eyeballed before trusting it.
//
// SAFETY: this refuses to touch the real data directory unless explicitly
// confirmed. To dry-run against a COPY:
//
//   CALENDAR_DB_PATH=/path/to/copy.db npx tsx scripts/normalize-exercise-names.ts
//
// To run for real (Dave only):
//
//   NORMALIZE_EXERCISE_NAMES_CONFIRM=yes npx tsx scripts/normalize-exercise-names.ts

import path from 'path';

import { getAllSessions } from '../src/lib/storage/exercise';
import { writeAllDomains } from '../src/lib/storage/db';
import { normalizeExerciseName } from '../src/lib/exercise-names';
import { DATA_DIR } from '../src/lib/data-paths';

async function main() {
  // The real store is calendar.db in the data dir; a caller pointing
  // CALENDAR_DB_PATH elsewhere (a scratchpad copy) is working on a copy.
  const usingRealDb = !process.env.CALENDAR_DB_PATH;
  if (usingRealDb && process.env.NORMALIZE_EXERCISE_NAMES_CONFIRM !== 'yes') {
    console.error(
      'Refusing to run against the real data directory without confirmation.\n' +
        `  Real DB: ${path.join(DATA_DIR, 'calendar.db')}\n\n` +
        'Dry-run against a copy:\n' +
        '  CALENDAR_DB_PATH=/path/to/copy.db npx tsx scripts/normalize-exercise-names.ts\n\n' +
        'Run for real:\n' +
        '  NORMALIZE_EXERCISE_NAMES_CONFIRM=yes npx tsx scripts/normalize-exercise-names.ts'
    );
    process.exit(1);
  }

  const sessions = await getAllSessions();

  // old spelling → { to, count }, and the tally of names already canonical.
  const renames = new Map<string, { to: string; count: number }>();
  const unchanged = new Map<string, number>();
  let entriesChanged = 0;
  let sessionsChanged = 0;

  const next = sessions.map(session => {
    if (!session.exercises?.length) return session;

    let touched = false;
    const exercises = session.exercises.map(entry => {
      const canonical = normalizeExerciseName(entry.name);
      if (canonical === entry.name) {
        unchanged.set(entry.name, (unchanged.get(entry.name) ?? 0) + 1);
        return entry;
      }
      const rename = renames.get(entry.name) ?? { to: canonical, count: 0 };
      rename.count += 1;
      renames.set(entry.name, rename);
      entriesChanged += 1;
      touched = true;
      return { ...entry, name: canonical };
    });

    if (!touched) return session;
    sessionsChanged += 1;
    return { ...session, exercises, updatedAt: new Date().toISOString() };
  });

  console.log(`Data dir: ${DATA_DIR}`);
  console.log(`DB: ${process.env.CALENDAR_DB_PATH ?? path.join(DATA_DIR, 'calendar.db')}\n`);

  if (renames.size === 0) {
    console.log('No changes needed — every stored exercise name is already canonical.');
  } else {
    console.log(`Renames (${entriesChanged} entr${entriesChanged === 1 ? 'y' : 'ies'} across ${sessionsChanged} session${sessionsChanged === 1 ? '' : 's'}):`);
    for (const [from, { to, count }] of [...renames.entries()].sort((a, b) => b[1].count - a[1].count)) {
      console.log(`  ${from}  →  ${to}   (${count})`);
    }
  }

  console.log(`\nLeft unchanged (${unchanged.size} distinct name${unchanged.size === 1 ? '' : 's'}):`);
  for (const [name, count] of [...unchanged.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${name}   (${count})`);
  }

  if (entriesChanged === 0) return;

  writeAllDomains({ exerciseSessions: next });
  console.log(`\nWrote ${entriesChanged} normalised entr${entriesChanged === 1 ? 'y' : 'ies'}.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
