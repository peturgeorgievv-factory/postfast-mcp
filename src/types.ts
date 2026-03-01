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
  | 'TELEGRAM';

export type PostStatus = 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'FAILED';

export type ApprovalStatus =
  | 'PENDING_APPROVAL'
  | 'IN_PROGRESS'
  | 'APPROVED'
  | 'REJECTED'
  | 'NEEDS_WORK';

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
  lastError: { message: string; code: string | null } | null;
}

export interface MediaItem {
  key: string;
  type: 'IMAGE' | 'VIDEO';
  sortOrder: number;
  url?: string;
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

export interface SignedUploadUrl {
  key: string;
  signedUrl: string;
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
  xCommunityId?: string;
  xQuoteTweetUrl?: string;
  xRetweetUrl?: string;
  // TikTok
  tiktokPrivacy?: 'PUBLIC' | 'MUTUAL_FRIENDS' | 'ONLY_ME';
  tiktokIsDraft?: boolean;
  tiktokAllowComments?: boolean;
  tiktokAllowDuet?: boolean;
  tiktokAllowStitch?: boolean;
  tiktokBrandOrganic?: boolean;
  tiktokBrandContent?: boolean;
  tiktokAutoAddMusic?: boolean;
  // Instagram
  instagramPostToGrid?: boolean;
  instagramPublishType?: 'TIMELINE' | 'STORY' | 'REEL';
  instagramCollaborators?: string[];
  // YouTube
  youtubePrivacy?: 'PUBLIC' | 'PRIVATE' | 'UNLISTED';
  youtubeTags?: string[];
  youtubeCategoryId?: string;
  youtubeIsShort?: boolean;
  youtubeMadeForKids?: boolean;
  youtubeTitle?: string;
  youtubePlaylistId?: string;
  // Facebook
  facebookContentType?: 'POST' | 'REEL' | 'STORY';
  facebookAllowComments?: boolean;
  facebookPrivacy?: 'PUBLIC' | 'FRIENDS_OF_FRIENDS' | 'FRIENDS' | 'SELF';
  facebookCarouselMainLink?: string;
  facebookCarouselShowEndCard?: boolean;
  facebookReelsCoverImageKey?: string;
  facebookReelsCollaborators?: string[];
  // Pinterest
  pinterestBoardId?: string;
  pinterestLink?: string;
  // LinkedIn
  linkedinAttachmentKey?: string;
  linkedinAttachmentTitle?: string;
}
