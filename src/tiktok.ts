import {ViralPost} from './types.js';

const APIFY_RUN_SYNC_URL = 'https://api.apify.com/v2/acts/clockworks~tiktok-scraper/run-sync-get-dataset-items';
const REQUEST_TIMEOUT_MS = 300_000; // 5 minutes for sync endpoint

const ensureToken = (): string => {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    throw new Error('APIFY_API_TOKEN is not set');
  }
  return token;
};

const buildRunSyncUrl = (): string => {
  const token = ensureToken();
  return `${APIFY_RUN_SYNC_URL}?token=${encodeURIComponent(token)}`;
};

type ApifyResult = Record<string, unknown>;
type DatasetResponse = ApifyResult[];

const toNumber = (value: unknown): number => {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const extractViews = (item: ApifyResult): number => {
  // Clockworks TikTok Scraper field mappings
  const itemAny = item as any;
  
  return (
    // Clockworks format (most common)
    toNumber(itemAny.videoPlayCount) ||
    toNumber(itemAny.playCount) ||
    toNumber(itemAny.play_count) ||
    toNumber(itemAny.viewCount) ||
    toNumber(itemAny.view_count) ||
    toNumber(itemAny.views) ||
    // Alternative formats
    toNumber(itemAny.stats?.playCount) ||
    toNumber(itemAny.stats?.viewCount) ||
    toNumber(itemAny.statistics?.playCount) ||
    toNumber(itemAny.statistics?.viewCount) ||
    0
  );
};

const isVideoItem = (item: ApifyResult): boolean => {
  if (typeof item.type === 'string' && item.type.toLowerCase() === 'video') {
    return true;
  }
  if (typeof item.isVideo === 'boolean' && item.isVideo) {
    return true;
  }
  if (typeof item.videoUrl === 'string' && item.videoUrl.trim().length > 0) {
    return true;
  }
  if (typeof item.video_url === 'string' && item.video_url.trim().length > 0) {
    return true;
  }
  if (toNumber(item.playCount) > 0 || toNumber(item.viewCount) > 0) {
    return true;
  }
  return false;
};

const normalizeKeyword = (value: string): string => {
  const keyword = value.replace(/^(cat_|sub_)/i, '').replace(/_/g, ' ').trim();
  return keyword || value;
};


export interface SearchTikTokPostsParams {
  category: string;
  language: 'fa' | 'en';
  minViews: number;
}

export const searchTikTokPosts = async (
  params: SearchTikTokPostsParams
): Promise<ViralPost[]> => {
  const keyword = normalizeKeyword(params.category);
  let searchKeyword = keyword.normalize('NFC');
  
  // Clockworks TikTok Scraper payload
  // Based on OpenAPI schema: searchQueries (array) and resultsPerPage
  const payload = {
    searchQueries: [searchKeyword],
    resultsPerPage: 60,
    searchSection: '/video' // Search for videos only
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    console.log('🟢 [TikTok API] Keyword received:', keyword);
    console.log('🟢 [TikTok API] Search keyword:', searchKeyword);
    console.log('🟢 [TikTok API] Sending payload:', payload);

    // Use run-sync-get-dataset-items endpoint which returns results directly
    const response = await fetch(buildRunSyncUrl(), {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    console.log('🟡 [TikTok API] HTTP status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('🔴 [TikTok API] Request failed:', response.status, errorText);
      return [];
    }

    const datasetItems: DatasetResponse = await response.json();
    
    if (!datasetItems || datasetItems.length === 0) {
      console.log('🟡 [TikTok API] No results returned');
      return [];
    }

    console.log(`✅ [TikTok API] Got ${datasetItems.length} items directly from sync endpoint`);

    // Log the first item to see the structure
    if (datasetItems.length > 0) {
      console.log('🔍 [TikTok API] Sample item structure:', JSON.stringify(datasetItems[0], null, 2));
    }

    const enriched = datasetItems
      .map((item) => {
        const views = extractViews(item);
        console.log('🟠 [TikTok API] Extract views for item:', {
          playCount: (item as any).playCount,
          viewCount: (item as any).viewCount,
          views: (item as any).views,
          stats: (item as any).stats,
          statistics: (item as any).statistics,
          computedViews: views
        });
        
        // Extract Clockworks TikTok Scraper fields
        const itemAny = item as any;
        
        // Video ID - Clockworks format
        const videoId = String(
          itemAny.id ?? 
          itemAny.awemeId ?? 
          itemAny.aweme_id ?? 
          itemAny.shortCode ??
          itemAny.shortcode ??
          ''
        );
        
        // Author info - Clockworks format
        const author = itemAny.authorMeta || itemAny.author || {};
        const authorUsername = String(
          author?.uniqueId ?? 
          author?.unique_id ??
          author?.name ??
          author?.nickname ??
          author?.username ??
          itemAny.authorName ??
          'unknown'
        );
        
        // Build TikTok URL - Clockworks format
        const postUrl = String(
          itemAny.webVideoUrl ??
          itemAny.url ?? 
          itemAny.link ??
          (videoId && authorUsername !== 'unknown' 
            ? `https://www.tiktok.com/@${authorUsername}/video/${videoId}`
            : '')
        );

        return {
          id: videoId,
          url: postUrl,
          caption: String(
            itemAny.text ?? 
            itemAny.desc ?? 
            itemAny.description ?? 
            itemAny.caption ?? 
            ''
          ),
          thumbnailUrl: String(
            itemAny.cover ?? 
            itemAny.thumbnailUrl ?? 
            itemAny.thumbnail ?? 
            itemAny.displayUrl ??
            itemAny.imageUrl ??
            ''
          ),
          likes: toNumber(
            itemAny.diggCount ?? 
            itemAny.likesCount ?? 
            itemAny.likeCount ?? 
            itemAny.digg_count ?? 
            itemAny.like_count ?? 
            0
          ),
          comments: toNumber(
            itemAny.commentCount ?? 
            itemAny.commentsCount ?? 
            itemAny.comment_count ?? 
            itemAny.comments_count ?? 
            0
          ),
          views,
          progress: 0,
          isVideo: isVideoItem(item)
        };
      })
      .filter((post) => post.url && post.isVideo);

    const filtered = enriched.filter((post) => post.views >= params.minViews);
    console.log('🔵 [TikTok API] After minViews filter:', filtered.length);

    const sorted = filtered.sort((a, b) => b.views - a.views);
    const limited = sorted.slice(0, 60);
    console.log('🟢 [TikTok API] Final returned count:', limited.length);

    return limited.map(({isVideo, ...rest}) => ({...rest, shares: 0}));
  } catch (error) {
    if (error instanceof Error) {
      console.error('TikTok Apify fetch error:', error.message);
    } else {
      console.error('TikTok Apify fetch error', error);
    }
    return [];
  } finally {
    clearTimeout(timeout);
  }
};

