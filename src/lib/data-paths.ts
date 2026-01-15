// Shared data directory paths for persistent storage
// Uses ~/.claude/data/calendar/ to survive builds and deployments

import { homedir } from 'os';
import path from 'path';

// Primary data directory - outside project to persist across builds
export const DATA_DIR = path.join(homedir(), '.claude', 'data', 'calendar');

// Individual data files
export const USER_DATA_FILE = path.join(DATA_DIR, 'user-data.json');
export const INTEGRATIONS_FILE = path.join(DATA_DIR, 'integrations.json');
