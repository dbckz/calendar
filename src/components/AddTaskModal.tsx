'use client';

import { useState } from 'react';
import { X, ChevronDown } from 'lucide-react';
import { AdHocTask, TaskType, TASK_TYPE_EMOJIS, TASK_TYPE_LABELS } from '@/types';
import { format } from 'date-fns';

const TASK_TYPES: TaskType[] = ['flight', 'train', 'car', 'walk', 'writing', 'reading', 'focus', 'email', 'batch', 'other'];

interface AddTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (task: Omit<AdHocTask, 'id' | 'createdAt' | 'updatedAt'>) => void;
  defaultDate?: Date;
}

export function AddTaskModal({ isOpen, onClose, onAdd, defaultDate }: AddTaskModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState(defaultDate ? format(defaultDate, 'yyyy-MM-dd') : '');
  const [dueTime, setDueTime] = useState('');
  const [taskType, setTaskType] = useState<TaskType | ''>('');
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !taskType) return;

    const emoji = TASK_TYPE_EMOJIS[taskType];
    onAdd({
      title: `${emoji} ${title.trim()}`,
      description: description.trim() || undefined,
      dueDate: dueDate || undefined,
      dueTime: dueTime || undefined,
      priority: 'medium',
      taskType,
      completed: false,
    });

    // Reset form
    setTitle('');
    setDescription('');
    setDueDate(defaultDate ? format(defaultDate, 'yyyy-MM-dd') : '');
    setDueTime('');
    setTaskType('');
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
                onClick={() => setShowTypeDropdown(!showTypeDropdown)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
              >
                <span className={taskType ? 'text-gray-900' : 'text-gray-400'}>
                  {taskType ? `${TASK_TYPE_EMOJIS[taskType]} ${TASK_TYPE_LABELS[taskType]}` : 'Select type...'}
                </span>
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>
              {showTypeDropdown && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {TASK_TYPES.map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        setTaskType(type);
                        setShowTypeDropdown(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-blue-50 transition-colors"
                    >
                      <span>{TASK_TYPE_EMOJIS[type]}</span>
                      <span>{TASK_TYPE_LABELS[type]}</span>
                    </button>
                  ))}
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
