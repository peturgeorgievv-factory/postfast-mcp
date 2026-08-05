import type {
  AnalyticsResponse,
  FollowerHistory,
  GbpLocation,
  PaginatedPosts,
  PinterestBoard,
  Place,
  SignedUploadUrl,
  SocialAccount,
  YouTubePlaylist,
} from './types.js';

export interface ListPostsArgs {
  page: number;
  limit: number;
  ids?: string[];
  platforms?: string[];
  statuses?: string[];
  from?: string;
  to?: string;
}

export interface CreatePostsArgs {
  posts: unknown[];
  status: string;
  approvalStatus: string;
  controls?: Record<string, unknown>;
}

export interface ApprovePostsArgs {
  postIds: string[];
  approvalStatus: string;
}

export interface AnalyticsArgs {
  startDate: string;
  endDate: string;
  platforms?: string[];
  socialMediaIds?: string[];
}

export interface FollowerHistoryArgs {
  socialMediaId: string;
  from?: string;
  to?: string;
}

export interface ConnectLinkArgs {
  expiryDays: number;
  sendEmail: boolean;
  email?: string;
}

export interface UploadUrlsArgs {
  contentType: string;
  count: number;
}

export interface UploadFromUrlArgs {
  sourceUrl: string;
  contentType?: string;
}

/** Remote conversation-media upload: a client-provided file ref or base64 bytes. */
export interface UploadMediaArgs {
  file?: {
    download_url: string;
    file_id: string;
    mime_type?: string;
    file_name?: string;
  };
  data?: string;
  contentType?: string;
}

export interface LocalUploadResult {
  key: string;
  type: 'IMAGE' | 'VIDEO';
  contentType: string;
}

/**
 * Everything the catalog tools need from a backend. The stdio bin implements
 * it over the public REST API (pf-api-key); the deployed host implements it
 * over its command gateway + upload service. `workspaceId` is only ever set on
 * the remote binding — adapters without workspace switching ignore it.
 *
 * Adapters may throw from methods whose tools they never register
 * (e.g. the REST adapter for the remote-only conversation-media uploads).
 */
export interface BackendPort {
  listWorkspaces(): Promise<unknown>;
  listAccounts(workspaceId?: string): Promise<SocialAccount[] | unknown>;
  getFollowerHistory(
    args: FollowerHistoryArgs,
    workspaceId?: string,
  ): Promise<FollowerHistory | unknown>;
  listPinterestBoards(
    socialMediaId: string,
    workspaceId?: string,
  ): Promise<PinterestBoard[] | unknown>;
  listYoutubePlaylists(
    socialMediaId: string,
    workspaceId?: string,
  ): Promise<YouTubePlaylist[] | unknown>;
  listGbpLocations(
    socialMediaId: string,
    workspaceId?: string,
  ): Promise<GbpLocation[] | unknown>;
  searchPlaces(query: string, workspaceId?: string): Promise<Place[] | unknown>;
  generateConnectLink(
    args: ConnectLinkArgs,
    workspaceId?: string,
  ): Promise<{ connectUrl: string } | unknown>;
  listPosts(args: ListPostsArgs, workspaceId?: string): Promise<PaginatedPosts | unknown>;
  createPosts(
    args: CreatePostsArgs,
    workspaceId?: string,
  ): Promise<{ postIds: string[] } | unknown>;
  approvePosts(args: ApprovePostsArgs, workspaceId?: string): Promise<unknown>;
  deletePost(id: string, workspaceId?: string): Promise<{ deleted: boolean } | unknown>;
  getPostAnalytics(
    args: AnalyticsArgs,
    workspaceId?: string,
  ): Promise<AnalyticsResponse | unknown>;
  getUploadUrls(
    args: UploadUrlsArgs,
    workspaceId?: string,
  ): Promise<SignedUploadUrl[] | unknown>;
  /** stdio only: read a local file and push it through the signed-URL flow. */
  uploadLocalFile(filePath: string): Promise<LocalUploadResult>;
  /** Remote only: server-side fetch of a public https URL (SSRF-guarded in the host). */
  uploadFromUrl(args: UploadFromUrlArgs, workspaceId?: string): Promise<unknown>;
  /** Remote only: upload a conversation-attached file or base64 bytes. */
  uploadMedia(args: UploadMediaArgs, workspaceId?: string): Promise<unknown>;
}
