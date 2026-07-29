import { NextRequest, NextResponse } from 'next/server';

import { setAiUserVerdicts, upsertTaskMetadata } from '@/lib/user-data-storage';

interface VerdictInput {
  gid: string;
  integrationId: string;
}

function parseList(raw: unknown): VerdictInput[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (v: unknown): v is VerdictInput =>
      !!v &&
      typeof v === 'object' &&
      typeof (v as VerdictInput).gid === 'string' &&
      typeof (v as VerdictInput).integrationId === 'string'
  );
}

// POST { accept: [{ gid, integrationId }], reject: [{ gid, integrationId }] }
// Apply Dave's decisions from the AI-runnable assessment review.
//
//  * accept → the task joins the AI-runnable list (metadata.aiDelegable), the
//    same mechanism as ticking the box by hand, so he can still untick it later
//    and a future assessment may legitimately re-claim it.
//  * reject → a standing USER VERDICT of "not AI-runnable", plus the metadata
//    flag cleared. The verdict outranks the classifier from then on, so
//    re-assessment can never put the task back.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const accept = parseList(body?.accept);
    const reject = parseList(body?.reject);
    if (accept.length === 0 && reject.length === 0) {
      return NextResponse.json({ error: 'accept or reject is required' }, { status: 400 });
    }

    for (const { gid, integrationId } of accept) {
      await upsertTaskMetadata(gid, integrationId, { aiDelegable: true });
    }
    for (const { gid, integrationId } of reject) {
      await upsertTaskMetadata(gid, integrationId, { aiDelegable: false });
    }
    // Record BOTH classes as user verdicts. Rejections pin the task out of the
    // list (the classify route skips a negative verdict, as before). Confirmations
    // are recorded too — not to pin (a positive verdict never blocks re-assessment,
    // preserving re-claim), but so the classifier can learn his positives as
    // few-shot examples instead of only ever seeing his rejections.
    await setAiUserVerdicts([
      ...accept.map(({ gid }) => ({ gid, aiSuitable: true })),
      ...reject.map(({ gid }) => ({ gid, aiSuitable: false })),
    ]);

    return NextResponse.json({ accepted: accept.length, rejected: reject.length });
  } catch (error) {
    console.error('Error applying AI verdicts:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to apply AI verdicts' },
      { status: 500 }
    );
  }
}
