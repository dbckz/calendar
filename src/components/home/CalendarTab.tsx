'use client';

import { ComponentProps, Dispatch, SetStateAction } from 'react';
import { Timeline } from '@/components/Timeline';
import { IntegrationStatus } from '@/components/IntegrationStatus';
import { AsanaSidebar } from '@/components/AsanaSidebar';
import { AllDayEventsBar } from '@/components/AllDayEventsBar';
import { CalendarEvent, SettingsResponse } from '@/types';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/useToast';

type SidebarProps = ComponentProps<typeof AsanaSidebar>;
type TimelineProps = ComponentProps<typeof Timeline>;
type AttributionMap = Record<string, { asanaIntegrationId: string; googleIntegrationId: string }>;

interface CalendarTabProps {
  colorScheme: NonNullable<SidebarProps['colorScheme']>;
  isLoading: boolean;
  settings: SettingsResponse | null;

  // Shared Asana sidebar data
  filteredAsanaTasks: SidebarProps['tasks'];
  scheduledAsanaTasks: SidebarProps['scheduledAsanaTasks'];
  asanaProjects: SidebarProps['projects'];
  asanaTypeValues: SidebarProps['typeValues'];
  asanaTypeFieldInfoByIntegration: SidebarProps['typeFieldInfoByIntegration'];
  asanaIntegrations: NonNullable<SidebarProps['integrations']>;
  metadataByGid: SidebarProps['taskMetadata'];
  delegationByGid: SidebarProps['delegation'];

  // Shared Asana sidebar handlers/state
  onUnschedule: SidebarProps['onUnschedule'];
  onToggleComplete: SidebarProps['onToggleComplete'];
  onAddComment: SidebarProps['onAddComment'];
  onCreateAsanaTask: SidebarProps['onCreateTask'];
  onUpdateTask: SidebarProps['onUpdateTask'];
  onDeleteTask: SidebarProps['onDeleteTask'];
  onSaveTaskMetadata: SidebarProps['onSaveTaskMetadata'];
  onDelegated: SidebarProps['onDelegated'];
  highlightedAsanaTaskId: SidebarProps['highlightedTaskId'];
  onClearHighlight: SidebarProps['onClearHighlight'];
  openTaskDialogId: SidebarProps['openTaskDialogId'];
  onClearOpenTaskDialog: SidebarProps['onClearOpenTaskDialog'];

  // Per-workspace (OM = left, DBC = right)
  omIntegrationId: string;
  dbcIntegrationId: string;
  omFilters: SidebarProps['filters'];
  dbcFilters: SidebarProps['filters'];
  onOmFiltersChange: SidebarProps['onFiltersChange'];
  onDbcFiltersChange: SidebarProps['onFiltersChange'];
  onOmClearFilters: SidebarProps['onClearFilters'];
  onDbcClearFilters: SidebarProps['onClearFilters'];

  // Main timeline area
  allDayEvents: CalendarEvent[];
  timedEvents: CalendarEvent[];
  selectedDate: Date;
  onEventClick: TimelineProps['onEventClick'];
  onEventDoubleClick: TimelineProps['onEventDoubleClick'];
  onDropTask: TimelineProps['onDropTask'];
  onEventMove: TimelineProps['onEventMove'];
  onDeleteEvent: TimelineProps['onDeleteEvent'];
  onCreateTask: TimelineProps['onCreateTask'];
  googleEventAttributions: TimelineProps['googleEventAttributions'];
  setGoogleEventAttributions: Dispatch<SetStateAction<AttributionMap>>;
}

export function CalendarTab({
  colorScheme,
  isLoading,
  settings,
  filteredAsanaTasks,
  scheduledAsanaTasks,
  asanaProjects,
  asanaTypeValues,
  asanaTypeFieldInfoByIntegration,
  asanaIntegrations,
  metadataByGid,
  delegationByGid,
  onUnschedule,
  onToggleComplete,
  onAddComment,
  onCreateAsanaTask,
  onUpdateTask,
  onDeleteTask,
  onSaveTaskMetadata,
  onDelegated,
  highlightedAsanaTaskId,
  onClearHighlight,
  openTaskDialogId,
  onClearOpenTaskDialog,
  omIntegrationId,
  dbcIntegrationId,
  omFilters,
  dbcFilters,
  onOmFiltersChange,
  onDbcFiltersChange,
  onOmClearFilters,
  onDbcClearFilters,
  allDayEvents,
  timedEvents,
  selectedDate,
  onEventClick,
  onEventDoubleClick,
  onDropTask,
  onEventMove,
  onDeleteEvent,
  onCreateTask,
  googleEventAttributions,
  setGoogleEventAttributions,
}: CalendarTabProps) {
  const toast = useToast();

  return (
    <div className="flex flex-1 min-h-0">
      {/* Left sidebar: OM Asana workspace */}
      <aside className="w-72 flex-shrink-0 overflow-hidden">
        <AsanaSidebar
          tasks={filteredAsanaTasks}
          isLoading={isLoading}
          scheduledAsanaTasks={scheduledAsanaTasks}
          onUnschedule={onUnschedule}
          colorScheme={colorScheme}
          lockedIntegrationId={omIntegrationId}
          projects={asanaProjects}
          typeValues={asanaTypeValues}
          typeFieldInfoByIntegration={asanaTypeFieldInfoByIntegration}
          integrations={asanaIntegrations}
          filters={omFilters}
          onFiltersChange={onOmFiltersChange}
          onClearFilters={onOmClearFilters}
          onToggleComplete={onToggleComplete}
          onAddComment={onAddComment}
          onCreateTask={onCreateAsanaTask}
          onUpdateTask={onUpdateTask}
          onDeleteTask={onDeleteTask}
          highlightedTaskId={highlightedAsanaTaskId}
          onClearHighlight={onClearHighlight}
          openTaskDialogId={openTaskDialogId}
          onClearOpenTaskDialog={onClearOpenTaskDialog}
          taskMetadata={metadataByGid}
          onSaveTaskMetadata={onSaveTaskMetadata}
          delegation={delegationByGid}
          onDelegated={onDelegated}
        />
      </aside>

      <main className={`flex-1 overflow-y-auto px-4 py-6 ${colorScheme.mainBg}`}>
        <div className="max-w-5xl mx-auto">
          {settings && <IntegrationStatus settings={settings} />}

          <AllDayEventsBar
            events={allDayEvents}
            onEventClick={onEventClick}
            onEventDoubleClick={onEventDoubleClick}
          />

          <div className="bg-white rounded-lg border shadow-sm p-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              </div>
            ) : (
              <Timeline
                events={timedEvents}
                selectedDate={selectedDate}
                onDropTask={onDropTask}
                onEventMove={onEventMove}
                onDeleteEvent={onDeleteEvent}
                onCreateTask={onCreateTask}
                onEventClick={onEventClick}
                onEventDoubleClick={onEventDoubleClick}
                googleEventAttributions={googleEventAttributions}
                asanaIntegrations={asanaIntegrations}
                onSetAttribution={async (googleEventId, googleIntegrationId, asanaIntegrationId) => {
                  try {
                    await api.setGoogleEventAttribution(googleEventId, googleIntegrationId, asanaIntegrationId);
                    setGoogleEventAttributions(prev => ({
                      ...prev,
                      [googleEventId]: { asanaIntegrationId, googleIntegrationId },
                    }));
                    const integration = asanaIntegrations.find(i => i.id === asanaIntegrationId);
                    toast.success(`Event counts toward ${integration?.name || 'workspace'}`);
                  } catch (err) {
                    console.error('Failed to set attribution:', err);
                    toast.error('Failed to set attribution');
                  }
                }}
                onRemoveAttribution={async (googleEventId) => {
                  try {
                    await api.removeGoogleEventAttribution(googleEventId);
                    setGoogleEventAttributions(prev => {
                      const next = { ...prev };
                      delete next[googleEventId];
                      return next;
                    });
                    toast.success('Attribution removed');
                  } catch (err) {
                    console.error('Failed to remove attribution:', err);
                    toast.error('Failed to remove attribution');
                  }
                }}
              />
            )}
          </div>

        </div>
      </main>

      {/* Right sidebar: DBC Asana workspace */}
      <aside className="w-72 flex-shrink-0 overflow-hidden">
        <AsanaSidebar
          tasks={filteredAsanaTasks}
          isLoading={isLoading}
          scheduledAsanaTasks={scheduledAsanaTasks}
          onUnschedule={onUnschedule}
          colorScheme={colorScheme}
          lockedIntegrationId={dbcIntegrationId}
          projects={asanaProjects}
          typeValues={asanaTypeValues}
          typeFieldInfoByIntegration={asanaTypeFieldInfoByIntegration}
          integrations={asanaIntegrations}
          filters={dbcFilters}
          onFiltersChange={onDbcFiltersChange}
          onClearFilters={onDbcClearFilters}
          onToggleComplete={onToggleComplete}
          onAddComment={onAddComment}
          onCreateTask={onCreateAsanaTask}
          onUpdateTask={onUpdateTask}
          onDeleteTask={onDeleteTask}
          highlightedTaskId={highlightedAsanaTaskId}
          onClearHighlight={onClearHighlight}
          openTaskDialogId={openTaskDialogId}
          onClearOpenTaskDialog={onClearOpenTaskDialog}
          taskMetadata={metadataByGid}
          onSaveTaskMetadata={onSaveTaskMetadata}
          delegation={delegationByGid}
          onDelegated={onDelegated}
        />
      </aside>
    </div>
  );
}
