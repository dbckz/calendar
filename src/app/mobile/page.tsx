import type { Metadata } from 'next';
import { MobileShell } from './MobileShell';

export const metadata: Metadata = {
  title: 'Mobile Planner',
  description: 'Mobile companion for Dave\'s Command Center',
};

export default function MobilePage() {
  return <MobileShell />;
}
