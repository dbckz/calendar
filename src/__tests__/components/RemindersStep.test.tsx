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

  it('renders a keep/convert choice per reminder and hides destination fields until convert', () => {
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
    // Default action is "keep" → no destination editor yet.
    expect(screen.queryByLabelText('Workspace')).not.toBeInTheDocument();
    expect(screen.getByText(/Nothing selected to convert/i)).toBeInTheDocument();
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
