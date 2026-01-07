import {
  getAdHocTasks,
  saveAdHocTasks,
  addAdHocTask,
  updateAdHocTask,
  deleteAdHocTask,
  getTasksForDate,
  getScheduledAsanaTasks,
  saveScheduledAsanaTasks,
  scheduleAsanaTask,
  updateScheduledAsanaTask,
  updateScheduledAsanaTaskByGoogleEvent,
  unscheduleAsanaTask,
  unscheduleAllAsanaTaskInstances,
  getScheduledAsanaTasksForDate,
  getTaskTemplates,
  saveTaskTemplates,
  addTaskTemplate,
  updateTaskTemplate,
  deleteTaskTemplate,
  getCustomTaskTypes,
  saveCustomTaskTypes,
  addCustomTaskType,
  deleteCustomTaskType,
} from '@/lib/storage';
import {
  mockAdHocTask,
  mockScheduledAsanaTask,
  mockScheduledAsanaTaskWithGoogle,
  mockTaskTemplate,
  mockCustomTaskType,
  createMockAdHocTask,
  createMockScheduledAsanaTask,
} from '../mocks/data';

const TASKS_KEY = 'daily-planner-adhoc-tasks';
const SCHEDULED_ASANA_KEY = 'daily-planner-scheduled-asana';
const TASK_TEMPLATES_KEY = 'daily-planner-task-templates';
const CUSTOM_TASK_TYPES_KEY = 'daily-planner-custom-task-types';

describe('Storage - Ad-Hoc Tasks', () => {
  describe('getAdHocTasks', () => {
    it('returns empty array when no data exists', () => {
      const tasks = getAdHocTasks();
      expect(tasks).toEqual([]);
    });

    it('returns empty array when stored data is invalid JSON', () => {
      localStorage.setItem(TASKS_KEY, 'invalid json');
      (localStorage.getItem as jest.Mock).mockReturnValue('invalid json');

      const tasks = getAdHocTasks();
      expect(tasks).toEqual([]);
    });

    it('parses and returns stored tasks correctly', () => {
      const storedTasks = [mockAdHocTask];
      (localStorage.getItem as jest.Mock).mockReturnValue(JSON.stringify(storedTasks));

      const tasks = getAdHocTasks();
      expect(tasks).toEqual(storedTasks);
    });
  });

  describe('saveAdHocTasks', () => {
    it('saves tasks to localStorage', () => {
      const tasks = [mockAdHocTask];
      saveAdHocTasks(tasks);

      expect(localStorage.setItem).toHaveBeenCalledWith(
        TASKS_KEY,
        JSON.stringify(tasks)
      );
    });
  });

  describe('addAdHocTask', () => {
    it('creates task with UUID and timestamps', () => {
      const newTask = addAdHocTask({
        title: 'New Task',
        completed: false,
        priority: 'high',
        taskType: 'focus',
      });

      expect(newTask.id).toMatch(/^test-uuid-/);
      expect(newTask.createdAt).toBeDefined();
      expect(newTask.updatedAt).toBeDefined();
      expect(newTask.title).toBe('New Task');
      expect(newTask.priority).toBe('high');
    });

    it('appends task to existing tasks', () => {
      const existingTask = createMockAdHocTask({ id: 'existing-1' });
      (localStorage.getItem as jest.Mock).mockReturnValue(JSON.stringify([existingTask]));

      addAdHocTask({
        title: 'New Task',
        completed: false,
        priority: 'low',
        taskType: 'admin',
      });

      expect(localStorage.setItem).toHaveBeenCalled();
      const savedData = JSON.parse((localStorage.setItem as jest.Mock).mock.calls[0][1]);
      expect(savedData).toHaveLength(2);
    });
  });

  describe('updateAdHocTask', () => {
    it('updates existing task and returns updated task', () => {
      const existingTask = createMockAdHocTask({ id: 'task-to-update' });
      (localStorage.getItem as jest.Mock).mockReturnValue(JSON.stringify([existingTask]));

      const updated = updateAdHocTask('task-to-update', { title: 'Updated Title' });

      expect(updated).not.toBeNull();
      expect(updated?.title).toBe('Updated Title');
      expect(updated?.updatedAt).not.toBe(existingTask.updatedAt);
    });

    it('returns null for non-existent task ID', () => {
      (localStorage.getItem as jest.Mock).mockReturnValue(JSON.stringify([mockAdHocTask]));

      const result = updateAdHocTask('non-existent-id', { title: 'Test' });
      expect(result).toBeNull();
    });
  });

  describe('deleteAdHocTask', () => {
    it('removes task and returns true', () => {
      const tasks = [
        createMockAdHocTask({ id: 'task-1' }),
        createMockAdHocTask({ id: 'task-2' }),
      ];
      (localStorage.getItem as jest.Mock).mockReturnValue(JSON.stringify(tasks));

      const result = deleteAdHocTask('task-1');

      expect(result).toBe(true);
      const savedData = JSON.parse((localStorage.setItem as jest.Mock).mock.calls[0][1]);
      expect(savedData).toHaveLength(1);
      expect(savedData[0].id).toBe('task-2');
    });

    it('returns false for non-existent task ID', () => {
      (localStorage.getItem as jest.Mock).mockReturnValue(JSON.stringify([mockAdHocTask]));

      const result = deleteAdHocTask('non-existent-id');
      expect(result).toBe(false);
    });
  });

  describe('getTasksForDate', () => {
    it('filters tasks by date correctly', () => {
      const tasks = [
        createMockAdHocTask({ id: 'task-1', dueDate: '2024-01-15' }),
        createMockAdHocTask({ id: 'task-2', dueDate: '2024-01-16' }),
        createMockAdHocTask({ id: 'task-3', dueDate: '2024-01-15' }),
      ];
      (localStorage.getItem as jest.Mock).mockReturnValue(JSON.stringify(tasks));

      const filtered = getTasksForDate('2024-01-15');

      expect(filtered).toHaveLength(2);
      expect(filtered.map(t => t.id)).toEqual(['task-1', 'task-3']);
    });

    it('returns empty array when no tasks match date', () => {
      const tasks = [createMockAdHocTask({ dueDate: '2024-01-15' })];
      (localStorage.getItem as jest.Mock).mockReturnValue(JSON.stringify(tasks));

      const filtered = getTasksForDate('2024-01-20');
      expect(filtered).toHaveLength(0);
    });
  });
});

describe('Storage - Scheduled Asana Tasks', () => {
  describe('getScheduledAsanaTasks', () => {
    it('returns empty array when no data exists', () => {
      const tasks = getScheduledAsanaTasks();
      expect(tasks).toEqual([]);
    });

    it('migrates legacy entries without ID field', () => {
      const legacyTask = {
        asanaTaskId: 'asana-1',
        integrationId: 'int-1',
        scheduledDate: '2024-01-15',
        scheduledTime: '09:00',
        duration: 60,
      };
      (localStorage.getItem as jest.Mock).mockReturnValue(JSON.stringify([legacyTask]));

      const tasks = getScheduledAsanaTasks();

      expect(tasks[0].id).toBeDefined();
      expect(tasks[0].id).toMatch(/^test-uuid-/);
      expect(localStorage.setItem).toHaveBeenCalled();
    });

    it('does not migrate entries that already have ID', () => {
      (localStorage.getItem as jest.Mock).mockReturnValue(
        JSON.stringify([mockScheduledAsanaTask])
      );

      const tasks = getScheduledAsanaTasks();

      expect(tasks[0].id).toBe('schedule-1');
      // setItem should not be called for migration
    });
  });

  describe('scheduleAsanaTask', () => {
    it('creates entry with unique ID', () => {
      const scheduled = scheduleAsanaTask(
        'asana-123',
        'integration-1',
        '2024-01-15',
        '10:00',
        45
      );

      expect(scheduled.id).toMatch(/^test-uuid-/);
      expect(scheduled.asanaTaskId).toBe('asana-123');
      expect(scheduled.duration).toBe(45);
    });

    it('allows multiple entries for same Asana task', () => {
      (localStorage.getItem as jest.Mock).mockReturnValue(
        JSON.stringify([mockScheduledAsanaTask])
      );

      const newSchedule = scheduleAsanaTask(
        mockScheduledAsanaTask.asanaTaskId,
        mockScheduledAsanaTask.integrationId,
        '2024-01-16',
        '14:00',
        30
      );

      const savedData = JSON.parse((localStorage.setItem as jest.Mock).mock.calls[0][1]);
      expect(savedData).toHaveLength(2);
      expect(savedData[0].asanaTaskId).toBe(savedData[1].asanaTaskId);
      expect(savedData[0].id).not.toBe(savedData[1].id);
    });

    it('includes Google event ID when provided', () => {
      const scheduled = scheduleAsanaTask(
        'asana-123',
        'integration-1',
        '2024-01-15',
        '10:00',
        45,
        'google-event-abc',
        'google-int-1'
      );

      expect(scheduled.googleEventId).toBe('google-event-abc');
      expect(scheduled.googleIntegrationId).toBe('google-int-1');
    });
  });

  describe('updateScheduledAsanaTask', () => {
    it('updates by schedule ID', () => {
      (localStorage.getItem as jest.Mock).mockReturnValue(
        JSON.stringify([mockScheduledAsanaTask])
      );

      const updated = updateScheduledAsanaTask('schedule-1', { duration: 90 });

      expect(updated).not.toBeNull();
      expect(updated?.duration).toBe(90);
    });

    it('returns null for non-existent schedule ID', () => {
      (localStorage.getItem as jest.Mock).mockReturnValue(
        JSON.stringify([mockScheduledAsanaTask])
      );

      const result = updateScheduledAsanaTask('non-existent', { duration: 90 });
      expect(result).toBeNull();
    });
  });

  describe('updateScheduledAsanaTaskByGoogleEvent', () => {
    it('updates by Google event ID', () => {
      (localStorage.getItem as jest.Mock).mockReturnValue(
        JSON.stringify([mockScheduledAsanaTaskWithGoogle])
      );

      const updated = updateScheduledAsanaTaskByGoogleEvent('google-event-1', {
        duration: 120,
        scheduledTime: '11:00',
      });

      expect(updated).not.toBeNull();
      expect(updated?.duration).toBe(120);
      expect(updated?.scheduledTime).toBe('11:00');
    });

    it('returns null when no matching Google event', () => {
      (localStorage.getItem as jest.Mock).mockReturnValue(
        JSON.stringify([mockScheduledAsanaTask])
      );

      const result = updateScheduledAsanaTaskByGoogleEvent('non-existent-google', {
        duration: 60,
      });
      expect(result).toBeNull();
    });
  });

  describe('unscheduleAsanaTask', () => {
    it('removes single entry by schedule ID', () => {
      const tasks = [
        createMockScheduledAsanaTask({ id: 'schedule-1' }),
        createMockScheduledAsanaTask({ id: 'schedule-2', asanaTaskId: 'asana-task-1' }),
      ];
      (localStorage.getItem as jest.Mock).mockReturnValue(JSON.stringify(tasks));

      const result = unscheduleAsanaTask('schedule-1');

      expect(result).toBe(true);
      const savedData = JSON.parse((localStorage.setItem as jest.Mock).mock.calls[0][1]);
      expect(savedData).toHaveLength(1);
      expect(savedData[0].id).toBe('schedule-2');
    });

    it('returns false for non-existent schedule ID', () => {
      (localStorage.getItem as jest.Mock).mockReturnValue(
        JSON.stringify([mockScheduledAsanaTask])
      );

      const result = unscheduleAsanaTask('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('unscheduleAllAsanaTaskInstances', () => {
    it('removes all entries for an Asana task', () => {
      const tasks = [
        createMockScheduledAsanaTask({ id: 'schedule-1', asanaTaskId: 'asana-1' }),
        createMockScheduledAsanaTask({ id: 'schedule-2', asanaTaskId: 'asana-1' }),
        createMockScheduledAsanaTask({ id: 'schedule-3', asanaTaskId: 'asana-2' }),
      ];
      (localStorage.getItem as jest.Mock).mockReturnValue(JSON.stringify(tasks));

      const result = unscheduleAllAsanaTaskInstances('asana-1');

      expect(result).toBe(true);
      const savedData = JSON.parse((localStorage.setItem as jest.Mock).mock.calls[0][1]);
      expect(savedData).toHaveLength(1);
      expect(savedData[0].asanaTaskId).toBe('asana-2');
    });

    it('returns false when no instances exist', () => {
      (localStorage.getItem as jest.Mock).mockReturnValue(
        JSON.stringify([mockScheduledAsanaTask])
      );

      const result = unscheduleAllAsanaTaskInstances('non-existent-asana');
      expect(result).toBe(false);
    });
  });

  describe('getScheduledAsanaTasksForDate', () => {
    it('filters by date correctly', () => {
      const tasks = [
        createMockScheduledAsanaTask({ id: 's1', scheduledDate: '2024-01-15' }),
        createMockScheduledAsanaTask({ id: 's2', scheduledDate: '2024-01-16' }),
        createMockScheduledAsanaTask({ id: 's3', scheduledDate: '2024-01-15' }),
      ];
      (localStorage.getItem as jest.Mock).mockReturnValue(JSON.stringify(tasks));

      const filtered = getScheduledAsanaTasksForDate('2024-01-15');

      expect(filtered).toHaveLength(2);
      expect(filtered.map(t => t.id)).toEqual(['s1', 's3']);
    });
  });
});

describe('Storage - Task Templates', () => {
  describe('getTaskTemplates', () => {
    it('returns empty array when no data exists', () => {
      const templates = getTaskTemplates();
      expect(templates).toEqual([]);
    });

    it('parses and returns stored templates', () => {
      (localStorage.getItem as jest.Mock).mockReturnValue(
        JSON.stringify([mockTaskTemplate])
      );

      const templates = getTaskTemplates();
      expect(templates).toEqual([mockTaskTemplate]);
    });
  });

  describe('addTaskTemplate', () => {
    it('creates template with UUID and timestamp', () => {
      const template = addTaskTemplate({
        title: 'New Template',
        duration: 30,
        taskType: 'focus',
        priority: 'high',
      });

      expect(template.id).toMatch(/^test-uuid-/);
      expect(template.createdAt).toBeDefined();
      expect(template.title).toBe('New Template');
    });
  });

  describe('updateTaskTemplate', () => {
    it('updates existing template', () => {
      (localStorage.getItem as jest.Mock).mockReturnValue(
        JSON.stringify([mockTaskTemplate])
      );

      const updated = updateTaskTemplate('template-1', { title: 'Updated' });

      expect(updated?.title).toBe('Updated');
    });

    it('returns null for non-existent template', () => {
      (localStorage.getItem as jest.Mock).mockReturnValue(JSON.stringify([]));

      const result = updateTaskTemplate('non-existent', { title: 'Test' });
      expect(result).toBeNull();
    });
  });

  describe('deleteTaskTemplate', () => {
    it('removes template and returns true', () => {
      (localStorage.getItem as jest.Mock).mockReturnValue(
        JSON.stringify([mockTaskTemplate])
      );

      const result = deleteTaskTemplate('template-1');

      expect(result).toBe(true);
      const savedData = JSON.parse((localStorage.setItem as jest.Mock).mock.calls[0][1]);
      expect(savedData).toHaveLength(0);
    });

    it('returns false for non-existent template', () => {
      (localStorage.getItem as jest.Mock).mockReturnValue(JSON.stringify([]));

      const result = deleteTaskTemplate('non-existent');
      expect(result).toBe(false);
    });
  });
});

describe('Storage - Custom Task Types', () => {
  describe('getCustomTaskTypes', () => {
    it('returns empty array when no data exists', () => {
      const types = getCustomTaskTypes();
      expect(types).toEqual([]);
    });

    it('parses and returns stored types', () => {
      (localStorage.getItem as jest.Mock).mockReturnValue(
        JSON.stringify([mockCustomTaskType])
      );

      const types = getCustomTaskTypes();
      expect(types).toEqual([mockCustomTaskType]);
    });
  });

  describe('addCustomTaskType', () => {
    it('creates type with UUID and timestamp', () => {
      const customType = addCustomTaskType({
        label: 'Custom Type',
        emoji: '🎯',
      });

      expect(customType.id).toMatch(/^test-uuid-/);
      expect(customType.createdAt).toBeDefined();
      expect(customType.label).toBe('Custom Type');
      expect(customType.emoji).toBe('🎯');
    });
  });

  describe('deleteCustomTaskType', () => {
    it('removes type and returns true', () => {
      (localStorage.getItem as jest.Mock).mockReturnValue(
        JSON.stringify([mockCustomTaskType])
      );

      const result = deleteCustomTaskType('custom-type-1');

      expect(result).toBe(true);
    });

    it('returns false for non-existent type', () => {
      (localStorage.getItem as jest.Mock).mockReturnValue(JSON.stringify([]));

      const result = deleteCustomTaskType('non-existent');
      expect(result).toBe(false);
    });
  });
});
