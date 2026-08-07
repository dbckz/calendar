import { NextRequest, NextResponse } from 'next/server';

import { getWellbeingDays, saveWellbeingDay } from '@/lib/storage/wellbeing';

// GET /api/wellbeing/days?from=&to= — the logged days in the range, oldest first.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const days = await getWellbeingDays(
      searchParams.get('from') ?? undefined,
      searchParams.get('to') ?? undefined
    );
    return NextResponse.json({ days });
  } catch (error) {
    console.error('Error listing wellbeing days:', error);
    return NextResponse.json({ error: 'Failed to load wellbeing days' }, { status: 500 });
  }
}

// POST /api/wellbeing/days — upsert one day's habit answers and notes. Written
// by the daily review. Habits are merged by id, so a partial answer never wipes
// one already recorded for that day.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const day = await saveWellbeingDay({
      date: body.date,
      habits: Array.isArray(body.habits) ? body.habits : [],
      notes: body.notes,
    });
    return NextResponse.json({ day });
  } catch (error) {
    // A missing skip reason or an unknown habit is the caller's fault and
    // carries an actionable message.
    const message = error instanceof Error ? error.message : 'Failed to save the day';
    console.error('Error saving wellbeing day:', error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
