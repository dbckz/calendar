/**
 * @jest-environment node
 *
 * Tests for the prep-blocks route's two lists:
 *   * `prepBlocksToday` excludes done blocks (a done block already happened and
 *     must not be re-briefed by the morning-briefings automation),
 *   * `prepBlocksForMeetingsOn` is unfiltered (the day-of-update flow needs to
 *     know prep occurred, done or not).
 * getPrepBlocks is mocked so the route runs pure.
 */
import type { PrepBlock } from '@/lib/storage/core';

jest.mock('@/lib/user-data-storage', () => ({
  getPrepBlocks: jest.fn(),
}));

import { GET } from '@/app/api/prep-blocks/route';
import { getPrepBlocks } from '@/lib/user-data-storage';
import { NextRequest } from 'next/server';

const mockPrep = getPrepBlocks as jest.Mock;

function prepBlock(over: Partial<PrepBlock> = {}): PrepBlock {
  return {
    id: 'p1',
    googleEventId: 'g1',
    googleIntegrationId: 'int1',
    meetingEventId: 'm1',
    meetingTitle: 'Meeting',
    meetingStart: '2026-07-15T14:00:00.000Z',
    date: '2026-07-15',
    start: '09:00',
    durationMinutes: 30,
    done: false,
    createdAt: '2026-07-14T00:00:00.000Z',
    ...over,
  };
}

function request(date: string): NextRequest {
  return new NextRequest(`http://localhost/api/prep-blocks?date=${date}`);
}

describe('GET /api/prep-blocks', () => {
  afterEach(() => jest.clearAllMocks());

  it('excludes done blocks from prepBlocksToday', async () => {
    mockPrep.mockResolvedValue([
      prepBlock({ id: 'pending', date: '2026-07-15', done: false }),
      prepBlock({ id: 'done', date: '2026-07-15', done: true }),
    ]);

    const res = await GET(request('2026-07-15'));
    const body = await res.json();

    expect(body.prepBlocksToday.map((b: PrepBlock) => b.id)).toEqual(['pending']);
  });

  it('keeps done blocks in prepBlocksForMeetingsOn', async () => {
    mockPrep.mockResolvedValue([
      prepBlock({ id: 'done', date: '2026-07-14', done: true }),
    ]);

    // Meeting is on 2026-07-15 (from meetingStart), prep day is 2026-07-14.
    const res = await GET(request('2026-07-15'));
    const body = await res.json();

    expect(body.prepBlocksToday).toEqual([]);
    expect(body.prepBlocksForMeetingsOn.map((b: PrepBlock) => b.id)).toEqual(['done']);
  });
});
