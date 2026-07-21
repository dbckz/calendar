/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, fireEvent, act } from '@testing-library/react';
import Home from '@/app/page';

// The page pulls in the whole app (heavy child components + data hooks). For a
// shell smoke test we stub the network layer, the data hooks, and the heavy
// tab-body children, then verify the tab shell renders and switching tabs swaps
// the visible content.

jest.mock('@/lib/api', () => ({
  api: {
    getSettings: jest.fn().mockResolvedValue({ googleIntegrations: [], asanaIntegrations: [] }),
    getWorkflowConfig: jest.fn().mockResolvedValue({ scheduling: { dayRolloverHour: 4 } }),
    getGoogleEventAttributions: jest.fn().mockResolvedValue({ attributions: [] }),
    recordTimeTracking: jest.fn().mockResolvedValue(undefined),
    setGoogleEventAttribution: jest.fn().mockResolvedValue(undefined),
    removeGoogleEventAttribution: jest.fn().mockResolvedValue(undefined),
    getCustomTaskTypes: jest.fn().mockResolvedValue({ customTypes: [] }),
    getTaskTemplates: jest.fn().mockResolvedValue({ templates: [] }),
  },
}));

jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
  }),
}));

jest.mock('@/hooks/useTasks', () => ({
  useTasks: () => ({
    addTask: jest.fn(),
    updateTask: jest.fn(),
    removeTask: jest.fn(),
    getTasksForDate: () => [],
  }),
}));

jest.mock('@/hooks/useTaskMetadata', () => ({
  useTaskMetadata: () => ({ metadataByGid: {}, saveMetadata: jest.fn(), reload: jest.fn() }),
}));

jest.mock('@/hooks/useDelegationQueue', () => ({
  useDelegationQueue: () => ({ delegationByGid: {}, refresh: jest.fn() }),
}));

jest.mock('@/hooks/useCalendarEvents', () => ({
  useCalendarEvents: () => ({
    googleEvents: [],
    allAsanaTasks: [],
    filteredAsanaTasks: [],
    scheduledAsanaTasks: [],
    isLoading: false,
    fetchAllEvents: jest.fn(),
    fetchEventsForDate: jest.fn(),
    adhocToCalendarEvent: jest.fn(),
    scheduleAsana: jest.fn(),
    updateScheduledAsana: jest.fn(),
    updateScheduledAsanaByGoogleEvent: jest.fn(),
    unscheduleAsana: jest.fn(),
    unscheduleAllAsanaInstances: jest.fn(),
    updateGoogleEvent: jest.fn(),
    createGoogleEvent: jest.fn(),
    deleteGoogleEvent: jest.fn(),
    getScheduledAsanaEventsForDate: () => [],
    completeAsanaTask: jest.fn(),
    addAsanaComment: jest.fn(),
    createAsanaTask: jest.fn(),
    updateAsanaTask: jest.fn(),
    deleteAsanaTask: jest.fn(),
    asanaProjects: [],
    asanaTypeValues: {},
    asanaTypeFieldInfoByIntegration: {},
    asanaIntegrations: [],
    setAsanaFilters: jest.fn(),
    getAsanaFiltersForIntegration: () => ({}),
    clearAsanaFilters: jest.fn(),
  }),
}));

// Stub the tab bodies / heavy children so the test stays a shell smoke test.
jest.mock('@/components/Header', () => ({
  Header: ({
    tabs,
    onTabChange,
  }: {
    tabs: { id: string; label: string }[];
    onTabChange: (id: string) => void;
  }) => (
    <div>
      {tabs.map(tab => (
        <button key={tab.id} onClick={() => onTabChange(tab.id)}>
          {tab.label}
        </button>
      ))}
    </div>
  ),
}));

jest.mock('@/components/dashboard/DashboardContent', () => ({
  DashboardContent: () => <div>Command Center Content</div>,
}));

jest.mock('@/components/RitualsContent', () => ({
  RitualsContent: () => <div>Rituals Content</div>,
}));

jest.mock('@/components/Reminders', () => ({
  Reminders: () => <div>Reminders Content</div>,
}));

jest.mock('@/components/home/CalendarTab', () => ({
  CalendarTab: () => <div>Calendar Tab Content</div>,
}));

describe('Home page shell', () => {
  async function renderHome() {
    let utils!: ReturnType<typeof render>;
    await act(async () => {
      utils = render(<Home />);
    });
    return utils;
  }

  it('renders the tab bar with all four tabs and the dashboard by default', async () => {
    await renderHome();

    expect(screen.getByRole('button', { name: 'Command Center' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Daily Calendar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rituals' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reminders' })).toBeInTheDocument();

    // Dashboard is the default active tab.
    expect(screen.getByText('Command Center Content')).toBeInTheDocument();
    expect(screen.queryByText('Calendar Tab Content')).not.toBeInTheDocument();
  });

  it('switches to the Rituals tab when its button is clicked', async () => {
    await renderHome();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Rituals' }));
    });

    expect(screen.getByText('Rituals Content')).toBeInTheDocument();
    expect(screen.queryByText('Command Center Content')).not.toBeInTheDocument();
  });

  it('switches to the Daily Calendar tab and shows the timeline area', async () => {
    await renderHome();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Daily Calendar' }));
    });

    expect(screen.getByText('Calendar Tab Content')).toBeInTheDocument();
    expect(screen.queryByText('Command Center Content')).not.toBeInTheDocument();
  });
});
