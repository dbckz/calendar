import { NextRequest, NextResponse } from 'next/server';
import { addDays, startOfWeek } from 'date-fns';

import { findCalendarReminders } from '@/lib/scheduling/calendar-reminders';
import { fetchEventsForDays } from '@/lib/scheduling/gather';
import { getEnabledGoogleIntegrations } from '@/lib/integration-storage';

// GET /api/scheduling/calendar-reminders?weekStart=yyyy-MM-dd
//
// The standing reminders parked on the calendar for the week — daily recurring
// events whose job is to nag rather than to occupy time. Offered in the
// plan-my-week wizard so one can become a real, scheduled task instead.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const weekStartParam = searchParams.get('weekStart');
    const weekStart = weekStartParam
      ? new Date(`${weekStartParam}T00:00:00`)
      : startOfWeek(new Date(), { weekStartsOn: 1 });

    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const { events } = await fetchEventsForDays(await getEnabledGoogleIntegrations(), days);

    return NextResponse.json({ candidates: findCalendarReminders(events) });
  } catch (error) {
    console.error('Error finding calendar reminders:', error);
    // Advisory: the wizard must still open if this fails.
    return NextResponse.json({ candidates: [] });
  }
}
