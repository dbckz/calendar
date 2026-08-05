// Scanning the side-project repos for what has actually been happening.
//
// The problem this solves: 20-odd repos accumulate under ~/working_dir/github,
// work moves between them, and it becomes impossible to remember what exists,
// what is live and what was abandoned half-finished. Git already knows all of
// this — nothing needs to be maintained by hand.
//
// Dormancy matters as much as activity here. A repo untouched for six weeks
// with nineteen uncommitted files is precisely the thing that goes missing.
//
// Server-only: shells out to git.

import { execFile } from 'child_process';
import fs from 'fs';
import { homedir } from 'os';
import path from 'path';
import { promisify } from 'util';

const run = promisify(execFile);

// Where the side projects live. Scoped to this one tree deliberately: the
// openmined/ and openclaw/ trees are day-job work with their own tracking, and
// folding them in would bury the personal projects.
export const PROJECTS_ROOT = path.join(homedir(), 'working_dir', 'github', 'dbckz');

// Past this, a project is hidden by default. Long enough that a project worked
// on monthly stays visible; short enough that genuinely finished one-offs drop
// out of the way.
export const DORMANT_AFTER_DAYS = 60;

export interface ProjectScan {
  name: string;
  path: string;
  branch: string;
  lastCommitDate: string; // yyyy-MM-dd
  lastCommitSha: string;
  lastCommitSubject: string;
  daysSinceCommit: number;
  commitsLast30Days: number;
  // Files with uncommitted changes. The signal for work left mid-stream.
  uncommittedFiles: number;
  // Commits not yet pushed — work that exists only on this machine.
  unpushedCommits: number;
  hasRemote: boolean;
  // A STATUS.md, if the project keeps one. Takes precedence over anything
  // generated: it is the author saying where things stand.
  statusFile?: string;
  dormant: boolean;
}

async function git(repo: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await run('git', ['-C', repo, ...args], {
      timeout: 10_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    return stdout.trim();
  } catch {
    // A repo mid-rebase, with no commits, or otherwise unreadable should not
    // take the whole scan down.
    return '';
  }
}

export async function scanProject(repoPath: string, now: Date = new Date()): Promise<ProjectScan | null> {
  if (!fs.existsSync(path.join(repoPath, '.git'))) return null;

  const [lastCommit, branch, status, remotes, since] = await Promise.all([
    git(repoPath, ['log', '-1', '--format=%H%x1f%cd%x1f%s', '--date=short']),
    git(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']),
    git(repoPath, ['status', '--porcelain']),
    git(repoPath, ['remote']),
    git(repoPath, ['log', '--since=30.days', '--format=%H']),
  ]);

  if (!lastCommit) return null; // no commits yet
  const [sha, date, subject] = lastCommit.split('');

  const hasRemote = remotes.length > 0;
  // Only meaningful with an upstream; a branch that has never been pushed
  // reports nothing rather than every commit it contains.
  const unpushed = hasRemote
    ? await git(repoPath, ['log', '--format=%H', '@{u}..HEAD'])
    : '';

  const daysSinceCommit = Math.max(
    0,
    Math.floor((now.getTime() - new Date(`${date}T00:00:00`).getTime()) / 86_400_000)
  );

  const statusPath = path.join(repoPath, 'STATUS.md');
  const statusFile = fs.existsSync(statusPath) ? readStatus(statusPath) : undefined;

  return {
    name: path.basename(repoPath),
    path: repoPath,
    branch: branch || 'HEAD',
    lastCommitDate: date,
    lastCommitSha: sha,
    lastCommitSubject: subject ?? '',
    daysSinceCommit,
    commitsLast30Days: since ? since.split('\n').filter(Boolean).length : 0,
    uncommittedFiles: status ? status.split('\n').filter(Boolean).length : 0,
    unpushedCommits: unpushed ? unpushed.split('\n').filter(Boolean).length : 0,
    hasRemote,
    ...(statusFile ? { statusFile } : {}),
    dormant: daysSinceCommit > DORMANT_AFTER_DAYS,
  };
}

// The first meaningful prose of a STATUS.md — enough to show as the project's
// state without rendering a whole document into a list.
function readStatus(statusPath: string): string | undefined {
  try {
    const contents = fs.readFileSync(statusPath, 'utf-8');
    const line = contents
      .split('\n')
      .map(l => l.trim())
      .find(l => l && !l.startsWith('#') && !l.startsWith('---'));
    return line?.slice(0, 300);
  } catch {
    return undefined;
  }
}

export async function scanProjects(
  root: string = PROJECTS_ROOT,
  now: Date = new Date()
): Promise<ProjectScan[]> {
  let entries: string[];
  try {
    entries = fs.readdirSync(root);
  } catch {
    return [];
  }

  const scans = await Promise.all(
    entries
      .map(name => path.join(root, name))
      .filter(p => {
        try {
          return fs.statSync(p).isDirectory();
        } catch {
          return false;
        }
      })
      .map(p => scanProject(p, now))
  );

  return sortProjects(scans.filter((s): s is ProjectScan => !!s));
}

// Most recently touched first — but anything with uncommitted work is lifted to
// the top regardless of date, because that is unfinished business rather than
// history.
export function sortProjects(projects: ProjectScan[]): ProjectScan[] {
  return [...projects].sort((a, b) => {
    const aDirty = a.uncommittedFiles > 0 ? 1 : 0;
    const bDirty = b.uncommittedFiles > 0 ? 1 : 0;
    if (aDirty !== bDirty) return bDirty - aDirty;
    return b.lastCommitDate.localeCompare(a.lastCommitDate);
  });
}
