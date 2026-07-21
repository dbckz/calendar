import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { AsanaSidebar } from '@/components/AsanaSidebar';
import { CalendarEvent } from '@/types';

// Mock the api layer so no real network calls are made.
jest.mock('@/lib/api', () => ({
  api: {
    getTaskStories: jest.fn().mockResolvedValue({ stories: [] }),
    upsertDelegationEntry: jest.fn().mockResolvedValue(undefined),
  },
}));

function makeTask(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: overrides.id || 'task-1',
    title: overrides.title || 'Write project proposal',
    source: 'asana',
    startTime: new Date('2026-07-22T09:00:00Z'),
    endTime: new Date('2026-07-22T09:30:00Z'),
    integrationId: 'int-1',
    integrationName: 'Work',
    ...overrides,
  };
}

describe('AsanaSidebar', () => {
  it('renders the task list with each task title', () => {
    const tasks = [
      makeTask({ id: 'task-1', title: 'Write project proposal' }),
      makeTask({ id: 'task-2', title: 'Review pull request' }),
    ];

    render(<AsanaSidebar tasks={tasks} isLoading={false} />);

    expect(screen.getByText('Write project proposal')).toBeInTheDocument();
    expect(screen.getByText('Review pull request')).toBeInTheDocument();
    // Header count reflects the number of tasks.
    expect(screen.getByText('2 tasks')).toBeInTheDocument();
  });

  it('shows a loading spinner instead of tasks while loading', () => {
    render(<AsanaSidebar tasks={[]} isLoading={true} />);
    expect(screen.queryByText('No incomplete Asana tasks')).not.toBeInTheDocument();
  });

  it('shows the empty state when there are no tasks', () => {
    render(<AsanaSidebar tasks={[]} isLoading={false} />);
    expect(screen.getByText('No incomplete Asana tasks')).toBeInTheDocument();
  });

  it('filters the visible tasks via the search box', () => {
    const tasks = [
      makeTask({ id: 'task-1', title: 'Write project proposal' }),
      makeTask({ id: 'task-2', title: 'Review pull request' }),
    ];

    render(<AsanaSidebar tasks={tasks} isLoading={false} />);

    fireEvent.change(screen.getByPlaceholderText('Search tasks...'), {
      target: { value: 'proposal' },
    });

    expect(screen.getByText('Write project proposal')).toBeInTheDocument();
    expect(screen.queryByText('Review pull request')).not.toBeInTheDocument();
    expect(screen.getByText('1 task')).toBeInTheDocument();
  });

  it('opens the task detail dialog when a task is clicked', async () => {
    const tasks = [makeTask({ id: 'task-1', title: 'Write project proposal' })];

    render(<AsanaSidebar tasks={tasks} isLoading={false} onToggleComplete={jest.fn()} />);

    fireEvent.click(screen.getByText('Write project proposal'));

    // The dialog surfaces action controls not present in the list row.
    // findBy* also flushes the dialog's async story fetch under act().
    expect(await screen.findByText('Mark Complete')).toBeInTheDocument();
    expect(screen.getByText('Open in Asana')).toBeInTheDocument();
  });
});
