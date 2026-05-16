import type { Metadata } from 'next';
import { MobilePlanner } from './MobilePlanner';

export const metadata: Metadata = {
  title: 'Mobile Planner',
  description: 'Read-only mobile view for Dave\'s Daily Planner',
};

export default function MobilePage() {
  return <MobilePlanner />;
}
