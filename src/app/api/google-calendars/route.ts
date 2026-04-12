import { NextRequest, NextResponse } from 'next/server';
import { ensureValidCredentials, listCalendars } from '@/lib/google-calendar';
import { getGoogleIntegrationById, updateIntegration } from '@/lib/integration-storage';
import { GoogleSubCalendar } from '@/types';

// GET: List available calendars for an integration, merged with saved selections
export async function GET(request: NextRequest) {
  const integrationId = request.nextUrl.searchParams.get('integrationId');

  if (!integrationId) {
    return NextResponse.json({ error: 'integrationId is required' }, { status: 400 });
  }

  try {
    const integration = await getGoogleIntegrationById(integrationId);
    if (!integration) {
      return NextResponse.json({ error: 'Integration not found' }, { status: 404 });
    }
    if (!integration.credentials) {
      return NextResponse.json({ error: 'Integration not authenticated' }, { status: 401 });
    }

    const credentials = await ensureValidCredentials(integration);
    const availableCalendars = await listCalendars(
      credentials,
      integration.clientId,
      integration.clientSecret
    );

    // Merge with saved selections
    const savedMap = new Map(
      (integration.calendars || []).map(c => [c.id, c])
    );
    const hasExistingConfig = !!integration.calendars;

    // No existing config: select all by default (matches previous behavior of showing all)
    // Has existing config: new calendars default to unselected
    const calendars: GoogleSubCalendar[] = availableCalendars.map(cal => ({
      id: cal.id,
      summary: cal.summary,
      backgroundColor: cal.backgroundColor,
      selected: savedMap.get(cal.id)?.selected ?? !hasExistingConfig,
    }));

    return NextResponse.json({ calendars });
  } catch (error) {
    console.error('Error listing calendars:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to list calendars: ${message}` },
      { status: 500 }
    );
  }
}

// PUT: Save calendar selections for an integration
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { integrationId, calendars } = body as {
      integrationId: string;
      calendars: GoogleSubCalendar[];
    };

    if (!integrationId || !calendars) {
      return NextResponse.json(
        { error: 'integrationId and calendars are required' },
        { status: 400 }
      );
    }

    const integration = await getGoogleIntegrationById(integrationId);
    if (!integration) {
      return NextResponse.json({ error: 'Integration not found' }, { status: 404 });
    }

    await updateIntegration(integrationId, { calendars });

    return NextResponse.json({ success: true, calendars });
  } catch (error) {
    console.error('Error saving calendar selections:', error);
    return NextResponse.json(
      { error: 'Failed to save calendar selections' },
      { status: 500 }
    );
  }
}
