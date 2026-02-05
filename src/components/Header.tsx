'use client';

import { format, addDays, subDays } from 'date-fns';
import { Calendar, Settings, RefreshCw, Star } from 'lucide-react';
import Link from 'next/link';

type DayTab = 'yesterday' | 'today' | 'tomorrow';

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

interface HeaderProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  onRefresh: () => void;
  isLoading?: boolean;
  colorScheme?: ColorScheme;
  timeWorkedByIntegration?: Record<string, number>;
  integrations?: Integration[];
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

export function Header({ selectedDate, onDateChange, onRefresh, isLoading, colorScheme, timeWorkedByIntegration, integrations }: HeaderProps) {
  const today = new Date();
  const yesterday = subDays(today, 1);
  const tomorrow = addDays(today, 1);

  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
  const yesterdayStr = format(yesterday, 'yyyy-MM-dd');
  const tomorrowStr = format(tomorrow, 'yyyy-MM-dd');

  const getActiveTab = (): DayTab => {
    if (selectedDateStr === yesterdayStr) return 'yesterday';
    if (selectedDateStr === tomorrowStr) return 'tomorrow';
    return 'today';
  };

  const activeTab = getActiveTab();

  const handleTabClick = (tab: DayTab) => {
    switch (tab) {
      case 'yesterday':
        onDateChange(yesterday);
        break;
      case 'today':
        onDateChange(today);
        break;
      case 'tomorrow':
        onDateChange(tomorrow);
        break;
    }
  };

  return (
    <header className={`${colorScheme?.headerBg || 'bg-white'} border-b border-gray-200 sticky top-0 z-10`}>
      <div className="px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Calendar className={`w-6 h-6 ${colorScheme ? 'text-white' : 'text-blue-600'}`} />
              <h1 className={`text-xl font-semibold ${colorScheme?.headerText || 'text-gray-900'}`}>Dave&apos;s Daily Planner</h1>
            </div>
          </div>

          {/* Day tabs */}
          <div className={`flex ${colorScheme ? 'bg-white/20' : 'bg-gray-100'} rounded-lg p-1`}>
            <button
              onClick={() => handleTabClick('yesterday')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'yesterday'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : colorScheme ? 'text-white/80 hover:text-white' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Yesterday
            </button>
            <button
              onClick={() => handleTabClick('today')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'today'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : colorScheme ? 'text-white/80 hover:text-white' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => handleTabClick('tomorrow')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'tomorrow'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : colorScheme ? 'text-white/80 hover:text-white' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Tomorrow
            </button>
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
