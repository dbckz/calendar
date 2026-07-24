// Pure precedence + diffing for AI-runnable verdicts.
//
// Precedence, mirroring the meeting-prep resolver (user decision > cached
// verdict > fresh AI answer): whatever Dave decided in the assessment review is
// final, so a re-assessment can never re-claim a task he rejected. Everything
// here is I/O-free so the route stays thin and the rules are unit-testable.

import type { AiUserVerdict } from '@/types';

// The final AI-runnable answer for a task. `userVerdict` wins outright; failing
// that, the AI's answer (fresh or cached) applies; failing that, undefined —
// "no opinion", leave whatever the task already has.
export function resolveAiSuitability(input: {
  userVerdict?: AiUserVerdict;
  aiSuitable?: boolean;
}): boolean | undefined {
  if (input.userVerdict) return input.userVerdict.aiSuitable;
  return input.aiSuitable;
}

// A task the assessor has newly claimed as AI-runnable, offered for review.
export interface AiClaim {
  gid: string;
  integrationId: string;
  title: string;
  integrationName?: string;
  dueOn?: string;
  reason?: string;
}

export interface AiClaimCandidate extends AiClaim {
  // The assessor's answer for this task in this run (absent → not assessed).
  aiSuitable?: boolean;
  // Is the task ALREADY in the AI-runnable list (metadata.aiDelegable)?
  alreadyAccepted: boolean;
  // Dave's standing verdict, if any.
  userVerdict?: AiUserVerdict;
}

// The NEW claims to put in front of Dave: tasks the assessor now says are
// AI-runnable that are neither already accepted nor already ruled out by him.
// Order is preserved so the modal lists them as the caller supplied them.
export function selectNewAiClaims(candidates: AiClaimCandidate[]): AiClaim[] {
  const claims: AiClaim[] = [];
  for (const c of candidates) {
    if (c.aiSuitable !== true) continue;
    if (c.alreadyAccepted) continue;
    if (c.userVerdict) continue; // he has already decided this one
    claims.push({
      gid: c.gid,
      integrationId: c.integrationId,
      title: c.title,
      ...(c.integrationName ? { integrationName: c.integrationName } : {}),
      ...(c.dueOn ? { dueOn: c.dueOn } : {}),
      ...(c.reason ? { reason: c.reason } : {}),
    });
  }
  return claims;
}
