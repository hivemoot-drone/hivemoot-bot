import type { PRRef } from "./types.js";
import type { PROperations } from "./pr-operations.js";
import type { PRConfig } from "./repo-config.js";
import { isCIPassing } from "./merge-readiness.js";
import { LABELS } from "../config.js";

export interface RequestReviewersParams {
  prs: PROperations;
  ref: PRRef;
  pr: {
    author: string;
    headSha: string;
    draft: boolean;
    state: string;
    labels: string[];
  };
  prConfig: PRConfig;
  log?: { info: (msg: string) => void; warn: (msg: string) => void };
}

/**
 * Auto-request trusted reviewers on a candidate PR when it becomes reviewable.
 *
 * Triggers: hivemoot:candidate label added, draft→ready transition, CI passing.
 *
 * Eligible set: trustedReviewers − author − already_reviewed_at_current_head
 * − currently_pending_review_requests.
 *
 * Idempotent: re-requesting a reviewer who already has a pending request is
 * a safe no-op (GitHub deduplicates server-side).
 *
 * Returns early (no-ops) when:
 * - reviewRequests is not configured
 * - trustedReviewers is empty
 * - PR is a draft
 * - PR is not open
 * - PR does not have the hivemoot:candidate label
 * - CI is not passing
 * - No eligible reviewers remain after filtering
 */
export async function requestTrustedReviewers(
  params: RequestReviewersParams
): Promise<void> {
  const { prs, ref, pr, prConfig, log } = params;

  if (!prConfig.reviewRequests) return;

  const { trustedReviewers } = prConfig;
  if (trustedReviewers.length === 0) return;

  if (pr.draft) return;
  if (pr.state !== "open") return;

  const isCandidate = pr.labels.some((label) => label === LABELS.IMPLEMENTATION);
  if (!isCandidate) return;

  const ciPassing = await isCIPassing(prs, ref, pr.headSha);
  if (!ciPassing) return;

  const author = pr.author.toLowerCase();

  const [reviewedAtHead, pendingRequests] = await Promise.all([
    prs.getReviewersAtCurrentHead(ref, pr.headSha),
    prs.getRequestedReviewers(ref),
  ]);

  const eligible: string[] = [];
  for (const reviewer of trustedReviewers.map((r) => r.toLowerCase()).sort()) {
    if (reviewer === author) continue;
    if (reviewedAtHead.has(reviewer)) continue;
    if (pendingRequests.has(reviewer)) continue;
    eligible.push(reviewer);
  }

  if (eligible.length === 0) return;

  const toRequest = eligible.slice(0, prConfig.reviewRequests.count);

  const confirmed: string[] = [];
  for (const reviewer of toRequest) {
    try {
      if (await prs.isCollaborator(ref, reviewer)) {
        confirmed.push(reviewer);
      } else {
        log?.warn(
          `[PR #${ref.prNumber}] Skipping reviewer request for ${reviewer}: not a collaborator`
        );
      }
    } catch (err) {
      log?.warn(
        `[PR #${ref.prNumber}] Could not verify collaborator status for ${reviewer}: ${String(err)}`
      );
    }
  }

  if (confirmed.length === 0) return;

  log?.info(
    `[PR #${ref.prNumber}] Requesting ${confirmed.length} trusted reviewer(s): ${confirmed.join(", ")}`
  );
  try {
    await prs.requestReviewers(ref, confirmed);
  } catch (err) {
    log?.warn(
      `[PR #${ref.prNumber}] Failed to request reviewers: ${String(err)}`
    );
  }
}
