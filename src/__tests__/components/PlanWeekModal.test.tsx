/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PlanWeekModal } from '@/components/dashboard/PlanWeekModal';

// The modal imports the api layer at module load; mock it so no real network
// calls happen. The priorities input phase (the initial step with no untyped
// tasks) renders without invoking any api method.
jest.mock('@/lib/api', () => ({
  api: {
    classifyTaskTypes: jest.fn(),
    updateAsanaTask: jest.fn(),
    getPrepCandidates: jest.fn(),
    setPrepDecision: jest.fn(),
    getWeekCandidates: jest.fn(),
    matchPriorities: jest.fn(),
    getAsanaProjects: jest.fn(),
    createPriorityTasks: jest.fn(),
    completeAsanaTaskInWizard: jest.fn(),
    proposeWeeklyPlan: jest.fn(),
    confirmWeeklyPlan: jest.fn(),
    // The priorities step shows recently-touched projects as context. Advisory,
    // so an empty list is the normal quiet case.
    getProjects: jest.fn().mockResolvedValue({ projects: [], dormantCount: 0 }),
    getReminders: jest.fn().mockResolvedValue({ reminders: [] }),
    getCalendarReminders: jest.fn().mockResolvedValue({ candidates: [] }),
  },
}));

import { api } from '@/lib/api';

// Walk the wizard forward with the footer's Skip/Next button until the review
// step is reached, so every per-step fetch fires.
async function skipThroughSteps() {
  for (let i = 0; i < 6; i++) {
    const next =
      screen.queryByRole('button', { name: 'Skip' }) ??
      screen.queryByRole('button', { name: /^Next/i });
    if (!next) break;
    await act(async () => {
      fireEvent.click(next);
    });
  }
}

describe('PlanWeekModal — next-week targeting', () => {
  const NEXT_MONDAY = '2026-07-20';

  beforeEach(() => {
    jest.clearAllMocks();
    (api.matchPriorities as jest.Mock).mockResolvedValue({
      results: [],
      asanaIntegrations: [],
      categories: [],
    });
    (api.getAsanaProjects as jest.Mock).mockResolvedValue({ projects: [] });
    (api.getPrepCandidates as jest.Mock).mockResolvedValue({
      meetings: [],
      unplaced: [],
      workingDays: ['2026-07-20', '2026-07-21'],
    });
    (api.getWeekCandidates as jest.Mock).mockResolvedValue({ categories: [] });
    (api.proposeWeeklyPlan as jest.Mock).mockResolvedValue({
      proposals: [],
      quotaSummary: [],
      weekStart: NEXT_MONDAY,
      weekEnd: '2026-07-26',
    });
  });

  it('passes the target week to every wizard endpoint and shows its dates', async () => {
    render(<PlanWeekModal isOpen onClose={jest.fn()} weekStart={NEXT_MONDAY} />);

    // Type a priority so the matching call fires, then walk on through
    // reminders/prep → tasks → review, which drives the remaining calls.
    const box = screen.getByPlaceholderText(/One priority per line/i);
    await act(async () => {
      fireEvent.change(box, { target: { value: 'Ship the report' } });
      fireEvent.click(screen.getByRole('button', { name: /^Next/i }));
    });
    await waitFor(() => expect(api.matchPriorities).toHaveBeenCalled());
    await skipThroughSteps();

    await waitFor(() => expect(api.proposeWeeklyPlan).toHaveBeenCalled());

    expect(api.matchPriorities).toHaveBeenCalledWith(expect.anything(), NEXT_MONDAY);
    expect(api.getPrepCandidates).toHaveBeenCalledWith(
      NEXT_MONDAY,
      expect.anything(),
      expect.anything()
    );
    expect(api.getWeekCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ weekStart: NEXT_MONDAY })
    );
    expect(api.proposeWeeklyPlan).toHaveBeenCalledWith(
      expect.objectContaining({ weekStart: NEXT_MONDAY })
    );
    // The header week range comes from the response, i.e. next week's dates.
    await waitFor(() => expect(screen.getByText(/Jul 20 – Jul 26/)).toBeInTheDocument());
  });

  it('sends the target week on confirm so the server plans the right week', async () => {
    (api.proposeWeeklyPlan as jest.Mock).mockResolvedValue({
      proposals: [
        {
          id: 'p1',
          category: 'Writing',
          date: '2026-07-21',
          start: '09:00',
          durationMinutes: 60,
          reason: 'quota',
          task: { gid: 'g1', title: 'Draft', integrationId: 'ai1' },
        },
      ],
      quotaSummary: [],
      weekStart: NEXT_MONDAY,
      weekEnd: '2026-07-26',
    });
    (api.confirmWeeklyPlan as jest.Mock).mockResolvedValue({ results: [{ id: 'p1', success: true }] });

    render(<PlanWeekModal isOpen onClose={jest.fn()} weekStart={NEXT_MONDAY} />);
    await skipThroughSteps();
    await waitFor(() => expect(api.proposeWeeklyPlan).toHaveBeenCalled());

    const apply = await screen.findByRole('button', { name: /to calendar/i });
    await act(async () => {
      fireEvent.click(apply);
    });

    await waitFor(() => expect(api.confirmWeeklyPlan).toHaveBeenCalled());
    expect(api.confirmWeeklyPlan).toHaveBeenCalledWith(expect.anything(), undefined, NEXT_MONDAY);
  });
});

describe('PlanWeekModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<PlanWeekModal isOpen={false} onClose={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('gives the priorities step two step dots (input + match-review screens)', () => {
    const { container } = render(<PlanWeekModal isOpen onClose={jest.fn()} />);

    // With no untyped tasks and no reminders, the screens the user pages through
    // are: priorities-input, priorities-review, prep, tasks, review = 5 dots.
    const dots = container.querySelectorAll('span.rounded-full');
    expect(dots).toHaveLength(5);

    // The two priorities screens each get their own labelled dot.
    expect(screen.getByTitle('Priorities')).toBeInTheDocument();
    expect(screen.getByTitle('Review matches')).toBeInTheDocument();

    // On the input phase the first priorities dot is the active one.
    expect(screen.getByTitle('Priorities').querySelector('span')).toHaveClass('bg-orange-500');
    expect(screen.getByTitle('Review matches').querySelector('span')).toHaveClass('bg-gray-200');
  });

  it('renders the modal shell and the priorities step when open', () => {
    render(<PlanWeekModal isOpen onClose={jest.fn()} />);

    // Header
    expect(screen.getByRole('heading', { name: 'Plan my week' })).toBeInTheDocument();

    // Priorities step (the default first step with no untyped tasks) is shown.
    expect(
      screen.getByText(/What matters most this week\?/i)
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/One priority per line/i)
    ).toBeInTheDocument();

    // Footer navigation is present.
    expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Next/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });
});
