/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { AiClaimsModal } from '@/components/dashboard/AiClaimsModal';

jest.mock('@/lib/api', () => ({
  api: { applyAiVerdicts: jest.fn() },
}));

import { api } from '@/lib/api';

const CLAIMS = [
  { gid: 'g1', integrationId: 'ai1', title: 'Draft the summary', integrationName: 'OM', dueOn: '2026-07-24' },
  { gid: 'g2', integrationId: 'ai2', title: 'Chase the invoice', integrationName: 'DBC' },
];

beforeEach(() => {
  jest.clearAllMocks();
  (api.applyAiVerdicts as jest.Mock).mockResolvedValue({ accepted: 0, rejected: 0 });
});

describe('AiClaimsModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <AiClaimsModal isOpen={false} claims={CLAIMS} onClose={jest.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('lists each claim with its source pill and due date, all ticked by default', () => {
    render(<AiClaimsModal isOpen claims={CLAIMS} onClose={jest.fn()} />);

    expect(screen.getByText('Draft the summary')).toBeInTheDocument();
    expect(screen.getByText('OM')).toBeInTheDocument();
    expect(screen.getByText('24 Jul')).toBeInTheDocument();
    expect(screen.getByText('DBC')).toBeInTheDocument();
    expect(screen.getByText('No due date')).toBeInTheDocument();

    for (const box of screen.getAllByRole('checkbox')) {
      expect(box).toBeChecked();
    }
  });

  it('confirm accepts the ticked claims and rejects the unticked ones', async () => {
    const onClose = jest.fn();
    const onApplied = jest.fn();
    render(<AiClaimsModal isOpen claims={CLAIMS} onClose={onClose} onApplied={onApplied} />);

    await act(async () => {
      fireEvent.click(screen.getByLabelText('AI-runnable: Chase the invoice'));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    });

    await waitFor(() => expect(api.applyAiVerdicts).toHaveBeenCalled());
    expect(api.applyAiVerdicts).toHaveBeenCalledWith(
      [{ gid: 'g1', integrationId: 'ai1' }],
      [{ gid: 'g2', integrationId: 'ai2' }]
    );
    expect(onApplied).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('cancel applies nothing', async () => {
    const onClose = jest.fn();
    render(<AiClaimsModal isOpen claims={CLAIMS} onClose={onClose} onApplied={jest.fn()} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    });

    expect(api.applyAiVerdicts).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('shows an empty state — and no Confirm — when there are no new claims', () => {
    render(<AiClaimsModal isOpen claims={[]} onClose={jest.fn()} />);

    expect(screen.getByText('No new AI-runnable tasks found.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
  });
});
