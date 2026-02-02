'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import { Header } from '@/components/Header';
import { Timeline } from '@/components/Timeline';
import { IntegrationStatus } from '@/components/IntegrationStatus';
import { AsanaSidebar } from '@/components/AsanaSidebar';
import { AddTaskModal } from '@/components/AddTaskModal';
import { AllDayEventsBar } from '@/components/AllDayEventsBar';
import { useTasks } from '@/hooks/useTasks';
import { useCalendarEvents } from '@/hooks/useCalendarEvents';
import { useToast } from '@/hooks/useToast';
import { CalendarEvent, DragItem, TaskType, SettingsResponse, AsanaFilterState } from '@/types';
import { api } from '@/lib/api';
import { containsHtml, htmlToReadableText } from '@/lib/html-utils';

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
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [colorSchemeIndex, setColorSchemeIndex] = useState(0);

  // Set random color scheme on mount (client-side only) to avoid hydration mismatch
  useEffect(() => {
    setColorSchemeIndex(Math.floor(Math.random() * COLOR_SCHEMES.length));
  }, []);

  const colorScheme = COLOR_SCHEMES[colorSchemeIndex];

  const toast = useToast();
  const { addTask, updateTask, removeTask, getTasksForDate } = useTasks();
  const {
    googleEvents,
    allAsanaTasks,
    filteredAsanaTasks,
    scheduledAsanaTasks,
    isLoading,
    fetchAllEvents,
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
  const [selectedGoogleEvent, setSelectedGoogleEvent] = useState<CalendarEvent | null>(null);
  const [isEditingGoogleEvent, setIsEditingGoogleEvent] = useState(false);
  const [editingGoogleEventTitle, setEditingGoogleEventTitle] = useState('');
  const [editingGoogleEventDescription, setEditingGoogleEventDescription] = useState('');
  const [isSavingGoogleEvent, setIsSavingGoogleEvent] = useState(false);

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

  // Combine calendar events, filtering out duplicates from synced Google events
  const allEvents = useMemo((): CalendarEvent[] => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');

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
  }, [googleEvents, selectedDate, getTasksForDate, adhocToCalendarEvent, getScheduledAsanaEventsForDate, scheduledAsanaTasks, isEventOnDate]);

  // Separate all-day events from timed events
  const allDayEvents = useMemo(() => allEvents.filter(e => e.allDay), [allEvents]);
  const timedEvents = useMemo(() => allEvents.filter(e => !e.allDay), [allEvents]);

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

  const handleDropTask = useCallback((dragItem: DragItem, startTime: Date, endTime: Date) => {
    const dateStr = format(startTime, 'yyyy-MM-dd');
    const timeStr = format(startTime, 'HH:mm');
    const duration = Math.round((endTime.getTime() - startTime.getTime()) / (60 * 1000));

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
        createGoogleEvent(integrationId, asanaTask.title, startTime, endTime).then(googleEvent => {
          if (googleEvent) {
            scheduleAsana(
              dragItem.id,
              asanaTask.integrationId,
              dateStr,
              timeStr,
              duration,
              googleEvent.id,
              integrationId
            );
            toast.success('Task scheduled and synced to Google Calendar');
          } else {
            scheduleAsana(
              dragItem.id,
              asanaTask.integrationId,
              dateStr,
              timeStr,
              duration
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
          duration
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
  }, [updateTask, addTask, scheduleAsana, allAsanaTasks, connectedGoogleIntegrations, createGoogleEvent, toast]);

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
        createGoogleEvent(integrationId, asanaTask.title, startTime, endTime).then(googleEvent => {
          if (googleEvent) {
            scheduleAsana(
              dragItem.id,
              asanaTask.integrationId,
              dateStr,
              timeStr,
              duration,
              googleEvent.id,
              integrationId
            );
            toast.success('Task scheduled and synced to Google Calendar');
          } else {
            scheduleAsana(
              dragItem.id,
              asanaTask.integrationId,
              dateStr,
              timeStr,
              duration
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
        updateGoogleEvent(eventId, googleEvent.integrationId, startTime, endTime);
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
  }, integrationId?: string) => {
    const newTask = await addTask(task);
    if (!newTask) return null;

    // If created with time and an integration was selected, sync it immediately
    if (task.dueDate && task.dueTime && task.duration && integrationId) {
      const [hours, minutes] = task.dueTime.split(':').map(Number);
      const startTime = new Date(task.dueDate);
      startTime.setHours(hours, minutes, 0, 0);
      const endTime = new Date(startTime.getTime() + task.duration * 60 * 1000);

      const eventType = task.taskType === 'focus' ? 'focusTime' : undefined;
      createGoogleEvent(integrationId, task.title, startTime, endTime, task.description, eventType).then(googleEvent => {
        if (googleEvent) {
          updateTask(newTask.id, {
            googleEventId: googleEvent.id,
            googleIntegrationId: integrationId,
          });
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
      deleteGoogleEvent(event.id, event.integrationId).then(success => {
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

  // Integration IDs for the two Asana workspaces
  const OM_INTEGRATION_ID = '68a7249c-78bb-40e4-bc9d-37fc4a306aea';
  const DBC_INTEGRATION_ID = 'a45421fa-02ad-41a7-9d68-dcdf4fdb432d';

  // Get filters for each locked integration
  const omFilters = useMemo(
    () => getAsanaFiltersForIntegration(OM_INTEGRATION_ID),
    [getAsanaFiltersForIntegration]
  );
  const dbcFilters = useMemo(
    () => getAsanaFiltersForIntegration(DBC_INTEGRATION_ID),
    [getAsanaFiltersForIntegration]
  );

  // Callbacks for setting/clearing filters per integration
  const handleOmFiltersChange = useCallback(
    (filters: AsanaFilterState) => setAsanaFilters(filters, OM_INTEGRATION_ID),
    [setAsanaFilters]
  );
  const handleDbcFiltersChange = useCallback(
    (filters: AsanaFilterState) => setAsanaFilters(filters, DBC_INTEGRATION_ID),
    [setAsanaFilters]
  );
  const handleOmClearFilters = useCallback(
    () => clearAsanaFilters(OM_INTEGRATION_ID),
    [clearAsanaFilters]
  );
  const handleDbcClearFilters = useCallback(
    () => clearAsanaFilters(DBC_INTEGRATION_ID),
    [clearAsanaFilters]
  );

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      <Header
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        onRefresh={handleRefresh}
        isLoading={isLoading}
        colorScheme={colorScheme}
      />

      <div className="flex flex-1 min-h-0">
        {/* Left sidebar: OM Asana workspace */}
        <aside className="w-72 flex-shrink-0 overflow-hidden">
          <AsanaSidebar
            tasks={filteredAsanaTasks}
            isLoading={isLoading}
            scheduledAsanaTasks={scheduledAsanaTasks}
            onUnschedule={handleUnscheduleAsana}
            colorScheme={colorScheme}
            lockedIntegrationId={OM_INTEGRATION_ID}
            projects={asanaProjects}
            typeValues={asanaTypeValues}
            typeFieldInfoByIntegration={asanaTypeFieldInfoByIntegration}
            integrations={asanaIntegrations}
            filters={omFilters}
            onFiltersChange={handleOmFiltersChange}
            onClearFilters={handleOmClearFilters}
            onToggleComplete={handleSidebarAsanaComplete}
            onAddComment={handleSidebarAsanaComment}
            onCreateTask={handleSidebarAsanaCreate}
            onUpdateTask={handleSidebarAsanaUpdate}
            onDeleteTask={handleSidebarAsanaDelete}
            highlightedTaskId={highlightedAsanaTaskId}
            onClearHighlight={handleClearHighlight}
            openTaskDialogId={openTaskDialogId}
            onClearOpenTaskDialog={handleClearOpenTaskDialog}
          />
        </aside>

        <main className={`flex-1 overflow-y-auto px-4 py-6 ${colorScheme.mainBg}`}>
          <div className="max-w-5xl mx-auto">
            {settings && <IntegrationStatus settings={settings} />}

            <AllDayEventsBar
              events={allDayEvents}
              onEventClick={handleEventClick}
              onEventDoubleClick={handleEventDoubleClick}
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
                  onDropTask={handleDropTask}
                  onEventMove={handleEventMove}
                  onDeleteEvent={handleDeleteEventRequest}
                  onCreateTask={handleTimelineCreateTask}
                  onEventClick={handleEventClick}
                  onEventDoubleClick={handleEventDoubleClick}
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
            onUnschedule={handleUnscheduleAsana}
            colorScheme={colorScheme}
            lockedIntegrationId={DBC_INTEGRATION_ID}
            projects={asanaProjects}
            typeValues={asanaTypeValues}
            typeFieldInfoByIntegration={asanaTypeFieldInfoByIntegration}
            integrations={asanaIntegrations}
            filters={dbcFilters}
            onFiltersChange={handleDbcFiltersChange}
            onClearFilters={handleDbcClearFilters}
            onToggleComplete={handleSidebarAsanaComplete}
            onAddComment={handleSidebarAsanaComment}
            onCreateTask={handleSidebarAsanaCreate}
            onUpdateTask={handleSidebarAsanaUpdate}
            onDeleteTask={handleSidebarAsanaDelete}
            highlightedTaskId={highlightedAsanaTaskId}
            onClearHighlight={handleClearHighlight}
            openTaskDialogId={openTaskDialogId}
            onClearOpenTaskDialog={handleClearOpenTaskDialog}
          />
        </aside>
      </div>

      {calendarSelectionModal.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Select Calendar</h3>
            <p className="text-sm text-gray-600 mb-4">Choose which Google Calendar to add this event to:</p>
            <div className="space-y-2">
              {connectedGoogleIntegrations.map(integration => (
                <button
                  key={integration.id}
                  onClick={() => handleCalendarSelection(integration.id)}
                  className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                >
                  <span className="font-medium text-gray-900">{integration.name}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setCalendarSelectionModal({ show: false, pendingDrop: null })}
              className="mt-4 w-full px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {deleteConfirmModal.show && deleteConfirmModal.event && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Event</h3>
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to delete &quot;{deleteConfirmModal.event.title}&quot;?
              {deleteConfirmModal.event.source === 'google' && (
                <span className="block mt-2 text-amber-600">
                  This will also delete the event from Google Calendar.
                </span>
              )}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirmModal({ show: false, event: null })}
                className="flex-1 px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="flex-1 px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <AddTaskModal
        isOpen={createTaskModal.show}
        onClose={() => setCreateTaskModal({ show: false, startTime: null, endTime: null })}
        onAdd={handleAddTask}
        defaultDate={selectedDate}
        defaultStartTime={createTaskModal.startTime || undefined}
        defaultEndTime={createTaskModal.endTime || undefined}
        googleIntegrations={connectedGoogleIntegrations.map(i => ({ id: i.id, name: i.name }))}
      />

      {selectedGoogleEvent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-start justify-between p-4 border-b">
              <div className="flex-1 min-w-0">
                {isEditingGoogleEvent ? (
                  <input
                    type="text"
                    value={editingGoogleEventTitle}
                    onChange={(e) => setEditingGoogleEventTitle(e.target.value)}
                    className="w-full text-lg font-semibold text-gray-900 border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Event title"
                    autoFocus
                  />
                ) : (
                  <h2 className="text-lg font-semibold text-gray-900 truncate">
                    {selectedGoogleEvent.title}
                  </h2>
                )}
                <p className="text-sm text-gray-500 mt-1">
                  {format(selectedGoogleEvent.startTime, 'EEEE, MMMM d, yyyy')}
                </p>
                <p className="text-sm text-gray-500">
                  {format(selectedGoogleEvent.startTime, 'h:mm a')} - {format(selectedGoogleEvent.endTime, 'h:mm a')}
                </p>
                {selectedGoogleEvent.integrationName && (
                  <p className="text-xs text-blue-600 mt-1">
                    {selectedGoogleEvent.integrationName}
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  setSelectedGoogleEvent(null);
                  setIsEditingGoogleEvent(false);
                }}
                className="p-1 hover:bg-gray-100 rounded-full transition-colors ml-2"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1">
              {selectedGoogleEvent.location && (
                <div className="mb-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-1">Location</h3>
                  <p className="text-sm text-gray-600">{selectedGoogleEvent.location}</p>
                </div>
              )}

              {isEditingGoogleEvent ? (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-1">Description</h3>
                  <textarea
                    value={editingGoogleEventDescription}
                    onChange={(e) => setEditingGoogleEventDescription(e.target.value)}
                    className="w-full h-40 text-sm text-gray-600 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    placeholder="Add a description..."
                  />
                </div>
              ) : (
                <>
                  {selectedGoogleEvent.description ? (
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-1">Description</h3>
                      <div className="text-sm text-gray-600 whitespace-pre-wrap break-words">
                        {(() => {
                          const displayText = containsHtml(selectedGoogleEvent.description)
                            ? htmlToReadableText(selectedGoogleEvent.description)
                            : selectedGoogleEvent.description;

                          return displayText.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
                            part.match(/^https?:\/\//) ? (
                              <a
                                key={i}
                                href={part}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800 hover:underline break-all"
                              >
                                {part}
                              </a>
                            ) : (
                              <span key={i}>{part}</span>
                            )
                          );
                        })()}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 italic">No description</p>
                  )}
                </>
              )}
            </div>

            <div className="p-4 border-t bg-gray-50">
              {isEditingGoogleEvent ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsEditingGoogleEvent(false)}
                    disabled={isSavingGoogleEvent}
                    className="flex-1 px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      if (!selectedGoogleEvent.integrationId) {
                        toast.error('Cannot update event: missing integration ID');
                        return;
                      }
                      setIsSavingGoogleEvent(true);
                      const result = await updateGoogleEvent(
                        selectedGoogleEvent.id,
                        selectedGoogleEvent.integrationId,
                        selectedGoogleEvent.startTime,
                        selectedGoogleEvent.endTime,
                        editingGoogleEventTitle,
                        editingGoogleEventDescription
                      );
                      setIsSavingGoogleEvent(false);
                      if (result.success) {
                        setSelectedGoogleEvent({
                          ...selectedGoogleEvent,
                          title: editingGoogleEventTitle,
                          description: editingGoogleEventDescription || undefined,
                        });
                        setIsEditingGoogleEvent(false);
                        toast.success('Event updated');
                      } else {
                        toast.error(result.error || 'Failed to update event');
                      }
                    }}
                    disabled={isSavingGoogleEvent}
                    className="flex-1 px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {isSavingGoogleEvent ? 'Saving...' : 'Save'}
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setSelectedGoogleEvent(null);
                      setIsEditingGoogleEvent(false);
                    }}
                    className="flex-1 px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => {
                      setEditingGoogleEventTitle(selectedGoogleEvent.title);
                      const desc = selectedGoogleEvent.description || '';
                      setEditingGoogleEventDescription(containsHtml(desc) ? htmlToReadableText(desc) : desc);
                      setIsEditingGoogleEvent(true);
                    }}
                    className="flex-1 px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      setDeleteConfirmModal({ show: true, event: selectedGoogleEvent });
                      setSelectedGoogleEvent(null);
                    }}
                    className="px-4 py-2 text-sm text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
