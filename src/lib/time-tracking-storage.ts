// Server-side storage for longitudinal time tracking data
// Stores daily time records for analysis of time spent across projects/integrations

import { promises as fs } from 'fs';

import { DATA_DIR, TIME_TRACKING_FILE } from './data-paths';

// Types for time tracking data
export interface IntegrationTimeRecord {
  integrationId: string;
  integrationName: string;
  totalMinutes: number;
}

export interface EventTimeRecord {
  eventId: string;
  title: string;
  integrationId: string;
  integrationName: string;
  startTime: string; // ISO timestamp
  endTime: string;
  durationMinutes: number;
  source: 'google' | 'asana';
  linkedAsanaTaskId?: string;
}

export interface DailyTimeRecord {
  date: string; // YYYY-MM-DD
  recordedAt: string; // ISO timestamp when this record was created/updated
  integrationTotals: Record<string, IntegrationTimeRecord>;
  events: EventTimeRecord[];
}

export interface TimeTrackingData {
  dailyRecords: DailyTimeRecord[];
}

const DEFAULT_DATA: TimeTrackingData = {
  dailyRecords: [],
};

async function ensureDataDir(): Promise<void> {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

export async function getTimeTrackingData(): Promise<TimeTrackingData> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(TIME_TRACKING_FILE, 'utf-8');
    const parsed = JSON.parse(data) as Partial<TimeTrackingData>;
    return {
      dailyRecords: parsed.dailyRecords || [],
    };
  } catch {
    return { ...DEFAULT_DATA };
  }
}

async function saveTimeTrackingData(data: TimeTrackingData): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(TIME_TRACKING_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export async function recordDailyTime(
  date: string,
  integrationTotals: Record<string, IntegrationTimeRecord>,
  events: EventTimeRecord[]
): Promise<DailyTimeRecord> {
  const data = await getTimeTrackingData();

  const record: DailyTimeRecord = {
    date,
    recordedAt: new Date().toISOString(),
    integrationTotals,
    events,
  };

  // Find existing record for this date and update, or add new
  const existingIndex = data.dailyRecords.findIndex(r => r.date === date);
  if (existingIndex >= 0) {
    data.dailyRecords[existingIndex] = record;
  } else {
    data.dailyRecords.push(record);
    // Keep records sorted by date
    data.dailyRecords.sort((a, b) => a.date.localeCompare(b.date));
  }

  await saveTimeTrackingData(data);
  return record;
}

export async function getDailyRecord(date: string): Promise<DailyTimeRecord | null> {
  const data = await getTimeTrackingData();
  return data.dailyRecords.find(r => r.date === date) || null;
}

export async function getRecordsInRange(
  startDate: string,
  endDate: string
): Promise<DailyTimeRecord[]> {
  const data = await getTimeTrackingData();
  return data.dailyRecords.filter(r => r.date >= startDate && r.date <= endDate);
}

export function exportToCSV(records: DailyTimeRecord[]): string {
  if (records.length === 0) {
    return 'date,integration_id,integration_name,total_minutes\n';
  }

  // CSV with one row per integration per day
  const lines: string[] = ['date,integration_id,integration_name,total_minutes'];

  for (const record of records) {
    for (const [integrationId, totals] of Object.entries(record.integrationTotals)) {
      lines.push(
        `${record.date},${integrationId},"${totals.integrationName}",${totals.totalMinutes}`
      );
    }
  }

  return lines.join('\n');
}

export function exportEventsToCSV(records: DailyTimeRecord[]): string {
  if (records.length === 0) {
    return 'date,event_id,title,integration_id,integration_name,start_time,end_time,duration_minutes,source,linked_asana_task_id\n';
  }

  const lines: string[] = [
    'date,event_id,title,integration_id,integration_name,start_time,end_time,duration_minutes,source,linked_asana_task_id',
  ];

  for (const record of records) {
    for (const event of record.events) {
      const escapedTitle = event.title.replace(/"/g, '""');
      lines.push(
        `${record.date},${event.eventId},"${escapedTitle}",${event.integrationId},"${event.integrationName}",${event.startTime},${event.endTime},${event.durationMinutes},${event.source},${event.linkedAsanaTaskId || ''}`
      );
    }
  }

  return lines.join('\n');
}
