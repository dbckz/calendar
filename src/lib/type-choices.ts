// The single rule for "which Type labels can a task in THIS integration be given,
// and where is a chosen label written?". Client-safe (no fs).
//
// Two kinds of integration:
//   - one with its own writable Asana "Type" custom field (non-empty enum) →
//     offer that field's labels, written back to Asana ('asana').
//   - one without (e.g. Dave's DBC workspace) → offer the union of every OTHER
//     integration's Asana Type labels, remembered in the app-local Type store
//     ('local'). An empty union means no labels are available anywhere, so the
//     Type feature is simply unavailable for that integration (labels: []).
//
// Both the client `AsanaTypeFieldInfo` map (label -> enum gid, via `enumOptions`)
// and grooming's `TypeFieldInfo` map (via an `options` array) describe an
// integration's Asana Type labels; `typeLabelsOf` reads either shape so the one
// rule serves every caller.

export type TypeWriteTarget = 'asana' | 'local';

export interface TypeChoices {
  labels: string[]; // exact Type labels offered, de-duplicated and sorted
  writeTarget: TypeWriteTarget;
}

// The two per-integration Type-field shapes used across the app. Anything that
// exposes its labels one of these two ways can feed the rule below.
type TypeLabelSource =
  | { enumOptions: Map<string, string> }
  | { options: Array<{ label: string }> };

// The Asana Type labels an integration's field can hold, read from either shape.
export function typeLabelsOf(info: TypeLabelSource): string[] {
  return 'enumOptions' in info
    ? Array.from(info.enumOptions.keys())
    : info.options.map(o => o.label);
}

function uniqueSorted(labels: string[]): string[] {
  return Array.from(new Set(labels)).sort();
}

// Resolve the Type labels and write target for `integrationId`. See the module
// comment for the rule. `undefined` inputs degrade to an empty local choice.
export function typeChoicesFor<T extends TypeLabelSource>(
  integrationId: string | undefined,
  infoByIntegration: Map<string, T> | undefined,
): TypeChoices {
  const own = integrationId ? infoByIntegration?.get(integrationId) : undefined;
  const ownLabels = own ? typeLabelsOf(own) : [];
  if (ownLabels.length > 0) {
    return { labels: uniqueSorted(ownLabels), writeTarget: 'asana' };
  }
  const union: string[] = [];
  if (infoByIntegration) {
    for (const [id, info] of infoByIntegration) {
      if (id === integrationId) continue;
      union.push(...typeLabelsOf(info));
    }
  }
  return { labels: uniqueSorted(union), writeTarget: 'local' };
}
