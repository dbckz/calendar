import { CalendarEventResponse } from '@/types';
import { LOCAL_TYPE_FIELD_GID } from '@/lib/local-task-types-shared';

// Per-integration "Type" custom field info: the field's gid plus a label -> enum
// option gid map. Mirrors the logic in useAsanaTasks (typeFieldInfoByIntegration):
// custom fields are workspace-specific, so we track them per integration and
// populate from each field's full enum_options list so every option is offered.
export interface TypeFieldInfo {
  fieldGid: string;
  options: Array<{ label: string; gid: string }>;
}

export function deriveTypeFieldInfo(
  tasks: CalendarEventResponse[]
): Map<string, TypeFieldInfo> {
  const infoMap = new Map<string, { fieldGid: string; options: Map<string, string> }>();

  for (const task of tasks) {
    if (!task.integrationId) continue;
    const typeField = task.customFields?.find(cf => cf.name.toLowerCase() === 'type');
    // Skip a synthesized local-type field: it carries a Type label but must not
    // make its integration look Asana-writable (see local-task-types-shared).
    if (!typeField || typeField.gid === LOCAL_TYPE_FIELD_GID) continue;

    if (!infoMap.has(task.integrationId)) {
      infoMap.set(task.integrationId, { fieldGid: typeField.gid, options: new Map() });
    }
    const info = infoMap.get(task.integrationId)!;

    if (typeField.enumOptions && typeField.enumOptions.length > 0) {
      for (const opt of typeField.enumOptions) info.options.set(opt.name, opt.gid);
    } else if (typeField.displayValue && typeField.enumValueGid) {
      info.options.set(typeField.displayValue, typeField.enumValueGid);
    }
  }

  const result = new Map<string, TypeFieldInfo>();
  for (const [integrationId, { fieldGid, options }] of infoMap) {
    result.set(integrationId, {
      fieldGid,
      options: Array.from(options.entries()).map(([label, gid]) => ({ label, gid })),
    });
  }
  return result;
}

// The task's currently selected Type enum option gid (if any).
export function currentTypeOptionGid(task: CalendarEventResponse): string | null {
  const typeField = task.customFields?.find(cf => cf.name.toLowerCase() === 'type');
  return typeField?.enumValueGid ?? null;
}
