import { homedir } from 'node:os';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// The launchd wrapper and the `orchestrator:run` npm script both invoke this
// worker with the calendar repo root as the working directory, so cwd is the
// repo root. Using cwd (rather than import.meta.url) keeps config.ts loadable
// under both tsx (ESM) at runtime and ts-jest (CJS) in tests.
const repoRoot = process.env.CALENDAR_APP_DIR || process.cwd();

// Mirror src/lib/data-paths.ts. The worker deliberately does NOT import app
// code (avoids pulling in server modules that touch integrations.json).
const DATA_DIR = path.join(homedir(), '.claude', 'data', 'calendar');

// Tool allowlist for the headless `claude -p` agent runner. The user has
// deliberately chosen an explicit allowlist WITHOUT Bash (and without
// --dangerously-skip-permissions): tasks that need shell access fail cleanly
// rather than run unsandboxed. Override via CLAUDE_ALLOWED_TOOLS if needed.
const DEFAULT_ALLOWED_TOOLS = [
  'Skill',
  'Read',
  'Write',
  'WebSearch',
  'WebFetch',
  'mcp__claude_ai_Google_Calendar',
  'mcp__claude_ai_Gmail',
  'mcp__claude_ai_Asana',
  'mcp__claude_ai_Slack',
  'mcp__claude_ai_HubSpot',
  'mcp__claude_ai_Google_Drive',
].join(',');

function resolvePlannerBaseUrl(): string {
  if (process.env.PLANNER_BASE_URL) {
    return process.env.PLANNER_BASE_URL;
  }
  // The production service writes its chosen port here (see scripts/start-production.sh).
  const portFile = path.join(repoRoot, '.data', 'current-port');
  try {
    const port = readFileSync(portFile, 'utf8').trim();
    if (port) {
      return `http://localhost:${port}`;
    }
  } catch {
    // fall through to default
  }
  return 'http://localhost:3001';
}

export const config = {
  repoRoot,
  dataDir: DATA_DIR,
  plannerBaseUrl: resolvePlannerBaseUrl(),
  runLogPath: path.join(DATA_DIR, 'orchestrator-last-run.json'),
  statusPath: path.join(DATA_DIR, 'orchestrator-status.json'),
  targetIntegrationName: process.env.ASANA_INTEGRATION_NAME || 'DBC',
  readyTagName: process.env.ASANA_READY_TAG || 'agent_ready',
  inProgressTagName: process.env.ASANA_IN_PROGRESS_TAG || 'agent_in_progress',
  completeTagName: process.env.ASANA_COMPLETE_TAG || 'agent_complete',
  failedTagName: process.env.ASANA_FAILED_TAG || 'agent_failed',
  // Headless Claude Code agent runner (see claude-runner.ts).
  claudeBin: process.env.CLAUDE_BIN || path.join(homedir(), '.local', 'bin', 'claude'),
  claudeTimeoutSeconds: Number(process.env.CLAUDE_TIMEOUT_SECONDS || 900),
  claudeAllowedTools: process.env.CLAUDE_ALLOWED_TOOLS || DEFAULT_ALLOWED_TOOLS,
  // Scratch workspace so the agent's Write output lands here, not in the repo.
  agentWorkspace: path.join(DATA_DIR, 'agent-workspace'),
};

export type OrchestratorConfig = typeof config;
