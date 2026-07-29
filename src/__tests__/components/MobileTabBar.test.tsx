/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { MobileTabBar } from '@/app/mobile/components/MobileTabBar';

describe('MobileTabBar', () => {
  it('renders the three tabs and marks the active one', () => {
    render(<MobileTabBar activeTab="day" onTabChange={jest.fn()} />);

    expect(screen.getByRole('button', { name: /home/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /day/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: /reminders/i })).toBeInTheDocument();
  });

  it('calls onTabChange when a tab is tapped', () => {
    const onTabChange = jest.fn();
    render(<MobileTabBar activeTab="home" onTabChange={onTabChange} />);

    fireEvent.click(screen.getByRole('button', { name: /reminders/i }));
    expect(onTabChange).toHaveBeenCalledWith('reminders');
  });

  it('shows the reminder badge count, capped at 9+', () => {
    const { rerender } = render(
      <MobileTabBar activeTab="home" onTabChange={jest.fn()} reminderCount={3} />
    );
    expect(screen.getByText('3')).toBeInTheDocument();

    rerender(<MobileTabBar activeTab="home" onTabChange={jest.fn()} reminderCount={12} />);
    expect(screen.getByText('9+')).toBeInTheDocument();
  });

  it('hides the badge when there are no reminders', () => {
    render(<MobileTabBar activeTab="home" onTabChange={jest.fn()} reminderCount={0} />);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });
});
