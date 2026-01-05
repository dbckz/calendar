'use client';

import { useState, memo, useCallback } from 'react';
import { AdHocTask, DragItem, CalendarEvent, TaskType, TASK_TYPE_EMOJIS, TASK_TYPE_LABELS } from '@/types';
import { Plus, GripVertical, Calendar, X, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';

interface ColorScheme {
  headerBg: string;
  headerText: string;
  sidebarHeaderBg: string;
  sidebarHeaderText: string;
  mainBg: string;
}

interface TaskSidebarProps {
  tasks: AdHocTask[];
  selectedDate: Date;
  onAddTask: (task: {
    title: string;
    description?: string;
    dueDate?: string;
    dueTime?: string;
    priority: 'low' | 'medium' | 'high';
    taskType: TaskType;
    completed: boolean;
  }) => void;
  onDeleteTask?: (taskId: string) => void;
  scheduledTaskIds?: Set<string>;
  onUnschedule?: (taskId: string) => void;
  allDayEvents?: CalendarEvent[];
  colorScheme?: ColorScheme;
}

const TASK_TYPES: TaskType[] = ['flight', 'train', 'car', 'walk', 'writing', 'reading', 'focus', 'email', 'batch', 'other'];

export function TaskSidebar({ tasks, selectedDate, onAddTask, onDeleteTask, scheduledTaskIds, onUnschedule, allDayEvents = [], colorScheme }: TaskSidebarProps) {
  const [title, setTitle] = useState('');
  const [taskType, setTaskType] = useState<TaskType | ''>('');
  const [isAdding, setIsAdding] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !taskType) return;

    const emoji = TASK_TYPE_EMOJIS[taskType];
    onAddTask({
      title: `${emoji} ${title.trim()}`,
      priority: 'medium',
      taskType,
      completed: false,
    });

    setTitle('');
    setTaskType('');
    setIsAdding(false);
  };

  const handleDragStart = useCallback((e: React.DragEvent, task: AdHocTask) => {
    const dragItem: DragItem = {
      type: 'adhoc-task',
      id: task.id,
      source: 'adhoc',
      title: task.title,
      duration: task.duration || 60, // Use task duration or default 1 hour
    };
    e.dataTransfer.setData('application/json', JSON.stringify(dragItem));
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  // Filter tasks that don't have a scheduled time (unscheduled tasks)
  const unscheduledTasks = tasks.filter(task => !task.dueTime);
  // Tasks scheduled for the selected date
  const scheduledTasks = tasks.filter(
    task => task.dueDate === format(selectedDate, 'yyyy-MM-dd') && task.dueTime
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only set to false if leaving the container entirely
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    try {
      const data = e.dataTransfer.getData('application/json');
      if (!data) return;

      const dragItem: DragItem = JSON.parse(data);
      console.log('[TaskSidebar] Drop received:', dragItem);

      // Only unschedule adhoc tasks dropped here
      if (dragItem.source === 'adhoc' && onUnschedule) {
        console.log('[TaskSidebar] Unscheduling task:', dragItem.id);
        onUnschedule(dragItem.id);
      }
    } catch (err) {
      console.error('Failed to parse drag data:', err);
    }
  };

  return (
    <div
      className={`bg-white border-l border-gray-200 h-full overflow-hidden flex flex-col transition-colors ${
        isDragOver ? 'bg-purple-50' : ''
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className={`p-4 border-b border-gray-200 ${colorScheme?.sidebarHeaderBg || ''}`}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-purple-500" />
          <h2 className={`font-semibold ${colorScheme?.sidebarHeaderText || 'text-gray-900'}`}>Ad-hoc Tasks</h2>
        </div>
        <p className="text-sm mt-1 text-gray-500">
          {unscheduledTasks.length} unscheduled
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
                onClick={() => setShowTypeDropdown(!showTypeDropdown)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none bg-white"
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
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-purple-50 transition-colors"
                    >
                      <span>{TASK_TYPE_EMOJIS[type]}</span>
                      <span>{TASK_TYPE_LABELS[type]}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={!title.trim() || !taskType}
                className="flex-1 px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsAdding(false);
                  setTitle('');
                  setTaskType('');
                  setShowTypeDropdown(false);
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
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-purple-600 border border-purple-200 rounded-lg hover:bg-purple-50 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Task
          </button>
        )}
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-y-auto">
        {unscheduledTasks.length === 0 && scheduledTasks.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">
            No tasks yet. Create one above!
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {/* Unscheduled tasks - can be dragged */}
            {unscheduledTasks.map(task => (
              <TaskItem
                key={task.id}
                task={task}
                onDragStart={handleDragStart}
                onDelete={onDeleteTask}
                draggable
                isScheduled={scheduledTaskIds?.has(task.id) || false}
              />
            ))}

            {/* Scheduled tasks for today */}
            {scheduledTasks.length > 0 && (
              <>
                <div className="text-xs text-gray-400 uppercase tracking-wider px-2 pt-3 pb-1">
                  Scheduled Today
                </div>
                {scheduledTasks.map(task => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onDragStart={handleDragStart}
                    onDelete={onDeleteTask}
                    draggable
                    showTime
                    isScheduled
                  />
                ))}
              </>
            )}
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

interface TaskItemProps {
  task: AdHocTask;
  onDragStart: (e: React.DragEvent, task: AdHocTask) => void;
  onDelete?: (taskId: string) => void;
  draggable?: boolean;
  showTime?: boolean;
  isScheduled?: boolean;
}

const TaskItem = memo(function TaskItem({ task, onDragStart, onDelete, draggable, showTime, isScheduled }: TaskItemProps) {
  const handleDrag = useCallback((e: React.DragEvent) => {
    onDragStart(e, task);
  }, [onDragStart, task]);

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.(task.id);
  }, [onDelete, task.id]);

  return (
    <div
      draggable={draggable}
      onDragStart={handleDrag}
      className={`group flex items-start gap-2 p-2 rounded-lg hover:bg-gray-50 ${
        draggable ? 'cursor-grab active:cursor-grabbing' : ''
      } ${task.completed ? 'opacity-50' : ''}`}
    >
      {draggable && (
        <GripVertical className="w-4 h-4 text-gray-300 group-hover:text-gray-400 mt-0.5 flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-sm font-medium text-gray-900 line-clamp-2 ${
            task.completed ? 'line-through text-gray-500' : ''
          }`}>
            {task.title}
          </p>
          <div className="flex items-center gap-1 flex-shrink-0">
            {isScheduled && (
              <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">
                Scheduled
              </span>
            )}
            {onDelete && (
              <button
                onClick={handleDelete}
                className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-all"
                title="Delete task"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
        {showTime && task.dueTime && (
          <p className="text-xs text-gray-500 mt-0.5">{task.dueTime}</p>
        )}
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
