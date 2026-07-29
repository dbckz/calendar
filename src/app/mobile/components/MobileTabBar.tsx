'use client';

import { Bell, CalendarDays, LayoutDashboard } from 'lucide-react';

export type MobileTab = 'home' | 'day' | 'reminders';

const TABS: Array<{ id: MobileTab; label: string; Icon: typeof LayoutDashboard }> = [
  { id: 'home', label: 'Home', Icon: LayoutDashboard },
  { id: 'day', label: 'Day', Icon: CalendarDays },
  { id: 'reminders', label: 'Reminders', Icon: Bell },
];

export function MobileTabBar({
  activeTab,
  onTabChange,
  reminderCount = 0,
}: {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  reminderCount?: number;
}) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <div className="mx-auto flex h-14 max-w-xl items-stretch">
        {TABS.map(({ id, label, Icon }) => {
          const isActive = id === activeTab;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onTabChange(id)}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                isActive ? 'text-orange-600' : 'text-gray-500 active:text-gray-700'
              }`}
            >
              <span className="relative">
                <Icon className="h-5 w-5" />
                {id === 'reminders' && reminderCount > 0 && (
                  <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-semibold text-white">
                    {reminderCount > 9 ? '9+' : reminderCount}
                  </span>
                )}
              </span>
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
