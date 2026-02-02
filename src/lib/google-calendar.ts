// Google Calendar integration service

import { google } from 'googleapis';
import { CalendarEvent, GoogleCalendarCredentials } from '@/types';

const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

export function createOAuth2Client(clientId: string, clientSecret: string, redirectUri?: string) {
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
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

export async function getCalendarEvents(
  credentials: GoogleCalendarCredentials,
  clientId: string,
  clientSecret: string,
  date: Date
): Promise<CalendarEvent[]> {
  const oauth2Client = createOAuth2Client(clientId, clientSecret);
  oauth2Client.setCredentials({
    access_token: credentials.accessToken,
    refresh_token: credentials.refreshToken,
  });

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events = response.data.items || [];

  return events.map((event): CalendarEvent => {
    const isAllDay = !!event.start?.date;
    let startTime: Date;
    let endTime: Date;

    if (isAllDay) {
      // Parse date-only strings as local dates (avoids UTC midnight shift)
      const startDateParts = (event.start?.date || '').split('-').map(Number);
      const endDateParts = (event.end?.date || '').split('-').map(Number);
      startTime = new Date(startDateParts[0], startDateParts[1] - 1, startDateParts[2], 0, 0, 0);
      endTime = new Date(endDateParts[0], endDateParts[1] - 1, endDateParts[2], 0, 0, 0);
    } else {
      startTime = new Date(event.start?.dateTime || '');
      endTime = new Date(event.end?.dateTime || '');
    }

    return {
      id: event.id!,
      title: event.summary || 'Untitled Event',
      description: event.description || undefined,
      startTime,
      endTime,
      source: 'google',
      color: event.colorId ? getGoogleColor(event.colorId) : '#4285f4',
      location: event.location || undefined,
      allDay: isAllDay,
    };
  });
}

export async function updateCalendarEvent(
  credentials: GoogleCalendarCredentials,
  clientId: string,
  clientSecret: string,
  eventId: string,
  startTime: Date,
  endTime: Date,
  title?: string,
  description?: string
): Promise<CalendarEvent> {
  const oauth2Client = createOAuth2Client(clientId, clientSecret);
  oauth2Client.setCredentials({
    access_token: credentials.accessToken,
    refresh_token: credentials.refreshToken,
  });

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  const existingEvent = await calendar.events.get({
    calendarId: 'primary',
    eventId: eventId,
  });

  const event = existingEvent.data;
  const isAllDay = !!event.start?.date;
  const updatedEvent = await calendar.events.update({
    calendarId: 'primary',
    eventId: eventId,
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
  eventType?: 'default' | 'focusTime'
): Promise<CalendarEvent> {
  const oauth2Client = createOAuth2Client(clientId, clientSecret);
  oauth2Client.setCredentials({
    access_token: credentials.accessToken,
    refresh_token: credentials.refreshToken,
  });

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const baseRequestBody = {
    summary: title,
    description: description,
    start: {
      dateTime: startTime.toISOString(),
      timeZone,
    },
    end: {
      dateTime: endTime.toISOString(),
      timeZone,
    },
  };

  let event;

  // Try with requested eventType first, fall back to default if focusTime isn't supported
  if (eventType === 'focusTime') {
    try {
      event = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: { ...baseRequestBody, eventType: 'focusTime' },
      });
    } catch (err) {
      // focusTime may not be supported on this calendar, retry as default event
      console.log('focusTime not supported, creating as default event');
      event = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: { ...baseRequestBody, eventType: 'default' },
      });
    }
  } else {
    event = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: { ...baseRequestBody, eventType: 'default' },
    });
  }

  return {
    id: event.data.id!,
    title: event.data.summary || 'Untitled Event',
    description: event.data.description || undefined,
    startTime: new Date(event.data.start?.dateTime || ''),
    endTime: new Date(event.data.end?.dateTime || ''),
    source: 'google',
    color: '#4285f4',
  };
}

export async function deleteCalendarEvent(
  credentials: GoogleCalendarCredentials,
  clientId: string,
  clientSecret: string,
  eventId: string
): Promise<void> {
  const oauth2Client = createOAuth2Client(clientId, clientSecret);
  oauth2Client.setCredentials({
    access_token: credentials.accessToken,
    refresh_token: credentials.refreshToken,
  });

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  await calendar.events.delete({
    calendarId: 'primary',
    eventId: eventId,
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
