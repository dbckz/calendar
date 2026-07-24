/**
 * @jest-environment jsdom
 *
 * The Analysis view: what it renders while loading, when the store is empty,
 * and once week summaries arrive. fetch is mocked; the view owns its own load.
 */
import '@testing-library/jest-dom';
import { render, screen, act } from '@testing-library/react';
import { AnalysisView } from '@/components/analysis/AnalysisView';
import type { summariseWeek } from '@/lib/weekly-stats';

type WeekSummary = ReturnType<typeof summariseWeek>;

function week(overrides: Partial<WeekSummary> = {}): WeekSummary {
  return {
    weekStart: '2026-07-13',
    categories: [{ category: 'Policy', scheduled: 4, completed: 1, carried: 2, dropped: 1 }],
    totalScheduled: 4,
    totalCompleted: 1,
    completionRate: 0.25,
    minutesWorkedByIntegration: [
      { integrationId: 'om', integrationName: 'OM', minutes: 150 },
      { integrationId: 'dbc', integrationName: 'DBC', minutes: 30 },
    ],
    totalMinutesWorked: 180,
    ...overrides,
  };
}

function mockFetch(body: unknown, ok = true) {
  const deferred: { resolve: () => void } = { resolve: () => {} };
  const pending = new Promise<void>(res => { deferred.resolve = () => res(); });
  global.fetch = jest.fn(() =>
    pending.then(() => ({
      ok,
      json: async () => body,
    }))
  ) as unknown as typeof fetch;
  return deferred;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('AnalysisView', () => {
  it('shows a loading state, then the week summaries', async () => {
    const deferred = mockFetch({ weeks: [week()] });

    render(<AnalysisView />);
    expect(screen.queryByText(/Week of/)).not.toBeInTheDocument();

    await act(async () => {
      deferred.resolve();
    });

    expect(screen.getByText('Week of 13 Jul 2026')).toBeInTheDocument();
    expect(screen.getByText('OM')).toBeInTheDocument();
    expect(screen.getByText('2h 30m')).toBeInTheDocument();
  });

  it('explains that analysis needs a week of data when the store is empty', async () => {
    const deferred = mockFetch({ weeks: [] });
    render(<AnalysisView />);
    await act(async () => { deferred.resolve(); });

    expect(screen.getByText(/needs at least a week of data/i)).toBeInTheDocument();
  });

  it('shows both scheduled and completed counts when a week was over-scheduled', async () => {
    const deferred = mockFetch({ weeks: [week()] });
    render(<AnalysisView />);
    await act(async () => { deferred.resolve(); });

    expect(screen.getByText('1 / 4')).toBeInTheDocument();
    expect(screen.getByText(/1 of 4 scheduled tasks done/)).toBeInTheDocument();
    expect(screen.getByText(/3 left undone/)).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
  });

  it('replaces the trend with a note when only one week has been recorded', async () => {
    const deferred = mockFetch({ weeks: [week()] });
    render(<AnalysisView />);
    await act(async () => { deferred.resolve(); });

    expect(screen.getByText(/appears once a second week completes/i)).toBeInTheDocument();
  });

  it('renders a trend column per week once two weeks exist', async () => {
    const deferred = mockFetch({
      weeks: [week({ weekStart: '2026-07-20', completionRate: 0.9 }), week()],
    });
    render(<AnalysisView />);
    await act(async () => { deferred.resolve(); });

    expect(screen.getByLabelText('13 Jul: 25 per cent completed')).toBeInTheDocument();
    expect(screen.getByLabelText('20 Jul: 90 per cent completed')).toBeInTheDocument();
  });

  it('shows an error state when the request fails', async () => {
    const deferred = mockFetch({ error: 'store unavailable' }, false);
    render(<AnalysisView />);
    await act(async () => { deferred.resolve(); });

    expect(screen.getByText('store unavailable')).toBeInTheDocument();
  });
});
