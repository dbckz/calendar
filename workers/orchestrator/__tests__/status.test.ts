import { isLockStale } from '../status';

describe('isLockStale', () => {
  const now = Date.parse('2026-07-12T12:00:00.000Z');

  it('treats a missing lock as stale', () => {
    expect(isLockStale(null, now)).toBe(true);
  });

  it('treats a dead pid as stale', () => {
    // PID 1 exists; use an implausible high pid that should not exist.
    const running = { pid: 2 ** 22, startedAt: '', heartbeatAt: new Date(now).toISOString() };
    expect(isLockStale(running, now)).toBe(true);
  });

  it('treats a live pid with a fresh heartbeat as active', () => {
    const running = { pid: process.pid, startedAt: '', heartbeatAt: new Date(now - 60_000).toISOString() };
    expect(isLockStale(running, now)).toBe(false);
  });

  it('treats a live pid with an old heartbeat as stale', () => {
    const running = { pid: process.pid, startedAt: '', heartbeatAt: new Date(now - 45 * 60_000).toISOString() };
    expect(isLockStale(running, now)).toBe(true);
  });
});
