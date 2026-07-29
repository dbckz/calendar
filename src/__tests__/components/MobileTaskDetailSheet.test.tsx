/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MobileTaskDetailSheet } from '@/app/mobile/components/MobileTaskDetailSheet';
import { api } from '@/lib/api';
import { createMockCalendarEvent } from '../mocks/data';

jest.mock('@/lib/api', () => ({
  api: {
    getTaskStories: jest.fn(),
  },
}));

const mockApi = api as jest.Mocked<typeof api>;

const task = createMockCalendarEvent({
  id: 'task-1',
  title: 'Write the report',
  description: 'Some notes',
  source: 'asana',
  integrationId: 'integration-1',
  integrationName: 'OM',
  dueOn: '2030-06-01',
  completed: false,
  projects: [{ gid: 'p1', name: 'Policy' }],
});

describe('MobileTaskDetailSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.getTaskStories.mockResolvedValue({
      stories: [
        {
          gid: 's1',
          type: 'comment',
          text: 'Looks good',
          createdAt: '2024-01-10T10:00:00.000Z',
          createdBy: { gid: 'u1', name: 'Dave' },
          resourceSubtype: 'comment_added',
        },
        {
          gid: 's2',
          type: 'system',
          text: 'added to Policy',
          createdAt: '2024-01-10T10:00:00.000Z',
          resourceSubtype: 'added_to_project',
        },
      ],
    });
  });

  it('renders the task fields and only comment stories', async () => {
    render(<MobileTaskDetailSheet task={task} onClose={jest.fn()} />);

    expect(screen.getByText('Write the report')).toBeInTheDocument();
    expect(screen.getByText('Some notes')).toBeInTheDocument();
    expect(screen.getByText('Policy')).toBeInTheDocument();
    expect(screen.getByText('OM')).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText('Looks good')).toBeInTheDocument());
    expect(screen.queryByText('added to Policy')).not.toBeInTheDocument();
  });

  it('marks the task complete and closes', async () => {
    const onToggleComplete = jest.fn();
    const onClose = jest.fn();
    render(
      <MobileTaskDetailSheet
        task={task}
        onClose={onClose}
        onToggleComplete={onToggleComplete}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /mark complete/i }));
    expect(onToggleComplete).toHaveBeenCalledWith('task-1', 'integration-1', true);
    expect(onClose).toHaveBeenCalled();
  });

  it('submits a comment through the handler', async () => {
    const onAddComment = jest.fn().mockResolvedValue(undefined);
    render(
      <MobileTaskDetailSheet task={task} onClose={jest.fn()} onAddComment={onAddComment} />
    );

    fireEvent.change(screen.getByPlaceholderText('Write a comment...'), {
      target: { value: 'On it' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send comment/i }));

    await waitFor(() =>
      expect(onAddComment).toHaveBeenCalledWith('task-1', 'integration-1', 'On it')
    );
  });

  it('offers Delegate via the delegation section', async () => {
    const onDelegate = jest.fn();
    render(
      <MobileTaskDetailSheet task={task} onClose={jest.fn()} onDelegate={onDelegate} />
    );

    fireEvent.click(await screen.findByRole('button', { name: /delegate/i }));
    expect(onDelegate).toHaveBeenCalledWith(task);
  });
});
