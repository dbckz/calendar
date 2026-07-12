'use client';

import { CalendarEvent, TaskMetadata } from '@/types';
import { useDashboard } from '@/hooks/useDashboard';
import { TodayColumn } from './TodayColumn';
import { TopTasks } from './TopTasks';
import { CapacityWidget } from './CapacityWidget';
import { ClientTimeWidget } from './ClientTimeWidget';
import { DelegationWidget } from './DelegationWidget';

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
}

export function DashboardContent({
  todayEvents,
  asanaTasks,
  metadataByGid,
  timeWorkedByIntegration,
  asanaIntegrations,
  onOpenTask,
}: DashboardContentProps) {
  const { data, isLoading } = useDashboard();

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6">
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
    </div>
  );
}
