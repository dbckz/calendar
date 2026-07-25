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
  started: string[];
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

    expect(body?.started).toEqual(['evt-1']);
    expect(body?.done).toEqual([]);
    expect(body?.replacements).toEqual([]);
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

    // One member started, the other not done: the block is started, not done.
    fireEvent.click(within(first).getByRole('button', { name: 'Started' }));

    const body = await saveAndReplan();
    expect(body?.started).toEqual(['evt-1']);
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
});
