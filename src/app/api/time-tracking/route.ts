import { NextRequest, NextResponse } from 'next/server';
import {
  getTimeTrackingData,
  recordDailyTime,
  getDailyRecord,
  getRecordsInRange,
  exportToCSV,
  exportEventsToCSV,
  IntegrationTimeRecord,
  EventTimeRecord,
} from '@/lib/time-tracking-storage';

// GET /api/time-tracking - Retrieve historical data
// Query params:
//   - date: specific date (YYYY-MM-DD)
//   - startDate & endDate: date range
//   - format: 'json' (default) or 'csv' or 'csv-events'
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const date = searchParams.get('date');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const format = searchParams.get('format') || 'json';

  try {
    let records;

    if (date) {
      const record = await getDailyRecord(date);
      records = record ? [record] : [];
    } else if (startDate && endDate) {
      records = await getRecordsInRange(startDate, endDate);
    } else {
      const data = await getTimeTrackingData();
      records = data.dailyRecords;
    }

    if (format === 'csv') {
      const csv = exportToCSV(records);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="time-tracking.csv"',
        },
      });
    }

    if (format === 'csv-events') {
      const csv = exportEventsToCSV(records);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="time-tracking-events.csv"',
        },
      });
    }

    return NextResponse.json({ records });
  } catch (error) {
    console.error('Error fetching time tracking data:', error);
    return NextResponse.json({ error: 'Failed to fetch time tracking data' }, { status: 500 });
  }
}

// POST /api/time-tracking - Record time data for a given date
// Body: { date, integrationTotals, events }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { date, integrationTotals, events } = body as {
      date: string;
      integrationTotals: Record<string, IntegrationTimeRecord>;
      events: EventTimeRecord[];
    };

    if (!date) {
      return NextResponse.json({ error: 'Date is required' }, { status: 400 });
    }

    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Invalid date format. Use YYYY-MM-DD' }, { status: 400 });
    }

    // Only record for dates that are today or in the past
    const today = new Date().toISOString().split('T')[0];
    if (date > today) {
      return NextResponse.json({ error: 'Cannot record time for future dates' }, { status: 400 });
    }

    const record = await recordDailyTime(date, integrationTotals || {}, events || []);
    return NextResponse.json({ success: true, record });
  } catch (error) {
    console.error('Error recording time tracking data:', error);
    return NextResponse.json({ error: 'Failed to record time tracking data' }, { status: 500 });
  }
}
