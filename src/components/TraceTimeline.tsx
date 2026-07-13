'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Wrench, MessageSquareText, CircleDot, Flag } from 'lucide-react';

interface TraceTimelineProps {
  file: string;         // trace basename under AGENT_RUNS_DIR
  live?: boolean;       // poll while the run is still in progress
}

interface TimelineRow {
  kind: 'system' | 'text' | 'tool_use' | 'tool_result' | 'result';
  label: string;
  detail?: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function toRows(events: any[]): TimelineRow[] {
  const rows: TimelineRow[] = [];
  for (const ev of events) {
    if (!ev || typeof ev !== 'object') continue;
    if (ev.type === 'system') {
      rows.push({ kind: 'system', label: 'Session started' });
    } else if (ev.type === 'assistant' && Array.isArray(ev.message?.content)) {
      for (const block of ev.message.content) {
        if (block.type === 'text' && block.text?.trim()) {
          rows.push({ kind: 'text', label: 'Thinking', detail: String(block.text).trim() });
        } else if (block.type === 'tool_use') {
          const input = block.input ? JSON.stringify(block.input) : '';
          rows.push({ kind: 'tool_use', label: block.name || 'tool', detail: input.slice(0, 300) });
        }
      }
    } else if (ev.type === 'user' && Array.isArray(ev.message?.content)) {
      for (const block of ev.message.content) {
        if (block.type === 'tool_result') {
          const text = typeof block.content === 'string'
            ? block.content
            : Array.isArray(block.content)
              ? block.content.map((c: any) => c?.text || '').join(' ')
              : '';
          rows.push({ kind: 'tool_result', label: 'Result', detail: String(text).slice(0, 300) });
        }
      }
    } else if (ev.type === 'result') {
      rows.push({ kind: 'result', label: ev.is_error ? 'Finished (error)' : 'Finished' });
    }
  }
  return rows;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const ICONS: Record<TimelineRow['kind'], React.ComponentType<{ className?: string }>> = {
  system: CircleDot,
  text: MessageSquareText,
  tool_use: Wrench,
  tool_result: CircleDot,
  result: Flag,
};

export function TraceTimeline({ file, live = false }: TraceTimelineProps) {
  const [rows, setRows] = useState<TimelineRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      api.getDelegationTrace(file)
        .then(({ events }) => { if (!cancelled) setRows(toRows(events as unknown[])); })
        .catch(() => { /* keep last known rows on transient errors */ });
    };
    load();
    if (!live) return () => { cancelled = true; };
    const interval = setInterval(load, 3000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [file, live]);

  if (rows.length === 0) {
    return <p className="text-xs text-gray-400 italic">No trace events yet.</p>;
  }

  return (
    <ul className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
      {rows.map((row, i) => {
        const Icon = ICONS[row.kind];
        return (
          <li key={i} className="flex items-start gap-2 text-xs">
            <Icon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-indigo-500" />
            <div className="min-w-0">
              <span className="font-medium text-gray-700">{row.label}</span>
              {row.detail && (
                <span className="block text-gray-500 truncate font-mono">{row.detail}</span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
