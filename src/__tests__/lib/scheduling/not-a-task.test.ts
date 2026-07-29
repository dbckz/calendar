import { isNotTaskLikeTitle, normalizeReviewTitleKey } from '@/lib/scheduling/not-a-task';

describe('normalizeReviewTitleKey', () => {
  it('drops a leading emoji, lowercases and collapses whitespace', () => {
    expect(normalizeReviewTitleKey('⏰ WAKE')).toBe('wake');
    expect(normalizeReviewTitleKey('  Meet   Corinna ')).toBe('meet corinna');
    expect(normalizeReviewTitleKey('Sophie')).toBe('sophie');
  });
});

describe('isNotTaskLikeTitle', () => {
  it('excludes the markers Dave was being asked to mark done', () => {
    // Straight from a real review: none of these is work with an outcome.
    expect(isNotTaskLikeTitle('WAKE')).toBe(true);
    expect(isNotTaskLikeTitle('MPs - gratitude')).toBe(true);
  });

  it('excludes personal routines, appointments and time away', () => {
    for (const title of [
      'Morning gratitude',
      'Journalling',
      'Dentist',
      'Haircut',
      'School run',
      'Annual leave',
    ]) {
      expect(isNotTaskLikeTitle(title)).toBe(true);
    }
  });

  it('excludes rituals and personal-like titles however they are typed', () => {
    expect(isNotTaskLikeTitle('Emails')).toBe(true);
    expect(isNotTaskLikeTitle('🏋️ Exercise')).toBe(true);
    expect(isNotTaskLikeTitle('🚲 Cycle to footy')).toBe(true);
  });

  it('excludes the emoji prefixes Dave uses for non-work, plus placeholder holds', () => {
    // Straight from his own calendar conventions.
    for (const title of [
      '🏋️ Pull + Core',
      '🧺 DRY CLEANER',
      '🧳 Pack',
      '🎵 Music night',
      '⏰ WAKE',
      '🙏 MPs - gratitude',
      'HOLD: RxC OM IFPIM / Fundraising Strategy',
    ]) {
      expect(isNotTaskLikeTitle(title)).toBe(true);
    }
  });

  it('keeps meetings, calls, 1:1s and catch-ups — the manual dismissal handles the rest', () => {
    // Loosened deliberately: each of these can be work Dave wants to record, so
    // they must now reach the review (isNotTaskLikeTitle === false).
    for (const title of [
      'Meet Corinna',
      'Call Corinna',
      'Catch-up with Irina',
      '1:1 Sam',
      'Coffee with Rob',
      '📞 Catch up with Curtis + Gary', // 📞 removed from the emoji list
      '📞 Tapestry Technical Standup (PM — APAC)',
      'Corinna?', // tentative-plan rule removed
      'Earlsfield?',
      'Team dinner', // meal/social terms that can be work no longer filtered
      'Drinks with the board',
    ]) {
      expect(isNotTaskLikeTitle(title)).toBe(false);
    }
  });

  it('keeps meeting prep, whose titles are meeting-shaped by definition', () => {
    // Prep IS work to tick off — the social-shape rules must never catch it.
    expect(isNotTaskLikeTitle('📖 Prep: 1:1 Dave & Lacey')).toBe(false);
    expect(isNotTaskLikeTitle('Prep: Catch up with Curtis')).toBe(false);
  });

  it('keeps real work, including titles that merely brush a term', () => {
    for (const title of [
      'Draft memo',
      'Write the partnerships strategy',
      'Email triage',
      'Prep slide deck for strategic partnerships role',
      'Meeting prep',
      'Review Subha meeting notes',
      'Book the venue for the team offsite',
    ]) {
      expect(isNotTaskLikeTitle(title)).toBe(false);
    }
  });

  it('treats an empty title as not a task', () => {
    expect(isNotTaskLikeTitle('')).toBe(true);
    expect(isNotTaskLikeTitle('   ')).toBe(true);
  });
});
