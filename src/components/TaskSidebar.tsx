'use client';

import { useState, useEffect, memo, useCallback, useMemo } from 'react';
import { DragItem, CalendarEvent, TaskType, TaskTypeSelection, TaskTemplate, CustomTaskType, BuiltInTaskType, BUILT_IN_TASK_TYPE_EMOJIS, BUILT_IN_TASK_TYPE_LABELS, isCustomTaskType, getCustomTaskTypeId } from '@/types';
import { Plus, GripVertical, Calendar, X, ChevronDown, Star, PlusCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { EmojiPicker } from './EmojiPicker';

interface ColorScheme {
  headerBg: string;
  headerText: string;
  sidebarHeaderBg: string;
  sidebarHeaderText: string;
  mainBg: string;
}

interface TaskSidebarProps {
  allDayEvents?: CalendarEvent[];
  colorScheme?: ColorScheme;
}

const BUILT_IN_TASK_TYPES: BuiltInTaskType[] = ['flight', 'train', 'car', 'walk', 'writing', 'reading', 'focus', 'email', 'batch'];

export function TaskSidebar({ allDayEvents = [], colorScheme }: TaskSidebarProps) {
  const [title, setTitle] = useState('');
  const [taskType, setTaskType] = useState<TaskTypeSelection>(null);
  const [duration, setDuration] = useState(30); // default 30 min for templates
  const [isAdding, setIsAdding] = useState(false);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [customTypes, setCustomTypes] = useState<CustomTaskType[]>([]);
  const [isCreatingCustomType, setIsCreatingCustomType] = useState(false);
  const [customTypeLabel, setCustomTypeLabel] = useState('');
  const [customTypeEmoji, setCustomTypeEmoji] = useState('');

  // Load templates and custom types on mount
  useEffect(() => {
    api.getTaskTemplates().then(({ templates }) => setTemplates(templates)).catch(console.error);
    api.getCustomTaskTypes().then(({ customTypes }) => setCustomTypes(customTypes)).catch(console.error);
  }, []);

  // Helper to get emoji for any task type
  const getTaskTypeEmoji = useCallback((type: TaskType): string => {
    if (isCustomTaskType(type)) {
      const customId = getCustomTaskTypeId(type);
      const custom = customTypes.find(c => c.id === customId);
      return custom?.emoji || '📌';
    }
    return BUILT_IN_TASK_TYPE_EMOJIS[type as BuiltInTaskType];
  }, [customTypes]);

  // Helper to get label for any task type
  const getTaskTypeLabel = useCallback((type: TaskType): string => {
    if (isCustomTaskType(type)) {
      const customId = getCustomTaskTypeId(type);
      const custom = customTypes.find(c => c.id === customId);
      return custom?.label || 'Custom';
    }
    return BUILT_IN_TASK_TYPE_LABELS[type as BuiltInTaskType];
  }, [customTypes]);

  // All task types including custom ones
  const allTaskTypes = useMemo((): Array<{ type: TaskType; emoji: string; label: string }> => {
    const builtIn = BUILT_IN_TASK_TYPES.map(type => ({
      type: type as TaskType,
      emoji: BUILT_IN_TASK_TYPE_EMOJIS[type],
      label: BUILT_IN_TASK_TYPE_LABELS[type],
    }));
    const custom = customTypes.map(c => ({
      type: `custom:${c.id}` as TaskType,
      emoji: c.emoji,
      label: c.label,
    }));
    return [...builtIn, ...custom];
  }, [customTypes]);

  const handleCreateCustomType = useCallback(async () => {
    if (!customTypeLabel.trim() || !customTypeEmoji.trim()) return;

    try {
      const { customType: newType } = await api.addCustomTaskType({
        label: customTypeLabel.trim(),
        emoji: customTypeEmoji.trim(),
      });
      setCustomTypes(prev => [...prev, newType]);
      setTaskType(`custom:${newType.id}` as TaskType);
      setCustomTypeLabel('');
      setCustomTypeEmoji('');
      setIsCreatingCustomType(false);
      setShowTypeDropdown(false);
    } catch (error) {
      console.error('Failed to create custom type:', error);
    }
  }, [customTypeLabel, customTypeEmoji]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !taskType) return;

    const emoji = getTaskTypeEmoji(taskType);

    try {
      // Add as template via API
      const { template: newTemplate } = await api.addTaskTemplate({
        title: `${emoji} ${title.trim()}`,
        priority: 'medium',
        taskType,
        duration,
      });
      setTemplates(prev => [...prev, newTemplate]);

      setTitle('');
      setTaskType(null);
      setDuration(30);
      setIsAdding(false);
    } catch (error) {
      console.error('Failed to add template:', error);
    }
  };

  const handleDeleteTemplate = useCallback(async (templateId: string) => {
    try {
      await api.deleteTaskTemplate(templateId);
      setTemplates(prev => prev.filter(t => t.id !== templateId));
    } catch (error) {
      console.error('Failed to delete template:', error);
    }
  }, []);

  const handleTemplateDragStart = useCallback((e: React.DragEvent, template: TaskTemplate) => {
    const dragItem: DragItem = {
      type: 'task-template',
      id: template.id,
      source: 'template',
      title: template.title,
      duration: template.duration,
      taskType: template.taskType,
      priority: template.priority,
    };
    e.dataTransfer.setData('application/json', JSON.stringify(dragItem));
    e.dataTransfer.effectAllowed = 'copy'; // copy instead of move for templates
  }, []);

  return (
    <div className="bg-white border-l border-gray-200 h-full overflow-hidden flex flex-col">
      <div className={`p-4 border-b border-gray-200 ${colorScheme?.sidebarHeaderBg || ''}`}>
        <div className="flex items-center gap-2">
          <Star className="w-4 h-4 text-amber-500" />
          <h2 className={`font-semibold ${colorScheme?.sidebarHeaderText || 'text-gray-900'}`}>
            Frequent Tasks
          </h2>
        </div>
        <p className="text-sm mt-1 text-gray-500">
          {templates.length} template{templates.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Add Task Form */}
      <div className="p-3 border-b border-gray-200">
        {isAdding ? (
          <form onSubmit={handleSubmit} className="space-y-2">
            {/* Task Type Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowTypeDropdown(!showTypeDropdown);
                  setIsCreatingCustomType(false);
                }}
                className="w-full flex items-center justify-between px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white"
              >
                <span className={taskType ? 'text-gray-900' : 'text-gray-400'}>
                  {taskType ? `${getTaskTypeEmoji(taskType)} ${getTaskTypeLabel(taskType)}` : 'Select type...'}
                </span>
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>
              {showTypeDropdown && (
                <div className={`absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-y-auto ${isCreatingCustomType ? 'max-h-96' : 'max-h-64'}`}>
                  {isCreatingCustomType ? (
                    <div className="p-3 space-y-3">
                      <div className="flex gap-2 items-center">
                        <div
                          className={`w-10 h-10 flex items-center justify-center text-xl border-2 rounded-lg ${
                            customTypeEmoji ? 'border-purple-400 bg-purple-50' : 'border-gray-300 bg-gray-50'
                          }`}
                        >
                          {customTypeEmoji || '?'}
                        </div>
                        <input
                          type="text"
                          value={customTypeLabel}
                          onChange={(e) => setCustomTypeLabel(e.target.value)}
                          placeholder="Type name..."
                          className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
                          autoFocus
                        />
                      </div>
                      <EmojiPicker
                        onSelect={(emoji) => setCustomTypeEmoji(emoji)}
                        selectedEmoji={customTypeEmoji}
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleCreateCustomType}
                          disabled={!customTypeEmoji.trim() || !customTypeLabel.trim()}
                          className="flex-1 px-2 py-1.5 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Create
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsCreatingCustomType(false);
                            setCustomTypeLabel('');
                            setCustomTypeEmoji('');
                          }}
                          className="px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {allTaskTypes.map(({ type, emoji, label }) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => {
                            setTaskType(type);
                            setShowTypeDropdown(false);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-amber-50 transition-colors"
                        >
                          <span>{emoji}</span>
                          <span>{label}</span>
                        </button>
                      ))}
                      <div className="border-t border-gray-200 mt-1 pt-1">
                        <button
                          type="button"
                          onClick={() => setIsCreatingCustomType(true)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-amber-600 hover:bg-amber-50 transition-colors"
                        >
                          <PlusCircle className="w-4 h-4" />
                          <span>Create custom type...</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Template name..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
            />
            {/* Duration field */}
            <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Duration:</label>
                <select
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                >
                  <option value={15}>15 min</option>
                  <option value={30}>30 min</option>
                  <option value={45}>45 min</option>
                  <option value={60}>1 hour</option>
                  <option value={90}>1.5 hours</option>
                  <option value={120}>2 hours</option>
                  <option value={180}>3 hours</option>
                  <option value={240}>4 hours</option>
                </select>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={!title.trim() || !taskType}
                className="flex-1 px-3 py-1.5 text-sm text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors bg-amber-600 hover:bg-amber-700"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsAdding(false);
                  setTitle('');
                  setTaskType(null);
                  setDuration(30);
                  setShowTypeDropdown(false);
                  setIsCreatingCustomType(false);
                  setCustomTypeLabel('');
                  setCustomTypeEmoji('');
                }}
                className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setIsAdding(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors text-amber-600 border border-amber-200 hover:bg-amber-50"
          >
            <Plus className="w-4 h-4" />
            Create Template
          </button>
        )}
      </div>

      {/* Template List */}
      <div className="flex-1 overflow-y-auto">
        {templates.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">
            No templates yet. Create one above!
            <p className="mt-2 text-xs">
              Templates can be dragged to the calendar multiple times.
            </p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {templates.map(template => (
              <TemplateItem
                key={template.id}
                template={template}
                onDragStart={handleTemplateDragStart}
                onDelete={handleDeleteTemplate}
              />
            ))}
          </div>
        )}
      </div>

      {/* All-Day Events Section */}
      {allDayEvents.length > 0 && (
        <div className="border-t border-gray-200">
          <div className={`p-4 border-b border-gray-200 ${colorScheme?.sidebarHeaderBg || ''}`}>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-500" />
              <h2 className={`font-semibold ${colorScheme?.sidebarHeaderText || 'text-gray-900'}`}>All-Day Events</h2>
            </div>
            <p className="text-sm mt-1 text-gray-500">
              {allDayEvents.length} event{allDayEvents.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="p-2 space-y-1 max-h-48 overflow-y-auto">
            {allDayEvents.map(event => (
              <AllDayEventItem key={`${event.integrationId || event.source}-${event.id}`} event={event} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface TemplateItemProps {
  template: TaskTemplate;
  onDragStart: (e: React.DragEvent, template: TaskTemplate) => void;
  onDelete: (templateId: string) => void;
}

const TemplateItem = memo(function TemplateItem({ template, onDragStart, onDelete }: TemplateItemProps) {
  const handleDrag = useCallback((e: React.DragEvent) => {
    onDragStart(e, template);
  }, [onDragStart, template]);

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(template.id);
  }, [onDelete, template.id]);

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  return (
    <div
      draggable
      onDragStart={handleDrag}
      className="group flex items-start gap-2 p-2 rounded-lg hover:bg-amber-50 cursor-grab active:cursor-grabbing"
    >
      <GripVertical className="w-4 h-4 text-amber-300 group-hover:text-amber-400 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-gray-900 line-clamp-2">
            {template.title}
          </p>
          <button
            onClick={handleDelete}
            className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-all flex-shrink-0"
            title="Delete template"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-xs text-amber-600 mt-0.5">
          {formatDuration(template.duration)}
        </p>
      </div>
    </div>
  );
});

interface AllDayEventItemProps {
  event: CalendarEvent;
}

const AllDayEventItem = memo(function AllDayEventItem({ event }: AllDayEventItemProps) {
  return (
    <div className="flex items-start gap-2 p-2 rounded-lg hover:bg-gray-50">
      <div
        className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
        style={{ backgroundColor: event.color || '#3b82f6' }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 line-clamp-2">
          {event.title}
        </p>
        {event.location && (
          <p className="text-xs text-gray-500 mt-0.5 truncate">{event.location}</p>
        )}
      </div>
    </div>
  );
});
