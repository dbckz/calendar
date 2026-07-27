/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';

import { TaskPeekModal } from '@/components/dashboard/plan-week/TaskPeekModal';
import type { WeekCandidate } from '@/lib/api';

function candidate(over: Partial<WeekCandidate> = {}): WeekCandidate {
  return { id: 't1', title: 'Write the brief', isPriority: false, ...over };
}

describe('TaskPeekModal', () => {
  it('shows the task details and an Asana link for an Asana-backed task', () => {
    render(
      <TaskPeekModal
        candidate={candidate({ gid: 'gid-1', integrationName: 'DBC', dueDate: '2026-07-30' })}
        onClose={jest.fn()}
      />
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Write the brief')).toBeInTheDocument();
    expect(screen.getByText('DBC')).toBeInTheDocument();
    expect(screen.getByText(/Due .*Jul 2026/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Open in Asana/i });
    expect(link).toHaveAttribute('href', 'https://app.asana.com/0/0/gid-1/f');
  });

  it('marks an ad-hoc task and omits the Asana link', () => {
    render(<TaskPeekModal candidate={candidate()} onClose={jest.fn()} />);
    expect(screen.getByText(/Ad-hoc task/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Open in Asana/i })).not.toBeInTheDocument();
  });

  it('closes on the X button and on Escape', () => {
    const onClose = jest.fn();
    render(<TaskPeekModal candidate={candidate()} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
