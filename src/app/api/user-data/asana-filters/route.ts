import { NextRequest, NextResponse } from 'next/server';
import {
  getAsanaFilterPreferences,
  getAllAsanaFilterPreferences,
  saveAsanaFilterPreferences,
} from '@/lib/user-data-storage';
import { AsanaFilterState } from '@/types';

// GET - retrieve filter preferences (all integrations or specific one)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const integrationId = searchParams.get('integrationId');

    if (integrationId) {
      // Get filters for specific integration
      const filters = await getAsanaFilterPreferences(integrationId);
      return NextResponse.json({ filters });
    } else {
      // Get all filter preferences (for all integrations)
      const filtersMap = await getAllAsanaFilterPreferences();
      return NextResponse.json({ filtersMap });
    }
  } catch (error) {
    console.error('Error getting filter preferences:', error);
    return NextResponse.json(
      { error: 'Failed to get filter preferences' },
      { status: 500 }
    );
  }
}

// PUT - save filter preferences (optionally for specific integration)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const filters = body.filters as AsanaFilterState;
    const integrationId = body.integrationId as string | undefined;

    if (!filters) {
      return NextResponse.json(
        { error: 'filters is required' },
        { status: 400 }
      );
    }

    await saveAsanaFilterPreferences(filters, integrationId);
    return NextResponse.json({ success: true, filters, integrationId });
  } catch (error) {
    console.error('Error saving filter preferences:', error);
    return NextResponse.json(
      { error: 'Failed to save filter preferences' },
      { status: 500 }
    );
  }
}
