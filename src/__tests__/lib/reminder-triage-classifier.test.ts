/**
 * Tests for the pure parts of the reminder-triage suggester: mapping the model's
 * name-based records to id/gid-based suggestions, validated against the workspace
 * catalogue (with the headless Claude call mocked for the end-to-end path).
 */
import {
  resolveSuggestions,
  suggestReminderTriage,
  type WorkspaceCatalogEntry,
} from '@/lib/reminder-triage-classifier';
import { runClaudeJsonArray } from '@/lib/ai-classifier';

jest.mock('@/lib/ai-classifier', () => ({
  runClaudeJsonArray: jest.fn(),
}));

const mockRun = runClaudeJsonArray as jest.MockedFunction<typeof runClaudeJsonArray>;

const WORKSPACES: WorkspaceCatalogEntry[] = [
  {
    integrationId: 'om-int',
    name: 'OM',
    projects: [
      { gid: 'p1', name: 'Policy' },
      { gid: 'p2', name: 'Engineering' },
    ],
    types: ['Bug', 'Feature'],
  },
  {
    integrationId: 'dbc-int',
    name: 'DBC',
    projects: [],
    types: [],
  },
];

describe('resolveSuggestions', () => {
  it('maps workspace/project/type names to ids/gids', () => {
    const out = resolveSuggestions(
      [{ id: 'r1', workspace: 'OM', project: 'Engineering', type: 'Bug' }],
      WORKSPACES,
    );
    expect(out).toEqual([
      { id: 'r1', integrationId: 'om-int', projectGid: 'p2', taskType: 'Bug' },
    ]);
  });

  it('matches workspace/project names case-insensitively', () => {
    const out = resolveSuggestions(
      [{ id: 'r1', workspace: 'om', project: 'policy', type: 'Feature' }],
      WORKSPACES,
    );
    expect(out[0]).toMatchObject({ integrationId: 'om-int', projectGid: 'p1', taskType: 'Feature' });
  });

  it('drops a record whose workspace is unknown (caller then defaults it)', () => {
    const out = resolveSuggestions(
      [{ id: 'r1', workspace: 'Nope', project: 'Policy', type: 'Bug' }],
      WORKSPACES,
    );
    expect(out).toEqual([]);
  });

  it('blanks a project that belongs to a different workspace', () => {
    // "Policy" is an OM project; when the chosen workspace is DBC it must not leak.
    const out = resolveSuggestions(
      [{ id: 'r1', workspace: 'DBC', project: 'Policy', type: '' }],
      WORKSPACES,
    );
    expect(out[0]).toEqual({ id: 'r1', integrationId: 'dbc-int', projectGid: '', taskType: '' });
  });

  it('blanks a type that is not one of the workspace labels', () => {
    const out = resolveSuggestions(
      [{ id: 'r1', workspace: 'OM', project: '', type: 'Chore' }],
      WORKSPACES,
    );
    expect(out[0]).toEqual({ id: 'r1', integrationId: 'om-int', projectGid: '', taskType: '' });
  });

  it('ignores records without a string id', () => {
    const out = resolveSuggestions(
      [{ workspace: 'OM' }, { id: 42, workspace: 'OM' }],
      WORKSPACES,
    );
    expect(out).toEqual([]);
  });
});

describe('suggestReminderTriage', () => {
  beforeEach(() => mockRun.mockReset());

  it('returns [] without calling the model when there are no reminders', async () => {
    const out = await suggestReminderTriage([], WORKSPACES);
    expect(out).toEqual([]);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('returns [] without calling the model when there are no workspaces', async () => {
    const out = await suggestReminderTriage([{ id: 'r1', title: 'x' }], []);
    expect(out).toEqual([]);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('runs one headless call and resolves the records', async () => {
    mockRun.mockResolvedValue([{ id: 'r1', workspace: 'OM', project: 'Policy', type: 'Feature' }]);
    const out = await suggestReminderTriage([{ id: 'r1', title: 'Draft policy note' }], WORKSPACES);
    expect(mockRun).toHaveBeenCalledTimes(1);
    expect(out).toEqual([
      { id: 'r1', integrationId: 'om-int', projectGid: 'p1', taskType: 'Feature' },
    ]);
  });
});
