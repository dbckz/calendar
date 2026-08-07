'use client';

import { HabitAnalysisTab } from './wellbeing/HabitAnalysisTab';
import { ExperimentsTab } from './wellbeing/ExperimentsTab';

interface WellbeingSectionProps {
  subTab: string;
}

export function WellbeingSection({ subTab }: WellbeingSectionProps) {
  if (subTab === 'experiments') return <ExperimentsTab />;
  return <HabitAnalysisTab />;
}
