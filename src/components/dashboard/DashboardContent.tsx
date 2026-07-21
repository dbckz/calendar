'use client';

import { useCallback, useState } from 'react';
import { CalendarClock, Bot, Loader2, Archive, RefreshCw, ClipboardCheck } from 'lucide-react';

import { CalendarEvent, TaskMetadata } from '@/types';
import type { AsanaTypeFieldInfo } from '@/components/CreateAsanaTaskModal';
import { api } from '@/lib/api';
import { useDashboard } from '@/hooks/useDashboard';
import { TodayColumn } from './TodayColumn';
import { TopTasks } from './TopTasks';
import { CapacityWidget } from './CapacityWidget';
import { ClientTimeWidget } from './ClientTimeWidget';
import { DelegationWidget } from './DelegationWidget';
import { AiRunnableTasks } from './AiRunnableTasks';
import { StaleTasksModal } from './StaleTasksModal';
import { PlanWeekModal } from './PlanWeekModal';
import { ReplanWeekModal } from './ReplanWeekModal';
import { DailyReviewModal } from './DailyReviewModal';

interface Integration {
  id: string;
  name: string;
}

interface DashboardContentProps {
  todayEvents: CalendarEvent[]; // today's timed events (reused from page.tsx)
  asanaTasks: CalendarEvent[]; // incomplete Asana tasks
  metadataByGid: Record<string, TaskMetadata>;
  timeWorkedByIntegration: Record<string, number>;
  asanaIntegrations: Integration[];
  // Per-integration Type field info, for the Plan-my-week "type unclassified
  // tasks" pre-step (find untyped tasks + write chosen Types back to Asana).
  typeFieldInfoByIntegration?: Map<string, AsanaTypeFieldInfo>;
  onOpenTask?: (taskId: string) => void;
  onDelegateTask?: (task: CalendarEvent) => void; // open the compose-brief modal directly
  onReloadMetadata?: () => Promise<void> | void; // refresh aiDelegable flags after re-assessment
  onDeleteTask?: (taskId: string, integrationId: string) => void; // optimistic delete (stale triage)
  onPlanApplied?: () => void; // refresh calendar/asana data after applying a plan
  // Stale-triage modal open state is lifted to page.tsx so the in-place task
  // dialog (rendered there) can sit on top of it with a Back affordance.
  staleModalOpen?: boolean;
  onStaleModalOpenChange?: (open: boolean) => void;
  // A task dialog is open on top of the triage modal (suppresses its Escape).
  taskDialogOpen?: boolean;
}

// Fixed, viewport-height three-column layout — nothing scrolls the page itself;
// each box scrolls or paginates internally.
export function DashboardContent({
  todayEvents,
  asanaTasks,
  metadataByGid,
  timeWorkedByIntegration,
  asanaIntegrations,
  typeFieldInfoByIntegration,
  onOpenTask,
  onDelegateTask,
  onReloadMetadata,
  onDeleteTask,
  onPlanApplied,
  staleModalOpen = false,
  onStaleModalOpenChange,
  taskDialogOpen,
}: DashboardContentProps) {
  const { data, isLoading, refetch } = useDashboard();
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showReplanModal, setShowReplanModal] = useState(false);
  const [showDailyReviewModal, setShowDailyReviewModal] = useState(false);

  const [isReassessing, setIsReassessing] = useState(false);
  const [reassessNote, setReassessNote] = useState<string | null>(null);

  const handleReassess = useCallback(async () => {
    setIsReassessing(true);
    setReassessNote(null);
    try {
      const payload = asanaTasks
        .filter(t => !t.completed && t.integrationId)
        .map(t => ({
          gid: t.id,
          integrationId: t.integrationId as string,
          title: t.title,
          description: t.description,
          integrationName: t.integrationName,
        }));
      const r = await api.classifyAiTasks(payload);
      await onReloadMetadata?.();
      setReassessNote(
        `Assessed ${r.assessed}, ${r.cached} unchanged${r.changed ? `, ${r.changed} updated` : ''}.`
      );
    } catch (err) {
      setReassessNote(err instanceof Error ? err.message : 'Re-assessment failed.');
    } finally {
      setIsReassessing(false);
    }
  }, [asanaTasks, onReloadMetadata]);

  return (
    <div className="h-full flex flex-col p-4 md:p-6 min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0 gap-3">
        <h1 className="text-xl font-semibold text-gray-900">Command Center</h1>
        <div className="flex items-center gap-3">
          {reassessNote && <span className="text-xs text-gray-500 hidden lg:inline">{reassessNote}</span>}
          <button
            onClick={() => onStaleModalOpenChange?.(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50 transition-colors"
            title="Review tasks that look old / stale and delete or keep them"
          >
            <Archive className="w-4 h-4" /> Triage stale
          </button>
          <button
            onClick={handleReassess}
            disabled={isReassessing}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-indigo-300 text-indigo-700 rounded-lg hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Re-assess which incomplete tasks an agent could run (cached — only changed tasks are re-checked)"
          >
            {isReassessing
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Assessing AI-runnable…</>
              : <><Bot className="w-4 h-4" /> Assess AI-runnable</>}
          </button>
          <button
            onClick={() => setShowDailyReviewModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-orange-300 text-orange-700 rounded-lg hover:bg-orange-50 transition-colors"
            title="Review what got done today, then replan the rest of the week"
          >
            <ClipboardCheck className="w-4 h-4" />
            Daily review
          </button>
          <button
            onClick={() => setShowReplanModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-orange-300 text-orange-700 rounded-lg hover:bg-orange-50 transition-colors"
            title="Replan the rest of this week — reschedule missed or newly-clashing blocks"
          >
            <RefreshCw className="w-4 h-4" />
            Replan week
          </button>
          <button
            onClick={() => setShowPlanModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
          >
            <CalendarClock className="w-4 h-4" />
            Plan my week
          </button>
        </div>
      </div>

      {/* Fixed 3-column grid filling the remaining height. min-w-0 on every grid
          item lets columns shrink to their track instead of being forced wider by
          long unbroken content (e.g. a bare URL), which would clash with the next
          column. */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Left: Today (single box, internal scroll) */}
        <div className="min-h-0 min-w-0 h-full">
          <TodayColumn events={todayEvents} />
        </div>

        {/* Middle: Top Tasks + AI-runnable, each half height, paginated */}
        <div className="min-h-0 min-w-0 grid grid-rows-2 gap-4 md:gap-6">
          <div className="min-h-0 min-w-0">
            <TopTasks tasks={asanaTasks} metadataByGid={metadataByGid} onTaskClick={onOpenTask} />
          </div>
          <div className="min-h-0 min-w-0">
            <AiRunnableTasks
              tasks={asanaTasks}
              metadataByGid={metadataByGid}
              onTaskClick={onOpenTask}
              onDelegate={onDelegateTask}
            />
          </div>
        </div>

        {/* Right: Weekly Capacity + Time Worked size to their content (no scroll);
            Delegation takes the remaining height and scrolls internally. */}
        <div className="min-h-0 min-w-0 flex flex-col gap-4 md:gap-6">
          <div className="flex-shrink-0 min-w-0">
            <CapacityWidget rows={data?.capacity ?? []} isLoading={isLoading} />
          </div>
          <div className="flex-shrink-0 min-w-0">
            <ClientTimeWidget
              timeWorkedByIntegration={timeWorkedByIntegration}
              integrations={asanaIntegrations}
            />
          </div>
          <div className="flex-1 min-h-0 min-w-0">
            <DelegationWidget tasks={asanaTasks} onTaskClick={onOpenTask} />
          </div>
        </div>
      </div>

      {staleModalOpen && (
        <StaleTasksModal
          tasks={asanaTasks}
          onClose={() => onStaleModalOpenChange?.(false)}
          onOpenTask={onOpenTask}
          onDeleteTask={onDeleteTask}
          childDialogOpen={taskDialogOpen}
        />
      )}

      <PlanWeekModal
        isOpen={showPlanModal}
        onClose={() => setShowPlanModal(false)}
        asanaTasks={asanaTasks}
        typeFieldInfoByIntegration={typeFieldInfoByIntegration}
        onApplied={() => {
          refetch();
          onPlanApplied?.();
        }}
      />

      <DailyReviewModal
        isOpen={showDailyReviewModal}
        onClose={() => setShowDailyReviewModal(false)}
        onApplied={() => {
          refetch();
          onPlanApplied?.();
        }}
      />

      <ReplanWeekModal
        isOpen={showReplanModal}
        onClose={() => setShowReplanModal(false)}
        onApplied={() => {
          refetch();
          onPlanApplied?.();
        }}
        onStartFromScratch={() => {
          // Reset chained into a fresh plan: refresh data, close replan, open the wizard.
          refetch();
          onPlanApplied?.();
          setShowReplanModal(false);
          setShowPlanModal(true);
        }}
      />
    </div>
  );
}
