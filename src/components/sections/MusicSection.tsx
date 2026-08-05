'use client';

import { SectionGoals } from '@/components/goals/SectionGoals';

// Goals-only for now, by design — the Music section's bespoke content is still
// to be specified (see TODO.md). The section exists so music goals can be set
// and reflected on alongside everything else in the meantime.
export function MusicSection() {
  return (
    <SectionGoals
      sectionId="music"
      emptyHint="Music is goals-only for now. Set a monthly or quarterly music goal here; the rest of this section is still to be designed."
    />
  );
}
