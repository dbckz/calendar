/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { RemindersStep } from '@/components/dashboard/plan-week/RemindersStep';
import type { ReminderTriageRow } from '@/components/dashboard/plan-week/types';
import type { AsanaProject } from '@/types';

const INTEGRATIONS = [
  { id: 'om-int', name: 'OM' },
  { id: 'dbc-int', name: 'DBC' },
];

const PROJECTS: AsanaProject[] = [
  { gid: 'p1', name: 'Policy', integrationId: 'om-int', integrationName: 'OM' },
  { gid: 'p2', name: 'Client work', integrationId: 'dbc-int', integrationName: 'DBC' },
];

const TYPE_INFO = new Map([
  ['om-int', { fieldGid: 'f1', enumOptions: new Map([['Bug', 'o1'], ['Feature', 'o2']]) }],
]);

function row(overrides: Partial<ReminderTriageRow> = {}): ReminderTriageRow {
  return {
    id: 'r1',
    name: 'Call the accountant',
    notes: '',
    action: 'keep',
    integrationId: 'om-int',
    projectGid: '',
    taskType: '',
    dueOn: '',
    ...overrides,
  };
}

describe('RemindersStep', () => {
  it('shows a loading message while suggestions are pending', () => {
    render(
      <RemindersStep
        rows={null}
        setRows={jest.fn()}
        loading
        error={null}
        integrations={INTEGRATIONS}
        projects={PROJECTS}
        typeFieldInfoByIntegration={TYPE_INFO}
      />,
    );
    expect(screen.getByText(/suggesting where each could go/i)).toBeInTheDocument();
  });

  it('renders a determinate progress bar while chunks are in flight', () => {
    render(
      <RemindersStep
        rows={null}
        setRows={jest.fn()}
        loading
        error={null}
        progress={{ done: 2, total: 5 }}
        integrations={INTEGRATIONS}
        projects={PROJECTS}
        typeFieldInfoByIntegration={TYPE_INFO}
      />,
    );
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '40');
    expect(screen.getByText('2 of 5 batches')).toBeInTheDocument();
  });

  it('renders all four action choices per reminder and hides destination fields until convert', () => {
    render(
      <RemindersStep
        rows={[row()]}
        setRows={jest.fn()}
        loading={false}
        error={null}
        integrations={INTEGRATIONS}
        projects={PROJECTS}
        typeFieldInfoByIntegration={TYPE_INFO}
      />,
    );
    expect(screen.getByText('Keep as reminder')).toBeInTheDocument();
    expect(screen.getByText('Convert to Asana task')).toBeInTheDocument();
    expect(screen.getByText('Mark done')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
    // Default action is "keep" → no destination editor yet.
    expect(screen.queryByLabelText('Workspace')).not.toBeInTheDocument();
    expect(screen.getByText(/Nothing selected to change/i)).toBeInTheDocument();
  });

  it('selecting convert flips the row action via setRows', () => {
    const setRows = jest.fn();
    render(
      <RemindersStep
        rows={[row()]}
        setRows={setRows}
        loading={false}
        error={null}
        integrations={INTEGRATIONS}
        projects={PROJECTS}
        typeFieldInfoByIntegration={TYPE_INFO}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: /Convert to Asana task/i }));
    expect(setRows).toHaveBeenCalled();
  });

  it('selecting Mark done / Delete sets the row action and shows no destination editor', () => {
    const setRows = jest.fn();
    const { rerender } = render(
      <RemindersStep
        rows={[row()]}
        setRows={setRows}
        loading={false}
        error={null}
        integrations={INTEGRATIONS}
        projects={PROJECTS}
        typeFieldInfoByIntegration={TYPE_INFO}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: /Mark done/i }));
    fireEvent.click(screen.getByRole('radio', { name: /Delete/i }));
    expect(setRows).toHaveBeenCalledTimes(2);

    // A row set to "delete" shows no destination editor and reflects in the summary.
    rerender(
      <RemindersStep
        rows={[row({ action: 'delete' })]}
        setRows={setRows}
        loading={false}
        error={null}
        integrations={INTEGRATIONS}
        projects={PROJECTS}
        typeFieldInfoByIntegration={TYPE_INFO}
      />,
    );
    expect(screen.queryByLabelText('Workspace')).not.toBeInTheDocument();
    expect(screen.getByText(/1 deleted/i)).toBeInTheDocument();
  });

  it('updates selection synchronously and makes NO network call, even with 40 rows', () => {
    // A radio click must be pure local state — writes are batched at confirm.
    const originalFetch = global.fetch;
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    try {
      const setRows = jest.fn();
      const manyRows = Array.from({ length: 40 }, (_, i) => row({ id: `r${i}`, name: `Reminder ${i}` }));
      render(
        <RemindersStep
          rows={manyRows}
          setRows={setRows}
          loading={false}
          error={null}
          integrations={INTEGRATIONS}
          projects={PROJECTS}
          typeFieldInfoByIntegration={TYPE_INFO}
        />,
      );
      const doneRadios = screen.getAllByRole('radio', { name: /Mark done/i });
      expect(doneRadios).toHaveLength(40);

      // The handler runs synchronously inside the click (no await), so setRows is
      // already called by the time fireEvent returns — that is the "instant" path.
      fireEvent.click(doneRadios[20]);
      expect(setRows).toHaveBeenCalledTimes(1);
      expect(setRows).toHaveBeenCalledWith(expect.any(Function));
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('shows workspace/project/type/due editors for a converting row', () => {
    render(
      <RemindersStep
        rows={[row({ action: 'convert' })]}
        setRows={jest.fn()}
        loading={false}
        error={null}
        integrations={INTEGRATIONS}
        projects={PROJECTS}
        typeFieldInfoByIntegration={TYPE_INFO}
      />,
    );
    expect(screen.getByLabelText('Workspace')).toBeInTheDocument();
    expect(screen.getByLabelText('Project')).toBeInTheDocument();
    expect(screen.getByLabelText('Type')).toBeInTheDocument();
    expect(screen.getByLabelText('Due date')).toBeInTheDocument();
    // OM has Bug/Feature type labels available.
    expect(screen.getByRole('option', { name: 'Feature' })).toBeInTheDocument();
    // The project picker is a combobox; open it to reveal the option list.
    fireEvent.focus(screen.getByLabelText('Project'));
    // Only OM's project is offered for an OM-integration row.
    expect(screen.getByRole('option', { name: 'Policy' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Client work' })).not.toBeInTheDocument();
  });

  it('surfaces the classifier-unavailable note', () => {
    render(
      <RemindersStep
        rows={[row()]}
        setRows={jest.fn()}
        loading={false}
        error="boom"
        integrations={INTEGRATIONS}
        projects={PROJECTS}
        typeFieldInfoByIntegration={TYPE_INFO}
      />,
    );
    expect(screen.getByText(/AI suggestions weren't available/i)).toBeInTheDocument();
  });
});
