import { NextRequest, NextResponse } from 'next/server';

import { setTypeVerdicts } from '@/lib/user-data-storage';
import { normalizeTaskTitleKey } from '@/lib/type-classifier';

// Record the Type labels the user decided in the wizard's type step, keyed by
// normalized task title, so the Type classifier can learn his own decisions.
// Body: { verdicts: [{ title, type, override? }] }. Idempotent; a later decision
// for the same title wins.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const raw: unknown[] = Array.isArray(body?.verdicts) ? body.verdicts : [];
    const entries = raw
      .filter(
        (v): v is { title: string; type: string; override?: boolean } =>
          !!v &&
          typeof v === 'object' &&
          typeof (v as { title?: unknown }).title === 'string' &&
          typeof (v as { type?: unknown }).type === 'string'
      )
      .map(v => ({
        key: normalizeTaskTitleKey(v.title),
        type: v.type,
        override: v.override === true,
      }));
    await setTypeVerdicts(entries);
    return NextResponse.json({ recorded: entries.length });
  } catch (error) {
    console.error('Error recording type verdicts:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to record type verdicts' },
      { status: 500 }
    );
  }
}
