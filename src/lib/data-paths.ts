// Shared data directory paths for persistent storage
// Uses ~/.claude/data/calendar/ to survive builds and deployments

import { homedir } from 'os';
import path from 'path';

// Primary data directory - outside project to persist across builds
export const DATA_DIR = path.join(homedir(), '.claude', 'data', 'calendar');

// Individual data files
export const USER_DATA_FILE = path.join(DATA_DIR, 'user-data.json');
export const INTEGRATIONS_FILE = path.join(DATA_DIR, 'integrations.json');
export const TIME_TRACKING_FILE = path.join(DATA_DIR, 'time-tracking.json');
export const WORKFLOW_CONFIG_FILE = path.join(DATA_DIR, 'workflow-config.json');

// Orchestrator worker status file (workers/orchestrator writes this; the app
// reads it via /api/orchestrator/status). The worker duplicates this path
// locally in workers/orchestrator/config.ts to avoid importing app code.
export const ORCHESTRATOR_STATUS_FILE = path.join(DATA_DIR, 'orchestrator-status.json');
