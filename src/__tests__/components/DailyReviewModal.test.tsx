/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, within } from '@testing-library/react';

import { DailyReviewModal } from '@/components/dashboard/DailyReviewModal';
import type { ReplanReviewBlock } from '@/lib/scheduling/replan';

// The modal imports the api layer at module load; mock every method it (and the
// step-2 replan hook) can reach so no real network calls happen.
jest.mock('@/lib/api', () => ({
  api: {
    analyzeReplan: jest.fn(),
    confirmReplan: jest.fn(),
    completeDailyReview: jest.fn(),
    getReviewMessage: jest.fn(),
    dismissReviewTitle: jest.fn(),
  },
}));

import { api } from '@/lib/api';

const WORKSPACES = [
  { id: 'ws-om', name: 'OpenMined' },
  { id: 'ws-dbc', name: 'DBC' },
];

function reviewBlock(overrides: Partial<ReplanReviewBlock> = {}): ReplanReviewBlock {
  return {
    googleEventId: 'evt-1',
    googleIntegrationId: 'gcal-1',
    kind: 'task',
    category: 'Deep work',
    date: '2026-07-24',
    start: '09:00',
    durationMinutes: 90,
    startMs: Date.parse('2026-07-24T09:00:00Z'),
    endMs: Date.parse('2026-07-24T10:30:00Z'),
    done: false,
    titles: ['Write the policy brief'],
    tasks: [{ title: 'Write the policy brief', done: false, adhocId: 'adhoc-1' }],
    ...overrides,
  };
}

function analyzeResponse(blocks: ReplanReviewBlock[]) {
  return {
    weekStart: '2026-07-20',
    weekEnd: '2026-07-26',
    kept: [],
    moves: [],
    unplaceable: [],
    stale: [],
    additions: [],
    deletions: [],
    reviewBlocks: blocks,
  };
}

async function openModal(
  blocks: ReplanReviewBlock[],
  props: Partial<React.ComponentProps<typeof DailyReviewModal>> = {}
) {
  (api.analyzeReplan as jest.Mock).mockResolvedValue(analyzeResponse(blocks));
  await act(async () => {
    render(<DailyReviewModal isOpen onClose={() => {}} {...props} />);
  });
}

// Click "Save & replan" and return the body confirmReplan was called with, or
// null when the apply found nothing worth sending.
async function saveAndReplan(): Promise<{
  done: string[];
  notDone: string[];
  started: Array<{ googleEventId: string; taskIds?: string[] }>;
  replacements: Array<Record<string, unknown>>;
} | null> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Save & replan/i }));
  });
  const mock = api.confirmReplan as jest.Mock;
  if (mock.mock.calls.length === 0) return null;
  const call = mock.mock.calls[0];
  // Positional signature: ..., notDone(6), completeAsana(7), ..., adopt(10),
  // displace(11), carry(12), started(13), replacements(14).
  return {
    done: call[1] ?? [],
    notDone: call[5] ?? [],
    started: call[12] ?? [],
    replacements: call[13] ?? [],
  };
}

const DIDNT_DO = 'Didn’t do';

describe('DailyReviewModal — step 1 outcomes and replacements', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (api.confirmReplan as jest.Mock).mockResolvedValue({
      results: [],
      doneResults: [],
      additionResults: [],
    });
    (api.completeDailyReview as jest.Mock).mockResolvedValue({});
    (api.getReviewMessage as jest.Mock).mockResolvedValue({ message: 'Good day.' });
  });

  it('offers three outcomes and records Started on apply', async () => {
    await openModal([reviewBlock()]);

    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Started' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: DIDNT_DO })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Started' }));
    const body = await saveAndReplan();

    // Recorded against the block's own task, not the block as a whole.
    expect(body?.started).toEqual([{ googleEventId: 'evt-1', taskIds: ['adhoc-1'] }]);
    expect(body?.done).toEqual([]);
    expect(body?.replacements).toEqual([]);
  });

  it('seeds a previously-started task as Started', async () => {
    // A deep-work task begun earlier this week (recorded 'started') comes up
    // again: it must present as Started, not blank/Didn’t do.
    await openModal([
      reviewBlock({
        tasks: [{ title: 'Write the policy brief', done: false, adhocId: 'adhoc-1', previouslyStarted: true }],
      }),
    ]);

    expect(screen.getByRole('button', { name: 'Started' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Done' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: DIDNT_DO })).toHaveAttribute('aria-pressed', 'false');

    // Left as started, the apply re-emits the started entry (an idempotent
    // re-record; the confirm route never downgrades an outcome already 'done').
    const body = await saveAndReplan();
    expect(body?.started).toEqual([{ googleEventId: 'evt-1', taskIds: ['adhoc-1'] }]);
  });

  it('lets Done override a previously-started seed', async () => {
    await openModal([
      reviewBlock({
        tasks: [{ title: 'Write the policy brief', done: false, adhocId: 'adhoc-1', previouslyStarted: true }],
      }),
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    const body = await saveAndReplan();
    expect(body?.done).toEqual(['evt-1']);
    expect(body?.started).toEqual([]);
  });

  it('shows the replacement panel only for a block marked Didn’t do', async () => {
    await openModal([reviewBlock()], { workspaceOptions: WORKSPACES });
    const trigger = /What were you doing instead\?/;

    // Seeded not-done, so the prompt is there from the start.
    expect(screen.getByRole('button', { name: trigger })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('button', { name: trigger })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Started' }));
    expect(screen.queryByRole('button', { name: trigger })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: DIDNT_DO }));
    expect(screen.getByRole('button', { name: trigger })).toBeInTheDocument();
  });

  it('sends a work replacement with the title and workspace', async () => {
    await openModal([reviewBlock()], { workspaceOptions: WORKSPACES });

    fireEvent.click(screen.getByRole('button', { name: /What were you doing instead\?/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Worked on something else' }));
    fireEvent.change(screen.getByLabelText('What did you work on instead?'), {
      target: { value: 'Firefighting the deploy' },
    });
    fireEvent.change(screen.getByLabelText('Workspace'), { target: { value: 'ws-dbc' } });

    const body = await saveAndReplan();
    expect(body?.replacements).toEqual([
      {
        googleEventId: 'evt-1',
        googleIntegrationId: 'gcal-1',
        date: '2026-07-24',
        start: '09:00',
        durationMinutes: 90,
        mode: 'work',
        title: 'Firefighting the deploy',
        workspaceId: 'ws-dbc',
      },
    ]);
  });

  it('defaults the workspace picker to the first option', async () => {
    await openModal([reviewBlock()], { workspaceOptions: WORKSPACES });

    fireEvent.click(screen.getByRole('button', { name: /What were you doing instead\?/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Worked on something else' }));

    expect(screen.getByLabelText('Workspace')).toHaveValue('ws-om');

    // And the default is what gets sent if the picker is left alone.
    const body = await saveAndReplan();
    expect(body?.replacements[0]).toMatchObject({ mode: 'work', workspaceId: 'ws-om' });
  });

  it('hides the work option when no workspaces are supplied', async () => {
    await openModal([reviewBlock()]);

    fireEvent.click(screen.getByRole('button', { name: /What were you doing instead\?/ }));
    expect(screen.queryByRole('button', { name: 'Worked on something else' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Personal / rest' })).toBeInTheDocument();
  });

  it('sends mode personal for a personal replacement', async () => {
    await openModal([reviewBlock()], { workspaceOptions: WORKSPACES });

    fireEvent.click(screen.getByRole('button', { name: /What were you doing instead\?/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Personal / rest' }));

    const body = await saveAndReplan();
    expect(body?.replacements).toHaveLength(1);
    expect(body?.replacements[0]).toMatchObject({ googleEventId: 'evt-1', mode: 'personal' });
  });

  it('sends mode none for "nothing — just remove it"', async () => {
    await openModal([reviewBlock()], { workspaceOptions: WORKSPACES });

    fireEvent.click(screen.getByRole('button', { name: /What were you doing instead\?/ }));
    fireEvent.click(screen.getByRole('button', { name: /Nothing — just remove it/ }));

    const body = await saveAndReplan();
    expect(body?.replacements).toHaveLength(1);
    expect(body?.replacements[0]).toMatchObject({ googleEventId: 'evt-1', mode: 'none' });
  });

  it('sends no replacement when the panel is left unanswered', async () => {
    await openModal([reviewBlock()], { workspaceOptions: WORKSPACES });

    // Expand it, look at the options, answer nothing.
    fireEvent.click(screen.getByRole('button', { name: /What were you doing instead\?/ }));

    const body = await saveAndReplan();
    expect(body).toBeNull(); // nothing changed at all, so no confirm call
  });

  it('clears an answer again with "Leave unanswered"', async () => {
    await openModal([reviewBlock()], { workspaceOptions: WORKSPACES });

    fireEvent.click(screen.getByRole('button', { name: /What were you doing instead\?/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Personal / rest' }));
    fireEvent.click(screen.getByRole('button', { name: 'Leave unanswered' }));

    const body = await saveAndReplan();
    expect(body).toBeNull();
  });

  it('gives each member of a grouped block its own outcome control', async () => {
    await openModal([
      reviewBlock({
        titles: ['Two things'],
        tasks: [
          { title: 'First thing', done: false, adhocId: 'a1' },
          { title: 'Second thing', done: false, adhocId: 'a2' },
        ],
      }),
    ]);

    const first = screen.getByRole('group', { name: 'Outcome for First thing' });
    const second = screen.getByRole('group', { name: 'Outcome for Second thing' });
    expect(first).toBeInTheDocument();
    expect(second).toBeInTheDocument();

    // One member started, the other not done: the block is started, not done —
    // and ONLY the started member is recorded, so the week's started count can't
    // be inflated by the sibling left untouched.
    fireEvent.click(within(first).getByRole('button', { name: 'Started' }));

    const body = await saveAndReplan();
    expect(body?.started).toEqual([{ googleEventId: 'evt-1', taskIds: ['a1'] }]);
  });

  it('offers "Complete in Asana" for Done but not for Started', async () => {
    await openModal([
      reviewBlock({
        tasks: [{ title: 'Write the policy brief', done: false, gid: 'g1', integrationId: 'i1' }],
      }),
    ]);

    expect(screen.queryByText('Complete in Asana')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Started' }));
    expect(screen.queryByText('Complete in Asana')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByText('Complete in Asana')).toBeInTheDocument();
  });

  it('applies successfully with nothing marked', async () => {
    await openModal([reviewBlock()]);

    const body = await saveAndReplan();
    expect(body).toBeNull();
    expect(api.completeDailyReview).toHaveBeenCalled();
    // The replan step is reached regardless.
    expect(await screen.findByRole('button', { name: 'Done' })).toBeInTheDocument();
  });

  it('shows a prominent "Not relevant" dismissal on calendar rows and hides + remembers on click', async () => {
    (api.dismissReviewTitle as jest.Mock).mockResolvedValue(undefined);
    await openModal([
      reviewBlock({
        googleEventId: 'evt-cal',
        source: 'calendar',
        titles: ['Meet Corinna'],
        tasks: [{ title: 'Meet Corinna', done: false }],
      }),
    ]);

    const btn = screen.getByRole('button', {
      name: /Not relevant — hide this and don’t ask again/i,
    });
    expect(btn).toBeInTheDocument();

    fireEvent.click(btn);

    // Records a permanent verdict for the title and drops the row from the review.
    expect(api.dismissReviewTitle).toHaveBeenCalledWith('Meet Corinna');
    expect(
      screen.queryByRole('button', { name: /Not relevant/i })
    ).not.toBeInTheDocument();
  });

  it('shows no dismissal on non-calendar (task-record) rows', async () => {
    // The default block has no source → it comes from a local task record.
    await openModal([reviewBlock()]);
    expect(screen.queryByRole('button', { name: /Not relevant/i })).not.toBeInTheDocument();
  });
});

describe('DailyReviewModal — catch-up context', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (api.confirmReplan as jest.Mock).mockResolvedValue({
      results: [],
      doneResults: [],
      additionResults: [],
    });
    (api.completeDailyReview as jest.Mock).mockResolvedValue({});
    (api.getReviewMessage as jest.Mock).mockResolvedValue({ message: 'Good day.' });
  });

  // Render with a specific `review` payload attached to the analyze response.
  async function openWithReview(
    blocks: ReplanReviewBlock[],
    review: { sinceIso: string | null; missedWorkingDays: number; clamped: boolean }
  ) {
    (api.analyzeReplan as jest.Mock).mockResolvedValue({ ...analyzeResponse(blocks), review });
    await act(async () => {
      render(<DailyReviewModal isOpen onClose={() => {}} />);
    });
  }

  it('shows the catch-up subtitle when working days were missed', async () => {
    await openWithReview([reviewBlock()], {
      sinceIso: '2026-07-17T12:00:00.000Z',
      missedWorkingDays: 2,
      clamped: false,
    });

    expect(screen.getByText(/Catching up since/)).toBeInTheDocument();
    expect(screen.getByText(/weekends and days off don’t count/)).toBeInTheDocument();
  });

  it('reads as a fresh start when the 7-day cap bit', async () => {
    await openWithReview([reviewBlock()], {
      sinceIso: '2026-07-01T12:00:00.000Z',
      missedWorkingDays: 5,
      clamped: true,
    });

    expect(screen.getByText('Welcome back — reviewing the last 7 days.')).toBeInTheDocument();
  });

  it('keeps the generic subtitle when nothing was missed', async () => {
    await openWithReview([reviewBlock()], {
      sinceIso: '2026-07-23T12:00:00.000Z',
      missedWorkingDays: 0,
      clamped: false,
    });

    expect(screen.getByText('What got done since your last review?')).toBeInTheDocument();
  });

  it('badges a prior-week row and withholds its replacement UI', async () => {
    // A not-done block dated before this week's Monday (weekStart 2026-07-20).
    await openWithReview(
      [reviewBlock({ googleEventId: 'evt-prior', date: '2026-07-17', titles: ['Friday leftover'], tasks: [{ title: 'Friday leftover', done: false, adhocId: 'a-prior' }] })],
      { sinceIso: '2026-07-17T12:00:00.000Z', missedWorkingDays: 0, clamped: false }
    );

    expect(screen.getByText('Last week')).toBeInTheDocument();
    // No "what were you doing instead" prompt — that path rewrites the current
    // week's calendar and must not touch a prior week.
    expect(
      screen.queryByRole('button', { name: /What were you doing instead\?/ })
    ).not.toBeInTheDocument();
  });

  it('still offers the replacement UI for a current-week not-done row', async () => {
    await openWithReview([reviewBlock({ date: '2026-07-24' })], {
      sinceIso: null,
      missedWorkingDays: 0,
      clamped: false,
    });

    expect(
      screen.getByRole('button', { name: /What were you doing instead\?/ })
    ).toBeInTheDocument();
  });
});
