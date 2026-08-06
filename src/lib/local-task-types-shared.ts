// Pure (fs-free) helpers for the local "Type" store, safe to import from client
// code. The server-side read/write store lives in ./local-task-types.

import type { AsanaCustomField } from '@/types';

// Sentinel gid stamped on the synthesized Type field so writable-Type derivation
// (useAsanaTasks' typeFieldInfoByIntegration, grooming's deriveTypeFieldInfo) can
// tell a locally-typed task apart and NOT treat its integration as Asana-writable.
export const LOCAL_TYPE_FIELD_GID = 'local-type';

// Overlay a task's local Type onto its custom fields. When the task has a local
// type and NO real Asana Type value, a synthesized enum "Type" field (carrying
// the label, no enum option gid) is prepended so readers find it. A real Asana
// Type value always wins and leaves the fields untouched. The synthesized field
// is deliberately gid `local-type` so writable-Type derivation can skip it.
export function overlayLocalType(
  gid: string | undefined,
  customFields: AsanaCustomField[] | undefined,
  localTypes: Record<string, string>
): AsanaCustomField[] | undefined {
  if (!gid) return customFields;
  const label = localTypes[gid];
  if (!label) return customFields;
  const existing = customFields?.find(cf => cf.name.toLowerCase() === 'type');
  if (existing?.displayValue) return customFields; // real Asana Type wins
  const synth: AsanaCustomField = {
    gid: LOCAL_TYPE_FIELD_GID,
    name: 'Type',
    displayValue: label,
    type: 'enum',
  };
  return [synth, ...(customFields ?? [])];
}
