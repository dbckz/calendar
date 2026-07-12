// Server-side storage for workflow configuration
// Stores task quotas and scheduling preferences used by the workflow planner

import { promises as fs } from 'fs';
import path from 'path';

import { DATA_DIR, WORKFLOW_CONFIG_FILE } from './data-paths';

// Types for workflow config data
export interface TaskQuota {
  weeklyCount?: number;
  targetLength: string;
  preferredTimes: string[];
}

export interface SchedulingConfig {
  maxTasksPerDay: number;
  bufferBetweenTasks: string;
  workingDays: string[];
  workingHours: {
    start: string;
    end: string;
  };
}

export interface WorkflowConfig {
  taskQuotas: Record<string, TaskQuota>;
  scheduling: SchedulingConfig;
  // Maps each quota category to the task types that count toward it.
  // Values are matched (case-insensitively) against an Asana task's "Type"
  // custom field value and against an ad-hoc task's taskType. A block also
  // matches a category when its type equals the category name directly.
  typeMapping: Record<string, string[]>;
  lastUpdated: string;
}

const DEFAULT_CONFIG: WorkflowConfig = {
  taskQuotas: {
    'Writing/Deep Work': {
      weeklyCount: 3,
      targetLength: '2h',
      preferredTimes: ['09:00-11:00', '21:00-23:00'],
    },
    Blogs: {
      weeklyCount: 2,
      targetLength: '1.5h',
      preferredTimes: ['09:00-12:00'],
    },
    Batch: {
      weeklyCount: 2,
      targetLength: '1h',
      preferredTimes: [],
    },
    'Engagement/Outreach': {
      weeklyCount: 1,
      targetLength: '45min',
      preferredTimes: [],
    },
    'General Todos': {
      // This fills remaining time - minimal configuration needed
      targetLength: '30min',
      preferredTimes: [],
    },
  },
  scheduling: {
    maxTasksPerDay: 4,
    bufferBetweenTasks: '30min',
    workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    workingHours: {
      start: '09:00',
      end: '17:00',
    },
  },
  // By default, each category matches an Asana Type / ad-hoc taskType with the
  // same name (handled by the direct category-name match in capacity logic),
  // plus the one built-in task type whose id matches a category name.
  typeMapping: {
    'Writing/Deep Work': [],
    Blogs: [],
    Batch: ['batch'],
    'Engagement/Outreach': [],
    'General Todos': [],
  },
  lastUpdated: new Date().toISOString(),
};

async function ensureDataDir(): Promise<void> {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// One-time migration: the config previously lived at the repo root.
// If the data-dir copy doesn't exist yet but the legacy file does, copy it over.
async function migrateLegacyConfig(): Promise<void> {
  if (await fileExists(WORKFLOW_CONFIG_FILE)) {
    return;
  }

  const legacyPath = path.join(process.cwd(), 'workflow-config.json');
  if (!(await fileExists(legacyPath))) {
    return;
  }

  try {
    await fs.copyFile(legacyPath, WORKFLOW_CONFIG_FILE);
  } catch (error) {
    console.error('Error migrating workflow config to data dir:', error);
  }
}

export async function getWorkflowConfig(): Promise<WorkflowConfig> {
  try {
    await ensureDataDir();
    await migrateLegacyConfig();

    if (!(await fileExists(WORKFLOW_CONFIG_FILE))) {
      // Create default config if it doesn't exist
      await saveWorkflowConfig(DEFAULT_CONFIG);
      return { ...DEFAULT_CONFIG };
    }

    const data = await fs.readFile(WORKFLOW_CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(data) as Partial<WorkflowConfig>;

    // Backward compat: older config files predate typeMapping. Default it to
    // an entry per existing quota category (empty array => category-name match).
    let typeMapping = parsed.typeMapping;
    if (!typeMapping) {
      typeMapping = {};
      for (const category of Object.keys(parsed.taskQuotas || {})) {
        typeMapping[category] = DEFAULT_CONFIG.typeMapping[category] || [];
      }
    }

    return {
      taskQuotas: parsed.taskQuotas || DEFAULT_CONFIG.taskQuotas,
      scheduling: parsed.scheduling || DEFAULT_CONFIG.scheduling,
      typeMapping,
      lastUpdated: parsed.lastUpdated || new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error reading workflow config:', error);
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveWorkflowConfig(
  config: Omit<WorkflowConfig, 'lastUpdated'> & { lastUpdated?: string }
): Promise<WorkflowConfig> {
  await ensureDataDir();

  const configToWrite: WorkflowConfig = {
    ...config,
    typeMapping: config.typeMapping ?? {},
    lastUpdated: new Date().toISOString(),
  };

  await fs.writeFile(WORKFLOW_CONFIG_FILE, JSON.stringify(configToWrite, null, 2), 'utf-8');
  return configToWrite;
}
