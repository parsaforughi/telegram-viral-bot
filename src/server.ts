import express, {Request, Response} from 'express';
import cors from 'cors';

const app = express();
const port = process.env.PORT ?? 3000;

// Enable CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

app.get('/', (_req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'Viral Bot API is running' });
});

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', botRunning: true });
});

app.get('/api/stats', (_req: Request, res: Response) => {
  res.json({
    totalMessages: 0,
    totalUsers: 0,
    activeChannels: 0,
    viralScore: 0,
  });
});

app.get('/api/content', (_req: Request, res: Response) => {
  res.json([]);
});

app.listen(port, () => {
  console.log(`Viral Bot API listening on port ${port}`);
});
