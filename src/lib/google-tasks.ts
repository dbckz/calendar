// Google Tasks integration service

import { google } from 'googleapis';
import { GoogleCalendarCredentials, GoogleIntegration } from '@/types';
import { createOAuth2Client, ensureValidCredentials } from './google-calendar';
import { getEnabledGoogleIntegrations } from './integration-storage';

const TASK_LIST_NAME = 'Reminders';
const ARCHIVE_LIST_NAME = 'Reminders (Archived)';
const GOOGLE_TASKS_INTEGRATION_NAME = 'Personal';

/** Resolve the Google Tasks integration and ensure valid credentials. Throws if not found. */
export async function getGoogleTasksIntegration(): Promise<{
  integration: GoogleIntegration;
  credentials: GoogleCalendarCredentials;
}> {
  const integrations = await getEnabledGoogleIntegrations();
  const integration = integrations.find(i => i.name === GOOGLE_TASKS_INTEGRATION_NAME);
  if (!integration) {
    throw new Error(`Google integration "${GOOGLE_TASKS_INTEGRATION_NAME}" not found`);
  }
  const credentials = await ensureValidCredentials(integration);
  return { integration, credentials };
}

function getTasksClient(credentials: GoogleCalendarCredentials, clientId: string, clientSecret: string) {
  const oauth2Client = createOAuth2Client(clientId, clientSecret);
  oauth2Client.setCredentials({
    access_token: credentials.accessToken,
    refresh_token: credentials.refreshToken,
  });
  return google.tasks({ version: 'v1', auth: oauth2Client });
}

/** Find or create a task list by name, returns its ID. */
async function getOrCreateListId(
  client: ReturnType<typeof getTasksClient>,
  name: string,
): Promise<string> {
  const lists = await client.tasklists.list({ maxResults: 100 });
  const existing = (lists.data.items || []).find(l => l.title === name);
  if (existing) return existing.id!;

  const created = await client.tasklists.insert({ requestBody: { title: name } });
  return created.data.id!;
}

export interface GoogleTask {
  id: string;
  title: string;
  status: 'needsAction' | 'completed';
  updated: string;
}

function toGoogleTask(item: { id?: string | null; title?: string | null; status?: string | null; updated?: string | null }): GoogleTask {
  return {
    id: item.id!,
    title: item.title || '',
    status: item.status as 'needsAction' | 'completed',
    updated: item.updated || '',
  };
}

export async function getTasks(
  credentials: GoogleCalendarCredentials,
  clientId: string,
  clientSecret: string,
): Promise<GoogleTask[]> {
  const client = getTasksClient(credentials, clientId, clientSecret);
  const listId = await getOrCreateListId(client, TASK_LIST_NAME);
  const response = await client.tasks.list({
    tasklist: listId,
    showCompleted: true,
    showHidden: true,
    maxResults: 100,
  });

  return (response.data.items || []).map(toGoogleTask);
}

export async function addTask(
  credentials: GoogleCalendarCredentials,
  clientId: string,
  clientSecret: string,
  title: string,
): Promise<GoogleTask> {
  const client = getTasksClient(credentials, clientId, clientSecret);
  const listId = await getOrCreateListId(client, TASK_LIST_NAME);
  const response = await client.tasks.insert({
    tasklist: listId,
    requestBody: { title },
  });

  return toGoogleTask(response.data);
}

export async function updateTask(
  credentials: GoogleCalendarCredentials,
  clientId: string,
  clientSecret: string,
  taskId: string,
  updates: { title?: string; status?: 'needsAction' | 'completed' },
): Promise<GoogleTask> {
  const client = getTasksClient(credentials, clientId, clientSecret);
  const listId = await getOrCreateListId(client, TASK_LIST_NAME);

  const existing = await client.tasks.get({ tasklist: listId, task: taskId });

  const response = await client.tasks.update({
    tasklist: listId,
    task: taskId,
    requestBody: {
      ...existing.data,
      title: updates.title ?? existing.data.title,
      status: updates.status ?? existing.data.status,
      completed: updates.status === 'needsAction' ? null : existing.data.completed,
    },
  });

  return toGoogleTask(response.data);
}

export async function deleteTask(
  credentials: GoogleCalendarCredentials,
  clientId: string,
  clientSecret: string,
  taskId: string,
): Promise<void> {
  const client = getTasksClient(credentials, clientId, clientSecret);
  const listId = await getOrCreateListId(client, TASK_LIST_NAME);
  await client.tasks.delete({ tasklist: listId, task: taskId });
}

/** Move all completed tasks from Reminders to the archive list, then delete them from Reminders. */
export async function archiveCompletedTasks(
  credentials: GoogleCalendarCredentials,
  clientId: string,
  clientSecret: string,
): Promise<number> {
  const client = getTasksClient(credentials, clientId, clientSecret);
  const listId = await getOrCreateListId(client, TASK_LIST_NAME);
  const archiveId = await getOrCreateListId(client, ARCHIVE_LIST_NAME);

  const response = await client.tasks.list({
    tasklist: listId,
    showCompleted: true,
    showHidden: true,
    maxResults: 100,
  });

  const completed = (response.data.items || []).filter(t => t.status === 'completed');

  for (const task of completed) {
    await client.tasks.insert({
      tasklist: archiveId,
      requestBody: { title: task.title, status: 'completed', notes: task.notes },
    });
    await client.tasks.delete({ tasklist: listId, task: task.id! });
  }

  return completed.length;
}
