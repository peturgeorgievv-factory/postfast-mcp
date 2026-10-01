import { readFileSync } from 'node:fs';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
// Type-only: a dev dependency that checks the `_meta` shapes below at build
// time and is bundled into the view; nothing imports it at runtime.
import type {
  OpenAIUiResourceMetadata,
  OpenAIUiToolMetadata,
} from '@openai/mcp-extensions/server';
import type { ToolIcon } from './tool-def.js';
import type { AppEntrypoint } from './types.js';

// The parts of ext-apps' McpUiToolMeta and McpUiResourceMeta used here. Its
// package types don't resolve under Node16 module resolution, so the tests
// check the emitted `_meta` against its runtime schemas instead.
interface McpUiToolMeta {
  resourceUri?: string;
  visibility?: ('model' | 'app')[];
}
interface McpUiResourceMeta {
  csp?: { connectDomains?: string[]; resourceDomains?: string[] };
  domain?: string;
  prefersBorder?: boolean;
}

/**
 * What a host passes to turn the calendar app on (BuildToolsOptions.app).
 * Each value is an origin (scheme and host, no path) that differs per
 * deployment.
 */
export interface AppOptions {
  /** Serves the signed media URLs: the only origin the view loads images and video from. */
  mediaOrigin: string;
  /** The view's dedicated origin (`_meta.ui.domain`). */
  domain: string;
  /** The PostFast web app, target of the "Open in PostFast" links. */
  webAppUrl: string;
}

/** Versioned: a change an open view can't handle ships under a new URI. */
export const APP_RESOURCE_URI = 'ui://postfast/app-v1';
export const APP_RESOURCE_MIME_TYPE = 'text/html;profile=mcp-app';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Throws unless every option is a bare origin: https, or http on a loopback host. */
export function assertAppOptions(app: AppOptions): void {
  for (const key of ['mediaOrigin', 'domain', 'webAppUrl'] as const) {
    const value = app?.[key];
    let url: URL | undefined;
    try {
      url = new URL(value);
    } catch {
      url = undefined;
    }
    const secure =
      url?.protocol === 'https:' ||
      (url?.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname));
    if (!url || !secure || url.origin !== value) {
      throw new Error(
        `app.${key} must be an https origin with no path, such as https://example.com; got ${JSON.stringify(value)}.`,
      );
    }
  }
}

/**
 * Tool `_meta` for the app. With an entrypoint, the tool opens the view and is
 * listed in the host's sidebar (global) or as a conversation tab (thread);
 * without one, only the view can call it. Every app tool is hidden from the
 * model.
 */
export function appToolMeta(entrypoint?: AppEntrypoint): Record<string, unknown> {
  if (!entrypoint) {
    return { ui: { visibility: ['app'] } satisfies McpUiToolMeta };
  }
  return {
    ui: { resourceUri: APP_RESOURCE_URI, visibility: ['app'] } satisfies McpUiToolMeta,
    // The flat key older hosts read; ext-apps' registerAppTool writes both.
    'ui/resourceUri': APP_RESOURCE_URI,
    'openai/ui': { entrypoints: [{ type: entrypoint }] } satisfies OpenAIUiToolMetadata,
    'openai/iconStyle': 'monochrome',
  };
}

/** Resource `_meta`: images and video only from the media origin, no network access, fullscreen. */
function appResourceMeta(app: AppOptions): Record<string, unknown> {
  return {
    ui: {
      csp: { resourceDomains: [app.mediaOrigin], connectDomains: [] },
      domain: app.domain,
      prefersBorder: false,
    } satisfies McpUiResourceMeta,
    'openai/ui': { preferredDisplayMode: 'fullscreen' } satisfies OpenAIUiResourceMetadata,
  };
}

// A calendar outline: 20x20, 1.33 px strokes, currentColor, transparent.
const CALENDAR_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.33" stroke-linecap="round" stroke-linejoin="round">' +
  '<rect x="3" y="4.5" width="14" height="12.5" rx="2.5"/>' +
  '<path d="M3 8.5h14M7 3v3M13 3v3M6.5 11.75h1.5M9.25 11.75h1.5M12 11.75h1.5M6.5 14.25h1.5M9.25 14.25h1.5"/>' +
  '</svg>';

/** The entrypoint icon in tools/list. */
export const APP_ICON: ToolIcon = {
  src: `data:image/svg+xml;base64,${Buffer.from(CALENDAR_SVG).toString('base64')}`,
  mimeType: 'image/svg+xml',
  sizes: ['any'],
};

let viewHtml: string | undefined;

/** The built view, one self-contained HTML file (dist/view/index.html), read once. */
export function appViewHtml(): string {
  viewHtml ??= readFileSync(new URL('../view/index.html', import.meta.url), 'utf8');
  return viewHtml;
}

/** Registers the view as the app's UI resource. */
export function registerAppResource(server: McpServer, app: AppOptions): void {
  const text = appViewHtml();
  const _meta = appResourceMeta(app);
  server.registerResource(
    'postfast-calendar',
    APP_RESOURCE_URI,
    {
      title: 'PostFast Calendar',
      description: 'The PostFast content calendar view.',
      mimeType: APP_RESOURCE_MIME_TYPE,
      _meta,
    },
    async () => ({
      contents: [{ uri: APP_RESOURCE_URI, mimeType: APP_RESOURCE_MIME_TYPE, text, _meta }],
    }),
  );
}

type RequestHandler = (request: unknown, extra: unknown) => Promise<unknown>;

/**
 * Lists icons on the named tools in tools/list. McpServer has no field for
 * tool icons, so this wraps its tools/list handler and adds `icons` to those
 * tools only; every other field stays the SDK's own output. If the SDK keeps
 * its handlers elsewhere, the icons are skipped with a log and the host falls
 * back to the app's own logo.
 */
export function listToolIcons(server: McpServer, icons: Map<string, ToolIcon[]>): void {
  const handlers = (server.server as unknown as { _requestHandlers?: unknown })._requestHandlers;
  const list =
    handlers instanceof Map ? (handlers.get('tools/list') as RequestHandler | undefined) : undefined;
  if (!list) {
    console.error('[postfast-mcp/core] tool icons not listed: no tools/list handler to wrap');
    return;
  }
  (handlers as Map<string, RequestHandler>).set('tools/list', async (request, extra) => {
    const result = (await list(request, extra)) as { tools?: { name: string; icons?: ToolIcon[] }[] };
    for (const tool of result.tools ?? []) {
      const toolIcons = icons.get(tool.name);
      if (toolIcons) tool.icons = toolIcons;
    }
    return result;
  });
}
