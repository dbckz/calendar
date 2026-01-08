import { NextRequest, NextResponse } from 'next/server';
import {
  getAsanaFilterPreferences,
  saveAsanaFilterPreferences,
} from '@/lib/user-data-storage';
import { AsanaFilterState } from '@/types';

// GET - retrieve filter preferences
export async function GET() {
  try {
    const filters = await getAsanaFilterPreferences();
    return NextResponse.json({ filters });
  } catch (error) {
    console.error('Error getting filter preferences:', error);
    return NextResponse.json(
      { error: 'Failed to get filter preferences' },
      { status: 500 }
    );
  }
}

// PUT - save filter preferences
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const filters = body.filters as AsanaFilterState;

    if (!filters) {
      return NextResponse.json(
        { error: 'filters is required' },
        { status: 400 }
      );
    }

    await saveAsanaFilterPreferences(filters);
    return NextResponse.json({ success: true, filters });
  } catch (error) {
    console.error('Error saving filter preferences:', error);
    return NextResponse.json(
      { error: 'Failed to save filter preferences' },
      { status: 500 }
    );
  }
}
