// SQLite-backed persistence for user data.
//
// Replaces the single ~/.claude/data/calendar/user-data.json blob (~161 KB,
// rewritten in full on every mutation) with an atomic, crash-safe store. The
// motivation: a crash mid-write to the JSON file truncated it and lost
// everything. SQLite writes are transactional, so a crash leaves the last
// committed state intact.
//
// Shape: one table `user_data(domain, data)`, a row per top-level domain of the
// old UserData object (taskTemplates, adHocTasks, delegationQueue, …) with the
// domain's value stored as a JSON string. This mirrors the document-shaped data
// closely while letting each save run inside one transaction. WAL mode is on so
// the Next.js server and the orchestrator worker (separate processes) can read
// concurrently without blocking each other.

import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

import { DATA_DIR, USER_DATA_FILE } from '../data-paths';

// Jest sets JEST_WORKER_ID for every worker. In tests we use an isolated
// in-memory database (no disk I/O, no cross-test bleed, no touching the dev
// machine's real user-data.json) that callers reset between cases via
// __resetDbForTests(). CALENDAR_DB_PATH lets a caller override the location.
const isTestEnv = !!process.env.JEST_WORKER_ID;
const DB_PATH =
  process.env.CALENDAR_DB_PATH || (isTestEnv ? ':memory:' : path.join(DATA_DIR, 'calendar.db'));

let db: Database.Database | null = null;

function initDb(): Database.Database {
  if (db) return db;

  if (DB_PATH !== ':memory:') {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  }

  const database = new Database(DB_PATH);
  // WAL lets readers and a writer coexist across processes; NORMAL is the
  // durability level WAL is designed for (safe against app crashes).
  database.pragma('journal_mode = WAL');
  database.pragma('synchronous = NORMAL');
  database.exec(
    'CREATE TABLE IF NOT EXISTS user_data (domain TEXT PRIMARY KEY, data TEXT NOT NULL)'
  );

  db = database;

  // Import the legacy JSON blob exactly once (only outside tests, where there is
  // no real file to import and the in-memory DB starts empty by design).
  if (!isTestEnv) {
    migrateLegacyJsonIfNeeded(database);
  }

  return db;
}

// One-time import: if the DB is empty and a user-data.json exists, copy every
// top-level key in as a domain row, then rename the JSON to .migrated as a
// safety net. Idempotent — a populated DB or an absent file is a no-op.
function migrateLegacyJsonIfNeeded(database: Database.Database): void {
  const { n } = database.prepare('SELECT COUNT(*) AS n FROM user_data').get() as { n: number };
  if (n > 0) return;
  if (!fs.existsSync(USER_DATA_FILE)) return;

  try {
    const parsed = JSON.parse(fs.readFileSync(USER_DATA_FILE, 'utf-8')) as Record<string, unknown>;
    const insert = database.prepare('INSERT OR REPLACE INTO user_data (domain, data) VALUES (?, ?)');
    const importAll = database.transaction((entries: Array<[string, unknown]>) => {
      for (const [domain, value] of entries) insert.run(domain, JSON.stringify(value));
    });
    importAll(Object.entries(parsed));
    fs.renameSync(USER_DATA_FILE, `${USER_DATA_FILE}.migrated`);
  } catch (error) {
    // A failed import must not brick the app; log and continue with an empty DB.
    console.error('Failed to migrate user-data.json into SQLite:', error);
  }
}

// Read every domain row into a plain object keyed by domain, values JSON-parsed.
// A missing/empty DB yields {}. Callers layer their own defaults on top.
export function readAllDomains(): Record<string, unknown> {
  const rows = initDb().prepare('SELECT domain, data FROM user_data').all() as Array<{
    domain: string;
    data: string;
  }>;
  const out: Record<string, unknown> = {};
  for (const { domain, data } of rows) out[domain] = JSON.parse(data);
  return out;
}

// Persist every top-level key of `record` as a domain row in one transaction, so
// a crash mid-save can never leave a partially written store.
export function writeAllDomains(record: Record<string, unknown>): void {
  const database = initDb();
  const upsert = database.prepare('INSERT OR REPLACE INTO user_data (domain, data) VALUES (?, ?)');
  const saveAll = database.transaction((entries: Array<[string, unknown]>) => {
    for (const [domain, value] of entries) {
      if (value === undefined) continue;
      upsert.run(domain, JSON.stringify(value));
    }
  });
  saveAll(Object.entries(record));
}

// Test-only: wipe all rows so each case starts from a clean store.
export function __resetDbForTests(): void {
  initDb().exec('DELETE FROM user_data');
}
