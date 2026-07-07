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
  /**
   * Present on FAILED (and missed) posts. `code` carries platform-specific error codes
   * plus two scheduling codes: MISSED_DISCONNECTED (account was disconnected when the
   * post was due) and MISSED_NOT_PUBLISHED (passed scheduled time + 2h grace unpublished).
   */
  lastError: { message: string; code: string | null } | null;
}

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
  // Instagram
  instagramPostToGrid?: boolean;
  instagramPublishType?: 'TIMELINE' | 'STORY' | 'REEL';
  instagramCollaborators?: string[];
  instagramLocationId?: string;
  instagramLocationName?: string;
  // YouTube
  youtubePrivacy?: 'PUBLIC' | 'PRIVATE' | 'UNLISTED';
  youtubeTags?: string[];
  youtubeCategoryId?: string;
  youtubeIsShort?: boolean;
  youtubeMadeForKids?: boolean;
  youtubeTitle?: string;
  youtubePlaylistId?: string;
  youtubeThumbnailKey?: string;
  // Facebook
  facebookContentType?: 'POST' | 'REEL' | 'STORY';
  facebookAllowComments?: boolean;
  facebookPrivacy?: 'PUBLIC' | 'FRIENDS_OF_FRIENDS' | 'FRIENDS' | 'SELF';
  facebookCarouselMainLink?: string;
  facebookCarouselShowEndCard?: boolean;
  facebookReelsCoverImageKey?: string;
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
}
