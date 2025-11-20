import {ViralPost} from './types.js';

const APIFY_RUN_URL = 'https://api.apify.com/v2/acts/apify~instagram-hashtag-scraper/runs';
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_DATASET_RETRIES = 20;
const DATASET_RETRY_DELAY = 3000;

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
  return (
    toNumber(item.videoPlayCount) ||
    toNumber(item.videoViewCount) ||
    toNumber(item.playCount) ||
    toNumber(item.plays) ||
    toNumber(item.video_views) ||
    toNumber(item.storyViewCount) ||
    toNumber(item.likesCount) ||
    0
  );
};

const isReelItem = (item: ApifyResult): boolean => {
  if (typeof item.isVideo === 'boolean' && item.isVideo) {
    return true;
  }
  if (typeof item.videoUrl === 'string' && item.videoUrl.trim().length > 0) {
    return true;
  }
  if (toNumber(item.videoViewCount) > 0) {
    return true;
  }
  if (toNumber(item.videoPlayCount) > 0) {
    return true;
  }
  return toNumber(item.playCount) > 0;
};

const normalizeKeyword = (value: string): string => {
  const keyword = value.replace(/^(cat_|sub_)/i, '').replace(/_/g, ' ').trim();
  return keyword || value;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface SearchInstagramPostsParams {
  category: string;
  language: 'fa' | 'en';
  minViews: number;
}

export const searchInstagramPosts = async (
  params: SearchInstagramPostsParams
): Promise<ViralPost[]> => {
  const keyword = normalizeKeyword(params.category);
  let safeKeyword = keyword.normalize('NFC');
  safeKeyword = safeKeyword.replace(/\s+/g, '');
  safeKeyword = safeKeyword.replace(/_/g, '');
  safeKeyword = safeKeyword.replace(/-/g, '');
  const payload = {
    hashtags: [safeKeyword],
    keywordSearch: false,
    resultsType: 'stories',
    resultsLimit: 60
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    console.log('🟢 [API] Keyword received:', keyword);
    console.log('🟢 [API] Safe NFC keyword:', safeKeyword);
    console.log('🟢 [API] Sending payload:', payload);

    const runResponse = await fetch(buildRunUrl(), {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    console.log('🟡 [API] HTTP status:', runResponse.status);
    const rawRunText = await runResponse.text();
    console.log('🟡 [API] Raw response from Apify (RUN):', rawRunText);

    let runJson: ApifyRunResponse | null = null;
    try {
      runJson = JSON.parse(rawRunText) as ApifyRunResponse;
      console.log('🟢 [API] Parsed RUN JSON:', runJson);
    } catch (err) {
      console.log('🔴 [API] JSON parse error on RUN:', err);
    }

    const datasetId = runJson?.data?.defaultDatasetId;
    if (!datasetId) {
      return [];
    }

    let datasetItems: DatasetResponse = [];
    for (let attempt = 0; attempt < MAX_DATASET_RETRIES; attempt += 1) {
      console.log('🟡 [API] Fetching dataset:', datasetId);
      const datasetRes = await fetch(buildDatasetUrl(datasetId), {
        signal: controller.signal
      });

      console.log('🟡 [API] HTTP status (DATASET):', datasetRes.status);
      const datasetRaw = await datasetRes.text();
      console.log('🟡 [API] Raw dataset:', datasetRaw);

      let parsed: DatasetResponse = [];
      try {
        parsed = JSON.parse(datasetRaw) as DatasetResponse;
      } catch (err) {
        console.log('🔴 [API] JSON parse error on DATASET:', err);
      }

      if (datasetRes.status === 200 && parsed.length > 0) {
        datasetItems = parsed;
        break;
      }

      if (attempt < MAX_DATASET_RETRIES - 1) {
        await sleep(DATASET_RETRY_DELAY);
      }
    }

    if (datasetItems.length === 0) {
      return [];
    }

    const enriched = datasetItems
      .map((item) => {
        const views = extractViews(item);
        console.log('🟠 [API] Extract views for item:', {
          videoPlayCount: item.videoPlayCount,
          videoViewCount: item.videoViewCount,
          playCount: item.playCount,
          plays: item.plays,
          video_views: item.video_views,
          storyViewCount: item.storyViewCount,
          likesCount: item.likesCount,
          computedViews: views
        });
        return {
          id: String(item.id ?? item.shortCode ?? item.shortcode ?? ''),
          url: String(item.url ?? item.link ?? ''),
          caption: (item.caption ?? '') as string,
          thumbnailUrl: String(item.displayUrl ?? item.thumbnailUrl ?? ''),
          likes: toNumber(item.likesCount),
          comments: toNumber(item.commentsCount),
          views,
          progress: 0,
          isReel: isReelItem(item)
        };
      })
      .filter((post) => post.url && post.isReel);

    const filtered = enriched.filter((post) => post.views >= params.minViews);
    console.log('🔵 [API] After minViews filter:', filtered.length);

    const sorted = filtered.sort((a, b) => b.views - a.views);
    const limited = sorted.slice(0, 60);
    console.log('🟢 [API] Final returned count:', limited.length);

    return limited.map(({isReel, ...rest}) => ({...rest, shares: 0}));
  } catch (error) {
    if (error instanceof Error) {
      console.error('Apify fetch error:', error.message);
    } else {
      console.error('Apify fetch error', error);
    }
    return [];
  } finally {
    clearTimeout(timeout);
  }
};
