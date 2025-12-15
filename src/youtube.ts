import {ViralPost} from './types.js';

const APIFY_RUN_URL = 'https://api.apify.com/v2/acts/streamers~youtube-scraper/runs';
const REQUEST_TIMEOUT_MS = 300_000; // 5 minutes for YouTube (can take longer)
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
    status?: string;
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
  const itemAny = item as any;
  
  return (
    toNumber(itemAny.viewCount) ||
    toNumber(itemAny.view_count) ||
    toNumber(itemAny.views) ||
    toNumber(itemAny.viewCountText) ||
    0
  );
};

const normalizeKeyword = (value: string): string => {
  const keyword = value.replace(/^(cat_|sub_)/i, '').replace(/_/g, ' ').trim();
  return keyword || value;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface SearchYouTubePostsParams {
  category: string;
  language: 'fa' | 'en';
  minViews: number;
  videoType?: 'video' | 'shorts'; // Optional, defaults to video
}

export const searchYouTubePosts = async (
  params: SearchYouTubePostsParams
): Promise<ViralPost[]> => {
  const keyword = normalizeKeyword(params.category);
  let searchKeyword = keyword.normalize('NFC');
  
  // YouTube Scraper payload - use Shorts with max 10 results
  const payload: any = {
    searchQueries: [searchKeyword],
    maxResultsShorts: 10,
    maxResults: 0, // Set to 0 to only get Shorts
    maxResultStreams: 0,
    sortingOrder: 'views' // Sort by views to get viral content
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    console.log('🟢 [YouTube API] Keyword received:', keyword);
    console.log('🟢 [YouTube API] Search keyword:', searchKeyword);
    console.log('🟢 [YouTube API] Sending payload:', payload);

    const runResponse = await fetch(buildRunUrl(), {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    console.log('🟡 [YouTube API] HTTP status:', runResponse.status);
    const rawRunText = await runResponse.text();
    console.log('🟡 [YouTube API] Raw response from Apify (RUN):', rawRunText);

    if (!runResponse.ok) {
      console.error('🔴 [YouTube API] Run request failed:', runResponse.status, rawRunText);
      return [];
    }

    let runJson: any = null;
    try {
      runJson = JSON.parse(rawRunText);
      console.log('🟢 [YouTube API] Parsed RUN JSON:', JSON.stringify(runJson, null, 2));
    } catch (parseErr) {
      console.log('🔴 [YouTube API] JSON parse error on RUN:', parseErr);
      console.log('🔴 [YouTube API] Raw response was:', rawRunText);
      return [];
    }
    
    // Check for error in response
    if (runJson.error) {
      console.error('🔴 [YouTube API] Error in response:', runJson.error);
      return [];
    }
    
    // Check if we got a valid run response
    if (!runJson.data || !runJson.data.id) {
      console.error('🔴 [YouTube API] Invalid run response - no run ID:', runJson);
      return [];
    }

    const runId = runJson.data.id;
    const datasetId = runJson.data.defaultDatasetId;
    
    if (!datasetId) {
      console.error('🔴 [YouTube API] No dataset ID in run response');
      return [];
    }

    console.log('✅ [YouTube API] Run created successfully:', runId);
    console.log('🟡 [YouTube API] Dataset ID:', datasetId);

    // Wait for the run to complete
    let runStatus = runJson.data.status;
    let waitAttempts = 0;
    const MAX_WAIT_ATTEMPTS = 100; // Wait up to 5 minutes (100 * 3 seconds)
    
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
            console.log(`🟡 [YouTube API] Run status (attempt ${waitAttempts}):`, runStatus);
            
            if (runStatus === 'FAILED') {
              console.error('🔴 [YouTube API] Run failed');
              clearTimeout(statusTimeout);
              return [];
            }
          }
        } catch (statusErr) {
          // Ignore abort errors for status checks - they're not critical
          if (statusErr instanceof Error && statusErr.name !== 'AbortError') {
            console.log('⚠️ [YouTube API] Error checking run status:', statusErr);
          }
        } finally {
          clearTimeout(statusTimeout);
        }
      } catch (err) {
        // Ignore errors, continue polling
        if (err instanceof Error && err.name !== 'AbortError') {
          console.log('⚠️ [YouTube API] Error in status check loop:', err);
        }
      }
    }

    if (runStatus !== 'SUCCEEDED') {
      console.error('🔴 [YouTube API] Run did not succeed, status:', runStatus);
      return [];
    }

    console.log('✅ [YouTube API] Run completed successfully, fetching dataset');

    // Fetch dataset using the specific dataset ID
    let datasetItems: DatasetResponse = [];
    for (let attempt = 0; attempt < MAX_DATASET_RETRIES; attempt += 1) {
      console.log(`🟡 [YouTube API] Fetching dataset (attempt ${attempt + 1})`);
      const datasetRes = await fetch(buildDatasetUrl(datasetId), {
        signal: controller.signal
      });

      console.log('🟡 [YouTube API] HTTP status (DATASET):', datasetRes.status);
      const datasetRaw = await datasetRes.text();

      let parsed: DatasetResponse = [];
      try {
        parsed = JSON.parse(datasetRaw) as DatasetResponse;
      } catch (err) {
        console.log('🔴 [YouTube API] JSON parse error on DATASET:', err);
      }

      if (datasetRes.status === 200 && parsed.length > 0) {
        datasetItems = parsed;
        console.log(`✅ [YouTube API] Got ${parsed.length} items from dataset`);
        break;
      }

      if (attempt < MAX_DATASET_RETRIES - 1) {
        await sleep(DATASET_RETRY_DELAY);
      }
    }

    // Log the first item to see the structure
    if (datasetItems.length > 0) {
      console.log('🔍 [YouTube API] Sample item structure:', JSON.stringify(datasetItems[0], null, 2));
    }

    if (datasetItems.length === 0) {
      return [];
    }

    const enriched = datasetItems
      .map((item) => {
        const views = extractViews(item);
        const itemAny = item as any;
        
        console.log('🟠 [YouTube API] Extract views for item:', {
          viewCount: itemAny.viewCount,
          view_count: itemAny.view_count,
          views: itemAny.views,
          computedViews: views
        });
        
        // Extract YouTube fields
        const videoId = String(
          itemAny.id ?? 
          itemAny.videoId ?? 
          itemAny.video_id ??
          ''
        );
        
        // Build YouTube URL
        const postUrl = String(
          itemAny.url ?? 
          itemAny.link ??
          (videoId ? `https://www.youtube.com/watch?v=${videoId}` : '')
        );

        return {
          id: videoId,
          url: postUrl,
          caption: String(
            itemAny.title ?? 
            itemAny.description ?? 
            itemAny.caption ?? 
            ''
          ),
          thumbnailUrl: String(
            itemAny.thumbnailUrl ?? 
            itemAny.thumbnail ?? 
            itemAny.thumbnail_url ?? 
            itemAny.imageUrl ??
            ''
          ),
          likes: toNumber(
            itemAny.likeCount ?? 
            itemAny.likes ?? 
            itemAny.like_count ?? 
            0
          ),
          comments: toNumber(
            itemAny.commentCount ?? 
            itemAny.comments ?? 
            itemAny.comment_count ?? 
            0
          ),
          views,
          progress: 0,
          isVideo: true // YouTube items are always videos
        };
      })
      .filter((post) => post.url);

    const filtered = enriched.filter((post) => post.views >= params.minViews);
    console.log('🔵 [YouTube API] After minViews filter:', filtered.length);

    const sorted = filtered.sort((a, b) => b.views - a.views);
    const limited = sorted.slice(0, 60);
    console.log('🟢 [YouTube API] Final returned count:', limited.length);

    return limited.map((post) => ({...post, shares: 0}));
  } catch (error) {
    if (error instanceof Error) {
      console.error('YouTube Apify fetch error:', error.message);
    } else {
      console.error('YouTube Apify fetch error', error);
    }
    return [];
  } finally {
    clearTimeout(timeout);
  }
};

