import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { LOOPBACK_HOSTS } from './shared.js';

/**
 * The access a remote tool needs, listed on the tool as `securitySchemes` and
 * mirrored in its `_meta.securitySchemes` for clients that read only `_meta`.
 * It is a hint for clients: the backend checks the token's scopes on every
 * call, whatever a client does with it.
 */
export interface SecurityScheme {
  type: 'oauth2';
  scopes: string[];
}

/** What a host passes to answer a backend scope refusal with an OAuth challenge. */
export interface ScopeChallengeOptions {
  /** The host's RFC 9728 protected resource metadata URL. */
  resourceMetadataUrl: string;
}

export interface InsufficientScopeOptions extends ScopeChallengeOptions {
  /** The scopes the refused call needs. */
  scopes: readonly string[];
  /**
   * The scopes the access token already has, when known. The challenge then
   * asks for them together with the missing ones, so a client that requests
   * exactly the challenge's scope never ends up with fewer than before.
   */
  grantedScopes?: readonly string[];
}

/**
 * Thrown by a host's port when the backend refuses a call because the access
 * token lacks a scope. registerCatalogTools() with `scopeChallenge` answers it
 * with insufficientScopeResult() for the tool's own scopes; without that
 * option it is an ordinary tool error carrying this message.
 */
export class InsufficientScopeError extends Error {
  constructor(message = 'This connection is not authorized for this action.') {
    super(message);
    this.name = 'InsufficientScopeError';
  }
}

/** By class or by name, so a second copy of this module in a host's tree still counts. */
export function isInsufficientScopeError(err: unknown): boolean {
  return (
    err instanceof InsufficientScopeError ||
    (err as { name?: unknown } | null | undefined)?.name === 'InsufficientScopeError'
  );
}

/**
 * Printable ASCII without space, quote or backslash: an RFC 6749 scope-token,
 * and safe inside a quoted header value.
 */
const isHeaderSafe = (value: unknown): value is string =>
  typeof value === 'string' && /^[\x21\x23-\x5B\x5D-\x7E]+$/.test(value);

/** Throws unless the URL is https (http only on a loopback host) and safe inside a quoted header value. */
export function assertScopeChallengeOptions(options: ScopeChallengeOptions): void {
  const value = options?.resourceMetadataUrl;
  let url: URL | undefined;
  try {
    url = new URL(value);
  } catch {
    url = undefined;
  }
  const secure =
    url?.protocol === 'https:' || (url?.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname));
  if (!url || !secure || !isHeaderSafe(value)) {
    throw new Error(
      `scopeChallenge.resourceMetadataUrl must be an https URL, such as https://example.com/.well-known/oauth-protected-resource; got ${JSON.stringify(value)}.`,
    );
  }
}

/**
 * The result for a call the token's scopes don't cover: an error whose
 * `_meta["mcp/www_authenticate"]` holds an RFC 6750 insufficient_scope
 * challenge pointing at the protected resource metadata, so a client can ask
 * the user for the missing scopes and retry. The text tells the model the same.
 */
export function insufficientScopeResult(options: InsufficientScopeOptions): CallToolResult {
  assertScopeChallengeOptions(options);
  // Scope values that could break the header are left out of it.
  const scopes = options.scopes.filter(isHeaderSafe);
  const granted = options.grantedScopes?.filter(isHeaderSafe);
  const missing = granted ? scopes.filter((scope) => !granted.includes(scope)) : [];
  const shown = missing.length ? missing : scopes;
  const needed = shown.length
    ? `the ${shown.join(', ')} permission${shown.length === 1 ? '' : 's'}`
    : 'more permissions';
  const requested = granted ? [...new Set([...granted, ...scopes])] : [];
  const params = [
    `resource_metadata="${options.resourceMetadataUrl}"`,
    'error="insufficient_scope"',
    `error_description="This action needs ${needed}"`,
    ...(requested.length ? [`scope="${requested.join(' ')}"`] : []),
  ];
  return {
    content: [
      {
        type: 'text',
        text: `This connection doesn't have permission for this action yet: it needs ${needed}. Reconnect PostFast and allow it, then try again.`,
      },
    ],
    isError: true,
    _meta: { 'mcp/www_authenticate': [`Bearer ${params.join(', ')}`] },
  };
}
