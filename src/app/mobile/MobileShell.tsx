'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { addDays, format, subDays } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDuration, getDayLabel } from '@/lib/event-display';
import { mergeEventsForDate } from '@/lib/event-merge';
import { logicalToday } from '@/lib/date-utils';
import { useCalendarEvents } from '@/hooks/useCalendarEvents';
import { useDashboard } from '@/hooks/useDashboard';
import { useDelegationQueue } from '@/hooks/useDelegationQueue';
import { useReminders } from '@/hooks/useReminders';
import { useTaskMetadata } from '@/hooks/useTaskMetadata';
import { useTasks } from '@/hooks/useTasks';
import { useTimeAttribution } from '@/hooks/useTimeAttribution';
import { useToast } from '@/hooks/useToast';
import { DelegateModal } from '@/components/DelegateModal';
import { CalendarEvent, DelegationQueueEntry, SettingsResponse } from '@/types';
import { MOBILE_COLOR_SCHEMES, MobileHeader } from './components/MobileHeader';
import { MOBILE_TABS, MobileTab, MobileTabBar } from './components/MobileTabBar';
import { EventDetailSheet } from './components/EventDetailSheet';
import { MobileTaskDetailSheet } from './components/MobileTaskDetailSheet';
import { CommandCenterTab } from './tabs/CommandCenterTab';
import { DayTab } from './tabs/DayTab';
import { RemindersTab } from './tabs/RemindersTab';
import { ExerciseTab } from './tabs/ExerciseTab';
import { GoalsTab } from './tabs/GoalsTab';
import { WellbeingTab } from './tabs/WellbeingTab';
import { useGoalNudges } from '@/hooks/useGoalNudges';
import {
  useExerciseOverview,
  useGoalsOverview,
  useWellbeingOverview,
} from '@/hooks/useLifeAreas';

const TAB_STORAGE_KEY = 'mobile-active-tab';

const TAB_SUBTITLES: Record<MobileTab, string> = {
  home: 'Command Center',
  day: 'Daily Planner',
  reminders: 'Reminders',
  goals: 'Goals',
  exercise: 'Exercise',
  wellbeing: 'Wellbeing',
};

export function MobileShell() {
  const toast = useToast();

  // Default tab matches desktop (Command Center); the persisted choice is
  // applied after mount so SSR and the first client render agree.
  const [activeTab, setActiveTab] = useState<MobileTab>('home');
  useEffect(() => {
    const stored = window.localStorage.getItem(TAB_STORAGE_KEY);
    // Validated against the live tab list, so a tab removed in a later version
    // can't leave the shell rendering nothing.
    if (stored && (MOBILE_TABS as string[]).includes(stored)) {
      setActiveTab(stored as MobileTab);
    }
  }, []);
  const changeTab = useCallback((tab: MobileTab) => {
    setActiveTab(tab);
    try {
      window.localStorage.setItem(TAB_STORAGE_KEY, tab);
    } catch {
      // Private-mode quota errors just lose the persistence, nothing else.
    }
  }, []);

  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [now, setNow] = useState(() => new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [delegateTask, setDelegateTask] = useState<CalendarEvent | null>(null);
  const [colorSchemeIndex, setColorSchemeIndex] = useState(0);
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { getTasksForDate } = useTasks();
  const {
    googleEvents,
    allAsanaTasks,
    scheduledAsanaTasks,
    isLoading,
    fetchAllEvents,
    fetchEventsForDate,
    adhocToCalendarEvent,
    getScheduledAsanaEventsForDate,
    asanaIntegrations,
    completeAsanaTask,
    addAsanaComment,
  } = useCalendarEvents();
  const remindersStore = useReminders();
  const { metadataByGid, saveMetadata } = useTaskMetadata();
  const { delegationByGid, refresh: refreshDelegation } = useDelegationQueue();
  const { data: capacityData, isLoading: capacityLoading, refetch: refetchCapacity } = useDashboard();
  // Life-area feeds. Both are lazy: goal evidence can cost an Asana round trip
  // per goal, so nothing is fetched until the tab is opened.
  const { nudges: goalNudges } = useGoalNudges();
  const goalsOverview = useGoalsOverview(activeTab === 'goals');
  const exerciseOverview = useExerciseOverview(activeTab === 'exercise');
  const wellbeingOverview = useWellbeingOverview(activeTab === 'wellbeing');

  const loadSettings = useCallback(async () => {
    try {
      setSettingsError(null);
      const settingsData = await api.getSettings();
      setSettings(settingsData);
    } catch (error) {
      console.error('Failed to load mobile settings:', error);
      setSettingsError('Unable to load planner settings');
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setColorSchemeIndex(Math.floor(Math.random() * MOBILE_COLOR_SCHEMES.length));
    });

    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    fetchEventsForDate(selectedDate);
  }, [fetchEventsForDate, selectedDate]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60 * 1000);
    return () => window.clearInterval(interval);
  }, []);

  // Merge the day's sources (Google + adhoc + scheduled Asana) for any date.
  const buildEventsForDate = useCallback((dateStr: string): CalendarEvent[] => {
    const adhocEvents = getTasksForDate(dateStr)
      .filter(task => task.dueTime && !task.googleEventId)
      .map(adhocToCalendarEvent);

    return mergeEventsForDate(dateStr, {
      googleEvents,
      scheduledAsanaTasks,
      adhocEvents,
      scheduledAsanaEvents: getScheduledAsanaEventsForDate(dateStr),
      allAsanaTasks,
    });
  }, [
    adhocToCalendarEvent,
    allAsanaTasks,
    getScheduledAsanaEventsForDate,
    getTasksForDate,
    googleEvents,
    scheduledAsanaTasks,
  ]);

  const dateKey = useMemo(() => format(selectedDate, 'yyyy-MM-dd'), [selectedDate]);
  const dayEvents = useMemo(() => buildEventsForDate(dateKey), [buildEventsForDate, dateKey]);

  // Logical today's timed events for the Command Center, attributed to
  // workspaces by the same rules as desktop.
  const buildTodayTimedEvents = useCallback(
    (rolloverHour: number) =>
      buildEventsForDate(logicalToday(new Date(), rolloverHour)).filter(e => !e.allDay),
    [buildEventsForDate]
  );
  const {
    rolloverHour,
    todayTimedEvents,
    timeWorkedByIntegration,
    timeScheduledByIntegration,
  } = useTimeAttribution(settings, googleEvents, buildTodayTimedEvents);

  // Unscheduled Asana tasks due/starting on the selected date (Day tab list).
  const dueTodayTasks = useMemo(() => {
    const dayStart = new Date(selectedDate);
    dayStart.setHours(0, 0, 0, 0);
    const fallback = dayStart.getTime();

    return allAsanaTasks
      .filter(task => !task.completed)
      .filter(task => task.dueOn === dateKey || task.startOn === dateKey)
      .filter(task => !scheduledAsanaTasks.some(schedule => schedule.asanaTaskId === task.id && schedule.scheduledDate === dateKey))
      .sort((a, b) => {
        const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : fallback;
        const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : fallback;
        return aCreated - bCreated;
      });
  }, [allAsanaTasks, dateKey, scheduledAsanaTasks, selectedDate]);

  const incompleteAsanaTasks = useMemo(
    () => allAsanaTasks.filter(t => !t.completed),
    [allAsanaTasks]
  );

  // GIDs the store currently shows as completed — a task merely absent from the
  // store is NOT treated as completed (matches desktop).
  const completedTaskGids = useMemo(() => {
    const set = new Set<string>();
    for (const t of allAsanaTasks) {
      if (t.completed) set.add(t.id);
    }
    return set;
  }, [allAsanaTasks]);

  const openTask = useMemo(
    () => (openTaskId ? allAsanaTasks.find(t => t.id === openTaskId) ?? null : null),
    [openTaskId, allAsanaTasks]
  );

  const activeReminderCount = useMemo(
    () => remindersStore.reminders.filter(r => !r.completed).length,
    [remindersStore.reminders]
  );

  const connectedCount = useMemo(() => {
    if (!settings) return 0;
    const google = settings.googleIntegrations.filter(item => item.enabled && item.connected).length;
    const asana = settings.asanaIntegrations.filter(item => item.enabled && item.connected).length;
    return google + asana;
  }, [settings]);

  // Every configured workspace, whether or not any of its tasks loaded, so a
  // fetch failure can't silently drop a workspace row (matches desktop).
  const dashboardIntegrations = useMemo(() => {
    const fromSettings = (settings?.asanaIntegrations ?? [])
      .filter(i => i.enabled)
      .map(i => ({ id: i.id, name: i.name }));
    const seen = new Set(fromSettings.map(i => i.id));
    return [...fromSettings, ...asanaIntegrations.filter(i => !seen.has(i.id))];
  }, [settings, asanaIntegrations]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([fetchAllEvents(), loadSettings(), remindersStore.refetch()]);
      refreshDelegation();
      refetchCapacity();
      // Only the life-area feed being looked at — refreshing the other would
      // fetch data that isn't on screen, and goal evidence isn't free.
      if (activeTab === 'goals') goalsOverview.refresh();
      if (activeTab === 'exercise') exerciseOverview.refresh();
      if (activeTab === 'wellbeing') wellbeingOverview.refresh();
    } finally {
      setIsRefreshing(false);
    }
  }, [
    fetchAllEvents,
    loadSettings,
    remindersStore,
    refreshDelegation,
    refetchCapacity,
    activeTab,
    goalsOverview,
    exerciseOverview,
    wellbeingOverview,
  ]);

  // A Day-tab event opens the task sheet when it's backed by an Asana task in
  // the store; otherwise the read-only event sheet.
  const handleSelectEvent = useCallback((event: CalendarEvent) => {
    const taskId = event.linkedAsanaTaskId || (event.source === 'asana' ? event.id : null);
    if (taskId && allAsanaTasks.some(t => t.id === taskId)) {
      setOpenTaskId(taskId);
      return;
    }
    setSelectedEvent(event);
  }, [allAsanaTasks]);

  const handleOpenTask = useCallback((taskOrGid: CalendarEvent | string) => {
    setOpenTaskId(typeof taskOrGid === 'string' ? taskOrGid : taskOrGid.id);
  }, []);

  const handleToggleComplete = useCallback((taskId: string, integrationId: string, completed: boolean) => {
    completeAsanaTask(taskId, integrationId, completed)
      .then(() => {
        refetchCapacity();
        toast.success(completed ? 'Task completed' : 'Task reopened');
      })
      .catch(err => {
        console.error('Failed to update task:', err);
        toast.error('Failed to update task');
      });
  }, [completeAsanaTask, refetchCapacity, toast]);

  const handleMoveToBacklog = useCallback((entry: DelegationQueueEntry) => {
    saveMetadata(entry.asanaTaskGid, entry.integrationId, { aiDelegable: false })
      .catch(err => console.error('Error clearing aiDelegable:', err));
    api.markDelegationReviewed(entry.asanaTaskGid, entry.integrationId)
      .then(() => refreshDelegation())
      .catch(err => {
        toast.error('Failed to clear from review');
        console.error('Error marking delegation reviewed:', err);
      });
    toast.success('Moved to backlog for a human');
  }, [saveMetadata, refreshDelegation, toast]);

  // "Return to AI queue": the next step is AI-runnable again. Mirrors the
  // desktop handler — stamp returnedToAiAt + settle reviewedAt (leaves
  // For-review, lifts the AI-runnable exclusion) and re-affirm aiDelegable + a
  // positive verdict so a later assessment can't drop it.
  const handleReturnToAiQueue = useCallback((entry: DelegationQueueEntry) => {
    saveMetadata(entry.asanaTaskGid, entry.integrationId, { aiDelegable: true })
      .catch(err => console.error('Error setting aiDelegable:', err));
    Promise.all([
      api.returnDelegationToAiQueue(entry.asanaTaskGid, entry.integrationId, entry.reviewedAt),
      api.applyAiVerdicts([{ gid: entry.asanaTaskGid, integrationId: entry.integrationId }], []),
    ])
      .then(() => refreshDelegation())
      .catch(err => {
        toast.error('Failed to return to AI queue');
        console.error('Error returning delegation to AI queue:', err);
      });
    toast.success('Returned to AI queue');
  }, [saveMetadata, refreshDelegation, toast]);

  const prevDay = subDays(selectedDate, 1);
  const nextDay = addDays(selectedDate, 1);
  const showLoading = isLoading || isRefreshing;
  const colorScheme = MOBILE_COLOR_SCHEMES[colorSchemeIndex];

  return (
    <div className="min-h-dvh touch-manipulation bg-slate-100 text-gray-950">
      <MobileHeader
        colorScheme={colorScheme}
        subtitle={TAB_SUBTITLES[activeTab]}
        googleEvents={googleEvents}
        onRefresh={handleRefresh}
        isRefreshing={showLoading}
      >
        {activeTab === 'day' && (
          <>
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedDate(prevDay)}
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md bg-white/10 text-white transition-colors hover:bg-white/20"
                aria-label="Previous day"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => setSelectedDate(new Date())}
                className="min-w-0 flex-1 rounded-md bg-white px-3 py-2 text-center text-slate-950 shadow-sm"
              >
                <span className="block text-base font-semibold">{getDayLabel(selectedDate)}</span>
                <span className="block text-xs text-slate-500">{format(selectedDate, 'EEEE, MMMM d')}</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedDate(nextDay)}
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md bg-white/10 text-white transition-colors hover:bg-white/20"
                aria-label="Next day"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-200">
              <span className="rounded-full bg-white/10 px-2.5 py-1">
                {settingsError || `${connectedCount} connected`}
              </span>
              {asanaIntegrations.map(integration => {
                const minutes = timeWorkedByIntegration[integration.id] || 0;
                if (minutes === 0) return null;
                return (
                  <span key={integration.id} className="rounded-full bg-white/10 px-2.5 py-1">
                    {integration.name}: {formatDuration(minutes)}
                  </span>
                );
              })}
            </div>
          </>
        )}
      </MobileHeader>

      <main className="mx-auto max-w-xl px-4 pb-[calc(4.5rem+env(safe-area-inset-bottom))] pt-4">
        {activeTab === 'home' && (
          <CommandCenterTab
            todayEvents={todayTimedEvents}
            asanaTasks={incompleteAsanaTasks}
            metadataByGid={metadataByGid}
            delegationByGid={delegationByGid}
            capacityData={capacityData}
            capacityLoading={capacityLoading}
            timeWorkedByIntegration={timeWorkedByIntegration}
            timeScheduledByIntegration={timeScheduledByIntegration}
            rolloverHour={rolloverHour}
            asanaIntegrations={dashboardIntegrations}
            completedTaskGids={completedTaskGids}
            onExpandToDay={() => changeTab('day')}
            onOpenTask={handleOpenTask}
            onDelegateTask={setDelegateTask}
          />
        )}

        {activeTab === 'day' && (
          <DayTab
            selectedDate={selectedDate}
            now={now}
            events={dayEvents}
            dueTodayTasks={dueTodayTasks}
            isLoading={showLoading}
            onSelectEvent={handleSelectEvent}
            onSelectTask={handleOpenTask}
          />
        )}

        {activeTab === 'goals' && (
          <GoalsTab
            monthItems={goalsOverview.monthItems}
            quarterItems={goalsOverview.quarterItems}
            nudges={goalNudges}
            isLoading={goalsOverview.isLoading}
            error={goalsOverview.error}
          />
        )}

        {activeTab === 'exercise' && (
          <ExerciseTab
            planned={exerciseOverview.planned}
            recent={exerciseOverview.recent}
            analysis={exerciseOverview.analysis}
            onSessionChanged={exerciseOverview.refresh}
            isLoading={exerciseOverview.isLoading}
            error={exerciseOverview.error}
          />
        )}

        {activeTab === 'wellbeing' && (
          <WellbeingTab
            analysis={wellbeingOverview.analysis}
            experiments={wellbeingOverview.experiments}
            isLoading={wellbeingOverview.isLoading}
            error={wellbeingOverview.error}
          />
        )}

        {activeTab === 'reminders' && (
          <RemindersTab
            reminders={remindersStore.reminders}
            updatingIds={remindersStore.updatingIds}
            hasUndo={remindersStore.undoState !== null}
            error={remindersStore.error}
            onComplete={reminder => void remindersStore.completeReminder(reminder)}
            onUndo={() => void remindersStore.undo()}
          />
        )}
      </main>

      <MobileTabBar
        activeTab={activeTab}
        onTabChange={changeTab}
        reminderCount={activeReminderCount}
        goalNudgeCount={goalNudges.length}
      />

      {selectedEvent && (
        <EventDetailSheet
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}

      {openTask && (
        <MobileTaskDetailSheet
          task={openTask}
          delegationEntry={delegationByGid[openTask.id]}
          onClose={() => setOpenTaskId(null)}
          onToggleComplete={handleToggleComplete}
          onAddComment={addAsanaComment}
          onDelegate={setDelegateTask}
          onMoveToBacklog={handleMoveToBacklog}
          onReturnToAiQueue={handleReturnToAiQueue}
        />
      )}

      {delegateTask && delegateTask.integrationId && (
        <DelegateModal
          asanaTaskGid={delegateTask.id}
          integrationId={delegateTask.integrationId}
          taskTitle={delegateTask.title}
          initialBrief={delegateTask.description || ''}
          onClose={() => setDelegateTask(null)}
          onDelegated={() => {
            refreshDelegation();
            refetchCapacity();
          }}
        />
      )}
    </div>
  );
}
