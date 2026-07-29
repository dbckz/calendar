/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { DayTab } from '@/app/mobile/tabs/DayTab';
import { createMockCalendarEvent } from '../mocks/data';

const NOW = new Date('2024-01-15T10:30:00');

function renderDay(events = [] as ReturnType<typeof createMockCalendarEvent>[]) {
  return render(
    <DayTab
      selectedDate={NOW}
      now={NOW}
      events={events}
      dueTodayTasks={[]}
      isLoading={false}
      onSelectEvent={jest.fn()}
    />
  );
}

describe('DayTab', () => {
  it('places the now indicator before the first event still in progress or upcoming', () => {
    const past = createMockCalendarEvent({
      id: 'past',
      title: 'Past meeting',
      startTime: new Date('2024-01-15T08:00:00'),
      endTime: new Date('2024-01-15T09:00:00'),
    });
    const upcoming = createMockCalendarEvent({
      id: 'upcoming',
      title: 'Upcoming meeting',
      startTime: new Date('2024-01-15T12:00:00'),
      endTime: new Date('2024-01-15T13:00:00'),
    });
    renderDay([upcoming, past]);

    const agenda = screen.getByText('Agenda').closest('section')!;
    const children = Array.from(agenda.querySelectorAll(':scope [aria-label="Current time"], :scope button'));
    const labels = children.map(el =>
      el.getAttribute('aria-label') === 'Current time' ? 'NOW' : el.textContent
    );

    const nowIdx = labels.indexOf('NOW');
    const pastIdx = labels.findIndex(l => l?.includes('Past meeting'));
    const upcomingIdx = labels.findIndex(l => l?.includes('Upcoming meeting'));
    expect(nowIdx).toBeGreaterThan(pastIdx);
    expect(nowIdx).toBeLessThan(upcomingIdx);
  });

  it('marks an in-progress event with the Now badge', () => {
    const current = createMockCalendarEvent({
      id: 'current',
      title: 'Current meeting',
      startTime: new Date('2024-01-15T10:00:00'),
      endTime: new Date('2024-01-15T11:00:00'),
    });
    renderDay([current]);

    expect(screen.getByText('Now')).toBeInTheDocument();
  });

  it('shows the empty state with a now indicator when today has no timed events', () => {
    renderDay([]);

    expect(screen.getByText('No timed events')).toBeInTheDocument();
    expect(screen.getByLabelText('Current time')).toBeInTheDocument();
  });
});
