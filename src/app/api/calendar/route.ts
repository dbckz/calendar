import { NextRequest, NextResponse } from 'next/server';
import { createCalendarEvent, deleteCalendarEvent, ensureValidCredentials, getCalendarEvents, updateCalendarEvent } from '@/lib/google-calendar';
import { getEnabledGoogleIntegrations, getGoogleIntegrationById } from '@/lib/integration-storage';
import { CalendarEvent, GoogleIntegration } from '@/types';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const dateStr = searchParams.get('date');

  if (!dateStr) {
    return NextResponse.json({ error: 'Date parameter is required' }, { status: 400 });
  }

  try {
    const integrations = await getEnabledGoogleIntegrations();

    if (integrations.length === 0) {
      return NextResponse.json([]);
    }

    const date = new Date(dateStr);
    const allEvents: CalendarEvent[] = [];

    // Fetch events from all enabled integrations
    for (const integration of integrations) {
      try {
        const events = await fetchEventsFromIntegration(integration, date);
        allEvents.push(...events);
      } catch (error) {
        console.error(`Error fetching from integration ${integration.name}:`, error);
        // Continue with other integrations even if one fails
      }
    }

    // Sort all events by start time
    allEvents.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    return NextResponse.json(allEvents);
  } catch (error) {
    console.error('Error fetching calendar events:', error);
    return NextResponse.json(
      { error: 'Failed to fetch calendar events' },
      { status: 500 }
    );
  }
}

async function fetchEventsFromIntegration(
  integration: GoogleIntegration,
  date: Date
): Promise<CalendarEvent[]> {
  if (!integration.credentials) {
    return [];
  }

  const credentials = await ensureValidCredentials(integration);

  const DEFAULT_CALENDAR = { id: 'primary', summary: 'Primary', backgroundColor: '#4285f4', selected: true as const };
  const selectedCalendars = integration.calendars?.filter(c => c.selected);
  const calendarsToFetch = selectedCalendars?.length ? selectedCalendars : [DEFAULT_CALENDAR];

  const allEvents: CalendarEvent[] = [];

  for (const cal of calendarsToFetch) {
    try {
      const events = await getCalendarEvents(
        credentials,
        integration.clientId,
        integration.clientSecret,
        date,
        cal.id,
        cal.backgroundColor
      );
      allEvents.push(...events.map(event => ({
        ...event,
        integrationId: integration.id,
        integrationName: integration.name,
        calendarId: cal.id,
        calendarName: cal.summary,
      })));
    } catch (error) {
      console.error(`Error fetching from calendar ${cal.summary}:`, error);
    }
  }

  return allEvents;
}

/**
 * Validates integration exists and has credentials.
 * Returns the integration or an error response.
 */
async function getValidatedIntegration(integrationId: string): Promise<
  | { integration: GoogleIntegration; error?: never }
  | { integration?: never; error: NextResponse }
> {
  const integration = await getGoogleIntegrationById(integrationId);
  if (!integration) {
    return { error: NextResponse.json({ error: 'Integration not found' }, { status: 404 }) };
  }
  if (!integration.credentials) {
    return { error: NextResponse.json({ error: 'Integration not authenticated' }, { status: 401 }) };
  }
  return { integration };
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { eventId, integrationId, startTime, endTime, title, description, calendarId, colorId } = body;

    if (!eventId || !integrationId || !startTime || !endTime) {
      return NextResponse.json(
        { error: 'Missing required fields: eventId, integrationId, startTime, endTime' },
        { status: 400 }
      );
    }

    const result = await getValidatedIntegration(integrationId);
    if (result.error) return result.error;
    const { integration } = result;

    const credentials = await ensureValidCredentials(integration);
    const updatedEvent = await updateCalendarEvent(
      credentials,
      integration.clientId,
      integration.clientSecret,
      eventId,
      new Date(startTime),
      new Date(endTime),
      title,
      description,
      calendarId || 'primary',
      colorId
    );

    return NextResponse.json({
      ...updatedEvent,
      integrationId: integration.id,
      integrationName: integration.name,
    });
  } catch (error) {
    console.error('Error updating calendar event:', error);
    return NextResponse.json(
      { error: 'Failed to update calendar event' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      integrationId,
      title,
      startTime,
      endTime,
      description,
      eventType,
      calendarId,
      allDay,
      recurrence,
    } = body;

    if (!integrationId || !title || !startTime || !endTime) {
      return NextResponse.json(
        { error: 'Missing required fields: integrationId, title, startTime, endTime' },
        { status: 400 }
      );
    }

    const result = await getValidatedIntegration(integrationId);
    if (result.error) return result.error;
    const { integration } = result;

    const credentials = await ensureValidCredentials(integration);
    const createdEvent = await createCalendarEvent(
      credentials,
      integration.clientId,
      integration.clientSecret,
      title,
      new Date(startTime),
      new Date(endTime),
      description,
      eventType,
      calendarId || 'primary',
      {
        allDay: !!allDay,
        recurrence: Array.isArray(recurrence) ? recurrence : undefined,
      }
    );

    return NextResponse.json({
      ...createdEvent,
      integrationId: integration.id,
      integrationName: integration.name,
    });
  } catch (error) {
    console.error('Error creating calendar event:', error);
    return NextResponse.json(
      { error: 'Failed to create calendar event' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { eventId, integrationId, calendarId } = body;

    if (!eventId || !integrationId) {
      return NextResponse.json(
        { error: 'Missing required fields: eventId, integrationId' },
        { status: 400 }
      );
    }

    const result = await getValidatedIntegration(integrationId);
    if (result.error) return result.error;
    const { integration } = result;

    const credentials = await ensureValidCredentials(integration);
    await deleteCalendarEvent(
      credentials,
      integration.clientId,
      integration.clientSecret,
      eventId,
      calendarId || 'primary'
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting calendar event:', error);
    return NextResponse.json(
      { error: 'Failed to delete calendar event' },
      { status: 500 }
    );
  }
}
