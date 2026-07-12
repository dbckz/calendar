import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from './config';
import {
  fetchAsanaTasks,
  fetchAsanaTags,
  createAsanaTag,
  fetchTaskStories,
  addTaskComment,
  updateTaskTags,
} from './planner-client';
import { parseAgentWorkContainers, isSkillContainer, skillNameFromContainer } from './containers';
import { getTag, hasTag, resolveWorkspaceTag, taskUrl } from './asana-task-utils';
import { runClaudeTask } from './claude-runner';
import { buildSkillContainerPrompt, buildPlainContainerPrompt } from './prompts';
import { formatComment } from './reporting';
import {
  acquireLock,
  appendHistory,
  heartbeat,
  releaseLock,
  setCurrentTask,
} from './status';
import type { AsanaStory, AsanaTag, ContainerReport, EligibleTask, PlannerTask } from './types';

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

interface RunResult {
  ranAt: string;
  picked: { id: string; title: string; url: string } | null;
  finalStatus?: string;
  reports?: ContainerReport[];
  message?: string;
  skipped?: boolean;
}

export async function runOnce(): Promise<RunResult> {
  // Claim the run lock. A stale lock (dead pid / heartbeat > 30 min) is stolen.
  const lock = await acquireLock();
  if (!lock) {
    const result: RunResult = {
      ranAt: new Date().toISOString(),
      picked: null,
      skipped: true,
      message: 'Another orchestrator run is already in progress; skipping.',
    };
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  try {
    return await executeRun();
  } finally {
    await releaseLock();
  }
}

async function executeRun(): Promise<RunResult> {
  const tasks = await fetchAsanaTasks(config.plannerBaseUrl);
  const eligible: EligibleTask[] = tasks
    .filter(task => task.integrationName === config.targetIntegrationName)
    .filter(task => !task.completed)
    .filter(task => hasTag(task, config.readyTagName))
    .map(task => ({ ...task, integrationId: task.integrationId as string, containers: parseAgentWorkContainers(task.description) }))
    .filter(task => task.containers.length > 0)
    .sort(compareTasks);

  if (eligible.length === 0) {
    const result: RunResult = { ranAt: new Date().toISOString(), picked: null, message: 'No eligible tasks found.' };
    await writeJson(config.runLogPath, result);
    return result;
  }

  const task = eligible[0];
  await setCurrentTask({ gid: task.id, title: task.title });

  const workspaceTags = await fetchAsanaTags(config.plannerBaseUrl, task.integrationId);
  const readyTag = getTag(task, config.readyTagName);
  const existingCompleteTag = getTag(task, config.completeTagName);
  const existingFailedTag = getTag(task, config.failedTagName);
  const inProgressTag = await ensureWorkspaceTag(task.integrationId, workspaceTags, config.inProgressTagName, 'light-blue');
  const completeTag = await ensureWorkspaceTag(task.integrationId, workspaceTags, config.completeTagName, 'light-green');
  const failedTag = await ensureWorkspaceTag(task.integrationId, workspaceTags, config.failedTagName, 'dark-red');

  if (!readyTag) {
    throw new Error(`Selected task is missing ready tag ${config.readyTagName}`);
  }

  await updateTaskTags(config.plannerBaseUrl, task.id, task.integrationId, {
    removeTags: [readyTag.gid, existingCompleteTag?.gid, existingFailedTag?.gid].filter((gid): gid is string => Boolean(gid)),
    addTags: [inProgressTag.gid],
  });

  const stories: AsanaStory[] = await fetchTaskStories(config.plannerBaseUrl, task.id, task.integrationId).catch(() => []);
  const reports: ContainerReport[] = [];
  let finalStatus = 'successful';

  try {
    for (const container of task.containers) {
      await heartbeat();
      const report = await executeContainer({ task, stories, container });
      reports.push(report);
      const comment = formatComment(container, report);
      await addTaskComment(config.plannerBaseUrl, task.id, task.integrationId, comment.text, comment.htmlText);
      if (report.status !== 'successful') {
        finalStatus = 'failed';
        break;
      }
    }
  } catch (error) {
    finalStatus = 'failed';
    const report: ContainerReport = {
      status: 'failed',
      summary: error instanceof Error ? error.message : String(error),
      outputs: [],
      next: 'Inspect the orchestrator failure and retry after fixing the blocker.',
    };
    reports.push(report);
    const comment = formatComment('orchestrator', report);
    await addTaskComment(config.plannerBaseUrl, task.id, task.integrationId, comment.text, comment.htmlText);
  } finally {
    await updateTaskTags(config.plannerBaseUrl, task.id, task.integrationId, {
      removeTags: [inProgressTag.gid, completeTag.gid, failedTag.gid],
      addTags: [finalStatus === 'successful' ? completeTag.gid : failedTag.gid],
    });
    await setCurrentTask(null);
  }

  const result: RunResult = {
    ranAt: new Date().toISOString(),
    picked: { id: task.id, title: task.title, url: taskUrl(task.id) },
    finalStatus,
    reports,
  };
  await writeJson(config.runLogPath, result);

  await appendHistory({
    ranAt: result.ranAt,
    taskGid: task.id,
    title: task.title,
    finalStatus,
    summary: reports[reports.length - 1]?.summary || '',
  });

  return result;
}

interface ExecuteContainerInput {
  task: PlannerTask;
  stories: AsanaStory[];
  container: string;
}

async function executeContainer({ task, stories, container }: ExecuteContainerInput): Promise<ContainerReport> {
  const runnerOpts = {
    timeoutSeconds: config.claudeTimeoutSeconds,
    allowedTools: config.claudeAllowedTools,
  };

  if (isSkillContainer(container)) {
    const skillName = skillNameFromContainer(container);
    if (!skillName) {
      return {
        status: 'failed',
        summary: `Empty skill container: ${container}`,
        outputs: [],
        next: 'Name a skill after the ~ or change the container text.',
      };
    }

    return normalizeReport(await runClaudeTask({
      ...runnerOpts,
      prompt: buildSkillContainerPrompt({ task, stories, container, skillName }),
    }));
  }

  return normalizeReport(await runClaudeTask({
    ...runnerOpts,
    prompt: buildPlainContainerPrompt({ task, stories, container }),
  }));
}

function normalizeReport(report: Partial<ContainerReport> | null | undefined): ContainerReport {
  const status: ContainerReport['status'] = report?.status === 'successful' ? 'successful' : 'failed';
  return {
    status,
    summary: String(report?.summary || '').trim() || (status === 'successful' ? 'Completed.' : 'Failed without a usable summary.'),
    outputs: Array.isArray(report?.outputs) ? report.outputs.map(value => String(value)) : [],
    next: String(report?.next || '').trim() || (status === 'successful' ? 'Review the outputs.' : 'Inspect the task and resolve the blocker.'),
  };
}

function compareTasks(a: EligibleTask, b: EligibleTask): number {
  const aDue = a.dueOn || '9999-12-31';
  const bDue = b.dueOn || '9999-12-31';
  if (aDue !== bDue) return aDue.localeCompare(bDue);
  return a.title.localeCompare(b.title);
}

async function ensureWorkspaceTag(integrationId: string, tags: AsanaTag[], name: string, color: string): Promise<AsanaTag> {
  const existing = resolveWorkspaceTag(tags, name);
  if (existing) {
    return existing;
  }
  return createAsanaTag(config.plannerBaseUrl, integrationId, name, color);
}
