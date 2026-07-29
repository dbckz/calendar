'use client';

import { forwardRef } from 'react';
import { format } from 'date-fns';

export const NowIndicator = forwardRef<HTMLDivElement, { now: Date }>(function NowIndicator({ now }, ref) {
  return (
    <div ref={ref} className="flex items-center gap-2 px-1" aria-label="Current time">
      <span className="text-xs font-semibold text-red-500 tabular-nums">
        {format(now, 'HH:mm')}
      </span>
      <div className="h-2 w-2 rounded-full bg-red-500" />
      <div className="h-0.5 flex-1 bg-red-500" />
    </div>
  );
});
