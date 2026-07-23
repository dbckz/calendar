'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { AsanaStory } from '@/types';
import { X, ExternalLink, Send, Check, ArrowLeft, Clock, Folder, Tag, PlayCircle, Trash2, MessageSquare, Loader2, Layers, Bot, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, parseISO, isToday, isPast } from 'date-fns';
import { getAsanaTaskUrl } from '@/lib/asana';
import { api } from '@/lib/api';
import { TaskMetadataEditor } from '../TaskMetadataEditor';
import { DelegateModal } from '../DelegateModal';
import { LinkifiedText } from './LinkifiedText';
import { DelegationSection } from './DelegationSection';
import { UpdateTaskOptions, TaskDetailDialogProps } from './types';

function getDueDateStyles(dueOn: string): string {
  const date = parseISO(dueOn);
  if (isPast(date) && !isToday(date)) return 'text-red-600 font-medium';
  if (isToday(date)) return 'text-orange-600 font-medium';
  return 'text-gray-900';
}

export function TaskDetailDialog({
  task,
  scheduledDuration,
  formatDuration,
  onClose,
  elevated,
  onBack,
  onToggleComplete,
  onAddComment,
  onUpdateTask,
  onDeleteTask,
  projects = [],
  typeFieldInfoByIntegration,
  metadata,
  onSaveMetadata,
  delegationEntry,
  onDelegated,
  onPrevTask,
  onNextTask,
}: TaskDetailDialogProps) {
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [stories, setStories] = useState<AsanaStory[]>([]);
  const [isLoadingStories, setIsLoadingStories] = useState(false);
  const [storiesError, setStoriesError] = useState<string | null>(null);

  // Agent delegation: the compose modal owns enqueue/run; this dialog just
  // renders queue state + the last result.
  const [showDelegateModal, setShowDelegateModal] = useState(false);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editDueOn, setEditDueOn] = useState(task.dueOn || '');
  const [editStartOn, setEditStartOn] = useState(task.startOn || '');
  const [editType, setEditType] = useState('');
  const [editProjectIds, setEditProjectIds] = useState<string[]>(task.projects?.map(p => p.gid) || []);
  const wasEditingRef = useRef(false);

  // Get Type custom field info for this task's integration
  const typeFieldInfo = useMemo(() => {
    if (!typeFieldInfoByIntegration || !task.integrationId) return null;
    return typeFieldInfoByIntegration.get(task.integrationId) || null;
  }, [typeFieldInfoByIntegration, task.integrationId]);

  // Available type values for dropdown
  const typeValues = useMemo(() => {
    if (!typeFieldInfo) return [];
    return Array.from(typeFieldInfo.enumOptions.keys()).sort();
  }, [typeFieldInfo]);

  // Filter projects to only those from this task's integration
  const availableProjects = useMemo(() => {
    return projects.filter(p => p.integrationId === task.integrationId);
  }, [projects, task.integrationId]);

  // Get Type custom field
  const typeField = task.customFields?.find(cf => cf.name.toLowerCase() === 'type');

  // Initialize edit fields only when ENTERING edit mode (not on every task prop change)
  useEffect(() => {
    if (isEditing && !wasEditingRef.current) {
      // Just entered edit mode - initialize fields
      setEditType(typeField?.displayValue || '');
      setEditDueOn(task.dueOn || '');
      setEditStartOn(task.startOn || '');
      setEditProjectIds(task.projects?.map(p => p.gid) || []);
    }
    wasEditingRef.current = isEditing;
  }, [isEditing, typeField?.displayValue, task.dueOn, task.startOn, task.projects]);

  // Fetch stories when dialog opens
  useEffect(() => {
    if (task.integrationId) {
      setIsLoadingStories(true);
      setStoriesError(null);
      api.getTaskStories(task.id, task.integrationId)
        .then(({ stories }) => {
          // Filter to only show comments (not system-generated stories)
          const comments = stories.filter(s => s.resourceSubtype === 'comment_added');
          setStories(comments);
        })
        .catch((err) => {
          console.error('Failed to fetch stories:', err);
          setStoriesError('Failed to load comments');
        })
        .finally(() => {
          setIsLoadingStories(false);
        });
    }
  }, [task.id, task.integrationId]);

  // Close on Escape; step through the originating list on ArrowLeft/ArrowRight.
  // Arrow keys are ignored while typing into a form control so they still move
  // the caret / adjust date inputs as expected.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;
      if (e.key === 'ArrowLeft' && onPrevTask) {
        e.preventDefault();
        onPrevTask();
      } else if (e.key === 'ArrowRight' && onNextTask) {
        e.preventDefault();
        onNextTask();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onPrevTask, onNextTask]);

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim() || !onAddComment || !task.integrationId) return;

    setIsSubmitting(true);
    try {
      await onAddComment(task.id, task.integrationId, comment.trim());
      setComment('');
      // Refresh stories to show the new comment
      const { stories } = await api.getTaskStories(task.id, task.integrationId);
      const comments = stories.filter(s => s.resourceSubtype === 'comment_added');
      setStories(comments);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleComplete = () => {
    if (!onToggleComplete || !task.integrationId) return;

    const isCompleting = !task.completed;
    // Optimistic: call handler and close dialog immediately
    onToggleComplete(task.id, task.integrationId, isCompleting);
    // Close the dialog immediately after marking complete (task will disappear from list)
    if (isCompleting) {
      onClose();
    }
  };

  const handleDeleteTask = () => {
    if (!onDeleteTask || !task.integrationId) return;

    // Optimistic: call handler and close dialog immediately
    onDeleteTask(task.id, task.integrationId);
    onClose();
  };

  const handleSaveChanges = () => {
    if (!onUpdateTask || !task.integrationId) return;

    const updates: UpdateTaskOptions = {};

    // Due date
    if (editDueOn !== (task.dueOn || '')) {
      updates.dueOn = editDueOn || null;
    }

    // Start date
    if (editStartOn !== (task.startOn || '')) {
      updates.startOn = editStartOn || null;
    }

    // Type
    if (editType !== (typeField?.displayValue || '')) {
      if (typeFieldInfo && editType) {
        const enumOptionGid = typeFieldInfo.enumOptions.get(editType);
        if (enumOptionGid) {
          updates.customFields = { [typeFieldInfo.fieldGid]: enumOptionGid };
        }
      } else if (typeFieldInfo && !editType) {
        // Clear the type
        updates.customFields = { [typeFieldInfo.fieldGid]: null };
      }
    }

    // Projects
    const currentProjectIds = task.projects?.map(p => p.gid) || [];
    const addProjects = editProjectIds.filter(id => !currentProjectIds.includes(id));
    const removeProjects = currentProjectIds.filter(id => !editProjectIds.includes(id));

    if (addProjects.length > 0) {
      updates.addProjects = addProjects;
    }
    if (removeProjects.length > 0) {
      updates.removeProjects = removeProjects;
    }

    // Only update if there are changes
    if (Object.keys(updates).length > 0) {
      // Optimistic: call handler immediately
      onUpdateTask(task.id, task.integrationId, updates);
      // If type was changed to "NOT A TASK", close the dialog entirely
      // since the task will be filtered out of the view
      if (editType === 'NOT A TASK') {
        onClose();
        return;
      }
    }
    // Exit edit mode immediately
    setIsEditing(false);
    wasEditingRef.current = false;
  };

  const handleProjectToggle = (projectGid: string) => {
    setEditProjectIds(prev =>
      prev.includes(projectGid)
        ? prev.filter(id => id !== projectGid)
        : [...prev, projectGid]
    );
  };

  return (
    <div className={`fixed inset-0 bg-black/50 flex items-center justify-center ${elevated ? 'z-[70]' : 'z-50'}`} onClick={onClose}>
      {/* Relative wrapper (no overflow clipping) so the prev/next controls can
          float just outside the panel's left/right edges, over the backdrop. */}
      <div className="relative w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        {/* Prev/next task navigation — carousel-style buttons vertically centred
            just outside the panel edges. Each renders only when its neighbour
            exists. stopPropagation keeps clicks off the backdrop-close handler. */}
        {onPrevTask && (
          <button
            onClick={(e) => { e.stopPropagation(); onPrevTask(); }}
            className="absolute top-1/2 -translate-y-1/2 right-full mr-3 z-10 flex items-center justify-center w-9 h-9 rounded-full bg-white border border-gray-200 text-gray-500 shadow-md hover:bg-gray-50 hover:text-gray-700"
            title="Previous task"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        {onNextTask && (
          <button
            onClick={(e) => { e.stopPropagation(); onNextTask(); }}
            className="absolute top-1/2 -translate-y-1/2 left-full ml-3 z-10 flex items-center justify-center w-9 h-9 rounded-full bg-white border border-gray-200 text-gray-500 shadow-md hover:bg-gray-50 hover:text-gray-700"
            title="Next task"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}

        <div
          className="bg-white rounded-lg shadow-xl w-full overflow-hidden max-h-[90vh] flex flex-col"
        >
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2 min-w-0">
              {onBack && (
                <button
                  onClick={onBack}
                  className="p-1 -ml-1 mt-0.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded flex-shrink-0"
                  title="Back"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              )}
              <h3 className="font-semibold text-gray-900 line-clamp-2">{task.title}</h3>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {onUpdateTask && task.integrationId && !isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="p-1 text-gray-400 hover:text-orange-600 hover:bg-gray-100 rounded"
                  title="Edit task"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              )}
              <button
                onClick={onClose}
                className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Type badge */}
          {typeField?.displayValue && !isEditing && (
            <span className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">
              <Tag className="w-3 h-3" />
              {typeField.displayValue}
            </span>
          )}

          {/* Scheduled duration */}
          {scheduledDuration !== undefined && scheduledDuration > 0 && !isEditing && (
            <span className="inline-flex ml-2 mt-2 bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-xs">
              {formatDuration(scheduledDuration)} scheduled
            </span>
          )}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {isEditing ? (
            /* Edit Mode Form */
            <div className="space-y-4">
              {/* Type selector */}
              {typeValues.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                    <Tag className="w-3 h-3" /> Type
                  </label>
                  <select
                    value={editType}
                    onChange={(e) => setEditType(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
                  >
                    <option value="">No type</option>
                    {typeValues.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Start date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                  <PlayCircle className="w-3 h-3" /> Start date
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={editStartOn}
                    onChange={(e) => setEditStartOn(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none cursor-pointer [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:left-0 [&::-webkit-calendar-picker-indicator]:top-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                  />
                </div>
              </div>

              {/* Due date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Due date
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={editDueOn}
                    onChange={(e) => setEditDueOn(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none cursor-pointer [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:left-0 [&::-webkit-calendar-picker-indicator]:top-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                  />
                </div>
              </div>

              {/* Projects */}
              {availableProjects.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                    <Folder className="w-3 h-3" /> Projects
                  </label>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 bg-gray-50 rounded-lg border border-gray-200">
                    {availableProjects.map(project => (
                      <button
                        key={project.gid}
                        type="button"
                        onClick={() => handleProjectToggle(project.gid)}
                        className={`text-xs px-2 py-1 rounded-full transition-colors ${
                          editProjectIds.includes(project.gid)
                            ? 'bg-orange-100 text-orange-700 ring-1 ring-orange-300'
                            : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                        }`}
                      >
                        {project.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Save/Cancel buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setIsEditing(false)}
                  className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveChanges}
                  className="flex-1 px-4 py-2 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </div>
          ) : (
            /* View Mode */
            <>
              {/* Notes/Description */}
              {task.description && (
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Notes</label>
                  <div className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">
                    <LinkifiedText text={task.description} />
                  </div>
                </div>
              )}

              {/* Parent Task */}
              {task.parentTask && (
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Parent Task</label>
                  <a
                    href={getAsanaTaskUrl(task.parentTask.gid)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-orange-600 hover:text-orange-700 hover:underline mt-0.5 block truncate"
                  >
                    {task.parentTask.name}
                  </a>
                </div>
              )}

              {/* Task Details Grid */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                {/* Start date */}
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1">
                    <PlayCircle className="w-3 h-3" /> Start
                  </label>
                  <p className="text-gray-900 mt-0.5">
                    {task.startOn ? format(parseISO(task.startOn), 'MMM d, yyyy') : <span className="text-gray-400 italic">Not set</span>}
                  </p>
                </div>

                {/* Due date */}
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Due
                  </label>
                  {task.dueOn ? (
                    <p className={`mt-0.5 ${getDueDateStyles(task.dueOn)}`}>
                      {format(parseISO(task.dueOn), 'MMM d, yyyy')}
                    </p>
                  ) : (
                    <p className="text-gray-400 italic mt-0.5">Not set</p>
                  )}
                </div>

                {/* Created at */}
                {task.createdAt && (
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Created</label>
                    <p className="text-gray-900 mt-0.5">{format(parseISO(task.createdAt), 'MMM d, yyyy')}</p>
                  </div>
                )}

                {/* Integration */}
                {task.integrationName && (
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Integration</label>
                    <p className="text-gray-900 mt-0.5">{task.integrationName}</p>
                  </div>
                )}
              </div>

              {/* Projects */}
              {task.projects && task.projects.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1">
                    <Folder className="w-3 h-3" /> Projects
                  </label>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {task.projects.map(project => (
                      <span
                        key={project.gid}
                        className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs"
                      >
                        {project.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Agent delegation */}
              {onUpdateTask && task.integrationId && (
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1 mb-2">
                    <Bot className="w-3 h-3" /> Agent delegation
                  </label>

                  <DelegationSection
                    entry={delegationEntry}
                    onDelegate={() => setShowDelegateModal(true)}
                  />
                </div>
              )}

              {/* Metadata enrichment */}
              {onSaveMetadata && task.integrationId && (
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1 mb-2">
                    <Layers className="w-3 h-3" /> Metadata
                  </label>
                  <TaskMetadataEditor
                    metadata={metadata}
                    onChange={(updates) => {
                      onSaveMetadata(task.id, task.integrationId!, updates);
                    }}
                  />
                </div>
              )}

              {/* Comments Section */}
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1">
                  <MessageSquare className="w-3 h-3" /> Comments
                  {stories.length > 0 && (
                    <span className="text-gray-400">({stories.length})</span>
                  )}
                </label>

                {isLoadingStories ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                  </div>
                ) : storiesError ? (
                  <p className="text-sm text-red-500 mt-1">{storiesError}</p>
                ) : stories.length === 0 ? (
                  <p className="text-sm text-gray-500 mt-1 italic">No comments yet</p>
                ) : (
                  <div className="mt-2 space-y-3 max-h-48 overflow-y-auto">
                    {stories.map((story) => (
                      <div key={story.gid} className="bg-gray-50 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-gray-700">
                            {story.createdBy?.name || 'Unknown'}
                          </span>
                          <span className="text-xs text-gray-400">
                            {format(parseISO(story.createdAt), 'MMM d, h:mm a')}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">
                          <LinkifiedText text={story.text} />
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Actions - fixed at bottom */}
        <div className="p-4 border-t border-gray-200 space-y-3 flex-shrink-0">
          {/* Complete/Reopen button */}
          {onToggleComplete && task.integrationId && (
            <button
              onClick={handleToggleComplete}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors ${
                task.completed
                  ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              <Check className="w-4 h-4" />
              {task.completed ? 'Reopen Task' : 'Mark Complete'}
            </button>
          )}

          {/* Add comment */}
          {onAddComment && task.integrationId && (
            <form onSubmit={handleSubmitComment} className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Add a comment</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Write a comment..."
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
                  disabled={isSubmitting}
                />
                <button
                  type="submit"
                  disabled={!comment.trim() || isSubmitting}
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>
          )}

          {/* Open in Asana */}
          <a
            href={getAsanaTaskUrl(task.id)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Open in Asana
          </a>

          {/* Delete Task */}
          {onDeleteTask && task.integrationId && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 border border-red-300 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete Task
            </button>
          )}
        </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]"
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Task?</h3>
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to delete &quot;{task.title}&quot;? This will permanently remove the task from Asana and cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteTask}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delegate compose modal */}
      {showDelegateModal && task.integrationId && (
        <DelegateModal
          asanaTaskGid={task.id}
          integrationId={task.integrationId}
          taskTitle={task.title}
          initialBrief={delegationEntry?.brief || ''}
          onClose={() => setShowDelegateModal(false)}
          onDelegated={onDelegated}
        />
      )}
    </div>
  );
}
