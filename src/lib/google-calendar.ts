// Google Calendar integration service

import { google } from 'googleapis';
import { CalendarEvent, GoogleCalendarCredentials, GoogleIntegration } from '@/types';
import { updateIntegration } from './integration-storage';

export const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/tasks',
];

export function createOAuth2Client(clientId: string, clientSecret: string, redirectUri?: string) {
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function createAuthenticatedClient(
  credentials: GoogleCalendarCredentials,
  clientId: string,
  clientSecret: string
) {
  const oauth2Client = createOAuth2Client(clientId, clientSecret);
  oauth2Client.setCredentials({
    access_token: credentials.accessToken,
    refresh_token: credentials.refreshToken,
  });
  return oauth2Client;
}

export function getAuthUrl(clientId: string, clientSecret: string, redirectUri: string): string {
  const oauth2Client = createOAuth2Client(clientId, clientSecret, redirectUri);

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
}

export async function getTokensFromCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<GoogleCalendarCredentials> {
  const oauth2Client = createOAuth2Client(clientId, clientSecret, redirectUri);
  const { tokens } = await oauth2Client.getToken(code);

  return {
    accessToken: tokens.access_token!,
    refreshToken: tokens.refresh_token!,
    expiresAt: tokens.expiry_date || Date.now() + 3600000,
  };
}

/**
 * Ensures credentials are valid, refreshing if needed.
 * Updates stored credentials when a refresh occurs.
 */
export async function ensureValidCredentials(integration: GoogleIntegration): Promise<GoogleCalendarCredentials> {
  let credentials = integration.credentials!;
  if (credentials.expiresAt && Date.now() >= credentials.expiresAt - 60000) {
    credentials = await refreshAccessToken(credentials, integration.clientId, integration.clientSecret);
    await updateIntegration(integration.id, { credentials });
  }
  return credentials;
}

export async function refreshAccessToken(
  credentials: GoogleCalendarCredentials,
  clientId: string,
  clientSecret: string
): Promise<GoogleCalendarCredentials> {
  const oauth2Client = createOAuth2Client(clientId, clientSecret);
  oauth2Client.setCredentials({
    refresh_token: credentials.refreshToken,
  });

  const { credentials: newCreds } = await oauth2Client.refreshAccessToken();

  return {
    accessToken: newCreds.access_token!,
    refreshToken: credentials.refreshToken,
    expiresAt: newCreds.expiry_date || Date.now() + 3600000,
  };
}

export async function listCalendars(
  credentials: GoogleCalendarCredentials,
  clientId: string,
  clientSecret: string
): Promise<Array<{ id: string; summary: string; backgroundColor: string }>> {
  const oauth2Client = createAuthenticatedClient(credentials, clientId, clientSecret);
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  const response = await calendar.calendarList.list();
  const items = response.data.items || [];

  return items.map(item => ({
    id: item.id!,
    summary: item.summary || item.id!,
    backgroundColor: item.backgroundColor || '#4285f4',
  }));
}

function parseGoogleDateOnly(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function formatDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toCalendarEvent(
  event: { id?: string | null; summary?: string | null; description?: string | null; start?: { date?: string | null; dateTime?: string | null } | null; end?: { date?: string | null; dateTime?: string | null } | null; colorId?: string | null; location?: string | null },
  fallbackColor: string,
  calendarId?: string
): CalendarEvent {
  const isAllDay = !!event.start?.date;
  const startTime = isAllDay
    ? parseGoogleDateOnly(event.start?.date || '')
    : new Date(event.start?.dateTime || '');
  const endTime = isAllDay
    ? parseGoogleDateOnly(event.end?.date || '')
    : new Date(event.end?.dateTime || '');

  return {
    id: event.id!,
    title: event.summary || 'Untitled Event',
    description: event.description || undefined,
    startTime,
    endTime,
    source: 'google',
    color: event.colorId ? getGoogleColor(event.colorId) : fallbackColor,
    location: event.location || undefined,
    allDay: isAllDay,
    calendarId,
  };
}

export async function getCalendarEvents(
  credentials: GoogleCalendarCredentials,
  clientId: string,
  clientSecret: string,
  date: Date,
  calendarId: string = 'primary',
  defaultColor?: string
): Promise<CalendarEvent[]> {
  const oauth2Client = createAuthenticatedClient(credentials, clientId, clientSecret);
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const response = await calendar.events.list({
    calendarId,
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events = response.data.items || [];
  const fallbackColor = defaultColor || '#4285f4';

  return events.map(event => toCalendarEvent(event, fallbackColor, calendarId));
}

export async function updateCalendarEvent(
  credentials: GoogleCalendarCredentials,
  clientId: string,
  clientSecret: string,
  eventId: string,
  startTime: Date,
  endTime: Date,
  title?: string,
  description?: string,
  calendarId: string = 'primary'
): Promise<CalendarEvent> {
  const oauth2Client = createAuthenticatedClient(credentials, clientId, clientSecret);
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  const existingEvent = await calendar.events.get({
    calendarId,
    eventId,
  });

  const event = existingEvent.data;
  const isAllDay = !!event.start?.date;
  const updatedEvent = await calendar.events.update({
    calendarId,
    eventId,
    requestBody: {
      ...event,
      summary: title !== undefined ? title : event.summary,
      description: description !== undefined ? description : event.description,
      start: isAllDay
        ? { date: startTime.toISOString().split('T')[0] }
        : { dateTime: startTime.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      end: isAllDay
        ? { date: endTime.toISOString().split('T')[0] }
        : { dateTime: endTime.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    },
  });

  return {
    id: updatedEvent.data.id!,
    title: updatedEvent.data.summary || 'Untitled Event',
    description: updatedEvent.data.description || undefined,
    startTime: new Date(updatedEvent.data.start?.dateTime || updatedEvent.data.start?.date || ''),
    endTime: new Date(updatedEvent.data.end?.dateTime || updatedEvent.data.end?.date || ''),
    source: 'google',
    color: updatedEvent.data.colorId ? getGoogleColor(updatedEvent.data.colorId) : '#4285f4',
    location: updatedEvent.data.location || undefined,
    allDay: isAllDay,
  };
}

export async function createCalendarEvent(
  credentials: GoogleCalendarCredentials,
  clientId: string,
  clientSecret: string,
  title: string,
  startTime: Date,
  endTime: Date,
  description?: string,
  eventType?: 'default' | 'focusTime',
  calendarId: string = 'primary',
  options?: {
    allDay?: boolean;
    recurrence?: string[];
  }
): Promise<CalendarEvent> {
  const oauth2Client = createAuthenticatedClient(credentials, clientId, clientSecret);
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const isAllDay = !!options?.allDay;

  const baseRequestBody = {
    summary: title,
    description,
    start: isAllDay
      ? { date: formatDateOnly(startTime) }
      : {
          dateTime: startTime.toISOString(),
          timeZone,
        },
    end: isAllDay
      ? { date: formatDateOnly(endTime) }
      : {
          dateTime: endTime.toISOString(),
          timeZone,
        },
    ...(options?.recurrence?.length ? { recurrence: options.recurrence } : {}),
  };

  let event;

  // Try with requested eventType first, fall back to default if focusTime isn't supported
  if (eventType === 'focusTime') {
    try {
      event = await calendar.events.insert({
        calendarId,
        requestBody: { ...baseRequestBody, eventType: 'focusTime' },
      });
    } catch (err) {
      // focusTime may not be supported on this calendar, retry as default event
      console.log('focusTime not supported, creating as default event');
      event = await calendar.events.insert({
        calendarId,
        requestBody: { ...baseRequestBody, eventType: 'default' },
      });
    }
  } else {
    event = await calendar.events.insert({
      calendarId,
      requestBody: { ...baseRequestBody, eventType: 'default' },
    });
  }

  return toCalendarEvent(event.data, '#4285f4', calendarId);
}

export async function deleteCalendarEvent(
  credentials: GoogleCalendarCredentials,
  clientId: string,
  clientSecret: string,
  eventId: string,
  calendarId: string = 'primary'
): Promise<void> {
  const oauth2Client = createAuthenticatedClient(credentials, clientId, clientSecret);
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  await calendar.events.delete({
    calendarId,
    eventId,
  });
}

function getGoogleColor(colorId: string): string {
  const colors: Record<string, string> = {
    '1': '#7986cb',
    '2': '#33b679',
    '3': '#8e24aa',
    '4': '#e67c73',
    '5': '#f6c026',
    '6': '#f5511d',
    '7': '#039be5',
    '8': '#616161',
    '9': '#3f51b5',
    '10': '#0b8043',
    '11': '#d60000',
  };
  return colors[colorId] || '#4285f4';
}
