'use client';

import { format, addDays, subDays, isSameDay } from 'date-fns';
import { Settings, RefreshCw, Star, ChevronLeft, ChevronRight, LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { CalendarEvent } from '@/types';
import { NotificationBell } from './NotificationBell';

interface ColorScheme {
  headerBg: string;
  headerText: string;
  sidebarHeaderBg: string;
  sidebarHeaderText: string;
  mainBg: string;
}

interface Integration {
  id: string;
  name: string;
}

interface Tab {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface HeaderProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  onRefresh: () => void;
  isLoading?: boolean;
  colorScheme?: ColorScheme;
  timeWorkedByIntegration?: Record<string, number>;
  integrations?: Integration[];
  activeTab?: string;
  tabs?: Tab[];
  onTabChange?: (tabId: string) => void;
  notificationEvents?: CalendarEvent[];
}

function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${Math.round(minutes)}m`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (mins === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${mins}m`;
}

function getDayLabel(date: Date): string {
  const today = new Date();
  if (isSameDay(date, today)) return 'Today';
  if (isSameDay(date, subDays(today, 1))) return 'Yesterday';
  if (isSameDay(date, addDays(today, 1))) return 'Tomorrow';
  return format(date, 'EEE, MMM d');
}

export function Header({ selectedDate, onDateChange, onRefresh, isLoading, colorScheme, timeWorkedByIntegration, integrations, activeTab, tabs, onTabChange, notificationEvents }: HeaderProps) {
  const prevDay = subDays(selectedDate, 1);
  const nextDay = addDays(selectedDate, 1);

  const inactiveClass = colorScheme ? 'text-white/80 hover:text-white' : 'text-gray-600 hover:text-gray-900';
  const arrowClass = `p-1.5 rounded-md transition-colors ${colorScheme ? 'text-white/70 hover:text-white hover:bg-white/10' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-200'}`;

  return (
    <header className={`${colorScheme?.headerBg || 'bg-white'} border-b border-gray-200 sticky top-0 z-10`}>
      <div className="px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {tabs && tabs.length > 0 ? (
              <div className={`flex items-center ${colorScheme ? 'bg-white/15' : 'bg-gray-100'} rounded-lg p-1`}>
                {tabs.map(tab => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => onTabChange?.(tab.id)}
                      className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                        isActive
                          ? 'bg-white text-gray-900 shadow-sm'
                          : colorScheme
                            ? 'text-white/80 hover:text-white hover:bg-white/10'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            ) : (
              <h1 className={`text-xl font-semibold ${colorScheme?.headerText || 'text-gray-900'}`}>Dave&apos;s Daily Planner</h1>
            )}
          </div>

          {/* Day navigation */}
          <div className="relative flex items-center">
            <div className={`flex items-center gap-1 ${colorScheme ? 'bg-white/20' : 'bg-gray-100'} rounded-lg p-1`}>
              <button
                onClick={() => onDateChange(prevDay)}
                className={arrowClass}
                aria-label="Previous day"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => onDateChange(prevDay)}
                className={`w-28 py-2 text-sm font-medium rounded-md transition-colors text-center ${inactiveClass}`}
              >
                {getDayLabel(prevDay)}
              </button>
              <button
                className="w-28 py-2 text-sm font-medium rounded-md transition-colors text-center bg-white text-gray-900 shadow-sm"
              >
                {getDayLabel(selectedDate)}
              </button>
              <button
                onClick={() => onDateChange(nextDay)}
                className={`w-28 py-2 text-sm font-medium rounded-md transition-colors text-center ${inactiveClass}`}
              >
                {getDayLabel(nextDay)}
              </button>
              <button
                onClick={() => onDateChange(nextDay)}
                className={arrowClass}
                aria-label="Next day"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            {!isSameDay(selectedDate, new Date()) && (
              <button
                onClick={() => onDateChange(new Date())}
                className={`absolute left-full ml-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  colorScheme ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Today
              </button>
            )}
          </div>

          {/* Time worked stats */}
          {integrations && integrations.length > 0 && (
            <div className="flex items-center gap-2">
              {integrations.map(integration => {
                const minutes = timeWorkedByIntegration?.[integration.id] || 0;
                if (minutes === 0) return null;
                return (
                  <div
                    key={integration.id}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium ${
                      colorScheme ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {integration.name}: {formatDuration(minutes)}
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-2">
            {notificationEvents && (
              <NotificationBell events={notificationEvents} onColoredBg={!!colorScheme} />
            )}
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className={`p-2 ${colorScheme ? 'hover:bg-white/20 text-white' : 'hover:bg-gray-100'} rounded-lg transition-colors disabled:opacity-50`}
              aria-label="Refresh"
            >
              <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <Link
              href="/frequent-tasks"
              className={`p-2 ${colorScheme ? 'hover:bg-white/20 text-white' : 'hover:bg-gray-100 text-amber-500'} rounded-lg transition-colors`}
              aria-label="Frequent Tasks"
            >
              <Star className="w-5 h-5" />
            </Link>
            <Link
              href="/settings"
              className={`p-2 ${colorScheme ? 'hover:bg-white/20 text-white' : 'hover:bg-gray-100'} rounded-lg transition-colors`}
              aria-label="Settings"
            >
              <Settings className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
