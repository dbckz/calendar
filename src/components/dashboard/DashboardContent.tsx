'use client';

import { useState } from 'react';
import { CalendarClock } from 'lucide-react';

import { CalendarEvent, TaskMetadata } from '@/types';
import { useDashboard } from '@/hooks/useDashboard';
import { TodayColumn } from './TodayColumn';
import { TopTasks } from './TopTasks';
import { CapacityWidget } from './CapacityWidget';
import { ClientTimeWidget } from './ClientTimeWidget';
import { DelegationWidget } from './DelegationWidget';
import { PlanWeekModal } from './PlanWeekModal';

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
  onOpenTask?: (taskId: string) => void;
  onPlanApplied?: () => void; // refresh calendar/asana data after applying a plan
}

export function DashboardContent({
  todayEvents,
  asanaTasks,
  metadataByGid,
  timeWorkedByIntegration,
  asanaIntegrations,
  onOpenTask,
  onPlanApplied,
}: DashboardContentProps) {
  const { data, isLoading, refetch } = useDashboard();
  const [showPlanModal, setShowPlanModal] = useState(false);

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Command Center</h1>
        <button
          onClick={() => setShowPlanModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
        >
          <CalendarClock className="w-4 h-4" />
          Plan my week
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Today column - full height on the left */}
        <div className="lg:col-span-1 lg:row-span-2">
          <TodayColumn events={todayEvents} />
        </div>

        {/* Widgets - right side, stack on narrow screens */}
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          <TopTasks tasks={asanaTasks} metadataByGid={metadataByGid} onTaskClick={onOpenTask} />
          <CapacityWidget rows={data?.capacity ?? []} isLoading={isLoading} />
          <ClientTimeWidget
            timeWorkedByIntegration={timeWorkedByIntegration}
            integrations={asanaIntegrations}
          />
          <DelegationWidget tasks={asanaTasks} onTaskClick={onOpenTask} />
        </div>
      </div>

      <PlanWeekModal
        isOpen={showPlanModal}
        onClose={() => setShowPlanModal(false)}
        onApplied={() => {
          refetch();
          onPlanApplied?.();
        }}
      />
    </div>
  );
}
