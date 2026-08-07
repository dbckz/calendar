// Shapes the Analysis view reads from GET /api/analysis.
//
// Declared here rather than derived from @/lib/weekly-stats: the view only needs
// the fields it renders, and keeping them local means the summary builder can
// grow without dragging the component's types along.

export interface WeekCategorySummary {
  category: string;
  scheduled: number;
  completed: number;
  // Worked on but not finished. Optional: records written before the daily
  // review gained a "Started" outcome have no such field, and read as 0.
  started?: number;
  carried: number;
  dropped: number;
}

export interface TimeSegment {
  category: string;
  minutes: number;
  share: number; // 0..1 of the owning workspace's totalMinutes
}

export interface TimeByIntegration {
  integrationId: string;
  integrationName: string;
  totalMinutes: number; // overlap-deduped; equals the sum of its segments
  segments: TimeSegment[]; // largest first, no zero-minute segments
}

export interface AnalysisEvent {
  integrationId: string;
  category: string;
  title: string;
  date: string; // yyyy-MM-dd
  durationMinutes: number;
}

export interface WeekSummary {
  weekStart: string;
  categories: WeekCategorySummary[];
  totalScheduled: number;
  totalCompleted: number;
  totalStarted?: number;
  completionRate: number; // (completed + started) / scheduled; 0 when nothing was scheduled
  // Working days of this week spent out of office. Optional: weeks recorded
  // before OOO tracking have none, which means "not known" rather than "was in
  // the office" — a distinction that only matters for those old weeks.
  outOfOfficeDays?: string[];
  totalMinutesWorked: number;
  timeByIntegration: TimeByIntegration[];
  events: AnalysisEvent[];
}

export interface AnalysisResponse {
  weeks: WeekSummary[];
  lastSyncedAt: string | null;
}

export interface ReconcileResponse {
  days: number;
  updated: number;
  skipped: number;
  lastSyncedAt: string;
  debounced?: boolean; // only set when an `auto` call was skipped
}
