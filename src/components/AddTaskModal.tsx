'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { X, ChevronDown, PlusCircle } from 'lucide-react';
import { AdHocTask, TaskType, TaskTypeSelection, BuiltInTaskType, CustomTaskType, BUILT_IN_TASK_TYPE_EMOJIS, BUILT_IN_TASK_TYPE_LABELS, isCustomTaskType, getCustomTaskTypeId } from '@/types';
import { format } from 'date-fns';
import { api } from '@/lib/api';
import { EmojiPicker } from './EmojiPicker';

const BUILT_IN_TASK_TYPES: BuiltInTaskType[] = ['flight', 'train', 'car', 'walk', 'writing', 'reading', 'focus', 'email', 'batch'];

interface AddTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (task: Omit<AdHocTask, 'id' | 'createdAt' | 'updatedAt'>) => void;
  defaultDate?: Date;
  defaultStartTime?: Date;
  defaultEndTime?: Date;
}

export function AddTaskModal({ isOpen, onClose, onAdd, defaultDate, defaultStartTime, defaultEndTime }: AddTaskModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState(
    defaultStartTime ? format(defaultStartTime, 'yyyy-MM-dd') :
    defaultDate ? format(defaultDate, 'yyyy-MM-dd') : ''
  );
  const [dueTime, setDueTime] = useState(defaultStartTime ? format(defaultStartTime, 'HH:mm') : '');
  const [taskType, setTaskType] = useState<TaskTypeSelection>(null);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [customTypes, setCustomTypes] = useState<CustomTaskType[]>([]);
  const [isCreatingCustomType, setIsCreatingCustomType] = useState(false);
  const [customTypeLabel, setCustomTypeLabel] = useState('');
  const [customTypeEmoji, setCustomTypeEmoji] = useState('');

  // Load custom types on mount
  useEffect(() => {
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

  // Calculate duration from start/end times if provided
  const calculatedDuration = useMemo(() => {
    if (defaultStartTime && defaultEndTime) {
      return Math.round((defaultEndTime.getTime() - defaultStartTime.getTime()) / (60 * 1000));
    }
    return 30; // Default 30 minute duration
  }, [defaultStartTime, defaultEndTime]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !taskType) return;

    const emoji = getTaskTypeEmoji(taskType);
    onAdd({
      title: `${emoji} ${title.trim()}`,
      description: description.trim() || undefined,
      dueDate: dueDate || undefined,
      dueTime: dueTime || undefined,
      duration: calculatedDuration,
      priority: 'medium',
      taskType,
      completed: false,
    });

    // Reset form
    setTitle('');
    setDescription('');
    setDueDate(
      defaultStartTime ? format(defaultStartTime, 'yyyy-MM-dd') :
      defaultDate ? format(defaultDate, 'yyyy-MM-dd') : ''
    );
    setDueTime(defaultStartTime ? format(defaultStartTime, 'HH:mm') : '');
    setTaskType(null);
    setIsCreatingCustomType(false);
    setCustomTypeLabel('');
    setCustomTypeEmoji('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Add New Task</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Task Type Dropdown */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Type *
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowTypeDropdown(!showTypeDropdown);
                  setIsCreatingCustomType(false);
                }}
                className="w-full flex items-center justify-between px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
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
                            customTypeEmoji ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-gray-50'
                          }`}
                        >
                          {customTypeEmoji || '?'}
                        </div>
                        <input
                          type="text"
                          value={customTypeLabel}
                          onChange={(e) => setCustomTypeLabel(e.target.value)}
                          placeholder="Type name..."
                          className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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
                          className="flex-1 px-2 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-blue-50 transition-colors"
                        >
                          <span>{emoji}</span>
                          <span>{label}</span>
                        </button>
                      ))}
                      <div className="border-t border-gray-200 mt-1 pt-1">
                        <button
                          type="button"
                          onClick={() => setIsCreatingCustomType(true)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-blue-600 hover:bg-blue-50 transition-colors"
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
          </div>

          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
              Title *
            </label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="Enter task title"
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
              placeholder="Enter task description"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="dueDate" className="block text-sm font-medium text-gray-700 mb-1">
                Due Date
              </label>
              <input
                type="date"
                id="dueDate"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>

            <div>
              <label htmlFor="dueTime" className="block text-sm font-medium text-gray-700 mb-1">
                Due Time
              </label>
              <input
                type="time"
                id="dueTime"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 px-4 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || !taskType}
              className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add Task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
