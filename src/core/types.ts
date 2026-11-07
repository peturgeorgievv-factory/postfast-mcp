export type Platform =
  | 'FACEBOOK'
  | 'INSTAGRAM'
  | 'X'
  | 'TIKTOK'
  | 'LINKEDIN'
  | 'YOUTUBE'
  | 'BLUESKY'
  | 'THREADS'
  | 'PINTEREST'
  | 'TELEGRAM'
  | 'GOOGLE_BUSINESS_PROFILE';

export type PostStatus = 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'FAILED';

export type ApprovalStatus =
  | 'PENDING_APPROVAL'
  | 'IN_PROGRESS'
  | 'APPROVED'
  | 'REJECTED'
  | 'NEEDS_WORK';

/** Health of a connected social account. CONNECTED = healthy; DISABLED = paused, needs reconnect. */
export type ConnectionStatus = 'CONNECTED' | 'DISABLED';

/**
 * Why an account is DISABLED. Only TOKEN_REVOKED and ACCOUNT_SUSPENDED are emitted
 * today; PERMISSION_REVOKED and MANUAL are reserved so the schema stays stable when
 * they are wired up later.
 */
export type DisabledReason =
  | 'TOKEN_REVOKED'
  | 'ACCOUNT_SUSPENDED'
  | 'PERMISSION_REVOKED'
  | 'MANUAL';

export interface SocialPost {
  id: string;
  content: string;
  status: PostStatus;
  approvalStatus: ApprovalStatus;
  socialMediaId: string;
  mediaItems: MediaItem[];
  scheduledAt: string | null;
  publishedAt: string | null;
  failedAt: string | null;
  platformPostId: string | null;
  groupId: string | null;
  firstComment: string | null;
  firstCommentError: string | null;
  controls: ReadablePostControls;
  /**
   * Present on FAILED (and missed) posts. `code` carries platform-specific error codes
   * plus two scheduling codes: MISSED_DISCONNECTED (account was disconnected when the
   * post was due) and MISSED_NOT_PUBLISHED (passed scheduled time + 2h grace unpublished).
   */
  lastError: { message: string; code: string | null } | null;
}

/**
 * The post settings list_posts reads back, each null when unset. Only the field
 * for the post's own platform is meaningful: posts created through the API store
 * every platform's defaults.
 */
export interface ReadablePostControls {
  threadsTopicTag: string | null;
  instagramPublishType: 'TIMELINE' | 'STORY' | 'REEL' | null;
  facebookContentType: 'POST' | 'REEL' | 'STORY' | null;
  tiktokIsDraft: boolean | null;
  youtubePrivacy: 'PUBLIC' | 'PRIVATE' | 'UNLISTED' | null;
}

/**
 * What an uploaded file is for: IMAGE and VIDEO keys go in mediaItems, a CAPTION
 * key in controls.youtubeCaptionKey, a DOCUMENT key in controls.linkedinAttachmentKey.
 */
export type UploadType = 'IMAGE' | 'VIDEO' | 'CAPTION' | 'DOCUMENT';

export interface MediaItem {
  key: string;
  type: 'IMAGE' | 'VIDEO';
  sortOrder: number;
  url?: string;
  coverImageKey?: string;
  coverTimestamp?: string;
}

export interface PaginatedPosts {
  data: SocialPost[];
  totalCount: number;
  pageInfo: { page: number; hasNextPage: boolean; perPage: number };
}

export interface SocialAccount {
  id: string;
  platform: Platform;
  platformUsername: string | null;
  displayName: string | null;
  /** Always present. If DISABLED, the account won't publish until the user reconnects. */
  connectionStatus: ConnectionStatus;
  /** Non-null only when connectionStatus is DISABLED. */
  disabledReason: DisabledReason | null;
  /** Whether the account can appear in the social inbox (comment ingestion). */
  inboxCapable: boolean;
  /** Latest stored follower snapshot (string bigint); absent for platforms without follower data. */
  followerCount?: string;
  /** When the follower snapshot was captured (ISO 8601); absent when followerCount is. */
  followerCountUpdatedAt?: string;
}

export interface PinterestBoard {
  id: string;
  boardId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
}

export interface YouTubePlaylist {
  id: string;
  playlistId: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
}

export interface GbpLocation {
  id: string;
  locationId: string;
  title: string;
  address: string | null;
  mapsUri: string | null;
}

/** A taggable place from search_places. The id works for both facebookPlaceId and instagramLocationId. */
export interface Place {
  id: string;
  name: string;
  /** The place's Facebook Page URL. Usually present, but treat as optional. */
  link: string | null;
  city: string | null;
  country: string | null;
  street: string | null;
  zip: string | null;
  pictureUrl: string | null;
}

export interface SignedUploadUrl {
  key: string;
  signedUrl: string;
}

export interface PostMetric {
  impressions: string;
  reach: string;
  likes: string;
  comments: string;
  shares: string;
  totalInteractions: string;
  fetchedAt: string;
  extras: Record<string, unknown>;
  // Normalized video watch-time in seconds (video posts only, where the platform reports it).
  avgWatchTimeSeconds?: number;
  totalWatchTimeSeconds?: number;
  videoViews?: number;
  // Instagram-only derived rates, as percentages rounded to 2 decimals.
  // saveRate: saves/reach (IG feed posts, reels, carousels). reelsSkipRate: % of viewers who skipped a reel in the first 3s (IG Reels only).
  saveRate?: number;
  reelsSkipRate?: number;
}

export interface AnalyticsPost {
  id: string;
  content: string;
  socialMediaId: string;
  platformPostId: string;
  publishedAt: string;
  latestMetric: PostMetric | null;
}

export interface AnalyticsResponse {
  data: AnalyticsPost[];
}

export interface FollowerSnapshot {
  /** Day of the snapshot (ISO 8601). */
  capturedAt: string;
  /** Follower count on that day (string bigint); absent for a gap day. */
  followerCount?: string;
}

/** Daily follower-count history for one social account, from get_follower_history. */
export interface FollowerHistory {
  socialMediaId: string;
  /** Daily snapshots, oldest first (may be empty). */
  series: FollowerSnapshot[];
  /** Most recent follower count (string bigint); absent until the first snapshot exists. */
  currentFollowerCount?: string;
  /** Net change across the returned series, signed, e.g. "+57" or "-12"; absent with no baseline. */
  delta?: string;
  /** When follower tracking began for this account (ISO 8601); absent until tracking starts. */
  trackingStartedAt?: string;
}

export interface CreatePostInput {
  content: string;
  firstComment?: string;
  mediaItems?: MediaItem[];
  scheduledAt?: string;
  socialMediaId: string;
}

export interface PostControls {
  // X/Twitter
  xRetweetUrl?: string;
  // TikTok
  tiktokPrivacy?: 'PUBLIC' | 'MUTUAL_FRIENDS' | 'FOLLOWER_OF_CREATOR' | 'ONLY_ME';
  tiktokIsDraft?: boolean;
  tiktokAllowComments?: boolean;
  tiktokAllowDuet?: boolean;
  tiktokAllowStitch?: boolean;
  tiktokBrandOrganic?: boolean;
  tiktokBrandContent?: boolean;
  tiktokAutoAddMusic?: boolean;
  tiktokIsAigc?: boolean;
  tiktokTitle?: string;
  tiktokMusicSoundId?: string;
  tiktokMusicSoundName?: string;
  // Instagram
  instagramPostToGrid?: boolean;
  instagramPublishType?: 'TIMELINE' | 'STORY' | 'REEL';
  instagramTrialReelStrategy?: 'MANUAL' | 'SS_PERFORMANCE';
  instagramCollaborators?: string[];
  instagramLocationId?: string;
  instagramLocationName?: string;
  instagramIsAiGenerated?: boolean;
  // YouTube
  youtubePrivacy?: 'PUBLIC' | 'PRIVATE' | 'UNLISTED';
  youtubeTags?: string[];
  youtubeCategoryId?: string;
  youtubeIsShort?: boolean;
  youtubeMadeForKids?: boolean;
  youtubeContainsSyntheticMedia?: boolean;
  youtubeTitle?: string;
  youtubePlaylistId?: string;
  youtubeThumbnailKey?: string;
  youtubeLanguage?: string;
  youtubeCaptionKey?: string;
  // Facebook
  facebookContentType?: 'POST' | 'REEL' | 'STORY';
  facebookAllowComments?: boolean;
  facebookPrivacy?: 'PUBLIC' | 'FRIENDS_OF_FRIENDS' | 'FRIENDS' | 'SELF';
  facebookCarouselMainLink?: string;
  facebookCarouselShowEndCard?: boolean;
  facebookReelsCollaborators?: string[];
  facebookTargetCountries?: string[];
  facebookPlaceId?: string;
  facebookPlaceName?: string;
  // Google Business Profile
  gbpLocationId?: string;
  gbpTopicType?: 'STANDARD' | 'EVENT' | 'OFFER';
  gbpCallToActionType?: 'BOOK' | 'ORDER' | 'LEARN_MORE' | 'SIGN_UP' | 'CALL' | 'SHOP';
  gbpCallToActionUrl?: string;
  gbpEventTitle?: string;
  gbpEventStartDate?: string;
  gbpEventEndDate?: string;
  gbpOfferCouponCode?: string;
  gbpOfferRedeemUrl?: string;
  gbpOfferTerms?: string;
  // Pinterest
  pinterestBoardId?: string;
  pinterestLink?: string;
  // LinkedIn
  linkedinAttachmentKey?: string;
  linkedinAttachmentTitle?: string;
  // Threads
  threadsTopicTag?: string;
}

// Webhook endpoints: what the webhook tools return.

/** The event types a webhook endpoint can receive. `webhook.test` is sent only by test_webhook_endpoint. */
export type WebhookEvent =
  | 'post.published'
  | 'post.failed'
  | 'account.connected'
  | 'account.disconnected';

/**
 * Why PostFast turned an endpoint off: GONE when its receiver answered 410,
 * FAILING after five days of failed deliveries. Null while it is active or
 * when a user turned it off.
 */
export type WebhookDisabledReason = 'GONE' | 'FAILING';

export interface WebhookEndpoint {
  id: string;
  workspaceId: string;
  url: string;
  events: WebhookEvent[];
  description: string | null;
  active: boolean;
  disabledReason: WebhookDisabledReason | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** The signing secret (`whsec_…`): only in the answer to create_webhook_endpoint, never again. */
  secret?: string;
}

/** Why a delivery attempt did not count. `internal` is PostFast's own failure, not the receiver's. */
export type WebhookDeliveryError =
  | 'timeout'
  | 'connection'
  | 'tls'
  | 'redirect'
  | 'http_4xx'
  | 'http_5xx'
  | 'gone'
  | 'blocked_address'
  | 'exhausted'
  | 'internal'
  | 'payload_too_large';

/** One synchronous delivery, from test_webhook_endpoint. */
export interface WebhookTestResult {
  /** `evt_<uuid>`: the `webhook-id` header the receiver got. */
  eventId: string;
  type: WebhookEvent | 'webhook.test';
  delivered: boolean;
  statusCode: number | null;
  latencyMs: number;
  error: WebhookDeliveryError | null;
}

/** The body a receiver gets, exactly as sent. */
export interface WebhookEnvelope {
  id: string;
  type: WebhookEvent | 'webhook.test';
  timestamp: string;
  workspaceId: string;
  data: Record<string, unknown>;
}

export interface WebhookDeliveryAttempt {
  n: number;
  at: string;
  statusCode: number | null;
  latencyMs: number;
  error: WebhookDeliveryError | null;
}

/** SKIPPED: dropped before any attempt because the endpoint was off. */
export type WebhookDeliveryStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED';

/** One row of an endpoint's delivery log. */
export interface WebhookDelivery {
  id: string;
  /** `evt_<uuid>`, the same under every endpoint that got the event. */
  eventId: string;
  eventType: WebhookEvent | 'webhook.test';
  /** The post (post events), the account (account events), the endpoint (`webhook.test`), or null (samples). */
  resourceId: string | null;
  socialMediaId: string | null;
  status: WebhookDeliveryStatus;
  attemptCount: number;
  attempts: WebhookDeliveryAttempt[];
  lastStatusCode: number | null;
  lastErrorCode: WebhookDeliveryError | null;
  lastLatencyMs: number | null;
  /** When the next attempt is due, while the status is PENDING. */
  nextAttemptAt: string | null;
  completedAt: string | null;
  createdAt: string;
  payload: WebhookEnvelope;
}

/** A page of the delivery log, newest first. The count fields are set only with getCount: true. */
export interface PaginatedWebhookDeliveries {
  data: WebhookDelivery[];
  totalCount: number | null;
  pageInfo: { page: number | null; hasNextPage: boolean; perPage: number | null };
}

// The calendar app (BuildToolsOptions.app). What the backend returns for it,
// and the view model the app tools hand to the view.

/** Where the app was opened: the sidebar (global) or a conversation tab (thread). */
export type AppEntrypoint = 'global' | 'thread';

/** Buttons in the view the backend records for product analytics. */
export type AppAction =
  | 'open_in_postfast'
  | 'review_in_chat'
  | 'reconnect'
  | 'connect_account'
  | 'new_post_started';

/** A post's status in the app. PROCESSING is a post being published right now. */
export type AppPostStatus = PostStatus | 'PROCESSING';

/**
 * One media item in the shape the rest of the API uses (list_posts, the web
 * app), plus display URLs named as in the web app. The URLs are signed and
 * expire within minutes; they reach only the view, never the model.
 */
export interface AppMediaItem {
  /** Taken from the stored file, so an imported cover image reads IMAGE. */
  type: 'IMAGE' | 'VIDEO';
  key: string;
  sortOrder: number;
  coverImageKey: string | null;
  coverTimestamp: string | null;
  /** The image, or the video file; null when the file cannot be served. */
  mediaUrl: string | null;
  /** A video's cover image; null when there is none. */
  coverImageUrl: string | null;
}

/** One account as the backend returns it for the calendar. */
export interface AppCalendarAccount {
  id: string;
  platform: Platform;
  platformUsername: string | null;
  displayName: string | null;
  connectionStatus: ConnectionStatus;
  disabledReason: DisabledReason | null;
  /** The profile picture as a signed display URL; null when there is none. */
  avatarUrl: string | null;
}

/** One post as the backend returns it for the calendar. Its account is in AppCalendar.accounts. */
export interface AppCalendarPost {
  id: string;
  socialMediaId: string;
  status: AppPostStatus;
  approvalStatus: ApprovalStatus;
  scheduledAt: string | null;
  publishedAt: string | null;
  content: string;
  lastError: { message: string; code: string | null } | null;
  mediaCount: number;
  /** The first media item by sortOrder, for the card's thumbnail. */
  thumbnail: AppMediaItem | null;
}

/** One post in full, as the backend returns it when the view opens it. */
export interface AppPostDetail extends Omit<AppCalendarPost, 'thumbnail'> {
  workspaceId: string;
  firstComment: string | null;
  /** Every media item, in sortOrder. */
  mediaItems: AppMediaItem[];
}

/** The backend's answer for one calendar window. */
export interface AppCalendar {
  workspace: { id: string; name: string };
  /** Every account in the workspace, including disconnected ones. */
  accounts: AppCalendarAccount[];
  /** Posts whose scheduledAt falls in [from, to], oldest first. */
  posts: AppCalendarPost[];
  /** Drafts with no scheduledAt, most recently changed first. */
  drafts: AppCalendarPost[];
  hasMore: boolean;
  draftsHasMore: boolean;
}

/** One account, as the view shows it. */
export interface AppAccount {
  id: string;
  platform: Platform;
  /** The @handle, else the display name; null when neither is known. */
  handle: string | null;
  connectionStatus: ConnectionStatus;
  disabledReason: DisabledReason | null;
  avatarUrl: string | null;
}

/** One post, as the view shows it: the caption is shortened and the web app link added. */
export interface AppPost extends AppCalendarPost {
  contentTruncated: boolean;
  /** Opens this post in the PostFast web app. */
  openUrl: string;
}

/** One post in full, as the view shows it when opened. */
export interface AppPostDetailView extends AppPostDetail {
  contentTruncated: boolean;
  openUrl: string;
}

/** Everything the view renders, delivered in the tool result's `_meta`. */
/** A workspace the calendar view can switch to. */
export interface AppWorkspace {
  id: string;
  name: string;
}

export interface AppCalendarView {
  version: 1;
  entrypoint: AppEntrypoint;
  generatedAt: string;
  window: { from: string; to: string };
  workspace: { id: string; name: string };
  /**
   * Every workspace this connection can show, the current one included, for
   * the view's switcher: personal first, then by name. Empty when the list
   * could not be loaded; the view then shows the current workspace only.
   */
  workspaces: AppWorkspace[];
  accounts: AppAccount[];
  posts: AppPost[];
  drafts: AppPost[];
  hasMore: boolean;
  draftsHasMore: boolean;
  links: { posts: string; accounts: string };
}
