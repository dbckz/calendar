'use client';

import { useEffect } from 'react';
import { X, ExternalLink, Star, Calendar, Building2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';

import type { WeekCandidate } from '@/lib/api';

interface TaskPeekModalProps {
  candidate: WeekCandidate;
  onClose: () => void;
}

// A lightweight read-only peek at a candidate task, opened by double-clicking a
// row in the wizard's Tasks step. The wizard only carries the candidate summary
// (title, workspace, due, flags), so this shows those plus a link to open the
// full task in Asana. Styled to match the app's other modals (fixed overlay +
// white rounded panel); sits above the wizard (z-[60]).
export function TaskPeekModal({ candidate, onClose }: TaskPeekModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const asanaUrl = candidate.gid ? `https://app.asana.com/0/0/${candidate.gid}/f` : null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-md w-full p-5"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Task details"
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            {candidate.isPriority && (
              <Star className="w-4 h-4 text-amber-400 fill-amber-400 flex-shrink-0" />
            )}
            <h2 className="text-base font-semibold text-gray-900 break-words">{candidate.title}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1 text-gray-400 hover:text-gray-600 flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <dl className="space-y-2 text-sm">
          {candidate.integrationName && (
            <div className="flex items-center gap-2 text-gray-600">
              <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <dt className="sr-only">Workspace</dt>
              <dd>{candidate.integrationName}</dd>
            </div>
          )}
          {candidate.dueDate && (
            <div className="flex items-center gap-2 text-gray-600">
              <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <dt className="sr-only">Due</dt>
              <dd>Due {format(parseISO(candidate.dueDate), 'EEE d MMM yyyy')}</dd>
            </div>
          )}
          {candidate.carriedOver && (
            <div className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded px-2 py-1">
              Carried over{candidate.carryStreak && candidate.carryStreak >= 2 ? ` ${candidate.carryStreak} weeks running` : ' from a previous week'}.
            </div>
          )}
          {!candidate.gid && (
            <p className="text-xs text-gray-400 italic">Ad-hoc task — stored locally, not in Asana.</p>
          )}
        </dl>

        {asanaUrl && (
          <div className="mt-4 pt-3 border-t border-gray-100">
            <a
              href={asanaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-orange-600 hover:text-orange-700"
            >
              <ExternalLink className="w-4 h-4" />
              Open in Asana
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
