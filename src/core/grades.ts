/**
 * LTI Assignment & Grade Services: post a completion (1/1) to the LMS
 * gradebook. Best-effort: a failure is reported back for the caller to
 * record and never blocks the student's flow.
 *
 * Which column receives the score:
 *   1. If the student launched a deep-linked activity for this very item
 *      (the custom parameter named by `customKey` matches `itemId`) and the
 *      platform sent that activity's own line item, use it.
 *   2. Otherwise, if the item wants a gradebook column and the platform
 *      grants line-item scope, find or create a column tagged for it.
 *   3. Otherwise, do nothing and say so.
 */

import type { IdToken, ProviderInstance } from 'ltijs';

export interface GradeResult {
  posted: boolean;
  error?: string;
}

export interface CompletionTarget {
  /** The launch custom parameter that names a deep-linked item, e.g. "persona_id". */
  customKey: string;
  itemId: number;
  /** Whether the item asks for its own column when none was deep-linked. */
  wantsColumn: boolean;
  /** Stable id of the column, e.g. "persona-12". */
  resourceId: string;
  label: string;
  tag: string;
  comment: string;
}

export async function postCompletion(lti: ProviderInstance, token: IdToken, t: CompletionTarget): Promise<GradeResult> {
  const endpoint = token.platformContext.endpoint;
  if (!endpoint) return { posted: false, error: 'Platform did not grant grade services on this launch.' };
  try {
    let lineItemId: string | null = null;
    const launched = String(token.platformContext.custom?.[t.customKey] ?? '');
    if (endpoint.lineitem && launched === String(t.itemId)) {
      lineItemId = endpoint.lineitem;
    } else if (t.wantsColumn && endpoint.lineitems) {
      const found = await lti.Grade.getLineItems(token, { resourceId: t.resourceId });
      const match = found.lineItems.find((li) => li.resourceId === t.resourceId);
      lineItemId = match ? match.id : (await lti.Grade.createLineItem(token, { scoreMaximum: 1, label: t.label, resourceId: t.resourceId, tag: t.tag })).id;
    }
    if (!lineItemId) return { posted: false, error: 'No gradebook column for this item (gradebook posting is off).' };
    await lti.Grade.submitScore(token, lineItemId, {
      userId: token.user, scoreGiven: 1, scoreMaximum: 1, activityProgress: 'Completed', gradingProgress: 'FullyGraded', comment: t.comment,
    });
    return { posted: true };
  } catch (e) {
    const msg = (e as Error).message || String(e);
    console.warn(`grades: could not post completion for ${t.resourceId}: ${msg}`);
    return { posted: false, error: msg.slice(0, 500) };
  }
}
