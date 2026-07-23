// Asana integration service

import { AsanaTask, AsanaCredentials, CalendarEvent, AsanaTag } from '@/types';

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

// Shared opt_fields used when fetching/creating/updating tasks. `parent.name` is
// only requested in list contexts (see TASK_OPT_FIELDS_WITH_PARENT).
const TASK_OPT_FIELDS_BASE = [
  'name',
  'notes',
  'due_on',
  'due_at',
  'start_on',
  'completed',
  'created_at',
  'assignee.name',
  'projects.name',
  'custom_fields.name',
  'custom_fields.display_value',
  'custom_fields.type',
  'custom_fields.enum_value',
  'custom_fields.enum_value.name',
  'custom_fields.enum_options.name',
  'custom_fields.enum_options.gid',
  'tags.name',
  'tags.color',
];

const TASK_OPT_FIELDS = TASK_OPT_FIELDS_BASE.join(',');
const TASK_OPT_FIELDS_WITH_PARENT = [...TASK_OPT_FIELDS_BASE, 'parent.name'].join(',');

type AsanaTagApi = { gid: string; name: string; color?: string | null };

function mapTag(tag: AsanaTagApi): AsanaTag {
  return { gid: tag.gid, name: tag.name, color: tag.color ?? null };
}

// OAuth functions
export function getAsanaAuthUrl(clientId: string, redirectUri: string, state?: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid profile email workspaces:read users:read tasks:read tasks:write tasks:delete projects:read custom_fields:read stories:read stories:write tags:read tags:write',
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
  workspaceId: string,
  // When set (ISO 8601), also return tasks completed since this time. Asana
  // otherwise defaults to `completed_since=now`, i.e. incomplete tasks only.
  // Callers that need completed tasks (e.g. the capacity type map, so finished
  // work still counts) pass the start of the window they care about.
  completedSince?: string
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

  const completedSinceParam = completedSince
    ? `&completed_since=${encodeURIComponent(completedSince)}`
    : '';
  const tasksResponse = await fetch(
    `${ASANA_API_BASE}/user_task_lists/${taskListData.data.gid}/tasks?opt_fields=${TASK_OPT_FIELDS_WITH_PARENT}${completedSinceParam}`,
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
  return tasksData.data.map(mapAsanaTaskResponse);
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
    startOn: task.startOn,
    createdAt: task.createdAt,
    projects: task.projects,
    customFields: task.customFields,
    tags: task.tags,
    parentTask: task.parent,
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

export async function deleteTask(
  accessToken: string,
  taskGid: string
): Promise<void> {
  const response = await fetch(`${ASANA_API_BASE}/tasks/${taskGid}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to delete task: ${response.status} - ${errorBody}`);
  }
}

export async function addTaskComment(
  accessToken: string,
  taskGid: string,
  text: string,
  htmlText?: string
): Promise<void> {
  const data: Record<string, string> = htmlText ? { html_text: htmlText } : { text };

  const response = await fetch(`${ASANA_API_BASE}/tasks/${taskGid}/stories`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to add comment: ${response.status} - ${errorBody}`);
  }
}

export interface AsanaStory {
  gid: string;
  type: string;
  text: string;
  htmlText?: string;
  createdAt: string;
  createdBy?: {
    gid: string;
    name: string;
  };
  resourceSubtype: string;
}

export async function getTaskStories(
  accessToken: string,
  taskGid: string
): Promise<AsanaStory[]> {
  const response = await fetch(
    `${ASANA_API_BASE}/tasks/${taskGid}/stories?opt_fields=type,text,html_text,created_at,created_by.name,resource_subtype`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to fetch stories: ${response.status} - ${errorBody}`);
  }

  const data = await response.json();
  return data.data.map((story: Record<string, unknown>) => ({
    gid: story.gid as string,
    type: story.type as string,
    text: story.text as string || '',
    htmlText: story.html_text as string | undefined,
    createdAt: story.created_at as string,
    createdBy: story.created_by ? {
      gid: (story.created_by as Record<string, string>).gid,
      name: (story.created_by as Record<string, string>).name,
    } : undefined,
    resourceSubtype: story.resource_subtype as string,
  }));
}

export function getAsanaTaskUrl(taskGid: string): string {
  return `https://app.asana.com/0/0/${taskGid}`;
}

export interface CreateTaskParams {
  name: string;
  notes?: string;
  dueOn?: string; // YYYY-MM-DD format
  projectGid?: string;
  customFields?: Record<string, string>; // fieldGid -> enumOptionGid (for enum fields)
  tagGids?: string[]; // Tag gids to attach on creation
}

export async function createTask(
  accessToken: string,
  workspaceId: string,
  params: CreateTaskParams
): Promise<AsanaTask> {
  // First get the user's gid for assignment
  const meResponse = await fetch(`${ASANA_API_BASE}/users/me`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!meResponse.ok) {
    throw new Error('Failed to fetch user info');
  }

  const meData: AsanaApiResponse<{ gid: string }> = await meResponse.json();
  const userGid = meData.data.gid;

  // Build task data
  const taskData: Record<string, unknown> = {
    name: params.name,
    workspace: workspaceId,
    assignee: userGid, // Assign to current user
  };

  if (params.notes) {
    taskData.notes = params.notes;
  }

  if (params.dueOn) {
    taskData.due_on = params.dueOn;
  }

  if (params.projectGid) {
    taskData.projects = [params.projectGid];
  }

  if (params.customFields && Object.keys(params.customFields).length > 0) {
    taskData.custom_fields = params.customFields;
  }

  if (params.tagGids && params.tagGids.length > 0) {
    taskData.tags = params.tagGids;
  }

  const response = await fetch(`${ASANA_API_BASE}/tasks?opt_fields=${TASK_OPT_FIELDS}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data: taskData }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('Asana create task error:', response.status, errorBody);
    throw new Error(`Failed to create task: ${response.status} - ${errorBody.substring(0, 200)}`);
  }

  const data = await response.json();
  return mapAsanaTaskResponse(data.data);
}

export interface UpdateTaskParams {
  name?: string;
  notes?: string;
  dueOn?: string | null; // YYYY-MM-DD format, null to clear
  startOn?: string | null; // YYYY-MM-DD format, null to clear
  customFields?: Record<string, string | null>; // fieldGid -> enumOptionGid (or null to clear)
  addProjects?: string[]; // project gids to add
  removeProjects?: string[]; // project gids to remove
  addTags?: string[]; // tag gids to add
  removeTags?: string[]; // tag gids to remove
}

export async function updateTask(
  accessToken: string,
  taskGid: string,
  params: UpdateTaskParams
): Promise<AsanaTask> {
  // If setting start_on, we need to ensure due_on is also set (Asana requirement)
  // Fetch current task to get existing due_on if needed
  let existingDueOn: string | null = null;
  if (params.startOn !== undefined && params.dueOn === undefined) {
    const fetchResponse = await fetch(`${ASANA_API_BASE}/tasks/${taskGid}?opt_fields=due_on`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });
    if (fetchResponse.ok) {
      const fetchData = await fetchResponse.json();
      existingDueOn = fetchData.data.due_on;
    }
  }

  // Build update data
  const taskData: Record<string, unknown> = {};

  if (params.name !== undefined) {
    taskData.name = params.name;
  }

  if (params.notes !== undefined) {
    taskData.notes = params.notes;
  }

  if (params.dueOn !== undefined) {
    taskData.due_on = params.dueOn;
  } else if (params.startOn !== undefined && params.startOn !== null && existingDueOn) {
    // Include existing due_on when setting start_on (Asana requires this)
    taskData.due_on = existingDueOn;
  }

  if (params.startOn !== undefined) {
    // Only set start_on if we have a due_on (either new or existing)
    if (params.startOn !== null && !taskData.due_on && !existingDueOn) {
      throw new Error('Cannot set start date without a due date. Please set a due date first.');
    }
    taskData.start_on = params.startOn;
  }

  if (params.customFields && Object.keys(params.customFields).length > 0) {
    taskData.custom_fields = params.customFields;
  }

  const response = await fetch(`${ASANA_API_BASE}/tasks/${taskGid}?opt_fields=${TASK_OPT_FIELDS}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data: taskData }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('Asana update task error:', response.status, errorBody);
    throw new Error(`Failed to update task: ${response.status} - ${errorBody.substring(0, 200)}`);
  }

  const data = await response.json();
  const task = data.data;

  // Handle project additions/removals separately (Asana API requires separate calls)
  if (params.addProjects && params.addProjects.length > 0) {
    for (const projectGid of params.addProjects) {
      await fetch(`${ASANA_API_BASE}/tasks/${taskGid}/addProject`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: { project: projectGid } }),
      });
    }
  }

  if (params.removeProjects && params.removeProjects.length > 0) {
    for (const projectGid of params.removeProjects) {
      await fetch(`${ASANA_API_BASE}/tasks/${taskGid}/removeProject`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: { project: projectGid } }),
      });
    }
  }

  // Handle tag additions/removals (Asana API requires separate calls)
  if (params.addTags && params.addTags.length > 0) {
    for (const tagGid of params.addTags) {
      await fetch(`${ASANA_API_BASE}/tasks/${taskGid}/addTag`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: { tag: tagGid } }),
      });
    }
  }

  if (params.removeTags && params.removeTags.length > 0) {
    for (const tagGid of params.removeTags) {
      await fetch(`${ASANA_API_BASE}/tasks/${taskGid}/removeTag`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: { tag: tagGid } }),
      });
    }
  }

  // If projects or tags were changed, re-fetch to get updated lists
  if ((params.addProjects && params.addProjects.length > 0) ||
      (params.removeProjects && params.removeProjects.length > 0) ||
      (params.addTags && params.addTags.length > 0) ||
      (params.removeTags && params.removeTags.length > 0)) {
    const refetchResponse = await fetch(`${ASANA_API_BASE}/tasks/${taskGid}?opt_fields=${TASK_OPT_FIELDS}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });
    if (refetchResponse.ok) {
      const refetchData = await refetchResponse.json();
      return mapAsanaTaskResponse(refetchData.data);
    }
  }

  return mapAsanaTaskResponse(task);
}

// Helper to map Asana API task response to our AsanaTask type
function mapAsanaTaskResponse(task: Record<string, unknown>): AsanaTask {
  return {
    id: task.gid as string,
    gid: task.gid as string,
    name: task.name as string,
    notes: task.notes as string | undefined,
    dueOn: task.due_on as string | undefined,
    dueAt: task.due_at as string | undefined,
    startOn: task.start_on as string | undefined,
    createdAt: task.created_at as string | undefined,
    completed: task.completed as boolean,
    assignee: task.assignee as { gid: string; name: string } | undefined,
    projects: task.projects as Array<{ gid: string; name: string }> | undefined,
    customFields: (task.custom_fields as Array<{ gid: string; name: string; display_value: string | null; type: string; enum_value?: { gid: string; name: string }; enum_options?: Array<{ gid: string; name: string }> }> | undefined)?.map(cf => ({
      gid: cf.gid,
      name: cf.name,
      displayValue: cf.display_value,
      type: cf.type,
      enumValueGid: cf.enum_value?.gid,
      enumOptions: cf.enum_options?.map(option => ({ gid: option.gid, name: option.name })),
    })),
    tags: (task.tags as AsanaTagApi[] | undefined)?.map(mapTag),
    parent: task.parent as { gid: string; name: string } | undefined,
  };
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

export async function getWorkspaceTags(
  accessToken: string,
  workspaceId: string
): Promise<AsanaTag[]> {
  const response = await fetch(
    `${ASANA_API_BASE}/workspaces/${workspaceId}/tags?opt_fields=name,color`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('Asana tags error:', response.status, errorBody);
    throw new Error(`Failed to fetch tags: ${response.status} - ${errorBody.substring(0, 200)}`);
  }

  const data = await response.json();
  return (data.data as AsanaTagApi[]).map(mapTag);
}

export async function createTag(
  accessToken: string,
  workspaceId: string,
  name: string,
  color?: string
): Promise<AsanaTag> {
  const body: Record<string, unknown> = {
    name,
    workspace: workspaceId,
  };
  if (color) {
    body.color = color;
  }

  const response = await fetch(`${ASANA_API_BASE}/tags?opt_fields=name,color`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data: body }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('Asana create tag error:', response.status, errorBody);
    throw new Error(`Failed to create tag: ${response.status} - ${errorBody.substring(0, 200)}`);
  }

  const data = await response.json();
  return mapTag(data.data as AsanaTagApi);
}
