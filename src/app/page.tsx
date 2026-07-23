'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import { Calendar, Repeat, LayoutDashboard, Bell } from 'lucide-react';
import { Header } from '@/components/Header';
import { TaskDetailDialog } from '@/components/AsanaSidebar';
import { DelegateModal } from '@/components/DelegateModal';
import { AddTaskModal } from '@/components/AddTaskModal';
import { RitualsContent } from '@/components/RitualsContent';
import { Reminders } from '@/components/Reminders';
import { DashboardContent } from '@/components/dashboard/DashboardContent';
import { CalendarTab } from '@/components/home/CalendarTab';
import { CalendarSelectionModal } from '@/components/home/CalendarSelectionModal';
import { DeleteConfirmModal } from '@/components/home/DeleteConfirmModal';
import { GoogleEventModal } from '@/components/home/GoogleEventModal';
import { useTasks } from '@/hooks/useTasks';
import { useCalendarEvents } from '@/hooks/useCalendarEvents';
import { useTaskMetadata } from '@/hooks/useTaskMetadata';
import { useDelegationQueue } from '@/hooks/useDelegationQueue';
import { useToast } from '@/hooks/useToast';
import { useGoogleEventModal } from '@/hooks/useGoogleEventModal';
import { CalendarEvent, DragItem, TaskType, SettingsResponse, AsanaFilterState } from '@/types';
import { api } from '@/lib/api';
import { asanaTaskUrl, asanaTaskGidsFromText } from '@/lib/asana-url';
import { stripLeadingEmoji } from '@/lib/scheduling/calendar-review';
import { DEFAULT_ROLLOVER_HOUR, logicalToday, logicalTodayDate, formatLocalDate } from '@/lib/date-utils';

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

const COLOR_SCHEMES = [
  {
    name: 'Slate',
    headerBg: 'bg-gradient-to-r from-slate-600 to-slate-700',
    headerText: 'text-white',
    sidebarHeaderBg: 'bg-slate-100',
    sidebarHeaderText: 'text-slate-700',
    mainBg: 'bg-slate-50',
  },
  {
    name: 'Ocean',
    headerBg: 'bg-gradient-to-r from-blue-500 to-blue-600',
    headerText: 'text-white',
    sidebarHeaderBg: 'bg-blue-50',
    sidebarHeaderText: 'text-blue-700',
    mainBg: 'bg-blue-50/50',
  },
  {
    name: 'Forest',
    headerBg: 'bg-gradient-to-r from-emerald-500 to-emerald-600',
    headerText: 'text-white',
    sidebarHeaderBg: 'bg-emerald-50',
    sidebarHeaderText: 'text-emerald-700',
    mainBg: 'bg-emerald-50/50',
  },
  {
    name: 'Lavender',
    headerBg: 'bg-gradient-to-r from-violet-500 to-violet-600',
    headerText: 'text-white',
    sidebarHeaderBg: 'bg-violet-50',
    sidebarHeaderText: 'text-violet-700',
    mainBg: 'bg-violet-50/50',
  },
  {
    name: 'Rose',
    headerBg: 'bg-gradient-to-r from-rose-500 to-rose-600',
    headerText: 'text-white',
    sidebarHeaderBg: 'bg-rose-50',
    sidebarHeaderText: 'text-rose-700',
    mainBg: 'bg-rose-50/50',
  },
  {
    name: 'Amber',
    headerBg: 'bg-gradient-to-r from-amber-500 to-amber-600',
    headerText: 'text-white',
    sidebarHeaderBg: 'bg-amber-50',
    sidebarHeaderText: 'text-amber-700',
    mainBg: 'bg-amber-50/50',
  },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'calendar' | 'rituals' | 'reminders'>(() => {
    if (typeof window !== 'undefined') {
      if (window.location.hash === '#rituals') return 'rituals';
      if (window.location.hash === '#reminders') return 'reminders';
      if (window.location.hash === '#calendar') return 'calendar';
    }
    return 'dashboard';
  });

  const handleTabChange = useCallback((tab: string) => {
    const t = tab as 'dashboard' | 'calendar' | 'rituals' | 'reminders';
    setActiveTab(t);
    window.location.hash = t === 'dashboard' ? '' : t;
  }, []);

  // The day-rollover hour (from workflow config); local times before it count as
  // the previous day. Defaults until the config loads. See lib/date-utils.ts.
  const [rolloverHour, setRolloverHour] = useState(DEFAULT_ROLLOVER_HOUR);
  const [selectedDate, setSelectedDate] = useState(() => logicalTodayDate(new Date(), DEFAULT_ROLLOVER_HOUR));
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [colorSchemeIndex, setColorSchemeIndex] = useState(0);

  // Set random color scheme on mount (client-side only) to avoid hydration mismatch
  useEffect(() => {
    setColorSchemeIndex(Math.floor(Math.random() * COLOR_SCHEMES.length));
  }, []);

  const colorScheme = COLOR_SCHEMES[colorSchemeIndex];

  const toast = useToast();
  const { metadataByGid, saveMetadata, reload: reloadMetadata } = useTaskMetadata();
  const { delegationByGid, refresh: refreshDelegation } = useDelegationQueue();
  const { addTask, updateTask, removeTask, getTasksForDate } = useTasks();
  const {
    googleEvents,
    allAsanaTasks,
    filteredAsanaTasks,
    scheduledAsanaTasks,
    isLoading,
    fetchAllEvents,
    fetchEventsForDate,
    adhocToCalendarEvent,
    scheduleAsana,
    updateScheduledAsana,
    updateScheduledAsanaByGoogleEvent,
    unscheduleAsana,
    unscheduleAllAsanaInstances,
    updateGoogleEvent,
    createGoogleEvent,
    deleteGoogleEvent,
    getScheduledAsanaEventsForDate,
    completeAsanaTask,
    addAsanaComment,
    createAsanaTask,
    updateAsanaTask,
    deleteAsanaTask,
    asanaProjects,
    asanaTypeValues,
    asanaTypeFieldInfoByIntegration,
    asanaIntegrations,
    setAsanaFilters,
    getAsanaFiltersForIntegration,
    clearAsanaFilters,
  } = useCalendarEvents();

  const [calendarSelectionModal, setCalendarSelectionModal] = useState<{
    show: boolean;
    pendingDrop: { dragItem: DragItem; startTime: Date; endTime: Date } | null;
  }>({ show: false, pendingDrop: null });

  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
    show: boolean;
    event: CalendarEvent | null;
  }>({ show: false, event: null });

  const [createTaskModal, setCreateTaskModal] = useState<{
    show: boolean;
    startTime: Date | null;
    endTime: Date | null;
  }>({ show: false, startTime: null, endTime: null });

  const [highlightedAsanaTaskId, setHighlightedAsanaTaskId] = useState<string | null>(null);
  const [openTaskDialogId, setOpenTaskDialogId] = useState<string | null>(null);
  const [staleModalOpen, setStaleModalOpen] = useState(false);
  const googleEventModal = useGoogleEventModal();
  const {
    selectedGoogleEvent,
    setSelectedGoogleEvent,
    isEditing: isEditingGoogleEvent,
    setIsEditing: setIsEditingGoogleEvent,
  } = googleEventModal;

  // Google event attributions for time tracking
  const [googleEventAttributions, setGoogleEventAttributions] = useState<
    Record<string, { asanaIntegrationId: string; googleIntegrationId: string }>
  >({});

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedGoogleEvent) {
          if (isEditingGoogleEvent) {
            setIsEditingGoogleEvent(false);
          } else {
            setSelectedGoogleEvent(null);
          }
        } else if (calendarSelectionModal.show) {
          setCalendarSelectionModal({ show: false, pendingDrop: null });
        } else if (deleteConfirmModal.show) {
          setDeleteConfirmModal({ show: false, event: null });
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedGoogleEvent, isEditingGoogleEvent, calendarSelectionModal.show, deleteConfirmModal.show]);

  useEffect(() => {
    api.getSettings()
      .then(data => setSettings(data))
      .catch(err => {
        console.error('Failed to load settings:', err);
        toast.error('Failed to load integration settings');
      });
  }, [toast]);

  // Load the configured day-rollover hour. If it differs from the default we
  // assumed at init and the user hasn't navigated away from the auto-selected
  // "today", re-sync the selected date to the configured logical today.
  useEffect(() => {
    api.getWorkflowConfig()
      .then(config => {
        const hour = config.scheduling.dayRolloverHour ?? DEFAULT_ROLLOVER_HOUR;
        setRolloverHour(hour);
        setSelectedDate(prev => {
          const stillOnDefaultToday =
            formatLocalDate(prev) === logicalToday(new Date(), DEFAULT_ROLLOVER_HOUR);
          return stillOnDefaultToday ? logicalTodayDate(new Date(), hour) : prev;
        });
      })
      .catch(err => {
        console.error('Failed to load workflow config:', err);
      });
  }, []);

  // Fetch Google event attributions for time tracking
  useEffect(() => {
    api.getGoogleEventAttributions()
      .then(data => {
        const map: Record<string, { asanaIntegrationId: string; googleIntegrationId: string }> = {};
        for (const attr of data.attributions) {
          map[attr.googleEventId] = {
            asanaIntegrationId: attr.asanaIntegrationId,
            googleIntegrationId: attr.googleIntegrationId,
          };
        }
        setGoogleEventAttributions(map);
      })
      .catch(err => {
        console.error('Failed to load Google event attributions:', err);
      });
  }, []);

  // Fetch events for newly navigated dates
  useEffect(() => {
    fetchEventsForDate(selectedDate);
  }, [selectedDate, fetchEventsForDate]);

  // Check if an event falls on a specific date
  const isEventOnDate = useCallback((event: CalendarEvent, targetDate: string): boolean => {
    const startDateStr = format(event.startTime, 'yyyy-MM-dd');
    const endDateStr = format(event.endTime, 'yyyy-MM-dd');

    // All-day events have exclusive end dates (Jan 15-16 = 1-day event on Jan 15)
    if (event.allDay) {
      return targetDate >= startDateStr && targetDate < endDateStr;
    }
    return startDateStr === targetDate;
  }, []);

  // Incomplete Asana task titles → gids, for linking planner blocks created
  // before descriptions carried task URLs. Those blocks are titled
  // "<category emoji> <task title>" (or just the task title when it already led
  // with its own emoji), so an exact title match identifies the task.
  const asanaGidsByTitle = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const t of allAsanaTasks) {
      if (t.completed) continue;
      const key = t.title.trim();
      map.set(key, [...(map.get(key) ?? []), t.id]);
    }
    return map;
  }, [allAsanaTasks]);

  // Combine calendar events for a given date, filtering out duplicates from synced Google events
  const buildEventsForDate = useCallback((dateStr: string): CalendarEvent[] => {
    const filteredGoogleEvents = googleEvents.filter(event => isEventOnDate(event, dateStr));

    const enrichedGoogleEvents = filteredGoogleEvents.map(event => {
      const linkedAsana = scheduledAsanaTasks.find(s => s.googleEventId === event.id);
      if (linkedAsana) {
        return {
          ...event,
          linkedAsanaTaskId: linkedAsana.asanaTaskId,
          linkedAsanaIntegrationId: linkedAsana.integrationId,
          // Use Asana color for linked events
          color: '#f06a6a',
        };
      }
      // No schedule-store link: fall back to a task URL in the description. Only
      // link when exactly one distinct task is referenced — grouped blocks with
      // several task URLs are ambiguous about which task to open, so stay
      // unlinked. Description-only links keep the event's own color and leave
      // linkedAsanaIntegrationId unset (unknown from the URL alone).
      const descGids = event.description ? asanaTaskGidsFromText(event.description) : [];
      if (descGids.length === 1) {
        return { ...event, linkedAsanaTaskId: descGids[0] };
      }
      // Last resort, for planner blocks that predate description links: match
      // the title against incomplete Asana tasks, tolerating the planner's
      // category-emoji prefix. Only an unambiguous (single-task) match links.
      const strippedTitle = stripLeadingEmoji(event.title);
      const titleGids =
        asanaGidsByTitle.get(strippedTitle) ?? asanaGidsByTitle.get(event.title.trim()) ?? [];
      if (titleGids.length === 1) {
        return { ...event, linkedAsanaTaskId: titleGids[0] };
      }
      return event;
    });

    // Exclude tasks that are already synced to Google to avoid duplicates
    const adhocTasks = getTasksForDate(dateStr).filter(t => t.dueTime && !t.googleEventId);
    const adhocEvents = adhocTasks.map(adhocToCalendarEvent);

    // Exclude Asana schedules linked to Google events (shown via enrichedGoogleEvents)
    const scheduledAsanaEvents = getScheduledAsanaEventsForDate(dateStr).filter(event => {
      const schedule = scheduledAsanaTasks.find(s => s.id === event.id);
      return !schedule?.googleEventId;
    });

    return [...enrichedGoogleEvents, ...adhocEvents, ...scheduledAsanaEvents];
  }, [googleEvents, getTasksForDate, adhocToCalendarEvent, getScheduledAsanaEventsForDate, scheduledAsanaTasks, isEventOnDate]);

  const allEvents = useMemo(
    () => buildEventsForDate(format(selectedDate, 'yyyy-MM-dd')),
    [buildEventsForDate, selectedDate]
  );

  // Separate all-day events from timed events
  const allDayEvents = useMemo(() => allEvents.filter(e => e.allDay), [allEvents]);
  const timedEvents = useMemo(() => allEvents.filter(e => !e.allDay), [allEvents]);

  // Today's timed events for the Command Center dashboard (independent of selectedDate)
  const todayTimedEvents = useMemo(
    () => buildEventsForDate(logicalToday(new Date(), rolloverHour)).filter(e => !e.allDay),
    [buildEventsForDate, rolloverHour]
  );

  // Resolve the Asana integration ID for an event, checking linked tasks,
  // Asana source events, and manual Google event attributions
  const getAsanaIntegrationIdForEvent = useCallback((event: CalendarEvent): string | null => {
    const directId = event.linkedAsanaIntegrationId ||
      (event.source === 'asana' ? event.integrationId : null);
    if (directId) return directId;

    if (event.source === 'google') {
      return googleEventAttributions[event.id]?.asanaIntegrationId ?? null;
    }
    return null;
  }, [googleEventAttributions]);

  // Calculate time worked per Asana integration from timed events
  // Counts: Asana-linked events, standalone Asana events, AND attributed Google events
  const timeWorkedByIntegration = useMemo(() => {
    const totals: Record<string, number> = {};

    for (const event of timedEvents) {
      const asanaIntegrationId = getAsanaIntegrationIdForEvent(event);
      if (!asanaIntegrationId) continue;

      const minutes = (event.endTime.getTime() - event.startTime.getTime()) / 60000;
      totals[asanaIntegrationId] = (totals[asanaIntegrationId] || 0) + minutes;
    }

    return totals;
  }, [timedEvents, getAsanaIntegrationIdForEvent]);

  // Record time tracking data for longitudinal analysis
  // Only records for today or past dates, debounced to avoid excessive writes
  useEffect(() => {
    const dateStr = formatLocalDate(selectedDate);
    const today = logicalToday(new Date(), rolloverHour);

    // Only record for dates that are today or in the past (logical day, so a
    // just-after-midnight session still records against the day it belongs to).
    if (dateStr > today) return;

    // Skip if no events or still loading
    if (isLoading || timedEvents.length === 0) return;

    // Debounce the recording
    const timeoutId = setTimeout(() => {
      // Build integration totals with names
      const integrationTotals: Record<string, { integrationId: string; integrationName: string; totalMinutes: number }> = {};
      for (const [integrationId, minutes] of Object.entries(timeWorkedByIntegration)) {
        const integration = asanaIntegrations.find(i => i.id === integrationId);
        integrationTotals[integrationId] = {
          integrationId,
          integrationName: integration?.name || 'Unknown',
          totalMinutes: minutes,
        };
      }

      // Build event records for detailed analysis
      const eventRecords = timedEvents
        .map(event => {
          const asanaIntegrationId = getAsanaIntegrationIdForEvent(event);
          if (!asanaIntegrationId) return null;
          const integration = asanaIntegrations.find(i => i.id === asanaIntegrationId);
          return {
            eventId: event.id,
            title: event.title,
            integrationId: asanaIntegrationId,
            integrationName: integration?.name || 'Unknown',
            startTime: event.startTime.toISOString(),
            endTime: event.endTime.toISOString(),
            durationMinutes: Math.round((event.endTime.getTime() - event.startTime.getTime()) / 60000),
            source: event.source as 'google' | 'asana',
            linkedAsanaTaskId: event.linkedAsanaTaskId,
          };
        })
        .filter((record): record is NonNullable<typeof record> => record !== null);

      // Record the time data
      api.recordTimeTracking(dateStr, integrationTotals, eventRecords).catch(err => {
        console.error('Failed to record time tracking data:', err);
      });
    }, 2000); // 2 second debounce

    return () => clearTimeout(timeoutId);
  }, [selectedDate, timedEvents, timeWorkedByIntegration, asanaIntegrations, isLoading, getAsanaIntegrationIdForEvent, rolloverHour]);

  const handleRefresh = useCallback(() => {
    // Rotate to a new random color scheme on refresh
    setColorSchemeIndex(prev => {
      let newIndex;
      do {
        newIndex = Math.floor(Math.random() * COLOR_SCHEMES.length);
      } while (newIndex === prev && COLOR_SCHEMES.length > 1);
      return newIndex;
    });
    fetchAllEvents();
  }, [fetchAllEvents]);

  const handleSidebarAsanaComplete = useCallback((taskId: string, integrationId: string, completed: boolean) => {
    toast.success(completed ? 'Task marked complete' : 'Task reopened');
    completeAsanaTask(taskId, integrationId, completed).catch(err => {
      toast.error('Failed to update task in Asana');
      console.error('Error completing Asana task:', err);
    });
  }, [completeAsanaTask, toast]);

  const handleSidebarAsanaComment = useCallback(async (taskId: string, integrationId: string, comment: string) => {
    try {
      await addAsanaComment(taskId, integrationId, comment);
      toast.success('Comment added to Asana');
    } catch (err) {
      toast.error('Failed to add comment to Asana');
      console.error('Error adding Asana comment:', err);
    }
  }, [addAsanaComment, toast]);

  const handleSidebarAsanaDelete = useCallback((taskId: string, integrationId: string) => {
    unscheduleAllAsanaInstances(taskId);
    toast.success('Task deleted from Asana');
    deleteAsanaTask(taskId, integrationId).catch(err => {
      toast.error('Failed to delete task from Asana');
      console.error('Error deleting Asana task:', err);
    });
  }, [deleteAsanaTask, unscheduleAllAsanaInstances, toast]);

  const handleSidebarAsanaUpdate = useCallback((
    taskId: string,
    integrationId: string,
    updates: {
      dueOn?: string | null;
      startOn?: string | null;
      customFields?: Record<string, string | null>;
      addProjects?: string[];
      removeProjects?: string[];
      addTags?: string[];
      removeTags?: string[];
    }
  ) => {
    updateAsanaTask(taskId, integrationId, updates).catch(err => {
      toast.error('Failed to update task in Asana');
      console.error('Error updating Asana task:', err);
    });
  }, [updateAsanaTask, toast]);

  const handleSidebarAsanaCreate = useCallback(async (
    integrationId: string,
    name: string,
    options?: { notes?: string; dueOn?: string; projectGid?: string; customFields?: Record<string, string> }
  ) => {
    try {
      const task = await createAsanaTask(integrationId, name, options);
      if (task) {
        toast.success('Task created in Asana');
      }
      return task;
    } catch (err) {
      toast.error('Failed to create task in Asana');
      console.error('Error creating Asana task:', err);
      throw err;
    }
  }, [createAsanaTask, toast]);

  const connectedGoogleIntegrations = useMemo(
    () => settings?.googleIntegrations.filter(i => i.connected && i.enabled) || [],
    [settings]
  );

  // Event routing for an Asana task: if its Asana integration declares an event
  // Google calendar (e.g. OM tasks → OM calendar, marked Free), scheduling that
  // task creates the event there with the configured availability, bypassing the
  // default/picker. Returns null when there's no override or the target calendar
  // isn't connected.
  const asanaEventRouting = useCallback(
    (asanaIntegrationId?: string): { googleIntegrationId: string; transparency: 'opaque' | 'transparent' } | null => {
      if (!asanaIntegrationId) return null;
      const asana = settings?.asanaIntegrations.find(i => i.id === asanaIntegrationId);
      if (!asana?.eventGoogleIntegrationId) return null;
      const target = connectedGoogleIntegrations.find(i => i.id === asana.eventGoogleIntegrationId);
      if (!target) return null;
      return { googleIntegrationId: asana.eventGoogleIntegrationId, transparency: asana.eventTransparency ?? 'opaque' };
    },
    [settings, connectedGoogleIntegrations]
  );

  const handleDropTask = useCallback((dragItem: DragItem, startTime: Date, endTime: Date) => {
    const dateStr = format(startTime, 'yyyy-MM-dd');
    const timeStr = format(startTime, 'HH:mm');
    const duration = Math.round((endTime.getTime() - startTime.getTime()) / (60 * 1000));

    // An Asana task with an event-routing override goes straight to its target
    // calendar (e.g. OM → OM calendar, Free), skipping the picker entirely.
    if (dragItem.type === 'asana-task') {
      const routedTask = allAsanaTasks.find(t => t.id === dragItem.id);
      const routed = asanaEventRouting(routedTask?.integrationId);
      if (routed && routedTask) {
        createGoogleEvent(
          routed.googleIntegrationId,
          routedTask.title,
          startTime,
          endTime,
          asanaTaskUrl(routedTask.id),
          undefined,
          undefined,
          { transparency: routed.transparency }
        ).then(googleEvent => {
          if (googleEvent) {
            scheduleAsana(dragItem.id, routedTask.integrationId, dateStr, timeStr, duration, googleEvent.id, routed.googleIntegrationId, routedTask.title);
            toast.success('Task scheduled and synced to Google Calendar');
          } else {
            scheduleAsana(dragItem.id, routedTask.integrationId, dateStr, timeStr, duration, undefined, undefined, routedTask.title);
            toast.error('Failed to sync with Google Calendar');
          }
        });
        return;
      }
    }

    if (connectedGoogleIntegrations.length > 1) {
      setCalendarSelectionModal({
        show: true,
        pendingDrop: { dragItem, startTime, endTime },
      });
      return;
    }

    const integrationId = connectedGoogleIntegrations.length === 1 ? connectedGoogleIntegrations[0].id : undefined;

    if (dragItem.type === 'adhoc-task') {
      updateTask(dragItem.id, { dueDate: dateStr, dueTime: timeStr, duration });

      if (integrationId) {
        createGoogleEvent(integrationId, dragItem.title, startTime, endTime).then(googleEvent => {
          if (googleEvent) {
            updateTask(dragItem.id, {
              googleEventId: googleEvent.id,
              googleIntegrationId: integrationId,
            });
            toast.success('Event added to Google Calendar');
          } else {
            toast.error('Failed to sync with Google Calendar');
          }
        });
      }
    } else if (dragItem.type === 'asana-task') {
      const asanaTask = allAsanaTasks.find(t => t.id === dragItem.id);

      if (integrationId && asanaTask) {
        createGoogleEvent(integrationId, asanaTask.title, startTime, endTime, asanaTaskUrl(asanaTask.id)).then(googleEvent => {
          if (googleEvent) {
            scheduleAsana(
              dragItem.id,
              asanaTask.integrationId,
              dateStr,
              timeStr,
              duration,
              googleEvent.id,
              integrationId,
              asanaTask.title
            );
            toast.success('Task scheduled and synced to Google Calendar');
          } else {
            scheduleAsana(
              dragItem.id,
              asanaTask.integrationId,
              dateStr,
              timeStr,
              duration,
              undefined,
              undefined,
              asanaTask.title
            );
            toast.error('Failed to sync with Google Calendar');
          }
        });
      } else {
        scheduleAsana(
          dragItem.id,
          asanaTask?.integrationId,
          dateStr,
          timeStr,
          duration,
          undefined,
          undefined,
          asanaTask?.title
        );
      }
    } else if (dragItem.type === 'task-template') {
      addTask({
        title: dragItem.title,
        dueDate: dateStr,
        dueTime: timeStr,
        priority: dragItem.priority || 'medium',
        taskType: dragItem.taskType!,
        completed: false,
      }).then(newTask => {
        if (!newTask) return;
        updateTask(newTask.id, { duration });

        if (integrationId) {
          createGoogleEvent(integrationId, dragItem.title, startTime, endTime).then(googleEvent => {
            if (googleEvent) {
              updateTask(newTask.id, {
                googleEventId: googleEvent.id,
                googleIntegrationId: integrationId,
              });
              toast.success('Event added to Google Calendar');
            } else {
              toast.error('Failed to sync with Google Calendar');
            }
          });
        }
      });
    }
  }, [updateTask, addTask, scheduleAsana, allAsanaTasks, connectedGoogleIntegrations, createGoogleEvent, toast, asanaEventRouting]);

  const handleCalendarSelection = useCallback((integrationId: string) => {
    const { pendingDrop } = calendarSelectionModal;
    if (!pendingDrop) return;

    const { dragItem, startTime, endTime } = pendingDrop;
    const dateStr = format(startTime, 'yyyy-MM-dd');
    const timeStr = format(startTime, 'HH:mm');
    const duration = Math.round((endTime.getTime() - startTime.getTime()) / (60 * 1000));

    if (dragItem.type === 'adhoc-task') {
      updateTask(dragItem.id, {
        dueDate: dateStr,
        dueTime: timeStr,
        duration,
      });

      createGoogleEvent(integrationId, dragItem.title, startTime, endTime).then(googleEvent => {
        if (googleEvent) {
          updateTask(dragItem.id, {
            googleEventId: googleEvent.id,
            googleIntegrationId: integrationId,
          });
          toast.success('Event added to Google Calendar');
        } else {
          toast.error('Failed to sync with Google Calendar');
        }
      });
    } else if (dragItem.type === 'asana-task') {
      const asanaTask = allAsanaTasks.find(t => t.id === dragItem.id);

      if (asanaTask) {
        // Create Google event first, then link to Asana schedule
        createGoogleEvent(integrationId, asanaTask.title, startTime, endTime, asanaTaskUrl(asanaTask.id)).then(googleEvent => {
          if (googleEvent) {
            scheduleAsana(
              dragItem.id,
              asanaTask.integrationId,
              dateStr,
              timeStr,
              duration,
              googleEvent.id,
              integrationId,
              asanaTask.title
            );
            toast.success('Task scheduled and synced to Google Calendar');
          } else {
            scheduleAsana(
              dragItem.id,
              asanaTask.integrationId,
              dateStr,
              timeStr,
              duration,
              undefined,
              undefined,
              asanaTask.title
            );
            toast.error('Failed to sync with Google Calendar');
          }
        });
      }
    } else if (dragItem.type === 'task-template') {
      addTask({
        title: dragItem.title,
        dueDate: dateStr,
        dueTime: timeStr,
        priority: dragItem.priority || 'medium',
        taskType: dragItem.taskType!,
        completed: false,
      }).then(newTask => {
        if (!newTask) return;
        updateTask(newTask.id, { duration });

        createGoogleEvent(integrationId, dragItem.title, startTime, endTime).then(googleEvent => {
          if (googleEvent) {
            updateTask(newTask.id, {
              googleEventId: googleEvent.id,
              googleIntegrationId: integrationId,
            });
            toast.success('Event added to Google Calendar');
          } else {
            toast.error('Failed to sync with Google Calendar');
          }
        });
      });
    }

    setCalendarSelectionModal({ show: false, pendingDrop: null });
  }, [calendarSelectionModal, updateTask, addTask, scheduleAsana, allAsanaTasks, createGoogleEvent, toast]);

  const handleEventMove = useCallback((
    eventId: string,
    source: 'adhoc' | 'asana' | 'google',
    startTime: Date,
    endTime: Date
  ) => {
    const dateStr = format(startTime, 'yyyy-MM-dd');
    const timeStr = format(startTime, 'HH:mm');
    const duration = Math.round((endTime.getTime() - startTime.getTime()) / (60 * 1000));

    if (source === 'adhoc') {
      updateTask(eventId, { dueDate: dateStr, dueTime: timeStr, duration });
    } else if (source === 'asana') {
      updateScheduledAsana(eventId, { scheduledDate: dateStr, scheduledTime: timeStr, duration });
    } else if (source === 'google') {
      const googleEvent = googleEvents.find(e => e.id === eventId);
      if (googleEvent?.integrationId) {
        updateGoogleEvent(eventId, googleEvent.integrationId, startTime, endTime, undefined, undefined, googleEvent.calendarId);
      }
      updateScheduledAsanaByGoogleEvent(eventId, { scheduledDate: dateStr, scheduledTime: timeStr, duration });
    }
  }, [updateTask, updateScheduledAsana, updateScheduledAsanaByGoogleEvent, updateGoogleEvent, googleEvents]);

  const handleAddTask = useCallback(async (task: {
    title: string;
    description?: string;
    dueDate?: string;
    dueTime?: string;
    duration?: number;
    priority: 'low' | 'medium' | 'high';
    taskType: TaskType;
    completed: boolean;
  }, integrationId?: string, timeAttributionId?: string) => {
    const newTask = await addTask(task);
    if (!newTask) return null;

    // If created with time and an integration was selected, sync it immediately
    if (task.dueDate && task.dueTime && task.duration && integrationId) {
      const [hours, minutes] = task.dueTime.split(':').map(Number);
      const startTime = new Date(task.dueDate);
      startTime.setHours(hours, minutes, 0, 0);
      const endTime = new Date(startTime.getTime() + task.duration * 60 * 1000);

      const eventType = task.taskType === 'focus' ? 'focusTime' : undefined;
      createGoogleEvent(integrationId, task.title, startTime, endTime, task.description, eventType).then(async googleEvent => {
        if (googleEvent) {
          updateTask(newTask.id, {
            googleEventId: googleEvent.id,
            googleIntegrationId: integrationId,
          });

          // Set time attribution if selected
          if (timeAttributionId) {
            await api.setGoogleEventAttribution(googleEvent.id, integrationId, timeAttributionId);
            setGoogleEventAttributions(prev => ({
              ...prev,
              [googleEvent.id]: { asanaIntegrationId: timeAttributionId, googleIntegrationId: integrationId },
            }));
          }

          toast.success('Event added to Google Calendar');
        }
      });
    }

    return newTask;
  }, [addTask, createGoogleEvent, updateTask, toast]);

  const handleTimelineCreateTask = useCallback((startTime: Date, endTime: Date) => {
    setCreateTaskModal({ show: true, startTime, endTime });
  }, []);

  const handleEventClick = useCallback((event: CalendarEvent) => {
    const asanaTaskId = event.linkedAsanaTaskId || (event.source === 'asana' ? event.id : null);
    if (asanaTaskId) {
      setHighlightedAsanaTaskId(asanaTaskId);
    }
  }, []);

  const handleClearHighlight = useCallback(() => {
    setHighlightedAsanaTaskId(null);
  }, []);

  const handleEventDoubleClick = useCallback((event: CalendarEvent) => {
    const asanaTaskId = event.linkedAsanaTaskId || (event.source === 'asana' ? event.id : null);
    if (asanaTaskId) {
      setOpenTaskDialogId(asanaTaskId);
    } else if (event.source === 'google') {
      setSelectedGoogleEvent(event);
    }
  }, []);

  const handleClearOpenTaskDialog = useCallback(() => {
    setOpenTaskDialogId(null);
  }, []);

  const handleDeleteEventRequest = useCallback((event: CalendarEvent) => {
    setDeleteConfirmModal({ show: true, event });
  }, []);

  const handleConfirmDelete = useCallback(() => {
    const { event } = deleteConfirmModal;
    if (!event) return;

    // Close modal immediately for better UX
    setDeleteConfirmModal({ show: false, event: null });

    if (event.source === 'google' && event.integrationId) {
      // Also unschedule linked Asana schedule if present (find by googleEventId)
      const linkedSchedule = scheduledAsanaTasks.find(s => s.googleEventId === event.id);
      if (linkedSchedule) {
        unscheduleAsana(linkedSchedule.id);
      }
      // deleteGoogleEvent is already optimistic - it removes from UI immediately
      deleteGoogleEvent(event.id, event.integrationId, event.calendarId).then(success => {
        if (success) {
          toast.success('Event deleted from Google Calendar');
        } else {
          toast.error('Failed to delete event from Google Calendar');
        }
      });
    } else if (event.source === 'adhoc') {
      removeTask(event.id);
      toast.success('Task deleted');
    } else if (event.source === 'asana') {
      // event.id is the schedule ID for Asana events
      unscheduleAsana(event.id);
      toast.success('Task unscheduled');
    }
  }, [deleteConfirmModal, deleteGoogleEvent, removeTask, unscheduleAsana, scheduledAsanaTasks, toast]);

  const handleUnscheduleAsana = useCallback((asanaTaskId: string) => {
    unscheduleAllAsanaInstances(asanaTaskId);
  }, [unscheduleAllAsanaInstances]);

  // Integration IDs for the two Asana workspaces (looked up by name)
  const OM_INTEGRATION_ID = useMemo(
    () => asanaIntegrations.find(i => i.name === 'OM')?.id ?? '',
    [asanaIntegrations]
  );
  const DBC_INTEGRATION_ID = useMemo(
    () => asanaIntegrations.find(i => i.name === 'DBC')?.id ?? '',
    [asanaIntegrations]
  );

  // Get filters for each locked integration
  const omFilters = useMemo(
    () => getAsanaFiltersForIntegration(OM_INTEGRATION_ID),
    [getAsanaFiltersForIntegration, OM_INTEGRATION_ID]
  );
  const dbcFilters = useMemo(
    () => getAsanaFiltersForIntegration(DBC_INTEGRATION_ID),
    [getAsanaFiltersForIntegration, DBC_INTEGRATION_ID]
  );

  // Callbacks for setting/clearing filters per integration
  const handleOmFiltersChange = useCallback(
    (filters: AsanaFilterState) => setAsanaFilters(filters, OM_INTEGRATION_ID),
    [setAsanaFilters, OM_INTEGRATION_ID]
  );
  const handleDbcFiltersChange = useCallback(
    (filters: AsanaFilterState) => setAsanaFilters(filters, DBC_INTEGRATION_ID),
    [setAsanaFilters, DBC_INTEGRATION_ID]
  );
  const handleOmClearFilters = useCallback(
    () => clearAsanaFilters(OM_INTEGRATION_ID),
    [clearAsanaFilters, OM_INTEGRATION_ID]
  );
  const handleDbcClearFilters = useCallback(
    () => clearAsanaFilters(DBC_INTEGRATION_ID),
    [clearAsanaFilters, DBC_INTEGRATION_ID]
  );

  const tabs = [
    { id: 'dashboard' as const, label: 'Command Center', icon: LayoutDashboard },
    { id: 'calendar' as const, label: 'Daily Calendar', icon: Calendar },
    { id: 'rituals' as const, label: 'Rituals', icon: Repeat },
    { id: 'reminders' as const, label: 'Reminders', icon: Bell },
  ];

  const handleOpenAsanaTask = useCallback((taskId: string) => {
    setActiveTab('calendar');
    window.location.hash = 'calendar';
    setOpenTaskDialogId(taskId);
  }, []);

  // Open a task from the Command Center WITHOUT leaving it (a page-level dialog
  // renders over the dashboard). Distinct from handleOpenAsanaTask, which is for
  // calendar-originated opens.
  const handleOpenTaskInPlace = useCallback((taskId: string) => {
    setOpenTaskDialogId(taskId);
  }, []);

  const dashboardDialogTask = useMemo(
    () => (activeTab === 'dashboard' && openTaskDialogId
      ? allAsanaTasks.find(t => t.id === openTaskDialogId) ?? null
      : null),
    [activeTab, openTaskDialogId, allAsanaTasks],
  );

  // One-click delegate from the AI-runnable section (compose-brief modal).
  const [delegateTask, setDelegateTask] = useState<CalendarEvent | null>(null);

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      <Header
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        onRefresh={handleRefresh}
        isLoading={isLoading}
        colorScheme={colorScheme}
        timeWorkedByIntegration={timeWorkedByIntegration}
        integrations={asanaIntegrations}
        activeTab={activeTab}
        tabs={tabs}
        onTabChange={handleTabChange}
        notificationEvents={googleEvents}
        showDateNav={activeTab === 'calendar'}
      />

      {activeTab === 'dashboard' ? (
        <div className="flex-1 overflow-hidden min-h-0 bg-gray-50">
          <DashboardContent
            todayEvents={todayTimedEvents}
            rolloverHour={rolloverHour}
            asanaTasks={allAsanaTasks}
            metadataByGid={metadataByGid}
            timeWorkedByIntegration={timeWorkedByIntegration}
            asanaIntegrations={asanaIntegrations}
            typeFieldInfoByIntegration={asanaTypeFieldInfoByIntegration}
            onOpenTask={handleOpenTaskInPlace}
            onDelegateTask={setDelegateTask}
            onReloadMetadata={reloadMetadata}
            onDeleteTask={handleSidebarAsanaDelete}
            onPlanApplied={fetchAllEvents}
            staleModalOpen={staleModalOpen}
            onStaleModalOpenChange={setStaleModalOpen}
            taskDialogOpen={Boolean(dashboardDialogTask)}
          />
          {delegateTask && delegateTask.integrationId && (
            <DelegateModal
              asanaTaskGid={delegateTask.id}
              integrationId={delegateTask.integrationId}
              taskTitle={delegateTask.title}
              initialBrief={delegationByGid[delegateTask.id]?.brief || ''}
              onClose={() => setDelegateTask(null)}
              onDelegated={refreshDelegation}
            />
          )}
          {/* Open a task over the Command Center without switching to calendar */}
          {dashboardDialogTask && (
            <TaskDetailDialog
              task={dashboardDialogTask}
              formatDuration={formatMinutes}
              onClose={handleClearOpenTaskDialog}
              elevated={staleModalOpen}
              onBack={staleModalOpen ? handleClearOpenTaskDialog : undefined}
              onToggleComplete={handleSidebarAsanaComplete}
              onAddComment={handleSidebarAsanaComment}
              onUpdateTask={handleSidebarAsanaUpdate}
              onDeleteTask={handleSidebarAsanaDelete}
              projects={asanaProjects}
              typeFieldInfoByIntegration={asanaTypeFieldInfoByIntegration}
              metadata={metadataByGid[dashboardDialogTask.id]}
              onSaveMetadata={saveMetadata}
              delegationEntry={delegationByGid[dashboardDialogTask.id]}
              onDelegated={refreshDelegation}
            />
          )}
        </div>
      ) : activeTab === 'rituals' ? (
        <div className="flex-1 overflow-y-auto">
          <RitualsContent />
        </div>
      ) : activeTab === 'reminders' ? (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-6">
            <Reminders
              asanaIntegrations={asanaIntegrations}
              asanaProjects={asanaProjects}
              asanaTypeFieldInfoByIntegration={asanaTypeFieldInfoByIntegration}
              onCreateAsanaTask={handleSidebarAsanaCreate}
            />
          </div>
        </div>
      ) : (
        <CalendarTab
          colorScheme={colorScheme}
          isLoading={isLoading}
          settings={settings}
          filteredAsanaTasks={filteredAsanaTasks}
          scheduledAsanaTasks={scheduledAsanaTasks}
          asanaProjects={asanaProjects}
          asanaTypeValues={asanaTypeValues}
          asanaTypeFieldInfoByIntegration={asanaTypeFieldInfoByIntegration}
          asanaIntegrations={asanaIntegrations}
          metadataByGid={metadataByGid}
          delegationByGid={delegationByGid}
          onUnschedule={handleUnscheduleAsana}
          onToggleComplete={handleSidebarAsanaComplete}
          onAddComment={handleSidebarAsanaComment}
          onCreateAsanaTask={handleSidebarAsanaCreate}
          onUpdateTask={handleSidebarAsanaUpdate}
          onDeleteTask={handleSidebarAsanaDelete}
          onSaveTaskMetadata={saveMetadata}
          onDelegated={refreshDelegation}
          highlightedAsanaTaskId={highlightedAsanaTaskId}
          onClearHighlight={handleClearHighlight}
          openTaskDialogId={openTaskDialogId}
          onClearOpenTaskDialog={handleClearOpenTaskDialog}
          omIntegrationId={OM_INTEGRATION_ID}
          dbcIntegrationId={DBC_INTEGRATION_ID}
          omFilters={omFilters}
          dbcFilters={dbcFilters}
          onOmFiltersChange={handleOmFiltersChange}
          onDbcFiltersChange={handleDbcFiltersChange}
          onOmClearFilters={handleOmClearFilters}
          onDbcClearFilters={handleDbcClearFilters}
          allDayEvents={allDayEvents}
          timedEvents={timedEvents}
          selectedDate={selectedDate}
          onEventClick={handleEventClick}
          onEventDoubleClick={handleEventDoubleClick}
          onDropTask={handleDropTask}
          onEventMove={handleEventMove}
          onDeleteEvent={handleDeleteEventRequest}
          onCreateTask={handleTimelineCreateTask}
          googleEventAttributions={googleEventAttributions}
          setGoogleEventAttributions={setGoogleEventAttributions}
        />
      )}

      {calendarSelectionModal.show && (
        <CalendarSelectionModal
          integrations={connectedGoogleIntegrations}
          onSelect={handleCalendarSelection}
          onCancel={() => setCalendarSelectionModal({ show: false, pendingDrop: null })}
        />
      )}

      {deleteConfirmModal.show && deleteConfirmModal.event && (
        <DeleteConfirmModal
          event={deleteConfirmModal.event}
          onCancel={() => setDeleteConfirmModal({ show: false, event: null })}
          onConfirm={handleConfirmDelete}
        />
      )}

      <AddTaskModal
        isOpen={createTaskModal.show}
        onClose={() => setCreateTaskModal({ show: false, startTime: null, endTime: null })}
        onAdd={handleAddTask}
        defaultDate={selectedDate}
        defaultStartTime={createTaskModal.startTime || undefined}
        defaultEndTime={createTaskModal.endTime || undefined}
        googleIntegrations={connectedGoogleIntegrations.map(i => ({ id: i.id, name: i.name }))}
        asanaIntegrations={asanaIntegrations.map(i => ({ id: i.id, name: i.name }))}
      />

      {selectedGoogleEvent && (
        <GoogleEventModal
          event={selectedGoogleEvent}
          setSelectedGoogleEvent={setSelectedGoogleEvent}
          isEditing={googleEventModal.isEditing}
          setIsEditing={googleEventModal.setIsEditing}
          editingTitle={googleEventModal.editingTitle}
          setEditingTitle={googleEventModal.setEditingTitle}
          editingDescription={googleEventModal.editingDescription}
          setEditingDescription={googleEventModal.setEditingDescription}
          isSaving={googleEventModal.isSaving}
          setIsSaving={googleEventModal.setIsSaving}
          googleEventAttributions={googleEventAttributions}
          setGoogleEventAttributions={setGoogleEventAttributions}
          asanaIntegrations={asanaIntegrations}
          updateGoogleEvent={updateGoogleEvent}
          onRequestDelete={(ev) => {
            setDeleteConfirmModal({ show: true, event: ev });
            setSelectedGoogleEvent(null);
          }}
        />
      )}
    </div>
  );
}
