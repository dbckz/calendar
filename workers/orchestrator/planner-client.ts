import type { AsanaStory, AsanaTag, PlannerTask } from './types';

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
