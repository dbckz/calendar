/**
 * Tests for the shared event-title builder (emoji conventions + prep parsing).
 */
import {
  categoryBlockTitle,
  categoryEmoji,
  eventTitleForBlock,
  isPrepTitle,
  prepMeetingTitleFromEvent,
  prepTitle,
  reservedBlockTitle,
  startsWithEmoji,
  taskBlockTitle,
} from '@/lib/scheduling/event-titles';
import type { ProposedBlock } from '@/lib/scheduling/types';

describe('categoryEmoji', () => {
  it('maps each known category to its emoji (whitespace-robust)', () => {
    expect(categoryEmoji('Writing/Deep Work')).toBe('✍️');
    expect(categoryEmoji('Writing / Deep Work')).toBe('✍️'); // spaced slash
    expect(categoryEmoji('Blogs')).toBe('📝');
    expect(categoryEmoji('Batch')).toBe('📦');
    expect(categoryEmoji('Engagement/Outreach')).toBe('🤝');
    expect(categoryEmoji('General Todos')).toBe('✅');
    expect(categoryEmoji('Meeting prep')).toBe('📖');
  });

  it('falls back to the unknown emoji for unmapped categories', () => {
    expect(categoryEmoji('Something else')).toBe('🗂️');
  });
});

describe('startsWithEmoji', () => {
  it('detects a leading pictographic emoji', () => {
    expect(startsWithEmoji('🎯 Focus time')).toBe(true);
    expect(startsWithEmoji('📖 Prep: X')).toBe(true);
  });
  it('is false for plain text', () => {
    expect(startsWithEmoji('Write the report')).toBe(false);
    expect(startsWithEmoji('1:1 with Alice')).toBe(false);
  });
});

describe('taskBlockTitle', () => {
  it('prefixes the category emoji for a plain task title', () => {
    expect(taskBlockTitle('Write the report', 'Blogs')).toBe('📝 Write the report');
  });
  it('does not double-prefix a task title that already leads with an emoji', () => {
    expect(taskBlockTitle('🎯 Focus time: deep work', 'Writing/Deep Work')).toBe(
      '🎯 Focus time: deep work'
    );
  });
});

describe('categoryBlockTitle / reservedBlockTitle', () => {
  it('emoji-prefixes a grouped block title', () => {
    expect(categoryBlockTitle('Engagement/Outreach')).toBe('🤝 Engagement/Outreach');
  });
  it('emoji-prefixes a reserved block title', () => {
    expect(reservedBlockTitle('Writing/Deep Work')).toBe('✍️ Writing/Deep Work block');
  });
});

describe('prep title helpers', () => {
  it('builds the emoji prep title', () => {
    expect(prepTitle('Board sync')).toBe('📖 Prep: Board sync');
  });
  it('isPrepTitle recognises both legacy and emoji forms', () => {
    expect(isPrepTitle('Prep: Board sync')).toBe(true);
    expect(isPrepTitle('📖 Prep: Board sync')).toBe(true);
    expect(isPrepTitle('Board sync')).toBe(false);
    expect(isPrepTitle('📝 Write the report')).toBe(false);
  });
  it('prepMeetingTitleFromEvent strips either prefix', () => {
    expect(prepMeetingTitleFromEvent('Prep: Board sync')).toBe('Board sync');
    expect(prepMeetingTitleFromEvent('📖 Prep: Board sync')).toBe('Board sync');
    expect(prepMeetingTitleFromEvent('Board sync')).toBe('Board sync'); // unchanged
  });
});

describe('eventTitleForBlock', () => {
  const base: ProposedBlock = {
    id: 'b1',
    category: 'Blogs',
    date: '2026-07-15',
    start: '09:00',
    durationMinutes: 30,
    reason: 'r',
  };

  it('titles a single-task block with the category emoji', () => {
    const block: ProposedBlock = { ...base, kind: 'task', task: { title: 'Draft post' } };
    expect(eventTitleForBlock(block)).toBe('📝 Draft post');
  });

  it('keeps a task title that already leads with an emoji', () => {
    const block: ProposedBlock = { ...base, kind: 'task', task: { title: '🎯 Focus time' } };
    expect(eventTitleForBlock(block)).toBe('🎯 Focus time');
  });

  it('titles a grouped block with the category emoji', () => {
    const block: ProposedBlock = {
      ...base,
      category: 'Engagement/Outreach',
      kind: 'task',
      tasks: [{ title: 'A' }, { title: 'B' }],
    };
    expect(eventTitleForBlock(block)).toBe('🤝 Engagement/Outreach');
  });

  it('titles a reserved block (no task) with "<emoji> <category> block"', () => {
    const block: ProposedBlock = { ...base, category: 'Writing/Deep Work', kind: 'reserved' };
    expect(eventTitleForBlock(block)).toBe('✍️ Writing/Deep Work block');
  });

  it('titles a prep block "📖 Prep: <meeting>"', () => {
    const block: ProposedBlock = {
      ...base,
      category: 'Meeting prep',
      kind: 'prep',
      meeting: { eventId: 'e', title: 'Board sync', meetingStart: '2026-07-15T14:00:00.000Z' },
    };
    expect(eventTitleForBlock(block)).toBe('📖 Prep: Board sync');
  });

  it('passes a ritual title through unchanged (already emoji\'d)', () => {
    const block: ProposedBlock = { ...base, category: 'Lunch', kind: 'ritual', title: '🍽️ Lunch' };
    expect(eventTitleForBlock(block)).toBe('🍽️ Lunch');
  });
});
