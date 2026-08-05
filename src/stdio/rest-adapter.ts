import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import type {
  AnalyticsArgs,
  ApprovePostsArgs,
  BackendPort,
  ConnectLinkArgs,
  CreatePostsArgs,
  FollowerHistoryArgs,
  ListPostsArgs,
  LocalUploadResult,
  UploadUrlsArgs,
} from '../core/backend-port.js';
import type { SignedUploadUrl } from '../core/types.js';

const DEFAULT_BASE_URL = 'https://api.postfa.st';

const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};

function detectContentType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  const mime = MIME_MAP[ext];
  if (!mime) {
    throw new Error(
      `Unsupported file extension "${ext}". Supported: ${Object.keys(MIME_MAP).join(', ')}`,
    );
  }
  return mime;
}

/** The stdio bin's BackendPort: the public PostFast REST API over pf-api-key. */
export class RestAdapter implements BackendPort {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.POSTFAST_API_KEY ?? '';
    this.baseUrl = (process.env.POSTFAST_API_URL ?? DEFAULT_BASE_URL).replace(
      /\/$/,
      '',
    );

    if (!this.apiKey) {
      throw new Error(
        'POSTFAST_API_KEY environment variable is required. Generate one in PostFast → Workspace Settings → API Key.',
      );
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | undefined>,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== '') {
          url.searchParams.set(key, value);
        }
      }
    }

    const headers: Record<string, string> = {
      'pf-api-key': this.apiKey,
      'Content-Type': 'application/json',
    };

    const response = await fetch(url.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      let message: string;

      try {
        const json = JSON.parse(text);
        message = json.message ?? json.error ?? text;
      } catch {
        message = text;
      }

      throw new Error(`PostFast API error (${response.status}): ${message}`);
    }

    const text = await response.text();
    if (!text) return undefined as T;

    return JSON.parse(text) as T;
  }

  private get<T>(path: string, query?: Record<string, string | undefined>): Promise<T> {
    return this.request<T>('GET', path, undefined, query);
  }

  private post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  listWorkspaces(): Promise<unknown> {
    throw new Error('list_workspaces is not available over the public REST API.');
  }

  listAccounts(): Promise<unknown> {
    return this.get('/social-media/my-social-accounts');
  }

  getFollowerHistory(args: FollowerHistoryArgs): Promise<unknown> {
    return this.get(`/social-media/${args.socialMediaId}/follower-history`, {
      from: args.from,
      to: args.to,
    });
  }

  listPinterestBoards(socialMediaId: string): Promise<unknown> {
    return this.get(`/social-media/${socialMediaId}/pinterest-boards`);
  }

  listYoutubePlaylists(socialMediaId: string): Promise<unknown> {
    return this.get(`/social-media/${socialMediaId}/youtube-playlists`);
  }

  listGbpLocations(socialMediaId: string): Promise<unknown> {
    return this.get(`/social-media/${socialMediaId}/gbp-locations`);
  }

  searchPlaces(query: string): Promise<unknown> {
    return this.get('/social-media/search-places', { q: query });
  }

  generateConnectLink(args: ConnectLinkArgs): Promise<unknown> {
    return this.post('/social-media/connect-link', {
      expiryDays: args.expiryDays,
      sendEmail: args.sendEmail,
      email: args.email,
    });
  }

  listPosts(args: ListPostsArgs): Promise<unknown> {
    return this.get('/social-posts', {
      page: String(args.page),
      limit: String(args.limit),
      ids: args.ids?.join(','),
      platforms: args.platforms?.join(','),
      statuses: args.statuses?.join(','),
      from: args.from,
      to: args.to,
    });
  }

  createPosts(args: CreatePostsArgs): Promise<unknown> {
    return this.post('/social-posts', {
      posts: args.posts,
      status: args.status,
      approvalStatus: args.approvalStatus,
      controls: args.controls,
    });
  }

  approvePosts(_args: ApprovePostsArgs): Promise<unknown> {
    throw new Error('approve_posts is not available over the public REST API.');
  }

  deletePost(id: string): Promise<unknown> {
    return this.request('DELETE', `/social-posts/${id}`);
  }

  getPostAnalytics(args: AnalyticsArgs): Promise<unknown> {
    return this.get('/social-posts/analytics', {
      startDate: args.startDate,
      endDate: args.endDate,
      platforms: args.platforms?.join(','),
      socialMediaIds: args.socialMediaIds?.join(','),
    });
  }

  getUploadUrls(args: UploadUrlsArgs): Promise<unknown> {
    return this.post('/file/get-signed-upload-urls', {
      contentType: args.contentType,
      count: args.count,
    });
  }

  async uploadLocalFile(filePath: string): Promise<LocalUploadResult> {
    const contentType = detectContentType(filePath);
    const isVideo = contentType.startsWith('video/');

    const [uploadUrl] = await this.post<SignedUploadUrl[]>(
      '/file/get-signed-upload-urls',
      { contentType, count: 1 },
    );

    const fileBuffer = await readFile(filePath);

    const uploadResponse = await fetch(uploadUrl.signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: fileBuffer,
    });

    if (!uploadResponse.ok) {
      throw new Error(
        `Upload failed (${uploadResponse.status}): ${await uploadResponse.text()}`,
      );
    }

    return {
      key: uploadUrl.key,
      type: isVideo ? 'VIDEO' : 'IMAGE',
      contentType,
    };
  }

  uploadFromUrl(): Promise<unknown> {
    throw new Error('upload_from_url is only available on the hosted PostFast MCP server.');
  }

  uploadMedia(): Promise<unknown> {
    throw new Error(
      'Conversation-media upload is only available on the hosted PostFast MCP server.',
    );
  }
}
