# Telegram Viral Bot

Multi-platform Telegram bot for searching viral content from Instagram, TikTok, and YouTube. Built with Node.js, TypeScript, and Telegraf.

## Features

- 🎯 **Multi-Platform Support**: Search viral content from Instagram, TikTok, and YouTube
- 📊 **Real-time Dashboard**: Integrated with Mastermind OS Dashboard for analytics
- 🔍 **Smart Filtering**: Filter by category, language, and minimum views
- 📈 **Analytics Tracking**: Track searches, users, and engagement metrics
- 🌐 **Persian & English**: Full bilingual support (Persian/English UI)

## Setup

```bash
cd telegram-viral-bot
npm install

# Create .env file with required tokens
cp .env.example .env
# Set the following in .env:
# TELEGRAM_BOT_TOKEN=your_telegram_bot_token
# APIFY_API_TOKEN=your_apify_api_token

npm run dev
```

## Scripts

- `npm run dev` — starts the bot via `node --import tsx src/index.ts` (uses tsx loader for TypeScript + ESM)
- `npm run build` — compiles `src/` to `dist/` via `tsc`
- `npm start` — runs the compiled `dist/index.js`

## Project Layout

- `src/index.ts` — loads environment and starts the bot
- `src/bot.ts` — Telegraf handlers for platform selection, categories, languages, view filters, and pagination
- `src/state.ts` — in-memory `Map` for per-user state management
- `src/instagram.ts` — Apify Instagram Hashtag Scraper integration
- `src/tiktok.ts` — Apify TikTok Scraper integration
- `src/youtube.ts` — Apify YouTube Scraper integration
- `src/messages.ts` — keyboard builders, text constants, and formatting helpers (Persian UI)
- `src/types.ts` — shared `ViralPost` and `UserState` definitions
- `src/tracking.ts` — search request tracking and analytics
- `src/server.ts` — Express API server for dashboard integration

## API Endpoints

The bot exposes a REST API on port 3000 (configurable via `PORT` env var):

- `GET /api/health` — health check
- `GET /api/stats` — bot statistics (total searches, users, channels, viral score)
- `GET /api/content` — recent search requests
- `GET /api/analytics` — analytics data (daily stats, distributions)
- `GET /api/search-logs` — search history logs
- `GET /api/logs` — Server-Sent Events (SSE) stream for real-time logs

## Requirements

- Node.js >= 20
- Telegram Bot Token
- Apify API Token

## License

Private project
