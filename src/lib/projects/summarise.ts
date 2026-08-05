// A one-line "what this is, where it's up to" for each project.
//
// The scan knows what changed; it cannot say what the project is FOR. This asks
// Claude, reading only what is cheap and reliable: the recent commit subjects
// and the top of the README / CLAUDE.md.
//
// Cached against the last commit SHA, so a project is summarised once and then
// never again until something actually lands in it. That keeps a 20-repo scan
// at zero marginal cost on a normal page load.
//
// A STATUS.md always wins. If the author has said where things stand, no
// generated sentence should overrule it.

import fs from 'fs';
import path from 'path';

import { runClaudeJsonArray } from '../ai-classifier';
import { readAllDomains, writeAllDomains } from '../storage/db';
import type { ProjectScan } from './scan';

export interface ProjectSummary {
  // The one-liner shown in the list.
  summary: string;
  // Where it came from, so the UI can be honest about it.
  source: 'status-file' | 'generated';
  // The commit the generated summary describes; used to invalidate.
  sha?: string;
  updatedAt?: string;
}

type SummaryCache = Record<string, ProjectSummary>;

// Its own `projectSummaries` domain, read and written through the db layer
// directly. getUserData() rebuilds a whitelisted UserData object and would drop
// this one — which silently empties the cache and re-runs Claude on every load.
async function readCache(): Promise<SummaryCache> {
  const raw = readAllDomains().projectSummaries;
  return raw && typeof raw === 'object' ? (raw as SummaryCache) : {};
}

async function writeCache(cache: SummaryCache): Promise<void> {
  writeAllDomains({ projectSummaries: cache });
}

// Context for the model: what the project says about itself, plus what has
// actually been happening. Capped hard — a long README would dominate the
// prompt and cost more than the answer is worth.
function projectContext(project: ProjectScan, recentSubjects: string[]): string {
  const docs: string[] = [];
  for (const file of ['README.md', 'CLAUDE.md']) {
    try {
      const contents = fs.readFileSync(path.join(project.path, file), 'utf-8');
      const prose = contents
        .split('\n')
        .filter(l => l.trim() && !l.trim().startsWith('#'))
        .slice(0, 4)
        .join(' ');
      if (prose) docs.push(`${file}: ${prose.slice(0, 400)}`);
    } catch {
      // No such file — normal.
    }
  }

  return [
    `name: ${project.name}`,
    ...docs,
    `recent commits: ${recentSubjects.slice(0, 8).join(' | ') || '(none in the last month)'}`,
  ].join('\n');
}

const PROMPT_HEADER = `You are helping someone keep track of their side projects. For EACH project below, write ONE sentence saying what the project is and where it has got to, in at most 20 words.

Write plainly and concretely. Prefer "a scraper for X, last working on Y" over "an interesting exploration of X". Do not speculate about what is planned next — describe only what the evidence shows. Do not use marketing language.

Return ONLY a JSON array, no prose, no code fences:
[{"name":"<project name>","summary":"<=20 words"}]

Projects:
`;

// Summarise the projects that need it, reusing cached lines for everything
// unchanged. `recentSubjectsFor` supplies commit subjects (the caller has them
// from the scan; passing them in keeps this free of git).
export async function summariseProjects(
  projects: ProjectScan[],
  // Called ONLY for the projects that need a new summary. Gathering commit
  // subjects for all 20-odd on every load would be pure waste on the cached
  // path, which is nearly every load.
  recentSubjectsFor: (project: ProjectScan) => Promise<string[]> | string[],
  options: { refresh?: boolean } = {}
): Promise<Record<string, ProjectSummary>> {
  const cache = await readCache();
  const out: Record<string, ProjectSummary> = {};
  const needed: ProjectScan[] = [];

  for (const project of projects) {
    // A hand-written status always wins over a generated line.
    if (project.statusFile) {
      out[project.name] = { summary: project.statusFile, source: 'status-file' };
      continue;
    }
    const cached = cache[project.name];
    if (!options.refresh && cached?.sha === project.lastCommitSha) {
      out[project.name] = cached;
      continue;
    }
    needed.push(project);
  }

  if (needed.length === 0) return out;

  try {
    const subjects = await Promise.all(needed.map(p => recentSubjectsFor(p)));
    const prompt =
      PROMPT_HEADER +
      needed.map((p, i) => projectContext(p, subjects[i])).join('\n\n---\n\n');
    const records = await runClaudeJsonArray(prompt, 180);

    const now = new Date().toISOString();
    for (const record of records) {
      const name = typeof record.name === 'string' ? record.name : '';
      const summary = typeof record.summary === 'string' ? record.summary.trim() : '';
      const project = needed.find(p => p.name === name);
      if (!project || !summary) continue;
      const entry: ProjectSummary = {
        summary: summary.slice(0, 200),
        source: 'generated',
        sha: project.lastCommitSha,
        updatedAt: now,
      };
      out[name] = entry;
      cache[name] = entry;
    }
    await writeCache(cache);
  } catch (error) {
    // The scan is the point; a summariser failure must not empty the list.
    console.error('Failed to summarise projects:', error);
    for (const project of needed) {
      const stale = cache[project.name];
      if (stale) out[project.name] = stale;
    }
  }

  return out;
}
