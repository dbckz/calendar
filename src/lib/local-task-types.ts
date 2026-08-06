// Local "Type" store for tasks whose Asana workspace has no writable Type custom
// field (e.g. Dave's DBC workspace). Asana can't hold a Type for those tasks, so
// the app remembers it here instead — keyed by Asana task gid — and OVERLAYS it
// as a synthesized "Type" custom field when tasks are read, so every existing
// Type reader (capacity categories, plan-week, sidebar grouping, mobile badges)
// works unchanged. This is app-local state and is NEVER written back to Asana.

import { promises as fs } from 'fs';

import { DATA_DIR, LOCAL_TASK_TYPES_FILE } from './data-paths';

// Re-export the pure helpers so server callers can import store + overlay from
// one place. Client code must import these from ./local-task-types-shared (this
// module pulls in `fs` and can't be bundled for the browser).
export { LOCAL_TYPE_FIELD_GID, overlayLocalType } from './local-task-types-shared';

interface LocalTaskTypesFile {
  version: 1;
  types: Record<string, string>; // taskGid -> Type label
}

const EMPTY: LocalTaskTypesFile = { version: 1, types: {} };

async function ensureDataDir(): Promise<void> {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

// Read the full gid -> Type-label map. Returns an empty map when the file is
// absent or malformed (never throws — a bad file must not break task reads).
export async function getLocalTaskTypes(): Promise<Record<string, string>> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(LOCAL_TASK_TYPES_FILE, 'utf-8');
    const parsed = JSON.parse(data) as Partial<LocalTaskTypesFile>;
    const types = parsed.types;
    if (!types || typeof types !== 'object') return {};
    // Keep only string->non-empty-string entries.
    const out: Record<string, string> = {};
    for (const [gid, label] of Object.entries(types)) {
      if (typeof gid === 'string' && typeof label === 'string' && label.trim()) {
        out[gid] = label;
      }
    }
    return out;
  } catch {
    return {};
  }
}

// Merge `updates` into the stored map and persist. A null (or empty-string) value
// deletes that task's local type; any other string sets it. Returns the merged map.
export async function setLocalTaskTypes(
  updates: Record<string, string | null>
): Promise<Record<string, string>> {
  await ensureDataDir();
  const current = await getLocalTaskTypes();
  for (const [gid, label] of Object.entries(updates)) {
    if (label == null || label === '') delete current[gid];
    else current[gid] = label;
  }
  const toWrite: LocalTaskTypesFile = { ...EMPTY, types: current };
  await fs.writeFile(LOCAL_TASK_TYPES_FILE, JSON.stringify(toWrite, null, 2), 'utf-8');
  return current;
}
