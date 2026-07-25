import { NextRequest, NextResponse } from 'next/server';

import {
  reconcilePastDays,
  DEFAULT_RECONCILE_DAYS,
  MAX_RECONCILE_DAYS,
} from '@/lib/time-reconcile';
import { getLastReconciledAt, setLastReconciledAt } from '@/lib/user-data-storage';

// How long an automatic (Analysis-tab-load) reconcile stays satisfied before
// another is allowed. A manual "Sync from calendar" press ignores this.
const AUTO_DEBOUNCE_MS = 10 * 60 * 1000;

// GET → when the last reconcile ran, for the Analysis page's "last synced" line.
export async function GET() {
  try {
    return NextResponse.json({ lastSyncedAt: await getLastReconciledAt() });
  } catch (error) {
    console.error('Error reading last reconcile time:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to read sync state' },
      { status: 500 }
    );
  }
}

// POST { days?: number, auto?: boolean } → rebuild past days' time records from
// the calendar (see lib/time-reconcile.ts).
//
// `auto: true` is the fire-and-forget refresh the Analysis tab triggers on load:
// it is debounced server-side so opening the tab repeatedly costs at most one
// pass per AUTO_DEBOUNCE_MS. A manual press (no `auto`) always runs.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const auto = body?.auto === true;
    const days =
      typeof body?.days === 'number' && Number.isFinite(body.days)
        ? Math.min(Math.max(1, Math.floor(body.days)), MAX_RECONCILE_DAYS)
        : DEFAULT_RECONCILE_DAYS;

    const lastSyncedAt = await getLastReconciledAt();
    if (auto && lastSyncedAt) {
      const age = Date.now() - Date.parse(lastSyncedAt);
      if (Number.isFinite(age) && age >= 0 && age < AUTO_DEBOUNCE_MS) {
        return NextResponse.json({ days: 0, updated: 0, skipped: [], lastSyncedAt, debounced: true });
      }
    }

    const result = await reconcilePastDays(days);
    await setLastReconciledAt(result.at);

    return NextResponse.json({
      days: result.days,
      updated: result.updated,
      skipped: result.skipped,
      lastSyncedAt: result.at,
    });
  } catch (error) {
    console.error('Error reconciling time records:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to reconcile time records' },
      { status: 500 }
    );
  }
}
