import { NextRequest, NextResponse } from 'next/server';
import {
  getGoogleEventAttributions,
  getGoogleEventAttribution,
  setGoogleEventAttribution,
  removeGoogleEventAttribution,
} from '@/lib/user-data-storage';

// GET /api/user-data/google-event-attributions
// Query params:
//   - googleEventId: get attribution for specific event
//   - (none): get all attributions
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const googleEventId = searchParams.get('googleEventId');

  try {
    if (googleEventId) {
      const attribution = await getGoogleEventAttribution(googleEventId);
      return NextResponse.json({ attribution });
    }

    const attributions = await getGoogleEventAttributions();
    return NextResponse.json({ attributions });
  } catch (error) {
    console.error('Error fetching attributions:', error);
    return NextResponse.json({ error: 'Failed to fetch attributions' }, { status: 500 });
  }
}

// POST /api/user-data/google-event-attributions
// Body: { googleEventId, googleIntegrationId, asanaIntegrationId }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { googleEventId, googleIntegrationId, asanaIntegrationId } = body;

    if (!googleEventId || !googleIntegrationId || !asanaIntegrationId) {
      return NextResponse.json(
        { error: 'googleEventId, googleIntegrationId, and asanaIntegrationId are required' },
        { status: 400 }
      );
    }

    const attribution = await setGoogleEventAttribution(
      googleEventId,
      googleIntegrationId,
      asanaIntegrationId
    );
    return NextResponse.json({ success: true, attribution });
  } catch (error) {
    console.error('Error setting attribution:', error);
    return NextResponse.json({ error: 'Failed to set attribution' }, { status: 500 });
  }
}

// DELETE /api/user-data/google-event-attributions
// Body: { googleEventId }
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { googleEventId } = body;

    if (!googleEventId) {
      return NextResponse.json({ error: 'googleEventId is required' }, { status: 400 });
    }

    const removed = await removeGoogleEventAttribution(googleEventId);
    return NextResponse.json({ success: true, removed });
  } catch (error) {
    console.error('Error removing attribution:', error);
    return NextResponse.json({ error: 'Failed to remove attribution' }, { status: 500 });
  }
}
