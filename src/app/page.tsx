'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import { Header } from '@/components/Header';
import { Timeline } from '@/components/Timeline';
import { IntegrationStatus } from '@/components/IntegrationStatus';
import { AsanaSidebar } from '@/components/AsanaSidebar';
import { TaskSidebar } from '@/components/TaskSidebar';
import { useTasks } from '@/hooks/useTasks';
import { useCalendarEvents } from '@/hooks/useCalendarEvents';
import { CalendarEvent, DragItem, TaskType } from '@/types';

interface SettingsState {
  googleIntegrations: Array<{
    id: string;
    name: string;
    enabled: boolean;
    connected: boolean;
  }>;
  asanaIntegrations: Array<{
    id: string;
    name: string;
    enabled: boolean;
    connected: boolean;
  }>;
}

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

  const { tasks, addTask, updateTask, toggleComplete: toggleAdHocComplete, removeTask, getTasksForDate } = useTasks();
  const {
    googleEvents,
    allAsanaTasks,
    scheduledAsanaTasks,
    isLoading,
    fetchAllEvents,
    adhocToCalendarEvent,
    scheduleAsana,
    updateScheduledAsana,
    unscheduleAsana,
    updateGoogleEvent,
    createGoogleEvent,
    deleteGoogleEvent,
    getScheduledAsanaEventsForDate,
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

  // Fetch settings on mount
  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => setSettings(data))
      .catch(console.error);
  }, []);

  // Combine all events for the calendar (scheduled tasks only)
  const allEvents = useMemo((): CalendarEvent[] => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');

    // Filter Google events to only show events for the selected date
    const filteredGoogleEvents = googleEvents.filter(event => {
      const eventDateStr = format(event.startTime, 'yyyy-MM-dd');
      return eventDateStr === dateStr;
    });

    // Only include tasks that have both date AND time (scheduled on calendar)
    const adhocTasks = getTasksForDate(dateStr).filter(t => t.dueTime);
    const adhocEvents = adhocTasks.map(adhocToCalendarEvent);

    // Include scheduled Asana tasks for this date (from local storage)
    const scheduledAsanaEvents = getScheduledAsanaEventsForDate(dateStr);

    return [...filteredGoogleEvents, ...adhocEvents, ...scheduledAsanaEvents];
  }, [googleEvents, selectedDate, getTasksForDate, adhocToCalendarEvent, getScheduledAsanaEventsForDate]);

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

  const handleToggleComplete = useCallback(async (id: string, source: 'adhoc' | 'asana') => {
    if (source === 'adhoc') {
      toggleAdHocComplete(id);
    } else if (source === 'asana') {
      // TODO: Implement Asana task completion
      console.log('Toggle Asana task:', id);
    }
  }, [toggleAdHocComplete]);

  const handleDeleteTask = useCallback((id: string) => {
    removeTask(id);
  }, [removeTask]);

  // Get connected Google integrations
  const connectedGoogleIntegrations = useMemo(() => {
    return settings?.googleIntegrations.filter(i => i.connected && i.enabled) || [];
  }, [settings]);

  // Handle dropping a task onto the calendar
  const handleDropTask = useCallback((dragItem: DragItem, startTime: Date, endTime: Date) => {
    const dateStr = format(startTime, 'yyyy-MM-dd');
    const timeStr = format(startTime, 'HH:mm');
    const duration = Math.round((endTime.getTime() - startTime.getTime()) / (60 * 1000));

    // Check if we should sync to Google Calendar
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
          }
        });
      }
    } else if (dragItem.type === 'asana-task') {
      // Find the Asana task to get its integration ID
      const asanaTask = allAsanaTasks.find(t => t.id === dragItem.id);
      // Schedule Asana task locally
      scheduleAsana(
        dragItem.id,
        asanaTask?.integrationId,
        dateStr,
        timeStr,
        duration
      );

      // Also create in Google Calendar if connected
      if (integrationId && asanaTask) {
        createGoogleEvent(integrationId, asanaTask.title, startTime, endTime);
      }
    }
  }, [updateTask, scheduleAsana, allAsanaTasks, connectedGoogleIntegrations, createGoogleEvent]);

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
        }
      });
    } else if (dragItem.type === 'asana-task') {
      const asanaTask = allAsanaTasks.find(t => t.id === dragItem.id);
      scheduleAsana(
        dragItem.id,
        asanaTask?.integrationId,
        dateStr,
        timeStr,
        duration
      );

      if (asanaTask) {
        createGoogleEvent(integrationId, asanaTask.title, startTime, endTime);
      }
    }

    setCalendarSelectionModal({ show: false, pendingDrop: null });
  }, [calendarSelectionModal, updateTask, scheduleAsana, allAsanaTasks, createGoogleEvent]);

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
    }
  }, [updateTask, updateScheduledAsana, updateGoogleEvent, googleEvents]);

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

  // Handle adding a new task from the sidebar
  const handleAddTask = useCallback((task: {
    title: string;
    description?: string;
    dueDate?: string;
    dueTime?: string;
    priority: 'low' | 'medium' | 'high';
    taskType: TaskType;
    completed: boolean;
  }) => {
    addTask(task);
  }, [addTask]);

  // Handle delete event request (shows confirmation)
  const handleDeleteEventRequest = useCallback((event: CalendarEvent) => {
    setDeleteConfirmModal({ show: true, event });
  }, []);

  // Handle confirmed event deletion
  const handleConfirmDelete = useCallback(async () => {
    const { event } = deleteConfirmModal;
    if (!event) return;

    if (event.source === 'google' && event.integrationId) {
      await deleteGoogleEvent(event.id, event.integrationId);
    } else if (event.source === 'adhoc') {
      removeTask(event.id);
    } else if (event.source === 'asana') {
      unscheduleAsana(event.id);
    }

    setDeleteConfirmModal({ show: false, event: null });
  }, [deleteConfirmModal, deleteGoogleEvent, removeTask, unscheduleAsana]);

  // Memoized callbacks for sidebars to avoid recreating on every render
  const handleUnscheduleAsana = useCallback((taskId: string) => {
    handleUnscheduleTask(taskId, 'asana');
  }, [handleUnscheduleTask]);

  const handleUnscheduleAdhoc = useCallback((taskId: string) => {
    handleUnscheduleTask(taskId, 'adhoc');
  }, [handleUnscheduleTask]);

  // Get set of scheduled task IDs for sidebar indicators
  const scheduledTaskIds = useMemo(() => {
    const ids = new Set<string>();
    // Ad-hoc tasks with scheduled times
    tasks.filter(t => t.dueTime).forEach(t => ids.add(t.id));
    // Scheduled Asana tasks
    scheduledAsanaTasks.forEach(s => ids.add(s.asanaTaskId));
    return ids;
  }, [tasks, scheduledAsanaTasks]);


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
            tasks={allAsanaTasks}
            isLoading={isLoading}
            scheduledTaskIds={scheduledTaskIds}
            onUnschedule={handleUnscheduleAsana}
            colorScheme={colorScheme}
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
                  onToggleComplete={handleToggleComplete}
                  onDeleteTask={handleDeleteTask}
                  onDropTask={handleDropTask}
                  onEventMove={handleEventMove}
                  onUnscheduleTask={handleUnscheduleTask}
                  onDeleteEvent={handleDeleteEventRequest}
                />
              )}
            </div>
          </div>
        </main>

        {/* Task Sidebar - Right (fixed) */}
        <aside className="w-72 flex-shrink-0 overflow-hidden">
          <TaskSidebar
            tasks={tasks}
            selectedDate={selectedDate}
            onAddTask={handleAddTask}
            onDeleteTask={handleDeleteTask}
            scheduledTaskIds={scheduledTaskIds}
            onUnschedule={handleUnscheduleAdhoc}
            allDayEvents={allDayEvents}
            colorScheme={colorScheme}
          />
        </aside>
      </div>

      {/* Calendar Selection Modal */}
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
    </div>
  );
}
