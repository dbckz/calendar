// Google Calendar integration service

import { google } from 'googleapis';
import { CalendarEvent, GoogleCalendarCredentials } from '@/types';

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

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

  // Get start and end of day
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

    return {
      id: event.id!,
      title: event.summary || 'Untitled Event',
      description: event.description || undefined,
      startTime: new Date(event.start?.dateTime || event.start?.date || ''),
      endTime: new Date(event.end?.dateTime || event.end?.date || ''),
      source: 'google',
      color: event.colorId ? getGoogleColor(event.colorId) : '#4285f4',
      location: event.location || undefined,
      allDay: isAllDay,
    };
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
