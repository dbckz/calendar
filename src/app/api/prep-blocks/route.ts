import { NextRequest, NextResponse } from 'next/server';
import { getPrepBlocks } from '@/lib/user-data-storage';

const LONDON_TZ = 'Europe/London';

// Format an absolute instant as its yyyy-MM-dd calendar date in Europe/London.
// PrepBlock.meetingStart is a full ISO timestamp, so the meeting's *day* depends
// on the London wall-clock date of that instant — not on the server's own
// timezone or on a naive substring of the ISO string.
function londonDate(instant: Date): string {
  // en-CA renders as yyyy-MM-dd, which is exactly the shape we want.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: LONDON_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

// GET /api/prep-blocks - Meeting-prep blocks relevant to a given day.
// Query params:
//   - date: yyyy-MM-dd (defaults to today in Europe/London)
// Response:
//   { date, prepBlocksToday, prepBlocksForMeetingsOn }
// where `prepBlocksToday` are the not-yet-done blocks scheduled on `date`
// (done blocks already happened and must not be re-briefed), and
// `prepBlocksForMeetingsOn` are blocks preparing for a meeting whose day is
// `date` (kept unfiltered so the day-of-update flow knows prep occurred).
// A block can appear in both when its prep day equals its meeting day.
export async function GET(request: NextRequest) {
  const dateParam = request.nextUrl.searchParams.get('date');
  const date = dateParam ?? londonDate(new Date());

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: `Invalid date "${date}". Use yyyy-MM-dd (e.g. ${londonDate(new Date())}).` },
      { status: 400 }
    );
  }

  try {
    const prepBlocks = await getPrepBlocks();

    const prepBlocksToday = prepBlocks.filter(block => block.date === date && !block.done);
    const prepBlocksForMeetingsOn = prepBlocks.filter(
      block => londonDate(new Date(block.meetingStart)) === date
    );

    return NextResponse.json({ date, prepBlocksToday, prepBlocksForMeetingsOn });
  } catch (error) {
    console.error('Error fetching prep blocks:', error);
    return NextResponse.json({ error: 'Failed to fetch prep blocks' }, { status: 500 });
  }
}
