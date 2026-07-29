import { NextRequest, NextResponse } from 'next/server';

import { setReminderVerdicts } from '@/lib/user-data-storage';
import { normalizeReminderKey } from '@/lib/reminder-triage-classifier';

// Record the keep/convert decisions the user confirmed in the wizard's reminders
// step, keyed by normalized reminder title, so the reminder-triage classifier can
// learn his own calls. Body: { verdicts: [{ title, action, integrationId?,
// projectGid?, taskType? }] }. Idempotent; a later decision for the same title
// wins. Only 'keep' / 'convert' are learnable classes — anything else is dropped.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const raw: unknown[] = Array.isArray(body?.verdicts) ? body.verdicts : [];
    const entries = raw
      .filter(
        (v): v is { title: string; action: 'keep' | 'convert'; integrationId?: string; projectGid?: string; taskType?: string } =>
          !!v &&
          typeof v === 'object' &&
          typeof (v as { title?: unknown }).title === 'string' &&
          ((v as { action?: unknown }).action === 'keep' || (v as { action?: unknown }).action === 'convert')
      )
      .map(v => ({
        key: normalizeReminderKey(v.title),
        action: v.action,
        integrationId: typeof v.integrationId === 'string' ? v.integrationId : undefined,
        projectGid: typeof v.projectGid === 'string' ? v.projectGid : undefined,
        taskType: typeof v.taskType === 'string' ? v.taskType : undefined,
      }));
    await setReminderVerdicts(entries);
    return NextResponse.json({ recorded: entries.length });
  } catch (error) {
    console.error('Error recording reminder verdicts:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to record reminder verdicts' },
      { status: 500 }
    );
  }
}
