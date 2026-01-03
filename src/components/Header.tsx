'use client';

import { format, addDays, subDays } from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar, Settings, RefreshCw } from 'lucide-react';
import Link from 'next/link';

interface HeaderProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  onRefresh: () => void;
  isLoading?: boolean;
}

export function Header({ selectedDate, onDateChange, onRefresh, isLoading }: HeaderProps) {
  const goToPreviousDay = () => onDateChange(subDays(selectedDate, 1));
  const goToNextDay = () => onDateChange(addDays(selectedDate, 1));
  const goToToday = () => onDateChange(new Date());

  const isToday = format(selectedDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-6 h-6 text-blue-600" />
              <h1 className="text-xl font-semibold text-gray-900">Daily Planner</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={goToPreviousDay}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Previous day"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={goToToday}
                disabled={isToday}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  isToday
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Today
              </button>
              <span className="text-lg font-medium text-gray-900 min-w-[180px] text-center">
                {format(selectedDate, 'EEEE, MMM d, yyyy')}
              </span>
            </div>

            <button
              onClick={goToNextDay}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Next day"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
              aria-label="Refresh"
            >
              <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <Link
              href="/settings"
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
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
