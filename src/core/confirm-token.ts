import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

/**
 * Tokens that tie a comment reply, private reply or deletion to exactly what
 * its preview tool showed: an HMAC over the workspace, item, action and text.
 * Format `v1.<exp>.<jti>.<base64url mac>`, exp in epoch seconds. Stateless
 * apart from the used-jti list below, so a token verifies on any replica of a
 * host. The action is signed too, so a token previewed for one operation never
 * carries out another.
 */

export type ConfirmAction = 'REPLY' | 'PRIVATE_REPLY' | 'DELETE';

export interface ConfirmFields {
  ws?: string;
  itemId: string;
  action: ConfirmAction;
  text?: string;
}

const TTL_SECONDS = 900;

/** The tool that previews each action, named in the errors so the model knows how to start over. */
const PREVIEW_TOOLS: Record<ConfirmAction, string> = {
  REPLY: 'preview_comment_reply',
  PRIVATE_REPLY: 'preview_private_reply',
  DELETE: 'preview_comment_deletion',
};

const missing = (action: ConfirmAction) =>
  `confirmToken is required. Preview it first with ${PREVIEW_TOOLS[action]}.`;
const mismatch = (action: ConfirmAction) =>
  `confirmToken does not match this request. Preview it again with ${PREVIEW_TOOLS[action]} and pass exactly what was previewed.`;
const expired = (action: ConfirmAction) =>
  `confirmToken has expired. Preview it again with ${PREVIEW_TOOLS[action]}.`;
const USED = 'This confirmToken was already used.';

/**
 * jti -> exp of every redeemed token that has not expired yet. Module-level,
 * so it spans sessions and buildTools() calls, but it is per process: a token
 * replayed on another replica of a host is not caught here. The reply tools
 * send the jti as the backend's idempotency key, so such a replay sends once.
 */
const usedJtis = new Map<string, number>();

function prune(nowSeconds: number): void {
  for (const [jti, exp] of usedJtis) {
    if (exp < nowSeconds) usedJtis.delete(jti);
  }
}

function mac(secret: string, exp: number, jti: string, fields: ConfirmFields): string {
  // DELETE carries no text: any text passed is ignored when signing and when
  // verifying, so a confirm that echoes one still matches.
  const text = fields.action === 'DELETE' ? '' : (fields.text ?? '');
  return createHmac('sha256', secret)
    .update(
      JSON.stringify(['v1', exp, jti, fields.ws ?? '', fields.itemId, fields.action, text]),
    )
    .digest('base64url');
}

export function sign(
  fields: ConfirmFields,
  secret: string,
  now: number = Date.now(),
): { confirmToken: string; expiresAt: string } {
  const nowSeconds = Math.floor(now / 1000);
  prune(nowSeconds);
  const exp = nowSeconds + TTL_SECONDS;
  const jti = randomUUID();
  return {
    confirmToken: `v1.${exp}.${jti}.${mac(secret, exp, jti, fields)}`,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

/**
 * Verify a token against the caller's own values and reserve its jti in the
 * same synchronous step, so two concurrent confirms cannot both pass. Returns
 * the jti, which identifies this one approved action, and a release() for
 * when the action itself then fails.
 */
export function redeem(
  confirmToken: string,
  fields: ConfirmFields,
  secret: string,
  now: number = Date.now(),
): { jti: string; release: () => void } {
  const nowSeconds = Math.floor(now / 1000);
  prune(nowSeconds);
  if (typeof confirmToken !== 'string' || !confirmToken) {
    throw new Error(missing(fields.action));
  }
  const parts = confirmToken.split('.');
  const [version, expText, jti, given] = parts;
  if (parts.length !== 4 || version !== 'v1' || !/^\d+$/.test(expText)) {
    throw new Error(mismatch(fields.action));
  }
  const exp = Number(expText);
  if (nowSeconds > exp) throw new Error(expired(fields.action));
  const expected = Buffer.from(mac(secret, exp, jti, fields));
  const actual = Buffer.from(given);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error(mismatch(fields.action));
  }
  if (usedJtis.has(jti)) throw new Error(USED);
  usedJtis.set(jti, exp);
  return {
    jti,
    release: () => {
      usedJtis.delete(jti);
    },
  };
}
