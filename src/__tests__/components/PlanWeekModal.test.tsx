/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
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
  },
}));

describe('PlanWeekModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<PlanWeekModal isOpen={false} onClose={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
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
