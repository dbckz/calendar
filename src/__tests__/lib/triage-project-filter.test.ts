import {
  isProjectInTriageCatalogue,
  DEFAULT_TRIAGE_PROJECT_FILTER,
  type TriageProjectFilterConfig,
} from '@/lib/triage-project-filter';

const NOW = new Date('2026-07-26T12:00:00Z');

function config(overrides: Partial<TriageProjectFilterConfig> = {}): TriageProjectFilterConfig {
  return { ...DEFAULT_TRIAGE_PROJECT_FILTER, ...overrides };
}

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

describe('isProjectInTriageCatalogue', () => {
  it('includes a project modified within the activity window', () => {
    expect(
      isProjectInTriageCatalogue({ gid: 'p1', modifiedAt: daysAgo(30) }, config(), NOW)
    ).toBe(true);
  });

  it('excludes a project modified before the activity window', () => {
    expect(
      isProjectInTriageCatalogue({ gid: 'p1', modifiedAt: daysAgo(120) }, config(), NOW)
    ).toBe(false);
  });

  it('always includes a project on the include list even if dormant', () => {
    expect(
      isProjectInTriageCatalogue(
        { gid: 'p1', modifiedAt: daysAgo(365) },
        config({ includeGids: ['p1'] }),
        NOW
      )
    ).toBe(true);
  });

  it('always excludes a project on the exclude list even if active', () => {
    expect(
      isProjectInTriageCatalogue(
        { gid: 'p1', modifiedAt: daysAgo(1) },
        config({ excludeGids: ['p1'] }),
        NOW
      )
    ).toBe(false);
  });

  it('lets exclude win over include for the same gid', () => {
    expect(
      isProjectInTriageCatalogue(
        { gid: 'p1', modifiedAt: daysAgo(1) },
        config({ includeGids: ['p1'], excludeGids: ['p1'] }),
        NOW
      )
    ).toBe(false);
  });

  it('fails open when modified_at is missing', () => {
    expect(isProjectInTriageCatalogue({ gid: 'p1' }, config(), NOW)).toBe(true);
  });

  it('fails open when modified_at is unparsable', () => {
    expect(
      isProjectInTriageCatalogue({ gid: 'p1', modifiedAt: 'not-a-date' }, config(), NOW)
    ).toBe(true);
  });

  it('honours a custom activeDays window', () => {
    const cfg = config({ activeDays: 7 });
    expect(isProjectInTriageCatalogue({ gid: 'p1', modifiedAt: daysAgo(3) }, cfg, NOW)).toBe(true);
    expect(isProjectInTriageCatalogue({ gid: 'p1', modifiedAt: daysAgo(10) }, cfg, NOW)).toBe(false);
  });
});
