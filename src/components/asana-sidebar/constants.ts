import { AsanaDateFilter, AsanaSortField, AsanaGroupBy } from '@/types';

export const DATE_FILTER_OPTIONS: { value: AsanaDateFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This week' },
  { value: 'no_date', label: 'No date' },
];

export const SORT_OPTIONS: { value: AsanaSortField; label: string }[] = [
  { value: 'dueOn', label: 'Due date' },
  { value: 'startOn', label: 'Start date' },
  { value: 'createdAt', label: 'Created' },
  { value: 'title', label: 'Title' },
  { value: 'type', label: 'Type' },
];

export const GROUP_BY_OPTIONS: { value: AsanaGroupBy; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'type', label: 'Type' },
];
