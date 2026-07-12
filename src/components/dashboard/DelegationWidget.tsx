'use client';

import { useMemo } from 'react';
import { CalendarEvent } from '@/types';

interface DelegationWidgetProps {
  tasks: CalendarEvent[]; // incomplete Asana tasks (carry `tags`)
  onTaskClick?: (taskId: string) => void;
}

// Asana tag names that drive the delegation pipeline.
const STAGES: { tag: string; label: string; color: string }[] = [
  { tag: 'agent_ready', label: 'Ready', color: 'text-blue-600' },
  { tag: 'agent_in_progress', label: 'In progress', color: 'text-amber-600' },
  { tag: 'agent_complete', label: 'Complete', color: 'text-emerald-600' },
];

function taskHasTag(task: CalendarEvent, tag: string): boolean {
  return (task.tags || []).some(t => t.name.toLowerCase() === tag);
}

export function DelegationWidget({ tasks, onTaskClick }: DelegationWidgetProps) {
  const byStage = useMemo(() => {
    return STAGES.map(stage => ({
      ...stage,
      tasks: tasks.filter(t => !t.completed && taskHasTag(t, stage.tag)),
    }));
  }, [tasks]);

  const anyTasks = byStage.some(s => s.tasks.length > 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Delegation</h2>
      {!anyTasks ? (
        <p className="text-sm text-gray-400 italic">No delegated tasks in flight.</p>
      ) : (
        <div className="space-y-4">
          {byStage.map(stage => (
            <div key={stage.tag}>
              <div className="flex items-center justify-between mb-1">
                <span className={`text-sm font-medium ${stage.color}`}>{stage.label}</span>
                <span className="text-xs text-gray-400">{stage.tasks.length}</span>
              </div>
              {stage.tasks.length > 0 && (
                <ul className="space-y-0.5">
                  {stage.tasks.map(task => (
                    <li
                      key={task.id}
                      onClick={() => onTaskClick?.(task.id)}
                      className={`text-sm text-gray-700 truncate px-2 py-1 rounded ${
                        onTaskClick ? 'cursor-pointer hover:bg-gray-50' : ''
                      }`}
                    >
                      {task.title}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
