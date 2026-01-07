'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import { Header } from '@/components/Header';
import { Timeline } from '@/components/Timeline';
import { IntegrationStatus } from '@/components/IntegrationStatus';
import { AsanaSidebar } from '@/components/AsanaSidebar';
import { TaskSidebar } from '@/components/TaskSidebar';
import { AddTaskModal } from '@/components/AddTaskModal';
import { useTasks } from '@/hooks/useTasks';
import { useCalendarEvents } from '@/hooks/useCalendarEvents';
import { useToast } from '@/hooks/useToast';
import { CalendarEvent, DragItem, TaskType, SettingsResponse } from '@/types';
import { api } from '@/lib/api';

// Use the typed SettingsResponse from types, but we keep a local alias for clarity
type SettingsState = SettingsResponse;

// Softer, more cohesive color themes
// Each theme has a main header color and a shared sidebar accent
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
  const [settings, setSettings] = useState<SettingsState | null>(null);
  // Start with index 0 on server, then randomize on client to avoid hydration mismatch
  const [colorSchemeIndex, setColorSchemeIndex] = useState(0);
  const [isClient, setIsClient] = useState(false);

  // Set random color scheme on client mount only
  useEffect(() => {
    setColorSchemeIndex(Math.floor(Math.random() * COLOR_SCHEMES.length));
    setIsClient(true);
  }, []);

  const colorScheme = COLOR_SCHEMES[colorSchemeIndex];

  const toast = useToast();
  const { tasks, addTask, updateTask, removeTask, getTasksForDate } = useTasks();
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
    deleteAsanaTask,
    // Asana filter state
    asanaProjects,
    asanaTypeValues,
    asanaIntegrations,
    asanaFilters,
    setAsanaFilters,
    clearAsanaFilters,
  } = useCalendarEvents();

  // State for calendar selection modal
  const [calendarSelectionModal, setCalendarSelectionModal] = useState<{
    show: boolean;
    pendingDrop: { dragItem: DragItem; startTime: Date; endTime: Date } | null;
  }>({ show: false, pendingDrop: null });

  // State for delete confirmation modal
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
    show: boolean;
    event: CalendarEvent | null;
  }>({ show: false, event: null });

  // State for task creation modal (triggered by click-drag on timeline)
  const [createTaskModal, setCreateTaskModal] = useState<{
    show: boolean;
    startTime: Date | null;
    endTime: Date | null;
  }>({ show: false, startTime: null, endTime: null });

  // State for pending task creation (needs calendar selection)
  const [pendingTaskCreation, setPendingTaskCreation] = useState<{
    task: {
      title: string;
      description?: string;
      dueDate?: string;
      dueTime?: string;
      duration?: number;
      priority: 'low' | 'medium' | 'high';
      taskType: TaskType;
      completed: boolean;
    };
    taskId: string;
    startTime: Date;
    endTime: Date;
  } | null>(null);

  // State for highlighted Asana task in sidebar (when clicking calendar event)
  const [highlightedAsanaTaskId, setHighlightedAsanaTaskId] = useState<string | null>(null);

  // Fetch settings on mount
  useEffect(() => {
    api.getSettings()
      .then(data => setSettings(data))
      .catch(err => {
        console.error('Failed to load settings:', err);
        toast.error('Failed to load integration settings');
      });
  }, [toast]);

  // Combine all events for the calendar (scheduled tasks only)
  // NOTE: We filter out adhoc tasks that have a corresponding Google event
  // to avoid showing duplicates on the calendar
  const allEvents = useMemo((): CalendarEvent[] => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');

    // Helper to check if a date falls within an event's range
    // For all-day/multi-day events, we need to check the full date range
    const isEventOnDate = (event: CalendarEvent, targetDate: string): boolean => {
      // For all-day events, the dates from Google are date-only strings
      // which we've already parsed. Compare just the date portions.
      const startDateStr = format(event.startTime, 'yyyy-MM-dd');
      const endDateStr = format(event.endTime, 'yyyy-MM-dd');

      // For all-day events, the end date is exclusive (e.g., a 1-day event on Jan 15
      // has start: Jan 15, end: Jan 16). For multi-day, same logic applies.
      // So we check: startDate <= targetDate < endDate for all-day events
      // For timed events, we just check the start date
      if (event.allDay) {
        return targetDate >= startDateStr && targetDate < endDateStr;
      }

      return startDateStr === targetDate;
    };

    // Filter Google events to only show events for the selected date
    const filteredGoogleEvents = googleEvents.filter(event => isEventOnDate(event, dateStr));

    // Enrich Google events with linked Asana task info (for unified display)
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

    // Only include tasks that have both date AND time (scheduled on calendar)
    // AND that don't have a corresponding Google event (to avoid duplicates)
    const adhocTasks = getTasksForDate(dateStr).filter(t => t.dueTime && !t.googleEventId);
    const adhocEvents = adhocTasks.map(adhocToCalendarEvent);

    // Include scheduled Asana tasks for this date, but EXCLUDE those with linked Google events
    // (they will show as the enriched Google event instead)
    // Note: event.id is the schedule ID, so we find the schedule directly
    const scheduledAsanaEvents = getScheduledAsanaEventsForDate(dateStr).filter(event => {
      const schedule = scheduledAsanaTasks.find(s => s.id === event.id);
      return !schedule?.googleEventId;
    });

    return [...enrichedGoogleEvents, ...adhocEvents, ...scheduledAsanaEvents];
  }, [googleEvents, selectedDate, getTasksForDate, adhocToCalendarEvent, getScheduledAsanaEventsForDate, scheduledAsanaTasks]);

  // Separate all-day events from timed events
  const allDayEvents = useMemo(() => {
    return allEvents.filter(e => e.allDay);
  }, [allEvents]);

  const timedEvents = useMemo(() => {
    return allEvents.filter(e => !e.allDay);
  }, [allEvents]);

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

  const handleDeleteTask = useCallback((id: string) => {
    removeTask(id);
  }, [removeTask]);

  // Handle Asana task completion from sidebar (with integration ID)
  const handleSidebarAsanaComplete = useCallback(async (taskId: string, integrationId: string, completed: boolean) => {
    try {
      await completeAsanaTask(taskId, integrationId, completed);
      toast.success(completed ? 'Task completed in Asana' : 'Task reopened in Asana');
    } catch (err) {
      toast.error('Failed to update task in Asana');
      console.error('Error completing Asana task:', err);
    }
  }, [completeAsanaTask, toast]);

  // Handle Asana comment from sidebar (with integration ID)
  const handleSidebarAsanaComment = useCallback(async (taskId: string, integrationId: string, comment: string) => {
    try {
      await addAsanaComment(taskId, integrationId, comment);
      toast.success('Comment added to Asana');
    } catch (err) {
      toast.error('Failed to add comment to Asana');
      console.error('Error adding Asana comment:', err);
    }
  }, [addAsanaComment, toast]);

  // Handle Asana task deletion from sidebar
  const handleSidebarAsanaDelete = useCallback(async (taskId: string, integrationId: string): Promise<boolean> => {
    try {
      // Also unschedule all instances of this task
      unscheduleAllAsanaInstances(taskId);
      await deleteAsanaTask(taskId, integrationId);
      toast.success('Task deleted from Asana');
      return true;
    } catch (err) {
      toast.error('Failed to delete task from Asana');
      console.error('Error deleting Asana task:', err);
      return false;
    }
  }, [deleteAsanaTask, unscheduleAllAsanaInstances, toast]);

  // Get connected Google integrations
  const connectedGoogleIntegrations = useMemo(() => {
    return settings?.googleIntegrations.filter(i => i.connected && i.enabled) || [];
  }, [settings]);

  // Handle dropping a task onto the calendar
  const handleDropTask = useCallback((dragItem: DragItem, startTime: Date, endTime: Date) => {
    const dateStr = format(startTime, 'yyyy-MM-dd');
    const timeStr = format(startTime, 'HH:mm');
    const duration = Math.round((endTime.getTime() - startTime.getTime()) / (60 * 1000));

    // Check if we should sync to Google Calendar and prompt for selection
    // Always prompt when there are multiple calendars connected
    if (connectedGoogleIntegrations.length > 1) {
      // Multiple calendars - show selection modal
      setCalendarSelectionModal({
        show: true,
        pendingDrop: { dragItem, startTime, endTime },
      });
      return;
    }

    // Single or no calendar - proceed immediately
    const integrationId = connectedGoogleIntegrations.length === 1 ? connectedGoogleIntegrations[0].id : undefined;

    if (dragItem.type === 'adhoc-task') {
      // Update existing ad-hoc task with scheduled time and duration
      updateTask(dragItem.id, {
        dueDate: dateStr,
        dueTime: timeStr,
        duration,
      });

      // Also create in Google Calendar if connected
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
      // Find the Asana task to get its integration ID
      const asanaTask = allAsanaTasks.find(t => t.id === dragItem.id);

      // Create Google event FIRST if connected, then link it to Asana schedule
      if (integrationId && asanaTask) {
        createGoogleEvent(integrationId, asanaTask.title, startTime, endTime).then(googleEvent => {
          if (googleEvent) {
            // Schedule Asana task with Google event reference (unified display)
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
            // Still schedule locally even if Google fails
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
        // No Google calendar - just schedule locally
        scheduleAsana(
          dragItem.id,
          asanaTask?.integrationId,
          dateStr,
          timeStr,
          duration
        );
      }
    } else if (dragItem.type === 'task-template') {
      // Create a new ad-hoc task from the template
      const newTask = addTask({
        title: dragItem.title,
        dueDate: dateStr,
        dueTime: timeStr,
        priority: dragItem.priority || 'medium',
        taskType: dragItem.taskType!,
        completed: false,
      });

      // Update with duration
      updateTask(newTask.id, { duration });

      // Also create in Google Calendar if connected
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
    }
  }, [updateTask, addTask, scheduleAsana, allAsanaTasks, connectedGoogleIntegrations, createGoogleEvent, toast]);

  // Handle calendar selection from modal
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
      // Create a new ad-hoc task from the template
      const newTask = addTask({
        title: dragItem.title,
        dueDate: dateStr,
        dueTime: timeStr,
        priority: dragItem.priority || 'medium',
        taskType: dragItem.taskType!,
        completed: false,
      });

      // Update with duration
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
    }

    setCalendarSelectionModal({ show: false, pendingDrop: null });
  }, [calendarSelectionModal, updateTask, addTask, scheduleAsana, allAsanaTasks, createGoogleEvent, toast]);

  // Handle calendar selection for new task creation
  const handleTaskCreationCalendarSelection = useCallback((integrationId: string) => {
    if (!pendingTaskCreation) return;

    const { task, taskId, startTime, endTime } = pendingTaskCreation;

    createGoogleEvent(integrationId, task.title, startTime, endTime).then(googleEvent => {
      if (googleEvent) {
        updateTask(taskId, {
          googleEventId: googleEvent.id,
          googleIntegrationId: integrationId,
        });
        toast.success('Event added to Google Calendar');
      } else {
        toast.error('Failed to sync with Google Calendar');
      }
    });

    setPendingTaskCreation(null);
  }, [pendingTaskCreation, createGoogleEvent, updateTask, toast]);

  // Handle moving/resizing an event on the calendar
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
      updateTask(eventId, {
        dueDate: dateStr,
        dueTime: timeStr,
        duration,
      });
    } else if (source === 'asana') {
      updateScheduledAsana(eventId, {
        scheduledDate: dateStr,
        scheduledTime: timeStr,
        duration,
      });
    } else if (source === 'google') {
      // Find the Google event to get its integration ID
      const googleEvent = googleEvents.find(e => e.id === eventId);
      if (googleEvent?.integrationId) {
        updateGoogleEvent(eventId, googleEvent.integrationId, startTime, endTime);
      }

      // Also update linked Asana schedule if present (keeps duration in sync)
      updateScheduledAsanaByGoogleEvent(eventId, {
        scheduledDate: dateStr,
        scheduledTime: timeStr,
        duration,
      });
    }
  }, [updateTask, updateScheduledAsana, updateScheduledAsanaByGoogleEvent, updateGoogleEvent, googleEvents]);

  // Handle unscheduling a task (dragging off calendar)
  const handleUnscheduleTask = useCallback((eventId: string, source: 'adhoc' | 'asana') => {
    if (source === 'adhoc') {
      updateTask(eventId, {
        dueTime: undefined,
        duration: undefined,
      });
    } else if (source === 'asana') {
      unscheduleAsana(eventId);
    }
  }, [updateTask, unscheduleAsana]);

  // Handle adding a new task from the sidebar or creation modal
  const handleAddTask = useCallback((task: {
    title: string;
    description?: string;
    dueDate?: string;
    dueTime?: string;
    duration?: number;
    priority: 'low' | 'medium' | 'high';
    taskType: TaskType;
    completed: boolean;
  }) => {
    const newTask = addTask(task);

    // If created with time and we have Google Calendar, sync it
    if (task.dueDate && task.dueTime && task.duration && connectedGoogleIntegrations.length > 0) {
      const [hours, minutes] = task.dueTime.split(':').map(Number);
      const startTime = new Date(task.dueDate);
      startTime.setHours(hours, minutes, 0, 0);
      const endTime = new Date(startTime.getTime() + task.duration * 60 * 1000);

      // If multiple calendars, prompt for selection
      if (connectedGoogleIntegrations.length > 1) {
        setPendingTaskCreation({
          task,
          taskId: newTask.id,
          startTime,
          endTime,
        });
        return newTask;
      }

      // Single calendar - use it directly
      const integrationId = connectedGoogleIntegrations[0].id;
      createGoogleEvent(integrationId, task.title, startTime, endTime).then(googleEvent => {
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
  }, [addTask, connectedGoogleIntegrations, createGoogleEvent, updateTask, toast]);

  // Handle creating a new task from timeline click-drag
  const handleTimelineCreateTask = useCallback((startTime: Date, endTime: Date) => {
    setCreateTaskModal({ show: true, startTime, endTime });
  }, []);

  // Handle clicking a calendar event to highlight its Asana task in sidebar
  const handleEventClick = useCallback((event: CalendarEvent) => {
    // Check if this is an Asana task (either directly or linked)
    const asanaTaskId = event.linkedAsanaTaskId || (event.source === 'asana' ? event.id : null);
    if (asanaTaskId) {
      setHighlightedAsanaTaskId(asanaTaskId);
    }
  }, []);

  // Clear highlighted Asana task
  const handleClearHighlight = useCallback(() => {
    setHighlightedAsanaTaskId(null);
  }, []);

  // Handle delete event request (shows confirmation)
  const handleDeleteEventRequest = useCallback((event: CalendarEvent) => {
    setDeleteConfirmModal({ show: true, event });
  }, []);

  // Handle confirmed event deletion
  const handleConfirmDelete = useCallback(async () => {
    const { event } = deleteConfirmModal;
    if (!event) return;

    try {
      if (event.source === 'google' && event.integrationId) {
        const success = await deleteGoogleEvent(event.id, event.integrationId);
        if (success) {
          // Also unschedule linked Asana schedule if present (find by googleEventId)
          const linkedSchedule = scheduledAsanaTasks.find(s => s.googleEventId === event.id);
          if (linkedSchedule) {
            unscheduleAsana(linkedSchedule.id);
          }
          toast.success('Event deleted from Google Calendar');
        } else {
          toast.error('Failed to delete event from Google Calendar');
        }
      } else if (event.source === 'adhoc') {
        removeTask(event.id);
        toast.success('Task deleted');
      } else if (event.source === 'asana') {
        // event.id is the schedule ID for Asana events
        unscheduleAsana(event.id);
        toast.success('Task unscheduled');
      }
    } catch {
      toast.error('Failed to delete event');
    }

    setDeleteConfirmModal({ show: false, event: null });
  }, [deleteConfirmModal, deleteGoogleEvent, removeTask, unscheduleAsana, scheduledAsanaTasks, toast]);

  // Memoized callbacks for sidebars to avoid recreating on every render
  // Called from sidebar - unschedule all instances of an Asana task
  const handleUnscheduleAsana = useCallback((asanaTaskId: string) => {
    unscheduleAllAsanaInstances(asanaTaskId);
  }, [unscheduleAllAsanaInstances]);

  const handleUnscheduleAdhoc = useCallback((taskId: string) => {
    handleUnscheduleTask(taskId, 'adhoc');
  }, [handleUnscheduleTask]);

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
        {/* Asana Sidebar - Left (fixed) */}
        <aside className="w-72 flex-shrink-0 overflow-hidden">
          <AsanaSidebar
            tasks={filteredAsanaTasks}
            isLoading={isLoading}
            scheduledAsanaTasks={scheduledAsanaTasks}
            onUnschedule={handleUnscheduleAsana}
            colorScheme={colorScheme}
            projects={asanaProjects}
            typeValues={asanaTypeValues}
            integrations={asanaIntegrations}
            filters={asanaFilters}
            onFiltersChange={setAsanaFilters}
            onClearFilters={clearAsanaFilters}
            onToggleComplete={handleSidebarAsanaComplete}
            onAddComment={handleSidebarAsanaComment}
            onCreateTask={createAsanaTask}
            onDeleteTask={handleSidebarAsanaDelete}
            highlightedTaskId={highlightedAsanaTaskId}
            onClearHighlight={handleClearHighlight}
          />
        </aside>

        {/* Main content - this is the only scrollable area */}
        <main className={`flex-1 overflow-y-auto px-4 py-6 ${colorScheme.mainBg}`}>
          <div className="max-w-5xl mx-auto">
            {settings && (
              <IntegrationStatus settings={settings} />
            )}

            {/* Events display */}
            <div className="bg-white rounded-lg border shadow-sm p-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                </div>
              ) : (
                <Timeline
                  events={timedEvents}
                  selectedDate={selectedDate}
                  onDeleteTask={handleDeleteTask}
                  onDropTask={handleDropTask}
                  onEventMove={handleEventMove}
                  onUnscheduleTask={handleUnscheduleTask}
                  onDeleteEvent={handleDeleteEventRequest}
                  onCreateTask={handleTimelineCreateTask}
                  onEventClick={handleEventClick}
                />
              )}
            </div>
          </div>
        </main>

        {/* Task Sidebar - Right (templates and all-day events) */}
        <aside className="w-72 flex-shrink-0 overflow-hidden">
          <TaskSidebar
            allDayEvents={allDayEvents}
            colorScheme={colorScheme}
          />
        </aside>
      </div>

      {/* Calendar Selection Modal (for drag & drop) */}
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

      {/* Calendar Selection Modal (for new task creation) */}
      {pendingTaskCreation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Select Calendar</h3>
            <p className="text-sm text-gray-600 mb-4">Choose which Google Calendar to add &quot;{pendingTaskCreation.task.title}&quot; to:</p>
            <div className="space-y-2">
              {connectedGoogleIntegrations.map(integration => (
                <button
                  key={integration.id}
                  onClick={() => handleTaskCreationCalendarSelection(integration.id)}
                  className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                >
                  <span className="font-medium text-gray-900">{integration.name}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setPendingTaskCreation(null)}
              className="mt-4 w-full px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Skip (don&apos;t sync to Google)
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
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

      {/* Task Creation Modal (from timeline click-drag) */}
      <AddTaskModal
        isOpen={createTaskModal.show}
        onClose={() => setCreateTaskModal({ show: false, startTime: null, endTime: null })}
        onAdd={handleAddTask}
        defaultDate={selectedDate}
        defaultStartTime={createTaskModal.startTime || undefined}
        defaultEndTime={createTaskModal.endTime || undefined}
      />
    </div>
  );
}
