'use client';

import { CalendarEvent, DelegationQueueEntry, TaskMetadata } from '@/types';
import { DashboardCapacityResponse } from '@/lib/api';
import { CapacityWidget } from '@/components/dashboard/CapacityWidget';
import { ClientTimeWidget } from '@/components/dashboard/ClientTimeWidget';
import { DelegationWidget } from '@/components/dashboard/DelegationWidget';
import { MobileTodayCard } from '../command-center/MobileTodayCard';
import { MobileTopTasks } from '../command-center/MobileTopTasks';
import { MobileAiRunnable } from '../command-center/MobileAiRunnable';

interface Integration {
  id: string;
  name: string;
}

// Single-column phone adaptation of the desktop Command Center. CapacityWidget,
// ClientTimeWidget and DelegationWidget are the desktop components (content-
// sized, touch-safe); Today / Top Tasks / AI-runnable are mobile rebuilds.
export function CommandCenterTab({
  todayEvents,
  asanaTasks,
  metadataByGid,
  delegationByGid,
  capacityData,
  capacityLoading,
  timeWorkedByIntegration,
  timeScheduledByIntegration,
  rolloverHour,
  asanaIntegrations,
  completedTaskGids,
  onExpandToDay,
  onOpenTask,
  onDelegateTask,
}: {
  todayEvents: CalendarEvent[]; // logical today's timed events
  asanaTasks: CalendarEvent[]; // incomplete Asana tasks
  metadataByGid: Record<string, TaskMetadata>;
  delegationByGid: Record<string, DelegationQueueEntry>;
  capacityData: DashboardCapacityResponse | null;
  capacityLoading: boolean;
  timeWorkedByIntegration: Record<string, number>;
  timeScheduledByIntegration: Record<string, number>;
  rolloverHour: number;
  asanaIntegrations: Integration[];
  completedTaskGids: Set<string>;
  onExpandToDay: () => void;
  onOpenTask: (taskOrGid: CalendarEvent | string) => void;
  onDelegateTask: (task: CalendarEvent) => void;
}) {
  return (
    <div className="space-y-4">
      <MobileTodayCard
        events={todayEvents}
        rolloverHour={rolloverHour}
        onExpand={onExpandToDay}
      />

      <ClientTimeWidget
        timeWorkedByIntegration={timeWorkedByIntegration}
        timeScheduledByIntegration={timeScheduledByIntegration}
        integrations={asanaIntegrations}
      />

      <CapacityWidget
        rows={capacityData?.weekProgress ?? []}
        planned={capacityData?.weekPlanned ?? false}
        isLoading={capacityLoading}
      />

      <MobileTopTasks
        tasks={asanaTasks}
        metadataByGid={metadataByGid}
        onTaskClick={onOpenTask}
      />

      <MobileAiRunnable
        tasks={asanaTasks}
        metadataByGid={metadataByGid}
        delegationByGid={delegationByGid}
        onTaskClick={onOpenTask}
        onDelegate={onDelegateTask}
      />

      {/* Plain wrapper (no h-full flex parent) so the widget sizes to content. */}
      <div>
        <DelegationWidget
          delegationByGid={delegationByGid}
          onTaskClick={onOpenTask}
          completedTaskGids={completedTaskGids}
        />
      </div>
    </div>
  );
}
