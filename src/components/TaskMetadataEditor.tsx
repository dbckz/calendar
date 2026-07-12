'use client';

import { TaskMetadata, EnergyLevel, DeadlineType, BestTime } from '@/types';

interface TaskMetadataEditorProps {
  metadata?: TaskMetadata;
  onChange: (updates: Partial<Omit<TaskMetadata, 'asanaTaskGid' | 'integrationId' | 'updatedAt'>>) => void;
}

const ENERGY_OPTIONS: EnergyLevel[] = ['high', 'medium', 'low'];
const DEADLINE_OPTIONS: DeadlineType[] = ['hard', 'soft', 'aspirational'];
const BEST_TIME_OPTIONS: BestTime[] = ['morning', 'afternoon', 'evening'];

const selectClass =
  'w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none bg-white';

export function TaskMetadataEditor({ metadata, onChange }: TaskMetadataEditorProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Energy</label>
        <select
          className={selectClass}
          value={metadata?.energyLevel ?? ''}
          onChange={(e) => onChange({ energyLevel: (e.target.value || undefined) as EnergyLevel | undefined })}
        >
          <option value="">—</option>
          {ENERGY_OPTIONS.map(o => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Deadline</label>
        <select
          className={selectClass}
          value={metadata?.deadlineType ?? ''}
          onChange={(e) => onChange({ deadlineType: (e.target.value || undefined) as DeadlineType | undefined })}
        >
          <option value="">—</option>
          {DEADLINE_OPTIONS.map(o => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Best time</label>
        <select
          className={selectClass}
          value={metadata?.bestTime ?? ''}
          onChange={(e) => onChange({ bestTime: (e.target.value || undefined) as BestTime | undefined })}
        >
          <option value="">—</option>
          {BEST_TIME_OPTIONS.map(o => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Effort (min)</label>
        <input
          type="number"
          min="0"
          step="5"
          className={selectClass}
          value={metadata?.effortMinutes ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            onChange({ effortMinutes: v === '' ? undefined : parseInt(v, 10) });
          }}
        />
      </div>

      <div className="col-span-2">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={metadata?.aiDelegable ?? false}
            onChange={(e) => onChange({ aiDelegable: e.target.checked })}
          />
          🤖 AI-delegable
        </label>
      </div>
    </div>
  );
}

// Small badges rendered on compact task cards.
const DEADLINE_DOT_COLOR: Record<DeadlineType, string> = {
  hard: 'bg-red-500',
  soft: 'bg-amber-500',
  aspirational: 'bg-gray-400',
};

const ENERGY_TITLE: Record<EnergyLevel, string> = {
  high: 'High energy',
  medium: 'Medium energy',
  low: 'Low energy',
};

export function TaskMetadataBadges({ metadata, className }: { metadata?: TaskMetadata; className?: string }) {
  if (!metadata) return null;
  const { energyLevel, aiDelegable, deadlineType } = metadata;
  if (!energyLevel && !aiDelegable && !deadlineType) return null;

  return (
    <span className={`inline-flex items-center gap-1 ${className ?? ''}`}>
      {deadlineType && (
        <span
          className={`inline-block w-2 h-2 rounded-full ${DEADLINE_DOT_COLOR[deadlineType]}`}
          title={`${deadlineType} deadline`}
        />
      )}
      {energyLevel && (
        <span className="text-[10px]" title={ENERGY_TITLE[energyLevel]}>
          {energyLevel === 'high' ? '⚡' : energyLevel === 'medium' ? '🔋' : '🪫'}
        </span>
      )}
      {aiDelegable && (
        <span className="text-[10px]" title="AI-delegable">🤖</span>
      )}
    </span>
  );
}
