'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import { Plus, List, Clock } from 'lucide-react';
import { Header } from '@/components/Header';
import { Timeline } from '@/components/Timeline';
import { ListView } from '@/components/ListView';
import { AddTaskModal } from '@/components/AddTaskModal';
import { IntegrationStatus } from '@/components/IntegrationStatus';
import { useTasks } from '@/hooks/useTasks';
import { useCalendarEvents } from '@/hooks/useCalendarEvents';
import { CalendarEvent, AppSettings, ViewMode } from '@/types';

export default function Home() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('timeline');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  const { tasks, addTask, toggleComplete: toggleAdHocComplete, removeTask, getTasksForDate } = useTasks();
  const {
    googleEvents,
    asanaEvents,
    isLoading,
    fetchAllEvents,
    adhocToCalendarEvent,
  } = useCalendarEvents();

  // Fetch settings on mount
  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => setSettings(data))
      .catch(console.error);
  }, []);

  // Fetch events when date changes
  useEffect(() => {
    fetchAllEvents(selectedDate);
  }, [selectedDate, fetchAllEvents]);

  // Combine all events
  const allEvents = useMemo((): CalendarEvent[] => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const adhocTasks = getTasksForDate(dateStr);
    const adhocEvents = adhocTasks.map(adhocToCalendarEvent);

    return [...googleEvents, ...asanaEvents, ...adhocEvents];
  }, [googleEvents, asanaEvents, selectedDate, getTasksForDate, adhocToCalendarEvent]);

  const handleRefresh = useCallback(() => {
    fetchAllEvents(selectedDate);
  }, [selectedDate, fetchAllEvents]);

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

  const completedCount = allEvents.filter(e => e.completed).length;
  const totalTasks = allEvents.filter(e => e.source !== 'google').length;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        onRefresh={handleRefresh}
        isLoading={isLoading}
      />

      <main className="max-w-5xl mx-auto px-4 py-6">
        {settings && (
          <IntegrationStatus settings={settings as AppSettings} />
        )}

        {/* Stats bar */}
        <div className="bg-white rounded-lg border shadow-sm p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-sm text-gray-500">Total Events</p>
                <p className="text-2xl font-semibold">{allEvents.length}</p>
              </div>
              <div className="h-10 w-px bg-gray-200" />
              <div>
                <p className="text-sm text-gray-500">Tasks Completed</p>
                <p className="text-2xl font-semibold">
                  {completedCount} / {totalTasks}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* View mode toggle */}
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('timeline')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'timeline'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Clock className="w-4 h-4" />
                  Timeline
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'list'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <List className="w-4 h-4" />
                  List
                </button>
              </div>

              {/* Add task button */}
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-5 h-5" />
                Add Task
              </button>
            </div>
          </div>
        </div>

        {/* Events display */}
        <div className="bg-white rounded-lg border shadow-sm p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : viewMode === 'timeline' ? (
            <Timeline
              events={allEvents}
              onToggleComplete={handleToggleComplete}
              onDeleteTask={handleDeleteTask}
            />
          ) : (
            <ListView
              events={allEvents}
              onToggleComplete={handleToggleComplete}
              onDeleteTask={handleDeleteTask}
            />
          )}
        </div>
      </main>

      <AddTaskModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdd={addTask}
        defaultDate={selectedDate}
      />
    </div>
  );
}
