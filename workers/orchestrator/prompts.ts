import type { AsanaStory, PlannerTask } from './types';

function compactStories(stories: AsanaStory[]): string {
  return stories
    .filter(story => story?.text)
    .slice(-8)
    .map(story => `- ${story.createdAt || 'unknown'} | ${story.createdBy?.name || 'unknown'} | ${story.text}`)
    .join('\n');
}

function baseTaskBlock(task: PlannerTask, stories: AsanaStory[], container: string): string {
  return [
    `Task title: ${task.title}`,
    `Task id: ${task.id}`,
    `Integration: ${task.integrationName || 'unknown'}`,
    `Due on: ${task.dueOn || 'none'}`,
    `Description:\n${task.description || '(none)'}`,
    `Container:\n${container}`,
    stories.length ? `Recent stories/comments:\n${compactStories(stories)}` : 'Recent stories/comments: (none)',
  ].join('\n\n');
}

interface PromptInput {
  task: PlannerTask;
  stories: AsanaStory[];
  container: string;
}

export function buildFlightFinderPrompt({ task, stories, container }: PromptInput): string {
  return [
    'Use the flight-finder skill for this task.',
    'Follow the skill exactly and do the actual work now.',
    'Return ONLY valid JSON with this schema:',
    '{"status":"successful|failed","summary":"string","outputs":["string"],"next":"string"}',
    'outputs should be a short list of concrete review items such as the Google Flights URL, shortlisted flight options, or key caveats.',
    'If information is missing, set status to failed and explain the blocker in summary/next.',
    '',
    baseTaskBlock(task, stories, container),
  ].join('\n');
}

export function buildPlainContainerPrompt({ task, stories, container }: PromptInput): string {
  return [
    'Execute the following Asana work container as a bounded task.',
    'Do the work now using available tools as needed.',
    'Return ONLY valid JSON with this schema:',
    '{"status":"successful|failed","summary":"string","outputs":["string"],"next":"string"}',
    'Do not include markdown fences or extra commentary.',
    '',
    baseTaskBlock(task, stories, container),
  ].join('\n');
}
