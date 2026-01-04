import {ViralPost} from './types.js';

const APIFY_RUN_URL = 'https://api.apify.com/v2/acts/clockworks~tiktok-scraper/runs';
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_DATASET_RETRIES = 20;
const DATASET_RETRY_DELAY = 3000;
const STATUS_CHECK_TIMEOUT_MS = 10_000; // 10 seconds for status checks

const ensureToken = (): string => {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    throw new Error('APIFY_API_TOKEN is not set');
  }
  return token;
};

const buildRunUrl = (): string => {
  const token = ensureToken();
  return `${APIFY_RUN_URL}?token=${encodeURIComponent(token)}`;
};

const buildDatasetUrl = (datasetId: string): string => {
  const token = ensureToken();
  return `https://api.apify.com/v2/datasets/${datasetId}/items?token=${encodeURIComponent(token)}`;
};

const buildRunStatusUrl = (runId: string): string => {
  const token = ensureToken();
  return `https://api.apify.com/v2/actor-runs/${runId}?token=${encodeURIComponent(token)}`;
};

type ApifyResult = Record<string, unknown>;

type ApifyRunResponse = {
  data?: {
    id?: string;
    defaultDatasetId?: string;
  };
};

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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

    const runResponse = await fetch(buildRunUrl(), {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    console.log('🟡 [TikTok API] HTTP status:', runResponse.status);
    const rawRunText = await runResponse.text();
    console.log('🟡 [TikTok API] Raw response from Apify (RUN):', rawRunText);

    if (!runResponse.ok) {
      console.error('🔴 [TikTok API] Run request failed:', runResponse.status, rawRunText);
      return [];
    }

    let runJson: any = null;
    try {
      runJson = JSON.parse(rawRunText);
      console.log('🟢 [TikTok API] Parsed RUN JSON:', JSON.stringify(runJson, null, 2));
    } catch (parseErr) {
      console.log('🔴 [TikTok API] JSON parse error on RUN:', parseErr);
      console.log('🔴 [TikTok API] Raw response was:', rawRunText);
      return [];
    }
    
    // Check for error in response
    if (runJson.error) {
      console.error('🔴 [TikTok API] Error in response:', runJson.error);
      return [];
    }
    
    // Check if we got a valid run response
    if (!runJson.data || !runJson.data.id) {
      console.error('🔴 [TikTok API] Invalid run response - no run ID:', runJson);
      return [];
    }

    const runId = runJson.data.id;
    const datasetId = runJson.data.defaultDatasetId;
    
    if (!datasetId) {
      console.error('🔴 [TikTok API] No dataset ID in run response');
      return [];
    }

    console.log('✅ [TikTok API] Run created successfully:', runId);
    console.log('🟡 [TikTok API] Dataset ID:', datasetId);

      // Wait for the run to complete
      let runStatus = runJson.data.status;
      let waitAttempts = 0;
      const MAX_WAIT_ATTEMPTS = 40; // Wait up to 2 minutes (40 * 3 seconds)
      
      while (runStatus !== 'SUCCEEDED' && runStatus !== 'FAILED' && waitAttempts < MAX_WAIT_ATTEMPTS) {
        await sleep(3000);
        waitAttempts++;
        
        try {
          // Use a separate AbortController for status checks to avoid timeout issues
          const statusController = new AbortController();
          const statusTimeout = setTimeout(() => statusController.abort(), STATUS_CHECK_TIMEOUT_MS);
          
          try {
            const statusRes = await fetch(buildRunStatusUrl(runId), {
              signal: statusController.signal
            });
            
            if (statusRes.ok) {
              const statusJson = await statusRes.json();
              runStatus = statusJson.data?.status || runStatus;
              console.log(`🟡 [TikTok API] Run status (attempt ${waitAttempts}):`, runStatus);
              
              if (runStatus === 'FAILED') {
                console.error('🔴 [TikTok API] Run failed');
                clearTimeout(statusTimeout);
                return [];
              }
            }
          } catch (statusErr) {
            // Ignore abort errors for status checks - they're not critical
            if (statusErr instanceof Error && statusErr.name !== 'AbortError') {
              console.log('⚠️ [TikTok API] Error checking run status:', statusErr);
            }
          } finally {
            clearTimeout(statusTimeout);
          }
        } catch (err) {
          // Ignore errors, continue polling
          if (err instanceof Error && err.name !== 'AbortError') {
            console.log('⚠️ [TikTok API] Error in status check loop:', err);
          }
        }
      }

      if (runStatus !== 'SUCCEEDED') {
        console.error('🔴 [TikTok API] Run did not succeed, status:', runStatus);
        return [];
      }

      console.log('✅ [TikTok API] Run completed successfully, fetching dataset');

      // Fetch dataset using the specific dataset ID
      let datasetItems: DatasetResponse = [];
      for (let attempt = 0; attempt < MAX_DATASET_RETRIES; attempt += 1) {
        console.log(`🟡 [TikTok API] Fetching dataset (attempt ${attempt + 1})`);
        const datasetRes = await fetch(buildDatasetUrl(datasetId), {
          signal: controller.signal
        });

        console.log('🟡 [TikTok API] HTTP status (DATASET):', datasetRes.status);
        const datasetRaw = await datasetRes.text();

        let parsed: DatasetResponse = [];
        try {
          parsed = JSON.parse(datasetRaw) as DatasetResponse;
        } catch (err) {
          console.log('🔴 [TikTok API] JSON parse error on DATASET:', err);
        }

        if (datasetRes.status === 200 && parsed.length > 0) {
          datasetItems = parsed;
          console.log(`✅ [TikTok API] Got ${parsed.length} items from dataset`);
          break;
        }

        if (attempt < MAX_DATASET_RETRIES - 1) {
          await sleep(DATASET_RETRY_DELAY);
        }
      }

      if (datasetItems.length === 0) {
        return [];
      }

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

