import express, {Request, Response} from 'express';
import cors from 'cors';
import {
  getTotalSearchRequests,
  getUniqueUsersCount,
  getActiveChannels,
  calculateViralScore,
  getRecentSearchRequests,
  getSearchLogs,
  getCategoryDistribution,
  getLanguageDistribution,
  getPlatformDistribution,
  getDailyAnalytics,
  getAllSearchRequests
} from './tracking.js';

const app = express();
const port = process.env.PORT ?? 3000;

// Enable CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

// SSE clients for logs
const logClients = new Set<Response>();

app.get('/', (_req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'Viral Bot API is running' });
});

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', botRunning: true });
});

app.get('/api/stats', (_req: Request, res: Response) => {
  const stats = {
    totalMessages: getTotalSearchRequests(),
    totalUsers: getUniqueUsersCount(),
    activeChannels: getActiveChannels(),
    viralScore: calculateViralScore(),
  };
  res.json(stats);
});

app.get('/api/content', (_req: Request, res: Response) => {
  const recentSearches = getRecentSearchRequests(50);
  const content = recentSearches.map(req => ({
    id: req.id,
    type: req.platform,
    content: req.category.replace(/^(cat_|sub_)/i, '').replace(/_/g, ' '),
    shares: 0,
    views: req.resultsCount,
    createdAt: req.timestamp.toISOString(),
  }));
  res.json(content);
});

app.get('/api/analytics', (_req: Request, res: Response) => {
  const analytics = {
    dailyData: getDailyAnalytics(7),
    categoryDistribution: getCategoryDistribution(),
    languageDistribution: getLanguageDistribution(),
    platformDistribution: getPlatformDistribution(),
  };
  res.json(analytics);
});

app.get('/api/search-logs', (_req: Request, res: Response) => {
  const logs = getSearchLogs();
  res.json(logs);
});

// SSE endpoint for real-time logs
app.get('/api/logs', (req: Request, res: Response) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // Add client to set
  logClients.add(res);
  
  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Connected to Viral Bot logs' })}\n\n`);
  
  // Send recent logs
  const recentLogs = getSearchLogs().slice(0, 10);
  recentLogs.forEach(log => {
    res.write(`data: ${JSON.stringify({ type: 'log', data: log })}\n\n`);
  });
  
  // Handle client disconnect
  req.on('close', () => {
    logClients.delete(res);
    res.end();
  });
});

// Function to broadcast logs to SSE clients (can be called from bot handlers)
export function broadcastLog(log: any) {
  const message = `data: ${JSON.stringify({ type: 'log', data: log, timestamp: new Date().toISOString() })}\n\n`;
  logClients.forEach(client => {
    try {
      client.write(message);
    } catch (error) {
      // Client disconnected, remove from set
      logClients.delete(client);
    }
  });
}

app.listen(port, () => {
  console.log(`Viral Bot API listening on port ${port}`);
});
