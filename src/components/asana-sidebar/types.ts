import { CalendarEvent, AsanaProject, AsanaFilterState, ScheduledAsanaTask, TaskMetadata, DelegationQueueEntry } from '@/types';
import { AsanaTypeFieldInfo as ImportedAsanaTypeFieldInfo } from '../CreateAsanaTaskModal';

export interface ColorScheme {
  headerBg: string;
  headerText: string;
  sidebarHeaderBg: string;
  sidebarHeaderText: string;
  mainBg: string;
}

export type AsanaSidebarTypeFieldInfo = ImportedAsanaTypeFieldInfo;

export interface UpdateTaskOptions {
  dueOn?: string | null;
  startOn?: string | null;
  customFields?: Record<string, string | null>;
  addProjects?: string[];
  removeProjects?: string[];
  addTags?: string[];
  removeTags?: string[];
}

export interface AsanaSidebarProps {
  tasks: CalendarEvent[];
  isLoading: boolean;
  scheduledAsanaTasks?: ScheduledAsanaTask[];
  onUnschedule?: (taskId: string) => void;
  colorScheme?: ColorScheme;
  // Lock to a specific integration (hides integration filter)
  lockedIntegrationId?: string;
  // Filter props
  projects?: AsanaProject[];
  typeValues?: string[]; // Unique Type custom field values
  typeFieldInfoByIntegration?: Map<string, AsanaSidebarTypeFieldInfo>; // Info for setting Type field, per integration
  integrations?: { id: string; name: string }[]; // Unique integrations from all tasks
  filters?: AsanaFilterState;
  onFiltersChange?: (filters: AsanaFilterState) => void;
  onClearFilters?: () => void;
  // Asana actions (optimistic: return immediately, errors shown via toast)
  onToggleComplete?: (taskId: string, integrationId: string, completed: boolean) => void;
  onAddComment?: (taskId: string, integrationId: string, comment: string) => void;
  onCreateTask?: (integrationId: string, name: string, options?: { notes?: string; dueOn?: string; projectGid?: string; customFields?: Record<string, string> }) => Promise<CalendarEvent | null>;
  onUpdateTask?: (taskId: string, integrationId: string, updates: UpdateTaskOptions) => void;
  onDeleteTask?: (taskId: string, integrationId: string) => void;
  // Highlight task from calendar click (single click - just navigate/scroll)
  highlightedTaskId?: string | null;
  onClearHighlight?: () => void;
  // Open task dialog from calendar double-click
  openTaskDialogId?: string | null;
  onClearOpenTaskDialog?: () => void;
  // Task enrichment metadata (keyed by Asana task GID) + saver
  taskMetadata?: Record<string, TaskMetadata>;
  onSaveTaskMetadata?: (
    asanaTaskGid: string,
    integrationId: string,
    updates: Partial<Omit<TaskMetadata, 'asanaTaskGid' | 'integrationId' | 'updatedAt'>>
  ) => Promise<void>;
  // Delegation queue (keyed by Asana task GID) + a refresher called after enqueue/run.
  delegation?: Record<string, DelegationQueueEntry>;
  onDelegated?: () => void;
}

// Task Detail Dialog Component
export interface TaskDetailDialogProps {
  task: CalendarEvent;
  scheduledDuration?: number;
  formatDuration: (minutes: number) => string;
  onClose: () => void;
  // Render above another modal (e.g. the stale-triage modal at z-[60]).
  elevated?: boolean;
  // When set, show a Back arrow in the header that returns to the underlying
  // view (typically closes just this dialog, leaving the triage modal open).
  onBack?: () => void;
  onToggleComplete?: (taskId: string, integrationId: string, completed: boolean) => void;
  onAddComment?: (taskId: string, integrationId: string, comment: string) => void;
  onUpdateTask?: (taskId: string, integrationId: string, updates: UpdateTaskOptions) => void;
  onDeleteTask?: (taskId: string, integrationId: string) => void;
  projects?: AsanaProject[];
  typeFieldInfoByIntegration?: Map<string, AsanaSidebarTypeFieldInfo>;
  metadata?: TaskMetadata;
  onSaveMetadata?: (
    asanaTaskGid: string,
    integrationId: string,
    updates: Partial<Omit<TaskMetadata, 'asanaTaskGid' | 'integrationId' | 'updatedAt'>>
  ) => Promise<void>;
  delegationEntry?: DelegationQueueEntry;
  onDelegated?: () => void;
  // Step to the previous/next task in the originating list (Command Center
  // panels). Each is provided only when such a neighbour exists, so the
  // corresponding chevron renders only at a non-end position.
  onPrevTask?: () => void;
  onNextTask?: () => void;
}

export interface TaskItemProps {
  task: CalendarEvent;
  onDragStart: (e: React.DragEvent, task: CalendarEvent) => void;
  scheduledDuration?: number;
  formatDuration: (minutes: number) => string;
  onClick: () => void;
  isHighlighted?: boolean;
  onComplete?: (taskId: string, integrationId: string, completed: boolean) => void;
  onDelete?: (taskId: string, integrationId: string) => void;
  metadata?: TaskMetadata;
  bulkMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (taskId: string) => void;
}
