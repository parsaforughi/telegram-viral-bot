export interface SearchRequest {
  id: string;
  userId: number;
  platform: 'instagram' | 'tiktok' | 'youtube';
  category: string;
  language: 'fa' | 'en';
  minViews: number;
  resultsCount: number;
  timestamp: Date;
  status: 'success' | 'failed' | 'no_results';
}

export interface SearchLog {
  id: string;
  userId: number;
  platform: string;
  category: string;
  language: string;
  minViews: number;
  resultsCount: number;
  timestamp: string;
  status: string;
}

const searchRequests: SearchRequest[] = [];
const uniqueUsers = new Set<number>();

export function trackSearchRequest(request: Omit<SearchRequest, 'id' | 'timestamp'> & { timestamp?: Date }): SearchRequest {
  const id = `search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const timestamp = request.timestamp || new Date();
  
  const searchRequest: SearchRequest = {
    id,
    ...request,
    timestamp
  };
  
  searchRequests.push(searchRequest);
  uniqueUsers.add(request.userId);
  
  // Keep only last 1000 requests in memory
  if (searchRequests.length > 1000) {
    searchRequests.shift();
  }
  
  return searchRequest;
}

export function getAllSearchRequests(): SearchRequest[] {
  return [...searchRequests];
}

export function getRecentSearchRequests(limit: number = 50): SearchRequest[] {
  return searchRequests
    .slice()
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, limit);
}

export function getTotalSearchRequests(): number {
  return searchRequests.length;
}

export function getUniqueUsersCount(): number {
  return uniqueUsers.size;
}

export function getActiveChannels(): number {
  const platforms = new Set<string>();
  searchRequests.forEach(req => platforms.add(req.platform));
  return platforms.size;
}

export function calculateViralScore(): number {
  if (searchRequests.length === 0) return 0;
  
  const recentRequests = searchRequests.filter(req => {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return req.timestamp >= dayAgo;
  });
  
  if (recentRequests.length === 0) return 0;
  
  const avgResults = recentRequests.reduce((sum, req) => sum + req.resultsCount, 0) / recentRequests.length;
  const successRate = recentRequests.filter(req => req.status === 'success').length / recentRequests.length;
  
  // Viral score: combination of success rate and average results
  return Math.round((successRate * 50) + (avgResults / 10));
}

export function getPlatformDistribution(): Record<string, number> {
  const distribution: Record<string, number> = {};
  searchRequests.forEach(req => {
    distribution[req.platform] = (distribution[req.platform] || 0) + 1;
  });
  return distribution;
}

export function getCategoryDistribution(): Record<string, number> {
  const distribution: Record<string, number> = {};
  searchRequests.forEach(req => {
    const category = req.category.replace(/^(cat_|sub_)/i, '').replace(/_/g, ' ');
    distribution[category] = (distribution[category] || 0) + 1;
  });
  return distribution;
}

export function getLanguageDistribution(): Record<string, number> {
  const distribution: Record<string, number> = {};
  searchRequests.forEach(req => {
    distribution[req.language] = (distribution[req.language] || 0) + 1;
  });
  return distribution;
}

export function getDailyAnalytics(days: number = 7): Array<{ day: string; searches: number; engagement: number; virality: number }> {
  const analytics: Record<string, { searches: number; engagement: number; virality: number }> = {};
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  // Initialize last N days
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dayKey = dayNames[date.getDay()];
    const dateKey = date.toISOString().split('T')[0];
    analytics[dateKey] = { searches: 0, engagement: 0, virality: 0 };
  }
  
  // Aggregate data
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  searchRequests
    .filter(req => req.timestamp >= cutoffDate)
    .forEach(req => {
      const dateKey = req.timestamp.toISOString().split('T')[0];
      if (analytics[dateKey]) {
        analytics[dateKey].searches++;
        analytics[dateKey].engagement += req.resultsCount;
        analytics[dateKey].virality += req.status === 'success' ? req.resultsCount : 0;
      }
    });
  
  return Object.entries(analytics).map(([date, data]) => {
    const dateObj = new Date(date);
    return {
      day: dayNames[dateObj.getDay()],
      searches: data.searches,
      engagement: Math.round(data.engagement / (data.searches || 1)),
      virality: Math.round(data.virality / (data.searches || 1))
    };
  });
}

export function getSearchLogs(): SearchLog[] {
  return searchRequests
    .slice()
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .map(req => ({
      id: req.id,
      userId: req.userId,
      platform: req.platform,
      category: req.category.replace(/^(cat_|sub_)/i, '').replace(/_/g, ' '),
      language: req.language === 'fa' ? 'Persian' : 'English',
      minViews: req.minViews,
      resultsCount: req.resultsCount,
      timestamp: req.timestamp.toISOString(),
      status: req.status
    }));
}

