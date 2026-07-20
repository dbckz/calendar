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
  // When true, "Plan my week" auto-picks tasks for this category instead of
  // prompting for manual selection. Defaults on for Batch.
  autoSelect?: boolean;
  // When true, this category is scheduled as "grouped blocks": weeklyCount
  // reserved blocks are placed, and the user's selected tasks (any number — the
  // selection cap is lifted) are distributed across those blocks round-robin and
  // listed inside each block's event as an agenda, rather than one task per block.
  grouped?: boolean;
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

// Budget policy for the delegation pacer (drains the queue at a sustainable
// rate so a big queue never torches usage limits). Rate is tiered by time of
// day: a modest cap during `activeHours` (when you're using Claude yourself)
// and a higher cap outside it (while you sleep), biasing work toward the night.
export interface AgentPacingConfig {
  // Hourly cap during activeHours (when you're likely using Claude yourself).
  maxRunsPerHour: number;
  // Hourly cap outside activeHours (overnight). Defaults to maxRunsPerHour when
  // omitted (i.e. no day/night difference).
  sleepMaxRunsPerHour?: number;
  // Overall daily backstop across both tiers.
  maxRunsPerDay: number;
  // Your active window, "HH:MM"-"HH:MM"; may wrap past midnight
  // (e.g. 07:00-01:00). Outside this window the sleep rate applies.
  activeHours?: { start: string; end: string };
}

export interface WorkflowConfig {
  taskQuotas: Record<string, TaskQuota>;
  scheduling: SchedulingConfig;
  // Always populated by get/saveWorkflowConfig; optional in the type so older
  // fixtures/config files without it still satisfy WorkflowConfig.
  agentPacing?: AgentPacingConfig;
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
      preferredTimes: ['08:30-11:00'],
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
      autoSelect: true,
    },
    'Engagement/Outreach': {
      weeklyCount: 3,
      targetLength: '1h',
      grouped: true,
      preferredTimes: ['13:00-17:00'],
      autoSelect: false,
    },
    'General Todos': {
      // This fills remaining time - minimal configuration needed
      targetLength: '30min',
      preferredTimes: [],
    },
  },
  scheduling: {
    maxTasksPerDay: 4,
    bufferBetweenTasks: '0',
    workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    workingHours: {
      start: '09:00',
      end: '17:00',
    },
  },
  agentPacing: {
    maxRunsPerHour: 2,        // daytime (active hours) — light, you're using Claude
    sleepMaxRunsPerHour: 6,   // overnight — drain harder while you sleep
    maxRunsPerDay: 40,        // overall backstop across both tiers
    activeHours: { start: '07:00', end: '01:00' },
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

    // Backward compat: older config files predate autoSelect. Default it to
    // true only for Batch (which historically auto-picked its tasks).
    const taskQuotas = parsed.taskQuotas || DEFAULT_CONFIG.taskQuotas;
    for (const [category, quota] of Object.entries(taskQuotas)) {
      if (quota.autoSelect === undefined) quota.autoSelect = category === 'Batch';
    }

    return {
      taskQuotas,
      scheduling: parsed.scheduling || DEFAULT_CONFIG.scheduling,
      agentPacing: parsed.agentPacing || DEFAULT_CONFIG.agentPacing,
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
    agentPacing: config.agentPacing ?? DEFAULT_CONFIG.agentPacing,
    lastUpdated: new Date().toISOString(),
  };

  await fs.writeFile(WORKFLOW_CONFIG_FILE, JSON.stringify(configToWrite, null, 2), 'utf-8');
  return configToWrite;
}
