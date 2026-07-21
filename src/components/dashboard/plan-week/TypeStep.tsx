'use client';

import { Dispatch, SetStateAction } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';

import type { TypeRow, UntypedTask } from './types';

interface TypeStepProps {
  untypedTasks: UntypedTask[];
  typeRows: TypeRow[] | null;
  setTypeRows: Dispatch<SetStateAction<TypeRow[] | null>>;
  typeLoading: boolean;
  typeError: string | null;
}

export function TypeStep({
  untypedTasks,
  typeRows,
  setTypeRows,
  typeLoading,
  typeError,
}: TypeStepProps) {
  if (typeLoading || typeRows === null) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
        <p className="text-sm text-gray-500">
          Suggesting a Type for {untypedTasks.length} untyped task
          {untypedTasks.length === 1 ? '' : 's'}…
        </p>
      </div>
    );
  }

  const setChosen = (gid: string, value: string) =>
    setTypeRows(prev => (prev ? prev.map(r => (r.gid === gid ? { ...r, chosen: value } : r)) : prev));

  const keptCount = typeRows.filter(r => r.chosen).length;

  // Light grouping by integration keeps a long list scannable when more than
  // one Asana workspace is involved.
  const byIntegration = new Map<string, TypeRow[]>();
  for (const r of typeRows) {
    const key = r.integrationName || 'Asana';
    const list = byIntegration.get(key) ?? [];
    list.push(r);
    byIntegration.set(key, list);
  }
  const groups = [...byIntegration.entries()];
  const showGroupHeaders = groups.length > 1;

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        {typeRows.length} task{typeRows.length === 1 ? '' : 's'} have no Type yet, so they&apos;re
        invisible to your weekly allocation. Review the suggested Type for each — override or leave
        untyped as needed — then apply.
      </p>
      {typeError && (
        <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>Couldn&apos;t auto-suggest types ({typeError}). Set them manually below.</span>
        </div>
      )}

      <div className="space-y-4">
        {groups.map(([name, rows]) => (
          <div key={name}>
            {showGroupHeaders && (
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">
                {name}
              </h3>
            )}
            <ul className="space-y-1.5">
              {rows.map(r => (
                <li key={r.gid} className="flex items-center gap-3">
                  <span className="text-sm text-gray-700 truncate flex-1" title={r.title}>
                    {r.title}
                  </span>
                  <select
                    value={r.chosen}
                    onChange={e => setChosen(r.gid, e.target.value)}
                    className={`text-xs border rounded px-1.5 py-1 outline-none focus:ring-2 focus:ring-orange-500 flex-shrink-0 max-w-[45%] ${
                      r.chosen ? 'border-gray-300 text-gray-700' : 'border-gray-200 text-gray-400'
                    }`}
                  >
                    <option value="">— leave untyped —</option>
                    {r.allowedTypes.map(t => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400">
        {keptCount} of {typeRows.length} will be written to Asana; the rest stay untyped. Skip to
        continue without typing.
      </p>
    </div>
  );
}
