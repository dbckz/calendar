'use client';

import { useState, useMemo, useEffect } from 'react';
import { X } from 'lucide-react';
import { AsanaProject, CalendarEvent } from '@/types';

export interface AsanaTypeFieldInfo {
  fieldGid: string;
  enumOptions: Map<string, string>;
}

export interface CreateAsanaTaskOptions {
  notes?: string;
  dueOn?: string;
  projectGid?: string;
  customFields?: Record<string, string>;
}

interface CreateAsanaTaskModalProps {
  integrations: { id: string; name: string }[];
  projects: AsanaProject[];
  typeFieldInfoByIntegration?: Map<string, AsanaTypeFieldInfo>;
  lockedIntegrationId?: string;
  initialName?: string;
  title?: string;
  submitLabel?: string;
  onClose: () => void;
  onCreateTask: (
    integrationId: string,
    name: string,
    options?: CreateAsanaTaskOptions,
  ) => Promise<CalendarEvent | null>;
}

export function CreateAsanaTaskModal({
  integrations,
  projects,
  typeFieldInfoByIntegration,
  lockedIntegrationId,
  initialName = '',
  title = 'Create Asana Task',
  submitLabel = 'Create Task',
  onClose,
  onCreateTask,
}: CreateAsanaTaskModalProps) {
  const [name, setName] = useState(initialName);
  const [notes, setNotes] = useState('');
  const [dueOn, setDueOn] = useState('');
  const [selectedIntegration, setSelectedIntegration] = useState(
    lockedIntegrationId || integrations[0]?.id || '',
  );
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const typeFieldInfo = useMemo(() => {
    if (!typeFieldInfoByIntegration || !selectedIntegration) return null;
    return typeFieldInfoByIntegration.get(selectedIntegration) || null;
  }, [typeFieldInfoByIntegration, selectedIntegration]);

  const typeValues = useMemo(() => {
    if (!typeFieldInfo) return [];
    return Array.from(typeFieldInfo.enumOptions.keys()).sort();
  }, [typeFieldInfo]);

  const typeRequired = !!typeFieldInfo && typeValues.length > 0;

  const filteredProjects = useMemo(
    () => projects.filter(p => p.integrationId === selectedIntegration),
    [projects, selectedIntegration],
  );

  useEffect(() => {
    setSelectedProject('');
    setSelectedType('');
  }, [selectedIntegration]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !selectedIntegration) return;

    if (typeRequired && !selectedType) {
      setError('Type field is required - please select a type for this task');
      return;
    }

    if (selectedIntegration === 'cced5243-26a4-447f-bd1e-1e202ebe5130' && !typeRequired) {
      setError('Type configuration missing for OM integration');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const options: CreateAsanaTaskOptions = {};
      if (notes.trim()) options.notes = notes.trim();
      if (dueOn) options.dueOn = dueOn;
      if (selectedProject) options.projectGid = selectedProject;

      if (selectedType && typeFieldInfo) {
        const enumOptionGid = typeFieldInfo.enumOptions.get(selectedType);
        if (enumOptionGid) {
          options.customFields = { [typeFieldInfo.fieldGid]: enumOptionGid };
        }
      }

      await onCreateTask(selectedIntegration, name.trim(), options);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {error}
            </div>
          )}

          {integrations.length > 1 && !lockedIntegrationId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Workspace</label>
              <select
                value={selectedIntegration}
                onChange={e => setSelectedIntegration(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
              >
                {integrations.map(int => (
                  <option key={int.id} value={int.id}>{int.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Task name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Enter task name"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
              autoFocus
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Add notes (optional)"
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Due date</label>
            <div className="relative">
              <input
                type="date"
                value={dueOn}
                onChange={e => setDueOn(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none cursor-pointer [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:left-0 [&::-webkit-calendar-picker-indicator]:top-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
              />
            </div>
          </div>

          {filteredProjects.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Project</label>
              <select
                value={selectedProject}
                onChange={e => setSelectedProject(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
              >
                <option value="">No project</option>
                {filteredProjects.map(project => (
                  <option key={project.gid} value={project.gid}>{project.name}</option>
                ))}
              </select>
            </div>
          )}

          {typeValues.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Type <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedType}
                onChange={e => setSelectedType(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
                required
              >
                <option value="">Select type (required)</option>
                {typeValues.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isSubmitting}
              className="flex-1 px-4 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? 'Creating...' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
