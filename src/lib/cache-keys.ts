export const CACHE_VERSION = 1;

export const CACHE_KEYS = {
  GOOGLE_CALENDAR: `calendar-cache:google:v${CACHE_VERSION}`,
  ASANA_TASKS: `calendar-cache:asana:v${CACHE_VERSION}`,
} as const;
