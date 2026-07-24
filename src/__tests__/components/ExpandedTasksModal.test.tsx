/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { ExpandedTasksModal } from '@/components/dashboard/ExpandedTasksModal';
import { TopTasks } from '@/components/dashboard/TopTasks';
import type { CalendarEvent } from '@/types';

// useFitCount (used by the task cards) observes its list; jsdom has no ResizeObserver.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(global as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub;

// More than one card page's worth, so the modal is provably showing the full list.
const TASKS: CalendarEvent[] = Array.from({ length: 24 }, (_, i) => ({
  id: `t${i}`,
  title: `Task ${i}`,
  startTime: new Date('2026-07-24T09:00:00Z'),
  endTime: new Date('2026-07-24T10:00:00Z'),
  source: 'asana' as const,
  integrationName: i % 2 === 0 ? 'OM' : 'DBC',
  dueOn: '2026-07-24',
}));

describe('ExpandedTasksModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <ExpandedTasksModal isOpen={false} onClose={jest.fn()} title="Top Tasks" tasks={TASKS} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders every task passed, not just a page of them', () => {
    render(<ExpandedTasksModal isOpen onClose={jest.fn()} title="Top Tasks" tasks={TASKS} />);

    for (const task of TASKS) {
      expect(screen.getByText(task.title)).toBeInTheDocument();
    }
    expect(screen.getByText('24')).toBeInTheDocument();
  });

  it('closes on Escape and on the X button', () => {
    const onClose = jest.fn();
    const { rerender } = render(
      <ExpandedTasksModal isOpen onClose={onClose} title="Top Tasks" tasks={TASKS} />
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(<ExpandedTasksModal isOpen onClose={onClose} title="Top Tasks" tasks={TASKS} />);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('a row click opens the task, passing the full list as nav ids', () => {
    const onTaskClick = jest.fn();
    render(
      <ExpandedTasksModal isOpen onClose={jest.fn()} title="Top Tasks" tasks={TASKS} onTaskClick={onTaskClick} />
    );

    fireEvent.click(screen.getByText('Task 7'));
    expect(onTaskClick).toHaveBeenCalledWith('t7', TASKS.map(t => t.id));
  });

  it('renders the per-row action slot', () => {
    render(
      <ExpandedTasksModal
        isOpen
        onClose={jest.fn()}
        title="AI-runnable"
        tasks={TASKS.slice(0, 2)}
        renderAction={task => <button>Delegate {task.title}</button>}
      />
    );

    expect(screen.getByRole('button', { name: 'Delegate Task 0' })).toBeInTheDocument();
  });
});

describe('TopTasks double-click expansion', () => {
  it('double-clicking the card header opens the expanded modal with every task', async () => {
    render(<TopTasks tasks={TASKS} metadataByGid={{}} onTaskClick={jest.fn()} />);

    // The card itself only shows a page; the last task isn't on it.
    expect(screen.queryByText('Task 23')).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.doubleClick(screen.getByText('Top Tasks'));
    });

    // Heading now appears twice — the card's and the modal's.
    expect(screen.getAllByText('Top Tasks')).toHaveLength(2);
    expect(screen.getByText('Task 23')).toBeInTheDocument();
  });
});
