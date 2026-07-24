'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { format, parseISO, isPast, isToday } from 'date-fns';
import { Search, Calendar } from 'lucide-react';
import { CalendarEvent } from '@/types';

interface TaskSearchModalProps {
  tasks: CalendarEvent[]; // incomplete Asana tasks (already filtered to !completed)
  onClose: () => void;
  onOpenTask?: (taskId: string, navIds?: string[]) => void;
}

const MAX_RESULTS = 50;

interface Scored {
  task: CalendarEvent;
  titleMatchIndex: number; // index of query in lowercased title, or -1
}

function dueColor(dueOn?: string): string {
  if (!dueOn) return 'text-gray-400';
  const date = parseISO(dueOn);
  if (isPast(date) && !isToday(date)) return 'text-red-500';
  if (isToday(date)) return 'text-orange-500';
  return 'text-gray-500';
}

// Highlight the matched substring in the title (case-insensitive).
function HighlightedTitle({ title, query }: { title: string; query: string }) {
  if (!query) return <>{title}</>;
  const idx = title.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{title}</>;
  return (
    <>
      {title.slice(0, idx)}
      <mark className="bg-yellow-200 text-inherit rounded-sm px-0.5">
        {title.slice(idx, idx + query.length)}
      </mark>
      {title.slice(idx + query.length)}
    </>
  );
}

// Command-palette style search over all incomplete Asana tasks. Opened via
// Cmd/Ctrl+F from the Command Center. Substring-matches title, description,
// project names and integration name; title matches are ranked first.
export function TaskSearchModal({ tasks, onClose, onOpenTask }: TaskSearchModalProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useMemo<Scored[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const scored: Scored[] = [];
    for (const task of tasks) {
      const title = (task.title ?? '').toLowerCase();
      const titleMatchIndex = title.indexOf(q);
      const inDescription = (task.description ?? '').toLowerCase().includes(q);
      const inIntegration = (task.integrationName ?? '').toLowerCase().includes(q);
      const inProjects = (task.projects ?? []).some(p => p.name.toLowerCase().includes(q));
      if (titleMatchIndex !== -1 || inDescription || inIntegration || inProjects) {
        scored.push({ task, titleMatchIndex });
      }
    }
    // Title matches first (earlier match position wins), others after.
    scored.sort((a, b) => {
      const aTitle = a.titleMatchIndex !== -1;
      const bTitle = b.titleMatchIndex !== -1;
      if (aTitle !== bTitle) return aTitle ? -1 : 1;
      if (aTitle && bTitle) return a.titleMatchIndex - b.titleMatchIndex;
      return 0;
    });
    return scored.slice(0, MAX_RESULTS);
  }, [query, tasks]);

  const orderedIds = useMemo(() => results.map(r => r.task.id), [results]);

  // Scroll the active row into view when navigating with the keyboard.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const el = list.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const openTask = (id: string) => {
    onOpenTask?.(id, orderedIds);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const hit = results[activeIndex];
      if (hit) openTask(hit.task.id);
    }
  };

  const trimmed = query.trim();

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-start justify-center z-[70] pt-[12vh]"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-xl mx-4 max-h-[70vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 flex-shrink-0">
          <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setActiveIndex(0); }}
            placeholder="Search all tasks…"
            className="flex-1 text-sm text-gray-900 placeholder:text-gray-400 outline-none bg-transparent"
            aria-label="Search tasks"
          />
          <kbd className="text-[10px] text-gray-400 border border-gray-200 rounded px-1.5 py-0.5 flex-shrink-0">
            Esc
          </kbd>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {!trimmed ? (
            <p className="text-sm text-gray-400 italic px-4 py-6 text-center">
              Type to search your tasks by title, project, or integration.
            </p>
          ) : results.length === 0 ? (
            <p className="text-sm text-gray-400 italic px-4 py-6 text-center">
              No tasks match “{trimmed}”.
            </p>
          ) : (
            <ul ref={listRef} className="py-1">
              {results.map(({ task }, i) => {
                const projectName = task.projects?.[0]?.name;
                const secondary = [task.integrationName, projectName].filter(Boolean).join(' · ');
                return (
                  <li key={task.id} data-index={i}>
                    <button
                      type="button"
                      onClick={() => openTask(task.id)}
                      onMouseMove={() => setActiveIndex(i)}
                      className={`w-full text-left flex items-center gap-2 px-4 py-2 ${
                        i === activeIndex ? 'bg-indigo-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate leading-tight">
                          <HighlightedTitle title={task.title} query={trimmed} />
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`flex items-center gap-1 text-[11px] ${dueColor(task.dueOn)}`}>
                            <Calendar className="w-3 h-3" />
                            {task.dueOn ? format(parseISO(task.dueOn), 'dd MMM') : 'No due date'}
                          </span>
                          {secondary && (
                            <span className="text-[11px] text-gray-400 truncate">{secondary}</span>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {results.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-100 text-[11px] text-gray-400 flex items-center justify-between flex-shrink-0">
            <span>{results.length}{results.length === MAX_RESULTS ? '+' : ''} result{results.length === 1 ? '' : 's'}</span>
            <span className="hidden sm:inline">↑↓ to navigate · ↵ to open · Esc to close</span>
          </div>
        )}
      </div>
    </div>
  );
}
