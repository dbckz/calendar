'use client';

import { useMemo, useState } from 'react';
import { Bot, Zap } from 'lucide-react';
import { CalendarEvent, TaskMetadata } from '@/types';
import { MobileTaskRow } from './MobileTaskRow';

const COLLAPSED_COUNT = 8;

// Tasks flagged aiDelegable in their metadata, with an always-visible Delegate
// button (the desktop widget reveals it on hover, which touch can't do).
export function MobileAiRunnable({
  tasks,
  metadataByGid,
  onTaskClick,
  onDelegate,
}: {
  tasks: CalendarEvent[]; // incomplete Asana tasks
  metadataByGid: Record<string, TaskMetadata>;
  onTaskClick?: (task: CalendarEvent) => void;
  onDelegate?: (task: CalendarEvent) => void;
}) {
  const runnable = useMemo(
    () => tasks
      .filter(t => !t.completed && metadataByGid[t.id]?.aiDelegable)
      .sort((a, b) => (a.dueOn || '9999').localeCompare(b.dueOn || '9999')),
    [tasks, metadataByGid]
  );
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? runnable : runnable.slice(0, COLLAPSED_COUNT);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-2 flex items-center gap-2">
        <Bot className="h-4 w-4 text-indigo-600" />
        <h2 className="text-base font-semibold text-gray-900">AI-runnable</h2>
        {runnable.length > 0 && <span className="text-xs text-gray-400">{runnable.length}</span>}
      </div>

      {runnable.length === 0 ? (
        <p className="text-sm italic text-gray-400">No tasks flagged AI-runnable yet.</p>
      ) : (
        <>
          <ul className="space-y-0.5">
            {shown.map(task => (
              <MobileTaskRow
                key={task.id}
                task={task}
                onClick={onTaskClick ? () => onTaskClick(task) : undefined}
                action={
                  onDelegate && task.integrationId ? (
                    <button
                      type="button"
                      onClick={() => onDelegate(task)}
                      className="flex h-9 flex-shrink-0 items-center gap-1 rounded-md bg-indigo-600 px-2.5 text-[11px] font-medium text-white active:bg-indigo-700"
                    >
                      <Zap className="h-3 w-3" /> Delegate
                    </button>
                  ) : undefined
                }
              />
            ))}
          </ul>
          {runnable.length > COLLAPSED_COUNT && (
            <button
              type="button"
              onClick={() => setExpanded(v => !v)}
              className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 active:bg-gray-50"
            >
              {expanded ? 'Show less' : `View all ${runnable.length}`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
