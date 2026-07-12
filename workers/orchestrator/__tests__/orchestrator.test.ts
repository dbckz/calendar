// Dry-run tests for runOnce with a fully mocked planner client + status layer.
// No real HTTP, no claude CLI, no Asana side effects.
import { runOnce } from '../orchestrator';
import * as planner from '../planner-client';
import * as claudeRunner from '../claude-runner';
import * as status from '../status';

jest.mock('../planner-client');
jest.mock('../claude-runner');
jest.mock('../status');

const mockedPlanner = planner as jest.Mocked<typeof planner>;
const mockedClaude = claudeRunner as jest.Mocked<typeof claudeRunner>;
const mockedStatus = status as jest.Mocked<typeof status>;

beforeEach(() => {
  jest.clearAllMocks();
  // Default: lock acquired successfully.
  mockedStatus.acquireLock.mockResolvedValue({ lastRunAt: null, running: null, history: [] });
  mockedStatus.releaseLock.mockResolvedValue();
  mockedStatus.setCurrentTask.mockResolvedValue();
  mockedStatus.heartbeat.mockResolvedValue();
  mockedStatus.appendHistory.mockResolvedValue();
});

describe('runOnce', () => {
  it('skips cleanly when the lock is already held by a live run', async () => {
    mockedStatus.acquireLock.mockResolvedValue(null);

    const result = await runOnce();

    expect(result.skipped).toBe(true);
    expect(result.picked).toBeNull();
    expect(mockedPlanner.fetchAsanaTasks).not.toHaveBeenCalled();
  });

  it('reports no eligible tasks when nothing matches the filters', async () => {
    mockedPlanner.fetchAsanaTasks.mockResolvedValue([
      // Wrong integration
      { id: '1', title: 'a', integrationName: 'OTHER', integrationId: 'i1', tags: [{ gid: 't', name: 'agent_ready' }], description: 'agent_work_containers:\n- do it' },
      // Completed
      { id: '2', title: 'b', integrationName: 'DBC', integrationId: 'i1', completed: true, tags: [{ gid: 't', name: 'agent_ready' }], description: 'agent_work_containers:\n- do it' },
      // Missing ready tag
      { id: '3', title: 'c', integrationName: 'DBC', integrationId: 'i1', tags: [], description: 'agent_work_containers:\n- do it' },
      // No containers
      { id: '4', title: 'd', integrationName: 'DBC', integrationId: 'i1', tags: [{ gid: 't', name: 'agent_ready' }], description: 'no marker here' },
    ]);

    const result = await runOnce();

    expect(result.picked).toBeNull();
    expect(result.message).toMatch(/No eligible tasks/i);
    expect(mockedClaude.runClaudeTask).not.toHaveBeenCalled();
    expect(mockedStatus.releaseLock).toHaveBeenCalledTimes(1);
  });

  it('claims, executes, comments, and completes an eligible task', async () => {
    mockedPlanner.fetchAsanaTasks.mockResolvedValue([
      {
        id: '100',
        title: 'Do the thing',
        integrationName: 'DBC',
        integrationId: 'i1',
        completed: false,
        tags: [{ gid: 'ready', name: 'agent_ready' }],
        description: 'agent_work_containers:\n- Draft a memo',
      },
    ]);
    mockedPlanner.fetchAsanaTags.mockResolvedValue([
      { gid: 'ready', name: 'agent_ready' },
      { gid: 'prog', name: 'agent_in_progress' },
      { gid: 'done', name: 'agent_complete' },
      { gid: 'fail', name: 'agent_failed' },
    ]);
    mockedPlanner.fetchTaskStories.mockResolvedValue([]);
    mockedPlanner.updateTaskTags.mockResolvedValue({ success: true });
    mockedPlanner.addTaskComment.mockResolvedValue({ success: true });
    mockedClaude.runClaudeTask.mockResolvedValue({
      status: 'successful',
      summary: 'Wrote the memo.',
      outputs: ['memo.md'],
      next: 'Review it.',
    });

    const result = await runOnce();

    expect(result.picked).toEqual({ id: '100', title: 'Do the thing', url: 'https://app.asana.com/0/0/100' });
    expect(result.finalStatus).toBe('successful');
    // Claimed (ready -> in_progress) then finalised (-> complete): two tag updates.
    expect(mockedPlanner.updateTaskTags).toHaveBeenCalledTimes(2);
    expect(mockedPlanner.addTaskComment).toHaveBeenCalledTimes(1);
    expect(mockedStatus.appendHistory).toHaveBeenCalledWith(
      expect.objectContaining({ taskGid: '100', finalStatus: 'successful' }),
    );
    expect(mockedStatus.releaseLock).toHaveBeenCalledTimes(1);
  });

  it('always releases the lock even if fetching tasks throws', async () => {
    mockedPlanner.fetchAsanaTasks.mockRejectedValue(new Error('calendar app not running'));

    await expect(runOnce()).rejects.toThrow(/calendar app not running/);
    expect(mockedStatus.releaseLock).toHaveBeenCalledTimes(1);
  });
});
