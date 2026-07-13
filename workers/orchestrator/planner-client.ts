import type { AgentPacing, AsanaStory, AsanaTag, DelegationQueueEntry, DelegationRunResult, DelegationState, PlannerTask } from './types';

function checkResponse(response: Response, body: string, label: string): void {
  if (!response.ok) {
    throw new Error(`Failed to ${label}: ${response.status} ${body}`);
  }
}

export async function fetchAsanaTasks(baseUrl: string): Promise<PlannerTask[]> {
  const response = await fetch(`${baseUrl}/api/asana-tasks/all`);
  const body = await response.text();
  checkResponse(response, body, 'fetch Asana tasks');
  return JSON.parse(body);
}

export async function fetchTaskById(baseUrl: string, taskId: string): Promise<PlannerTask | null> {
  const tasks = await fetchAsanaTasks(baseUrl);
  return tasks.find(task => task.id === taskId) || null;
}

// --- Delegation queue (app-owned) ---

export async function claimNextEntry(baseUrl: string): Promise<DelegationQueueEntry | null> {
  const response = await fetch(`${baseUrl}/api/orchestrator/claim`, { method: 'POST' });
  const body = await response.text();
  checkResponse(response, body, 'claim next delegation entry');
  return JSON.parse(body).entry ?? null;
}

export async function fetchQueueEntry(baseUrl: string, taskGid: string): Promise<DelegationQueueEntry | null> {
  const response = await fetch(`${baseUrl}/api/orchestrator/queue`);
  const body = await response.text();
  checkResponse(response, body, 'fetch delegation queue');
  const entries: Record<string, DelegationQueueEntry> = JSON.parse(body).entries ?? {};
  return entries[taskGid] ?? null;
}

export async function markEntryRunning(baseUrl: string, entry: DelegationQueueEntry): Promise<void> {
  const response = await fetch(`${baseUrl}/api/orchestrator/queue`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ asanaTaskGid: entry.asanaTaskGid, integrationId: entry.integrationId, state: 'running' }),
  });
  const body = await response.text();
  checkResponse(response, body, 'mark delegation entry running');
}

export async function reportResult(
  baseUrl: string,
  taskGid: string,
  integrationId: string,
  state: DelegationState,
  result?: DelegationRunResult,
): Promise<void> {
  const response = await fetch(`${baseUrl}/api/orchestrator/result`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ asanaTaskGid: taskGid, integrationId, state, result }),
  });
  const body = await response.text();
  checkResponse(response, body, 'report delegation result');
}

export async function fetchAgentPacing(baseUrl: string): Promise<AgentPacing | null> {
  const response = await fetch(`${baseUrl}/api/workflow-config`);
  const body = await response.text();
  checkResponse(response, body, 'fetch workflow config');
  return JSON.parse(body)?.config?.agentPacing ?? null;
}

export async function fetchAsanaTags(baseUrl: string, integrationId: string): Promise<AsanaTag[]> {
  const response = await fetch(`${baseUrl}/api/asana-tags?integrationId=${encodeURIComponent(integrationId)}`);
  const body = await response.text();
  checkResponse(response, body, 'fetch Asana tags');
  return JSON.parse(body);
}

export async function createAsanaTag(baseUrl: string, integrationId: string, name: string, color: string): Promise<AsanaTag> {
  const response = await fetch(`${baseUrl}/api/asana-tags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ integrationId, name, color }),
  });
  const body = await response.text();
  checkResponse(response, body, 'create Asana tag');
  return JSON.parse(body);
}

export async function fetchTaskStories(baseUrl: string, taskId: string, integrationId: string): Promise<AsanaStory[]> {
  const response = await fetch(`${baseUrl}/api/asana-tasks/${taskId}?integrationId=${encodeURIComponent(integrationId)}`);
  const body = await response.text();
  checkResponse(response, body, 'fetch task stories');
  return JSON.parse(body).stories || [];
}

export async function addTaskComment(
  baseUrl: string,
  taskId: string,
  integrationId: string,
  comment: string,
  htmlText: string,
): Promise<unknown> {
  const response = await fetch(`${baseUrl}/api/asana-tasks/${taskId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ integrationId, comment, htmlText }),
  });
  const body = await response.text();
  checkResponse(response, body, 'add task comment');
  return body ? JSON.parse(body) : { success: true };
}

interface UpdateTagsInput {
  addTags?: string[];
  removeTags?: string[];
}

export async function updateTaskTags(
  baseUrl: string,
  taskId: string,
  integrationId: string,
  { addTags = [], removeTags = [] }: UpdateTagsInput,
): Promise<unknown> {
  const response = await fetch(`${baseUrl}/api/asana-tasks/${taskId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ integrationId, addTags, removeTags }),
  });
  const body = await response.text();
  checkResponse(response, body, 'update task tags');
  return body ? JSON.parse(body) : { success: true };
}
