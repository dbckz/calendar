'use client';

import { ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { NotificationBell } from '@/components/NotificationBell';
import { CalendarEvent } from '@/types';

export interface MobileColorScheme {
  name: string;
  headerBg: string;
  headerBorder: string;
  subText: string;
}

export const MOBILE_COLOR_SCHEMES: MobileColorScheme[] = [
  {
    name: 'Slate',
    headerBg: 'bg-gradient-to-r from-slate-600 to-slate-700',
    headerBorder: 'border-slate-500/40',
    subText: 'text-slate-100/80',
  },
  {
    name: 'Ocean',
    headerBg: 'bg-gradient-to-r from-blue-500 to-blue-600',
    headerBorder: 'border-blue-300/40',
    subText: 'text-blue-50/80',
  },
  {
    name: 'Forest',
    headerBg: 'bg-gradient-to-r from-emerald-500 to-emerald-600',
    headerBorder: 'border-emerald-300/40',
    subText: 'text-emerald-50/80',
  },
  {
    name: 'Lavender',
    headerBg: 'bg-gradient-to-r from-violet-500 to-violet-600',
    headerBorder: 'border-violet-300/40',
    subText: 'text-violet-50/80',
  },
  {
    name: 'Rose',
    headerBg: 'bg-gradient-to-r from-rose-500 to-rose-600',
    headerBorder: 'border-rose-300/40',
    subText: 'text-rose-50/80',
  },
  {
    name: 'Amber',
    headerBg: 'bg-gradient-to-r from-amber-500 to-amber-600',
    headerBorder: 'border-amber-300/40',
    subText: 'text-amber-50/90',
  },
];

export function MobileHeader({
  colorScheme,
  subtitle,
  googleEvents,
  onRefresh,
  isRefreshing,
  children,
}: {
  colorScheme: MobileColorScheme;
  subtitle: string;
  // For the notification bell's upcoming-event alerts.
  googleEvents: CalendarEvent[];
  onRefresh: () => void;
  isRefreshing: boolean;
  // Extra header rows (e.g. the Day tab's date navigator + status chips).
  children?: ReactNode;
}) {
  return (
    <header className={`sticky top-0 z-20 border-b text-white ${colorScheme.headerBg} ${colorScheme.headerBorder}`}>
      <div className="mx-auto max-w-xl px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className={`text-xs font-medium uppercase tracking-wide ${colorScheme.subText}`}>{subtitle}</p>
            <h1 className="truncate text-xl font-semibold">Dave&apos;s Calendar</h1>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <NotificationBell
              events={googleEvents}
              className="flex h-10 w-10 items-center justify-center rounded-md bg-white/10 text-white transition-colors hover:bg-white/20"
              iconClassName="h-5 w-5"
            />
            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="flex h-10 w-10 items-center justify-center rounded-md bg-white/10 text-white transition-colors hover:bg-white/20 disabled:opacity-60"
              aria-label="Refresh"
            >
              <RefreshCw className={`h-5 w-5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
        {children}
      </div>
    </header>
  );
}
