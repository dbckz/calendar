import { getTag, hasTag, resolveWorkspaceTag } from '../asana-task-utils';

describe('asana-task-utils', () => {
  it('hasTag and getTag are case-insensitive', () => {
    const task = {
      id: '1',
      title: 'x',
      tags: [
        { gid: '1', name: 'agent_ready' },
        { gid: '2', name: 'OtherTag' },
      ],
    };

    expect(hasTag(task, 'AGENT_READY')).toBe(true);
    expect(getTag(task, 'agent_ready')).toEqual({ gid: '1', name: 'agent_ready' });
    expect(hasTag(task, 'missing')).toBe(false);
  });

  it('resolveWorkspaceTag finds tag by name and returns null when missing', () => {
    const tags = [
      { gid: 'a', name: 'agent_in_progress' },
      { gid: 'b', name: 'agent_complete' },
    ];

    expect(resolveWorkspaceTag(tags, 'AGENT_COMPLETE')).toEqual({ gid: 'b', name: 'agent_complete' });
    expect(resolveWorkspaceTag(tags, 'agent_failed')).toBeNull();
  });
});
