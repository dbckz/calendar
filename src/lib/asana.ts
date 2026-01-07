// Asana integration service

import { AsanaTask, AsanaCredentials, CalendarEvent } from '@/types';

const ASANA_API_BASE = 'https://app.asana.com/api/1.0';
const ASANA_AUTH_BASE = 'https://app.asana.com/-/oauth_authorize';
const ASANA_TOKEN_URL = 'https://app.asana.com/-/oauth_token';

interface AsanaApiResponse<T> {
  data: T;
}

export interface AsanaWorkspace {
  gid: string;
  name: string;
}

// OAuth functions
export function getAsanaAuthUrl(clientId: string, redirectUri: string, state?: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid profile email workspaces:read users:read tasks:read tasks:write projects:read custom_fields:read',
  });
  if (state) {
    params.set('state', state);
  }
  return `${ASANA_AUTH_BASE}?${params.toString()}`;
}


export async function getAsanaTokensFromCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<AsanaCredentials> {
  const response = await fetch(ASANA_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get tokens: ${error}`);
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

export async function refreshAsanaToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<AsanaCredentials> {
  const response = await fetch(ASANA_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh token: ${error}`);
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

// API functions
export async function getWorkspaces(accessToken: string): Promise<AsanaWorkspace[]> {
  const response = await fetch(`${ASANA_API_BASE}/workspaces`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('Asana workspaces error:', response.status, errorBody);
    throw new Error(`Failed to fetch workspaces: ${response.status} - ${errorBody.substring(0, 200)}`);
  }

  const data: AsanaApiResponse<AsanaWorkspace[]> = await response.json();
  return data.data;
}

export async function getMyTasks(
  accessToken: string,
  workspaceId: string
): Promise<AsanaTask[]> {
  // First get the user's gid
  const meResponse = await fetch(`${ASANA_API_BASE}/users/me`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!meResponse.ok) {
    const errorBody = await meResponse.text();
    console.error('Asana /users/me error:', meResponse.status, errorBody);
    throw new Error(`Failed to fetch user info: ${meResponse.status} - ${errorBody.substring(0, 200)}`);
  }

  const meData: AsanaApiResponse<{ gid: string }> = await meResponse.json();
  const userGid = meData.data.gid;

  // Get user task list
  const taskListResponse = await fetch(
    `${ASANA_API_BASE}/users/${userGid}/user_task_list?workspace=${workspaceId}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  );

  if (!taskListResponse.ok) {
    const errorBody = await taskListResponse.text();
    console.error('Asana user_task_list error:', taskListResponse.status, errorBody);
    throw new Error(`Failed to fetch task list: ${taskListResponse.status} - ${errorBody.substring(0, 200)}`);
  }

  const taskListData: AsanaApiResponse<{ gid: string }> = await taskListResponse.json();

  // Get tasks from the task list
  const tasksResponse = await fetch(
    `${ASANA_API_BASE}/user_task_lists/${taskListData.data.gid}/tasks?opt_fields=name,notes,due_on,due_at,completed,assignee.name`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  );

  if (!tasksResponse.ok) {
    const errorBody = await tasksResponse.text();
    console.error('Asana tasks error:', tasksResponse.status, errorBody);
    throw new Error(`Failed to fetch tasks: ${tasksResponse.status} - ${errorBody.substring(0, 200)}`);
  }

  const tasksData = await tasksResponse.json();
  // Map snake_case API response to camelCase
  return tasksData.data.map((task: Record<string, unknown>) => ({
    id: task.gid as string,
    gid: task.gid as string,
    name: task.name as string,
    notes: task.notes as string | undefined,
    dueOn: task.due_on as string | undefined,
    dueAt: task.due_at as string | undefined,
    completed: task.completed as boolean,
    assignee: task.assignee as { gid: string; name: string } | undefined,
  }));
}

export async function getTaskByName(
  accessToken: string,
  workspaceId: string,
  taskName: string
): Promise<Record<string, unknown> | null> {
  const allTasks = await getMyTasks(accessToken, workspaceId);
  const task = allTasks.find(t => t.name.toLowerCase().includes(taskName.toLowerCase()));

  if (!task) return null;

  // Fetch full task details with all available fields
  const response = await fetch(
    `${ASANA_API_BASE}/tasks/${task.gid}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  return data.data;
}

export async function getIncompleteTasks(
  accessToken: string,
  workspaceId: string
): Promise<AsanaTask[]> {
  const allTasks = await getMyTasks(accessToken, workspaceId);
  return allTasks
    .filter(task => !task.completed)
    .sort((a, b) => {
      // Tasks with no due date go to the end
      if (!a.dueOn && !b.dueOn) return 0;
      if (!a.dueOn) return 1;
      if (!b.dueOn) return -1;
      return a.dueOn.localeCompare(b.dueOn);
    });
}

export async function getTasksForDate(
  accessToken: string,
  workspaceId: string,
  date: string
): Promise<AsanaTask[]> {
  const allTasks = await getMyTasks(accessToken, workspaceId);

  // Filter tasks by due date
  return allTasks.filter(task => {
    if (task.dueOn === date) return true;
    if (task.dueAt) {
      const dueDate = new Date(task.dueAt).toISOString().split('T')[0];
      return dueDate === date;
    }
    return false;
  });
}

export function asanaTaskToCalendarEvent(task: AsanaTask): CalendarEvent {
  let startTime: Date;
  let endTime: Date;

  if (task.dueAt) {
    startTime = new Date(task.dueAt);
    endTime = new Date(startTime.getTime() + 30 * 60 * 1000); // 30 min duration
  } else if (task.dueOn) {
    startTime = new Date(task.dueOn);
    startTime.setHours(9, 0, 0, 0); // Default to 9 AM
    endTime = new Date(startTime.getTime() + 30 * 60 * 1000);
  } else {
    startTime = new Date();
    startTime.setHours(9, 0, 0, 0);
    endTime = new Date(startTime.getTime() + 30 * 60 * 1000);
  }

  return {
    id: task.gid,
    title: task.name,
    description: task.notes,
    startTime,
    endTime,
    source: 'asana',
    color: '#f06a6a',
    completed: task.completed,
    assignee: task.assignee?.name,
    dueOn: task.dueOn,
  };
}

export async function completeTask(
  accessToken: string,
  taskGid: string,
  completed: boolean
): Promise<void> {
  const response = await fetch(`${ASANA_API_BASE}/tasks/${taskGid}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      data: { completed },
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to update task: ${response.statusText}`);
  }
}

export async function addTaskComment(
  accessToken: string,
  taskGid: string,
  text: string
): Promise<void> {
  const response = await fetch(`${ASANA_API_BASE}/tasks/${taskGid}/stories`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      data: { text },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to add comment: ${response.status} - ${errorBody}`);
  }
}

export function getAsanaTaskUrl(taskGid: string): string {
  return `https://app.asana.com/0/0/${taskGid}`;
}

export interface AsanaProject {
  gid: string;
  name: string;
}

export async function getProjects(
  accessToken: string,
  workspaceId: string
): Promise<AsanaProject[]> {
  const response = await fetch(
    `${ASANA_API_BASE}/projects?workspace=${workspaceId}&opt_fields=name`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('Asana projects error:', response.status, errorBody);
    throw new Error(`Failed to fetch projects: ${response.status}`);
  }

  const data: AsanaApiResponse<AsanaProject[]> = await response.json();
  return data.data;
}
