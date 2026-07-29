'use client';

import { useMemo, useState } from 'react';
import { CalendarEvent, TaskMetadata } from '@/types';
import { rankTasks } from '@/lib/task-ranking';
import { TaskMetadataBadges } from '@/components/TaskMetadataEditor';
import { MobileTaskRow } from './MobileTaskRow';

const COLLAPSED_COUNT = 8;

export function MobileTopTasks({
  tasks,
  metadataByGid,
  onTaskClick,
}: {
  tasks: CalendarEvent[]; // incomplete Asana tasks
  metadataByGid: Record<string, TaskMetadata>;
  onTaskClick?: (task: CalendarEvent) => void;
}) {
  const ranked = useMemo(
    () => rankTasks(tasks.filter(t => !t.completed), metadataByGid),
    [tasks, metadataByGid]
  );
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? ranked : ranked.slice(0, COLLAPSED_COUNT);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">Top Tasks</h2>
        {ranked.length > 0 && <span className="text-xs text-gray-400">{ranked.length}</span>}
      </div>
      {ranked.length === 0 ? (
        <p className="text-sm italic text-gray-400">No tasks to show.</p>
      ) : (
        <>
          <ul className="space-y-0.5">
            {shown.map(task => (
              <MobileTaskRow
                key={task.id}
                task={task}
                onClick={onTaskClick ? () => onTaskClick(task) : undefined}
                action={<TaskMetadataBadges metadata={metadataByGid[task.id]} className="flex-shrink-0" />}
              />
            ))}
          </ul>
          {ranked.length > COLLAPSED_COUNT && (
            <button
              type="button"
              onClick={() => setExpanded(v => !v)}
              className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 active:bg-gray-50"
            >
              {expanded ? 'Show less' : `View all ${ranked.length}`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
