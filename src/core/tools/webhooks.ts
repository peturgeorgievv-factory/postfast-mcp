import { z } from 'zod';
import type {
  CreateWebhookEndpointArgs,
  ListWebhookDeliveriesArgs,
  TestWebhookEndpointArgs,
  UpdateWebhookEndpointArgs,
} from '../backend-port.js';
import { WEBHOOK_EVENTS } from '../shared.js';
import type { Binding, ToolAnnotations, ToolDef } from '../tool-def.js';

/**
 * Webhook endpoints: register, change, test and delete the URLs where PostFast
 * sends signed events (Standard Webhooks), and read each endpoint's delivery
 * log. A model learns the delivery rules only from these descriptions: the
 * secret is returned once, an endpoint receives every event of its types from
 * the whole workspace, the URL rules and the cap of 5 active endpoints, the
 * retry schedule and what turns an endpoint off. The backend answers errors
 * with a bare code, so the descriptions say what each code means.
 *
 * On the remote binding only workspace admins may call these tools, whatever
 * the token's scopes, and registering or changing an endpoint sends workspace
 * data to another server, so that text waits for the user's yes. Every def
 * carries portMethod, so an adapter that predates this wave skips the tools
 * instead of shipping broken ones.
 */

/** Every webhook tool's scope, reads included (the backend gates them all on it). */
const SCOPES = ['webhooks:manage'];

const REMOTE_ADMIN_ONLY =
  " Only workspace admins can use this tool; for anyone else it fails with webhook.forbidden, which reconnecting doesn't fix.";

/** The shared text, then what only the remote or only the stdio binding gets. */
const describe = (binding: Binding, shared: string, remote = '', stdio = '') =>
  shared + (binding === 'remote' ? remote + REMOTE_ADMIN_ONLY : stdio);

const READ: ToolAnnotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

const ENDPOINT_ID = 'Webhook endpoint id (from list_webhook_endpoints)';

const URL_RULES =
  "The receiver's URL: https on port 443, with a public hostname that contains a dot (no IP address, no localhost or internal name, no user:password@) and resolves to public addresses; at most 2,048 characters. A URL that breaks a rule fails with webhook.urlNotHttps, webhook.urlPortNotAllowed, webhook.urlHostNotAllowed, webhook.urlPrivateAddress (it resolves to a private address), webhook.urlResolutionFailed (the hostname doesn't resolve) or webhook.invalidUrl.";

const EVENT_TYPES =
  "Event types to send, each at most once: post.published (a post was published), post.failed (a post failed for good, with the reason in data.post.lastError; never sent for a failure that will still be retried), account.connected (an account was connected or reconnected; data.reconnected is true for a reconnect, and data.externalId carries the connect link's externalId when it had one) and account.disconnected (PostFast paused an account, for example because its access expired or was revoked). webhook.test can't be chosen: only test_webhook_endpoint sends it.";

export const webhookTools: ToolDef[] = [
  {
    name: 'list_webhook_endpoints',
    binding: 'both',
    title: 'List Webhook Endpoints',
    description: (binding) =>
      describe(
        binding,
        "List the workspace's webhook endpoints: the URLs where PostFast sends a signed JSON event when a post publishes or fails for good, or when an account connects or disconnects. Oldest first, turned-off ones included. Each has id, url, events, description, active, disabledReason (GONE: its receiver answered 410 Gone; FAILING: its deliveries failed for five days and the workspace owner was emailed; null while it is active, or when a user turned it off), lastSuccessAt and lastFailureAt. The signing secret is never listed: create_webhook_endpoint returns it once. To see what was sent and how the receiver answered, use list_webhook_deliveries.",
      ),
    inputSchema: {},
    annotations: READ,
    scopes: SCOPES,
    portMethod: 'listWebhookEndpoints',
    run: (port, _args, workspaceId) => port.listWebhookEndpoints!(workspaceId),
  },
  {
    name: 'get_webhook_endpoint',
    binding: 'both',
    title: 'Get Webhook Endpoint',
    description: (binding) =>
      describe(
        binding,
        "Fetch one webhook endpoint by id, with the fields list_webhook_endpoints gives (never the signing secret). An id that isn't in this workspace, or was deleted, fails with webhook.notFound.",
      ),
    inputSchema: {
      id: z.uuid().describe(ENDPOINT_ID),
    },
    annotations: READ,
    scopes: SCOPES,
    portMethod: 'getWebhookEndpoint',
    run: (port, args, workspaceId) => port.getWebhookEndpoint!(args.id as string, workspaceId),
  },
  {
    name: 'create_webhook_endpoint',
    binding: 'both',
    title: 'Create Webhook Endpoint',
    description: (binding) =>
      describe(
        binding,
        'Register a webhook endpoint: a URL where PostFast sends a signed JSON POST for every event of the chosen types, { id, type, timestamp, workspaceId, data }, where data.post is a post as list_posts returns it and data.account an account as list_accounts returns it. The endpoint gets these events from the whole workspace, for every account; a receiver that wants one account checks data.post.socialMediaId (or data.post.platform) or data.account.id. A workspace can have 5 active endpoints (turned-off ones don\'t count); one more fails with webhook.limitReached. The answer is the endpoint plus secret (whsec_…), shown this once: PostFast never returns it again, so give it to the user and tell them to store it in their receiver now (if it is lost, delete the endpoint and create a new one). The receiver checks every delivery with it as Standard Webhooks specifies: the webhook-id, webhook-timestamp and webhook-signature headers, verified over the raw request body; a Standard Webhooks library such as standardwebhooks does this. A delivery counts when the receiver answers 2xx within 15 seconds; redirects are not followed. Anything else is retried up to 7 more times over about a day (after 5 s, 5 min, 30 min, 2 h, 4 h, 6 h and 7 h). A 410 Gone answer turns the endpoint off at once, and five days of failures with no success turn it off and email the workspace owner. An event can arrive twice and events can arrive out of order, so the receiver should skip an id it has already handled. Offer test_webhook_endpoint to check the receiver.',
        ' Use only a URL the user gave you. From then on every such event, with its post or account data, goes to that URL, so show the user the URL and the event types and call this only after they say yes in the conversation.',
      ),
    inputSchema: {
      url: z.url().max(2048).describe(URL_RULES),
      events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).max(4).describe(EVENT_TYPES),
      description: z
        .string()
        .max(255)
        .optional()
        .describe('A note to tell endpoints apart, such as what the receiver is for (max 255 characters)'),
    },
    // Not destructive: it adds an endpoint and changes none. Open world: from
    // then on PostFast sends workspace events to the URL's server. Not
    // idempotent: a second call makes a second endpoint with its own secret.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    scopes: SCOPES,
    portMethod: 'createWebhookEndpoint',
    run: (port, args, workspaceId) =>
      port.createWebhookEndpoint!(args as unknown as CreateWebhookEndpointArgs, workspaceId),
  },
  {
    name: 'update_webhook_endpoint',
    binding: 'both',
    title: 'Update Webhook Endpoint',
    description: (binding) =>
      describe(
        binding,
        "Change a webhook endpoint: its url, events or description, or turn it off (active false) or back on (active true). Fields you omit keep their value; description null removes the description. A new url follows the rules of create_webhook_endpoint, keeps the same signing secret, and starts the endpoint's failure count afresh. active true turns an endpoint back on, whether PostFast turned it off (disabledReason GONE or FAILING) or a user did, and resets its failure count; it fails with webhook.limitReached when the workspace already has 5 active endpoints. Events that happen while an endpoint is off are never sent to it, not even after it is turned back on. An id that isn't in this workspace fails with webhook.notFound. Returns the updated endpoint.",
        ' A new url must be one the user gave you. Show the user what will change and call this only after they say yes in the conversation.',
      ),
    inputSchema: {
      id: z.uuid().describe(ENDPOINT_ID),
      url: z
        .url()
        .max(2048)
        .optional()
        .describe('New receiver URL, under the rules of create_webhook_endpoint'),
      events: z
        .array(z.enum(WEBHOOK_EVENTS))
        .min(1)
        .max(4)
        .optional()
        .describe('The event types to send from now on, replacing the current ones (the values create_webhook_endpoint takes)'),
      description: z
        .string()
        .max(255)
        .nullable()
        .optional()
        .describe('New note (max 255 characters), or null to remove it'),
      active: z
        .boolean()
        .optional()
        .describe('false turns the endpoint off; true turns it back on and resets its failure count'),
    },
    // Destructive: it overwrites the endpoint's settings, and events that
    // happen while an endpoint is off, or of a type taken off it, are never
    // sent. Idempotent: the same change again leaves the endpoint as it is.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    scopes: SCOPES,
    portMethod: 'updateWebhookEndpoint',
    run: (port, args, workspaceId) =>
      port.updateWebhookEndpoint!(args as unknown as UpdateWebhookEndpointArgs, workspaceId),
  },
  {
    name: 'delete_webhook_endpoint',
    binding: 'both',
    title: 'Delete Webhook Endpoint',
    description: (binding) =>
      describe(
        binding,
        "Delete a webhook endpoint by id. PostFast stops sending to it at once: deliveries still waiting are dropped, and its delivery log and signing secret are deleted with it. To pause an endpoint instead, set active false with update_webhook_endpoint. An id that isn't in this workspace fails with webhook.notFound. Returns { ok: true }.",
        " Deleting can't be undone, so show the user which endpoint (its url and description) and call this only after they say yes in the conversation.",
        ' The deletion cannot be undone.',
      ),
    inputSchema: {
      id: z.uuid().describe(ENDPOINT_ID),
    },
    // openWorld false: it removes PostFast's record only; no call goes out.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    scopes: SCOPES,
    portMethod: 'deleteWebhookEndpoint',
    run: (port, args, workspaceId) => port.deleteWebhookEndpoint!(args.id as string, workspaceId),
  },
  {
    name: 'test_webhook_endpoint',
    binding: 'both',
    title: 'Test Webhook Endpoint',
    description: (binding) =>
      describe(
        binding,
        'Send one signed test delivery to a webhook endpoint now and report how its receiver answered: { eventId, type, delivered, statusCode, latencyMs, error }. It waits up to 15 seconds for the receiver, and the call succeeds even when the receiver failed, so read delivered, statusCode and error (null when delivered; otherwise timeout, connection, tls, redirect, http_4xx, http_5xx, gone, blocked_address, payload_too_large, or internal, which is PostFast\'s own failure). Without sampleEvent it sends a webhook.test event, whose data is { webhook: { id, url }, message }. With sampleEvent it sends a fixed sample of that event type, built exactly like a real one so the receiver can be set up before any real event happens: ids of zeros, platform X, the post text "Sample post from PostFast" or the account @sample, and no real post or account data. A test counts like any delivery: it shows in list_webhook_deliveries, a failure adds to the endpoint\'s failure count, and a 410 Gone answer turns the endpoint off. webhook.disabled means PostFast has webhooks switched off for now, not that this endpoint is off.',
        ' The receiver may act on a test as on a real event, so send one only when the user asks.',
      ),
    inputSchema: {
      id: z.uuid().describe(ENDPOINT_ID),
      sampleEvent: z
        .enum(WEBHOOK_EVENTS)
        .optional()
        .describe('Send a fixed sample of this event type instead of webhook.test'),
    },
    // Open world: it calls the receiver's server. Not destructive: it changes
    // no setting (a 410 answer turns the endpoint off, which active true
    // undoes). Not idempotent: every call is a new delivery with a new eventId.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    scopes: SCOPES,
    portMethod: 'testWebhookEndpoint',
    run: (port, args, workspaceId) =>
      port.testWebhookEndpoint!(args as unknown as TestWebhookEndpointArgs, workspaceId),
  },
  {
    name: 'list_webhook_deliveries',
    binding: 'both',
    title: 'List Webhook Deliveries',
    description: (binding) =>
      describe(
        binding,
        "List a webhook endpoint's delivery log, newest first: every delivery to it from the last 30 days, with how the receiver answered. Use it to find out why an event did or didn't arrive. Each row has eventId (evt_…, the webhook-id header the receiver got), eventType, resourceId (the post id for post events, the account id for account events, the endpoint id for webhook.test, null for a sample), status, attempts (each with n, at, statusCode, latencyMs and error), lastStatusCode, lastErrorCode, nextAttemptAt, completedAt and payload (the body exactly as sent). status is SUCCEEDED, FAILED (every attempt failed, the receiver answered 410 Gone, or the event was too large to send), PENDING (still being delivered: a nextAttemptAt in the future means a retry is scheduled, up to 8 attempts over about a day) or SKIPPED (not sent because the endpoint was off when the delivery came due, possibly after failed attempts; while an endpoint is off, its PENDING rows end this way unless it is turned back on before they come due). Error codes: timeout, connection, tls, redirect (redirects are not followed), http_4xx, http_5xx, gone (410), blocked_address (PostFast refused to connect because the hostname resolved to a private address), exhausted, payload_too_large (the event was too large to send) and internal (PostFast's own failure, not the receiver's). Only the receiver's status code is kept, never its response body. totalCount and pageInfo.hasNextPage are filled only when getCount is true, so ask for it on the first page; without it, a full page may have more after it. An id that isn't in this workspace, or was deleted, gives an empty page rather than an error; get_webhook_endpoint tells whether it exists.",
      ),
    inputSchema: {
      endpointId: z.uuid().describe(ENDPOINT_ID),
      page: z.number().int().min(0).default(0).describe('Page number (0-based)'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(10)
        .describe('Deliveries per page (max 100; every row carries the full event payload)'),
      getCount: z
        .boolean()
        .optional()
        .describe('Count the whole log, which fills totalCount and pageInfo.hasNextPage. Ask for it on the first page only.'),
    },
    annotations: READ,
    scopes: SCOPES,
    portMethod: 'listWebhookDeliveries',
    run: (port, args, workspaceId) =>
      port.listWebhookDeliveries!(args as unknown as ListWebhookDeliveriesArgs, workspaceId),
  },
];
