import { NextResponse } from 'next/server';

import { getEventAttributionRules } from '@/lib/user-data-storage';
import { BUILT_IN_ATTRIBUTION_RULES } from '@/lib/attribution-rules';

// GET → the stored attribution rules, so the client applies exactly what the
// server does. Built-in rules live in code and apply on both sides regardless;
// they are returned too, marked, so the UI can show the full picture.
export async function GET() {
  try {
    const rules = await getEventAttributionRules();
    return NextResponse.json({ rules, builtIn: BUILT_IN_ATTRIBUTION_RULES });
  } catch (error) {
    console.error('Error reading attribution rules:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to read attribution rules' },
      { status: 500 }
    );
  }
}
