import { CalendarEvent, ScheduledAsanaTask } from '@/types';
import { CACHE_KEYS, CACHE_VERSION } from './cache-keys';

export interface CacheMetadata {
  version: number;
  lastUpdated: string;
}

export interface CacheEntry<T> {
  data: T;
  metadata: CacheMetadata;
}

export interface GoogleCalendarCache {
  events: CalendarEvent[];
  metadata: CacheMetadata;
}

export interface AsanaTasksCache {
  allTasks: CalendarEvent[];
  scheduledTasks: ScheduledAsanaTask[];
  metadata: CacheMetadata;
}

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function createMetadata(): CacheMetadata {
  return {
    version: CACHE_VERSION,
    lastUpdated: new Date().toISOString(),
  };
}

function isValidCacheEntry<T>(entry: unknown): entry is CacheEntry<T> {
  if (!entry || typeof entry !== 'object') return false;
  const e = entry as Record<string, unknown>;
  return (
    e.data !== undefined &&
    typeof e.metadata === 'object' &&
    e.metadata !== null &&
    typeof (e.metadata as Record<string, unknown>).version === 'number' &&
    typeof (e.metadata as Record<string, unknown>).lastUpdated === 'string'
  );
}

// Generic cache operations
export function writeCache<T>(key: string, data: T): void {
  if (!isBrowser()) return;

  try {
    const entry: CacheEntry<T> = {
      data,
      metadata: createMetadata(),
    };
    localStorage.setItem(key, JSON.stringify(entry));
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      console.warn('Cache quota exceeded, clearing old caches');
      clearCache();
      // Retry once
      try {
        const entry: CacheEntry<T> = {
          data,
          metadata: createMetadata(),
        };
        localStorage.setItem(key, JSON.stringify(entry));
      } catch {
        console.error('Failed to write cache even after clearing');
      }
    } else {
      console.error('Failed to write cache:', error);
    }
  }
}

export function readCache<T>(key: string): CacheEntry<T> | null {
  if (!isBrowser()) return null;

  try {
    const item = localStorage.getItem(key);
    if (!item) return null;

    const parsed = JSON.parse(item);

    if (!isValidCacheEntry<T>(parsed)) {
      console.warn('Invalid cache entry, clearing');
      localStorage.removeItem(key);
      return null;
    }

    // Check version mismatch
    if (parsed.metadata.version !== CACHE_VERSION) {
      console.warn('Cache version mismatch, clearing');
      localStorage.removeItem(key);
      return null;
    }

    return parsed;
  } catch (error) {
    console.error('Cache read error, clearing:', error);
    localStorage.removeItem(key);
    return null;
  }
}

export function clearCache(key?: string): void {
  if (!isBrowser()) return;

  if (key) {
    localStorage.removeItem(key);
  } else {
    // Clear all cache keys
    Object.values(CACHE_KEYS).forEach(cacheKey => {
      localStorage.removeItem(cacheKey);
    });
  }
}

// Typed cache operations for Google Calendar
export function writeGoogleCalendarCache(events: CalendarEvent[]): void {
  const cache: GoogleCalendarCache = {
    events,
    metadata: createMetadata(),
  };
  writeCache(CACHE_KEYS.GOOGLE_CALENDAR, cache);
}

export function readGoogleCalendarCache(): GoogleCalendarCache | null {
  const entry = readCache<GoogleCalendarCache>(CACHE_KEYS.GOOGLE_CALENDAR);
  if (!entry?.data) return null;

  // Parse date strings back to Date objects
  const events = entry.data.events.map(event => ({
    ...event,
    startTime: new Date(event.startTime),
    endTime: new Date(event.endTime),
  }));

  return {
    ...entry.data,
    events,
  };
}

// Typed cache operations for Asana Tasks
export function writeAsanaTasksCache(
  allTasks: CalendarEvent[],
  scheduledTasks: ScheduledAsanaTask[]
): void {
  const cache: AsanaTasksCache = {
    allTasks,
    scheduledTasks,
    metadata: createMetadata(),
  };
  writeCache(CACHE_KEYS.ASANA_TASKS, cache);
}

export function readAsanaTasksCache(): AsanaTasksCache | null {
  const entry = readCache<AsanaTasksCache>(CACHE_KEYS.ASANA_TASKS);
  if (!entry?.data) return null;

  // Parse date strings back to Date objects
  const allTasks = entry.data.allTasks.map(task => ({
    ...task,
    startTime: new Date(task.startTime),
    endTime: new Date(task.endTime),
  }));

  return {
    ...entry.data,
    allTasks,
  };
}
