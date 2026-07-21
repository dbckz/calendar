'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Bell } from 'lucide-react';
import { Reminders } from '@/components/Reminders';
import { useCalendarEvents } from '@/hooks/useCalendarEvents';
import { useToast } from '@/hooks/useToast';

export default function RemindersPage() {
  const {
    createAsanaTask,
    asanaProjects,
    asanaTypeFieldInfoByIntegration,
    asanaIntegrations,
  } = useCalendarEvents();
  const toast = useToast();

  const handleCreateAsanaTask = useCallback(async (
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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-4 py-4">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-blue-600" />
              <h1 className="text-xl font-semibold text-gray-900">Reminders</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6">
        <Reminders
          asanaIntegrations={asanaIntegrations}
          asanaProjects={asanaProjects}
          asanaTypeFieldInfoByIntegration={asanaTypeFieldInfoByIntegration}
          onCreateAsanaTask={handleCreateAsanaTask}
        />
      </main>
    </div>
  );
}
