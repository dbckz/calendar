/**
 * @jest-environment node
 *
 * Ordering and dormancy for the project scan. The git reading itself is
 * exercised against the real repos by the API route; what matters here is the
 * rule that decides what surfaces first, because that is the whole point of the
 * view.
 */
import { sortProjects, DORMANT_AFTER_DAYS } from '@/lib/projects/scan';
import type { ProjectScan } from '@/lib/projects/scan';

function project(overrides: Partial<ProjectScan> & { name: string }): ProjectScan {
  return {
    path: `/repos/${overrides.name}`,
    branch: 'main',
    lastCommitDate: '2026-07-01',
    lastCommitSha: 'abc123',
    lastCommitSubject: 'chore: something',
    daysSinceCommit: 10,
    commitsLast30Days: 1,
    uncommittedFiles: 0,
    unpushedCommits: 0,
    hasRemote: true,
    dormant: false,
    ...overrides,
  };
}

describe('sortProjects', () => {
  it('puts the most recently committed first', () => {
    const sorted = sortProjects([
      project({ name: 'old', lastCommitDate: '2026-06-01' }),
      project({ name: 'new', lastCommitDate: '2026-08-01' }),
    ]);
    expect(sorted.map(p => p.name)).toEqual(['new', 'old']);
  });

  it('lifts unfinished work above merely-recent work', () => {
    // The whole point: a repo abandoned mid-change is what gets forgotten, so it
    // outranks a repo that was simply committed to more recently.
    const sorted = sortProjects([
      project({ name: 'recent', lastCommitDate: '2026-08-04' }),
      project({ name: 'abandoned', lastCommitDate: '2026-06-20', uncommittedFiles: 19 }),
    ]);
    expect(sorted.map(p => p.name)).toEqual(['abandoned', 'recent']);
  });

  it('still orders several dirty repos by recency between themselves', () => {
    const sorted = sortProjects([
      project({ name: 'dirty-old', lastCommitDate: '2026-06-01', uncommittedFiles: 3 }),
      project({ name: 'dirty-new', lastCommitDate: '2026-08-01', uncommittedFiles: 1 }),
      project({ name: 'clean-newest', lastCommitDate: '2026-08-04' }),
    ]);
    expect(sorted.map(p => p.name)).toEqual(['dirty-new', 'dirty-old', 'clean-newest']);
  });

  it('does not mutate the array it is given', () => {
    const input = [
      project({ name: 'a', lastCommitDate: '2026-06-01' }),
      project({ name: 'b', lastCommitDate: '2026-08-01' }),
    ];
    sortProjects(input);
    expect(input.map(p => p.name)).toEqual(['a', 'b']);
  });
});

describe('dormancy threshold', () => {
  it('is long enough to keep a monthly project visible', () => {
    // A project touched every few weeks should never disappear behind the
    // toggle; the threshold exists for genuinely finished one-offs.
    expect(DORMANT_AFTER_DAYS).toBeGreaterThan(31);
  });
});
