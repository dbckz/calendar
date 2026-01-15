'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Star,
  Plus,
  Trash2,
  Edit2,
  GripVertical,
  ChevronDown,
  ChevronRight,
  Clock,
  FolderPlus,
  X,
  PlusCircle,
} from 'lucide-react';
import { TaskTemplate, TemplateGroup, TaskType, BuiltInTaskType, CustomTaskType, BUILT_IN_TASK_TYPE_EMOJIS, BUILT_IN_TASK_TYPE_LABELS, isCustomTaskType, getCustomTaskTypeId } from '@/types';
import { api } from '@/lib/api';
import { EmojiPicker } from '@/components/EmojiPicker';

const BUILT_IN_TASK_TYPES: BuiltInTaskType[] = ['flight', 'train', 'car', 'walk', 'writing', 'reading', 'focus', 'email', 'batch'];

export default function FrequentTasksPage() {
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [groups, setGroups] = useState<TemplateGroup[]>([]);
  const [customTypes, setCustomTypes] = useState<CustomTaskType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['ungrouped']));

  // Modal state
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TaskTemplate | null>(null);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<TemplateGroup | null>(null);

  // Template form state
  const [templateTitle, setTemplateTitle] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateDuration, setTemplateDuration] = useState(30);
  const [templateTaskType, setTemplateTaskType] = useState<TaskType | null>(null);
  const [templateGroup, setTemplateGroup] = useState<string>('');
  const [templatePriority, setTemplatePriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);

  // Custom type creation state
  const [isCreatingCustomType, setIsCreatingCustomType] = useState(false);
  const [customTypeLabel, setCustomTypeLabel] = useState('');
  const [customTypeEmoji, setCustomTypeEmoji] = useState('');

  // Group form state
  const [groupName, setGroupName] = useState('');

  // Load data
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [templatesRes, groupsRes, typesRes] = await Promise.all([
        api.getTaskTemplates(),
        fetch('/api/user-data/template-groups').then(r => r.json()),
        api.getCustomTaskTypes(),
      ]);
      setTemplates(templatesRes.templates);
      setGroups(groupsRes.groups || []);
      setCustomTypes(typesRes.customTypes);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper functions
  const getTaskTypeEmoji = useCallback((type: TaskType): string => {
    if (isCustomTaskType(type)) {
      const customId = getCustomTaskTypeId(type);
      const custom = customTypes.find(c => c.id === customId);
      return custom?.emoji || '📌';
    }
    return BUILT_IN_TASK_TYPE_EMOJIS[type as BuiltInTaskType];
  }, [customTypes]);

  const getTaskTypeLabel = useCallback((type: TaskType): string => {
    if (isCustomTaskType(type)) {
      const customId = getCustomTaskTypeId(type);
      const custom = customTypes.find(c => c.id === customId);
      return custom?.label || 'Custom';
    }
    return BUILT_IN_TASK_TYPE_LABELS[type as BuiltInTaskType];
  }, [customTypes]);

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

  // Group templates
  const groupedTemplates = useMemo(() => {
    const grouped: Record<string, TaskTemplate[]> = { ungrouped: [] };
    groups.forEach(g => { grouped[g.name] = []; });

    templates.forEach(t => {
      if (t.group && grouped[t.group]) {
        grouped[t.group].push(t);
      } else {
        grouped.ungrouped.push(t);
      }
    });

    return grouped;
  }, [templates, groups]);

  // Toggle group expansion
  const toggleGroup = (groupName: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupName)) {
        next.delete(groupName);
      } else {
        next.add(groupName);
      }
      return next;
    });
  };

  // Template CRUD
  const openTemplateModal = (template?: TaskTemplate) => {
    if (template) {
      setEditingTemplate(template);
      setTemplateTitle(template.title);
      setTemplateDescription(template.description || '');
      setTemplateDuration(template.duration);
      setTemplateTaskType(template.taskType);
      setTemplateGroup(template.group || '');
      setTemplatePriority(template.priority);
    } else {
      setEditingTemplate(null);
      setTemplateTitle('');
      setTemplateDescription('');
      setTemplateDuration(30);
      setTemplateTaskType(null);
      setTemplateGroup('');
      setTemplatePriority('medium');
    }
    setShowTemplateModal(true);
  };

  const handleSaveTemplate = async () => {
    if (!templateTitle.trim() || !templateTaskType) return;

    try {
      if (editingTemplate) {
        await api.updateTaskTemplate(editingTemplate.id, {
          title: templateTitle.trim(),
          description: templateDescription.trim() || undefined,
          duration: templateDuration,
          taskType: templateTaskType,
          group: templateGroup || undefined,
          priority: templatePriority,
        });
      } else {
        await api.addTaskTemplate({
          title: templateTitle.trim(),
          description: templateDescription.trim() || undefined,
          duration: templateDuration,
          taskType: templateTaskType,
          group: templateGroup || undefined,
          priority: templatePriority,
        });
      }
      await loadData();
      setShowTemplateModal(false);
    } catch (error) {
      console.error('Error saving template:', error);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('Delete this template?')) return;
    try {
      await api.deleteTaskTemplate(id);
      await loadData();
    } catch (error) {
      console.error('Error deleting template:', error);
    }
  };

  // Group CRUD
  const openGroupModal = (group?: TemplateGroup) => {
    if (group) {
      setEditingGroup(group);
      setGroupName(group.name);
    } else {
      setEditingGroup(null);
      setGroupName('');
    }
    setShowGroupModal(true);
  };

  const handleSaveGroup = async () => {
    if (!groupName.trim()) return;

    try {
      if (editingGroup) {
        await fetch('/api/user-data/template-groups', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingGroup.id, name: groupName.trim() }),
        });
      } else {
        await fetch('/api/user-data/template-groups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: groupName.trim() }),
        });
      }
      await loadData();
      setShowGroupModal(false);
    } catch (error) {
      console.error('Error saving group:', error);
    }
  };

  const handleDeleteGroup = async (id: string) => {
    if (!confirm('Delete this group? Templates in this group will become ungrouped.')) return;
    try {
      await fetch('/api/user-data/template-groups', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      await loadData();
    } catch (error) {
      console.error('Error deleting group:', error);
    }
  };

  // Custom type creation
  const handleCreateCustomType = async () => {
    if (!customTypeLabel.trim() || !customTypeEmoji.trim()) return;

    try {
      const { customType: newType } = await api.addCustomTaskType({
        label: customTypeLabel.trim(),
        emoji: customTypeEmoji.trim(),
      });
      setCustomTypes(prev => [...prev, newType]);
      setTemplateTaskType(`custom:${newType.id}` as TaskType);
      setCustomTypeLabel('');
      setCustomTypeEmoji('');
      setIsCreatingCustomType(false);
      setShowTypeDropdown(false);
    } catch (error) {
      console.error('Failed to create custom type:', error);
    }
  };

  const renderTemplateCard = (template: TaskTemplate) => (
    <div
      key={template.id}
      className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
    >
      <GripVertical className="w-4 h-4 text-gray-400 cursor-grab" />
      <span className="text-xl">{getTaskTypeEmoji(template.taskType)}</span>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-gray-900 truncate">{template.title}</div>
        <div className="text-sm text-gray-500 flex items-center gap-2">
          <Clock className="w-3 h-3" />
          {template.duration} min
          {template.description && (
            <span className="truncate">• {template.description}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => openTemplateModal(template)}
          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
        >
          <Edit2 className="w-4 h-4" />
        </button>
        <button
          onClick={() => handleDeleteTemplate(template.id)}
          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div className="flex items-center gap-2">
                <Star className="w-6 h-6 text-amber-500" />
                <h1 className="text-xl font-semibold text-gray-900">Frequent Tasks</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => openGroupModal()}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <FolderPlus className="w-4 h-4" />
                New Group
              </button>
              <button
                onClick={() => openTemplateModal()}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Template
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto p-6 space-y-6">
        {templates.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
            <Star className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h2 className="text-lg font-medium text-gray-900 mb-2">No frequent tasks yet</h2>
            <p className="text-gray-500 mb-4">Create templates for tasks you schedule often</p>
            <button
              onClick={() => openTemplateModal()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Template
            </button>
          </div>
        ) : (
          <>
            {/* Groups */}
            {groups.map(group => (
              <div key={group.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <button
                  onClick={() => toggleGroup(group.name)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {expandedGroups.has(group.name) ? (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    )}
                    <span className="font-medium text-gray-900">{group.name}</span>
                    <span className="text-sm text-gray-500">
                      ({groupedTemplates[group.name]?.length || 0})
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); openGroupModal(group); }}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group.id); }}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </button>
                {expandedGroups.has(group.name) && (
                  <div className="px-4 pb-4 space-y-2">
                    {groupedTemplates[group.name]?.length > 0 ? (
                      groupedTemplates[group.name].map(renderTemplateCard)
                    ) : (
                      <p className="text-sm text-gray-400 text-center py-4">No templates in this group</p>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Ungrouped */}
            {groupedTemplates.ungrouped.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <button
                  onClick={() => toggleGroup('ungrouped')}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {expandedGroups.has('ungrouped') ? (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    )}
                    <span className="font-medium text-gray-500">Ungrouped</span>
                    <span className="text-sm text-gray-400">
                      ({groupedTemplates.ungrouped.length})
                    </span>
                  </div>
                </button>
                {expandedGroups.has('ungrouped') && (
                  <div className="px-4 pb-4 space-y-2">
                    {groupedTemplates.ungrouped.map(renderTemplateCard)}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Template Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">
                {editingTemplate ? 'Edit Template' : 'New Template'}
              </h2>
              <button
                onClick={() => setShowTemplateModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {/* Task Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setShowTypeDropdown(!showTypeDropdown);
                      setIsCreatingCustomType(false);
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white"
                  >
                    <span className={templateTaskType ? 'text-gray-900' : 'text-gray-400'}>
                      {templateTaskType
                        ? `${getTaskTypeEmoji(templateTaskType)} ${getTaskTypeLabel(templateTaskType)}`
                        : 'Select type...'}
                    </span>
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  </button>
                  {showTypeDropdown && (
                    <div className={`absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-y-auto ${isCreatingCustomType ? 'max-h-96' : 'max-h-64'}`}>
                      {isCreatingCustomType ? (
                        <div className="p-3 space-y-3">
                          <div className="flex gap-2 items-center">
                            <div className={`w-10 h-10 flex items-center justify-center text-xl border-2 rounded-lg ${customTypeEmoji ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-gray-50'}`}>
                              {customTypeEmoji || '?'}
                            </div>
                            <input
                              type="text"
                              value={customTypeLabel}
                              onChange={(e) => setCustomTypeLabel(e.target.value)}
                              placeholder="Type name..."
                              className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-lg"
                              autoFocus
                            />
                          </div>
                          <EmojiPicker onSelect={(emoji) => setCustomTypeEmoji(emoji)} selectedEmoji={customTypeEmoji} />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={handleCreateCustomType}
                              disabled={!customTypeEmoji.trim() || !customTypeLabel.trim()}
                              className="flex-1 px-2 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                            >
                              Create
                            </button>
                            <button
                              type="button"
                              onClick={() => { setIsCreatingCustomType(false); setCustomTypeLabel(''); setCustomTypeEmoji(''); }}
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
                              onClick={() => { setTemplateTaskType(type); setShowTypeDropdown(false); }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-blue-50"
                            >
                              <span>{emoji}</span>
                              <span>{label}</span>
                            </button>
                          ))}
                          <div className="border-t border-gray-200 mt-1 pt-1">
                            <button
                              type="button"
                              onClick={() => setIsCreatingCustomType(true)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-blue-600 hover:bg-blue-50"
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

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input
                  type="text"
                  value={templateTitle}
                  onChange={(e) => setTemplateTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="Template name"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={templateDescription}
                  onChange={(e) => setTemplateDescription(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none"
                  placeholder="Optional description"
                />
              </div>

              {/* Duration & Group */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Duration (min)</label>
                  <input
                    type="number"
                    value={templateDuration}
                    onChange={(e) => setTemplateDuration(parseInt(e.target.value) || 30)}
                    min={5}
                    step={5}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Group</label>
                  <select
                    value={templateGroup}
                    onChange={(e) => setTemplateGroup(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
                  >
                    <option value="">None</option>
                    {groups.map(g => (
                      <option key={g.id} value={g.name}>{g.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Priority */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                <div className="flex gap-2">
                  {(['low', 'medium', 'high'] as const).map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setTemplatePriority(p)}
                      className={`flex-1 py-2 px-3 text-sm rounded-lg border transition-colors ${
                        templatePriority === p
                          ? p === 'high' ? 'bg-red-50 border-red-300 text-red-700'
                            : p === 'medium' ? 'bg-yellow-50 border-yellow-300 text-yellow-700'
                            : 'bg-green-50 border-green-300 text-green-700'
                          : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTemplateModal(false)}
                  className="flex-1 py-2 px-4 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveTemplate}
                  disabled={!templateTitle.trim() || !templateTaskType}
                  className="flex-1 py-2 px-4 bg-amber-500 text-white rounded-lg font-medium hover:bg-amber-600 disabled:opacity-50"
                >
                  {editingTemplate ? 'Save' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Group Modal */}
      {showGroupModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">
                {editingGroup ? 'Edit Group' : 'New Group'}
              </h2>
              <button
                onClick={() => setShowGroupModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Group Name</label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="e.g., Morning Routine"
                  autoFocus
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowGroupModal(false)}
                  className="flex-1 py-2 px-4 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveGroup}
                  disabled={!groupName.trim()}
                  className="flex-1 py-2 px-4 bg-amber-500 text-white rounded-lg font-medium hover:bg-amber-600 disabled:opacity-50"
                >
                  {editingGroup ? 'Save' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
