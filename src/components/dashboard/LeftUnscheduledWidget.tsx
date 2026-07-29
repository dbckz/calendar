'use client';

import { CalendarX } from 'lucide-react';

import type { UnscheduledTask } from '@/lib/weekly-stats';
import { categoryColor } from './replanFormat';

interface LeftUnscheduledWidgetProps {
  tasks: UnscheduledTask[];
}

// Short "when it dropped out" label from an ISO instant, e.g. "just now",
// "3h ago", "2d ago". Matches the DelegationWidget's relative-time style.
function relativeTime(iso: string | undefined): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.round((Date.now() - then) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

// Tasks planned into this week that then slid out of the schedule — deferred to
// next week or carried at the end of it — so they stay visible rather than
// silently lost. Read-only; the list is derived server-side from the durable
// weekly record. The caller only renders this when there is something to show,
// so there is no empty state here.
export function LeftUnscheduledWidget({ tasks }: LeftUnscheduledWidgetProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col min-h-0 max-h-52">
      <div className="flex items-center gap-2 mb-2 flex-shrink-0">
        <CalendarX className="w-4 h-4 text-amber-600" />
        <h2 className="text-base font-semibold text-gray-900">Left unscheduled</h2>
        <span className="ml-auto text-xs text-gray-400">{tasks.length}</span>
      </div>
      <p className="text-[11px] text-gray-400 mb-2.5 flex-shrink-0">
        Planned this week but couldn&apos;t be fitted in.
      </p>
      <ul className="space-y-1.5 overflow-y-auto min-h-0">
        {tasks.map(t => {
          const color = categoryColor(t.category);
          const dropped = relativeTime(t.droppedAt);
          return (
            <li key={t.taskId} className="flex items-start gap-2">
              <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${color.dot}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-sm text-gray-800 truncate">{t.title || t.category}</span>
                  {t.carryStreak && t.carryStreak >= 2 && (
                    <span className="flex-shrink-0 text-[11px] text-amber-600">
                      · {t.carryStreak} weeks running
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-gray-400">
                  {t.category}
                  {' · '}
                  <span className={t.reason === 'unscheduled' ? 'text-amber-600' : 'text-slate-500'}>
                    {t.reason === 'unscheduled' ? 'left unscheduled' : 'deferred to next week'}
                  </span>
                  {dropped && <> · {dropped}</>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
