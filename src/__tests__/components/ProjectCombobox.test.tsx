/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProjectCombobox } from '@/components/dashboard/plan-week/ProjectCombobox';

const PROJECTS = [
  { gid: 'p1', name: 'Search Engine' },
  { gid: 'p2', name: 'Settlements' },
  { gid: 'p3', name: 'Marketing' },
];

describe('ProjectCombobox', () => {
  it('shows the selected project name when closed', () => {
    render(<ProjectCombobox value="p2" onChange={jest.fn()} projects={PROJECTS} />);
    expect(screen.getByRole('combobox')).toHaveValue('Settlements');
  });

  it('opens the full list on focus and filters as the user types', () => {
    render(<ProjectCombobox value="" onChange={jest.fn()} projects={PROJECTS} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    // Full list visible.
    expect(screen.getByRole('option', { name: 'Search Engine' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Marketing' })).toBeInTheDocument();
    // Typing "se" narrows to the two case-insensitive substring matches.
    fireEvent.change(input, { target: { value: 'se' } });
    expect(screen.getByRole('option', { name: 'Search Engine' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Settlements' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Marketing' })).not.toBeInTheDocument();
  });

  it('selects an option on click and calls onChange with its gid', () => {
    const onChange = jest.fn();
    render(<ProjectCombobox value="" onChange={onChange} projects={PROJECTS} />);
    fireEvent.focus(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: 'Marketing' }));
    expect(onChange).toHaveBeenCalledWith('p3');
  });

  it('supports arrow-key navigation and Enter to select', () => {
    const onChange = jest.fn();
    render(<ProjectCombobox value="" onChange={onChange} projects={PROJECTS} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    // Highlight starts at index 0 (Search Engine); one ArrowDown → Settlements.
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('p2');
  });

  it('closes on Escape without selecting', () => {
    const onChange = jest.fn();
    render(<ProjectCombobox value="" onChange={onChange} projects={PROJECTS} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('offers a clear entry when clearLabel is set', () => {
    const onChange = jest.fn();
    render(
      <ProjectCombobox value="p1" onChange={onChange} projects={PROJECTS} clearLabel="No project" />
    );
    fireEvent.focus(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: 'No project' }));
    expect(onChange).toHaveBeenCalledWith('');
  });
});
