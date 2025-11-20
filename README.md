# Telegram Viral Instagram Bot

Minimal Node.js + TypeScript + Telegraf bot that follows the requested workflow.

## Setup

```bash
cd telegram-viral-bot
npm install
cp .env.example .env
# set TELEGRAM_BOT_TOKEN and APIFY_API_TOKEN in .env
npm run dev
```

## Scripts

- `npm run dev` — starts the bot via `node --import tsx src/index.ts` (uses tsx loader for TypeScript + ESM).
- `npm run build` — compiles `src/` to `dist/` via `tsc`.
- `npm start` — runs the compiled `dist/index.js`.

## Project Layout

- `src/index.ts` — loads environment and starts the bot.
- `src/bot.ts` — Telegraf handlers for categories, languages, view filters, and pagination.
- `src/state.ts` — in-memory `Map` for per-user state.
- `src/instagram.ts` — runs the Apify `instagram-hashtag-scraper` actor for real Instagram Reels results.
- `src/messages.ts` — keyboard builders, text constants, and formatting helpers.
- `src/types.ts` — shared `ViralPost` and `UserState` definitions.
