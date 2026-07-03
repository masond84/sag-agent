export type EpisodeStatus =
  | "planned"
  | "scripted"
  | "manus_queued"
  | "rendering"
  | "draft_ready"
  | "posted"
  | "failed";

export type ContentPlatform = "youtube" | "tiktok" | "reels";

export interface ContentSeries {
  id: string;
  name: string;
  tone: string;
  lengthMinutes: number;
  platforms: ContentPlatform[];
  /** Days of week 0=Sun … 6=Sat; empty = any day */
  cadenceDays: number[];
  enabled: boolean;
}

export interface ClipCaptions {
  youtube: string;
  tiktok: string;
  reels: string;
  hashtags: string[];
}

export interface EpisodeAssets {
  videoPath?: string;
  videoUrl?: string;
  voiceoverPath?: string;
  voiceoverUrl?: string;
  thumbnailPath?: string;
  durationSeconds?: number;
  notes?: string;
}

export interface ContentEpisode {
  id: string;
  seriesId: string;
  title: string;
  status: EpisodeStatus;
  script?: string;
  voiceoverNotes?: string;
  captions?: ClipCaptions;
  assets?: EpisodeAssets;
  manusJobId?: string;
  manusPackagePath?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  postedAt?: string;
  platformsPosted: ContentPlatform[];
}

export interface ManusPackageManifest {
  episodeId: string;
  seriesId: string;
  title: string;
  lengthMinutes: number;
  tone: string;
  createdAt: string;
  instructions: string;
}

export interface ManusResult {
  videoPath?: string;
  videoUrl?: string;
  voiceoverPath?: string;
  voiceoverUrl?: string;
  thumbnailPath?: string;
  durationSeconds?: number;
  notes?: string;
  completedAt?: string;
}

export interface ContentStats {
  byStatus: Record<EpisodeStatus, number>;
  draftsReady: number;
  inFlight: number;
  postedThisWeek: number;
  failed: number;
  total: number;
  seriesCount: number;
}
