/**
 * NON-BLOCKING, FAIL-SAFE Analytics Event Emitter
 * 
 * This module provides analytics tracking for MastermindOS Dashboard.
 * It is designed to NEVER interfere with bot operation:
 * - Never throws errors
 * - Never blocks execution
 * - Fails silently
 * - Zero impact on Telegram bot timing
 */

type EventType = 'search_started' | 'search_results_ready' | 'batch_sent' | 'search_finished' | 'search_cancelled';

interface EventPayload {
  source: 'vb-telegram';
  event_type: EventType;
  platform: 'instagram' | 'tiktok' | 'youtube';
  telegram_id: number;
  username?: string;
  keyword: string;
  language: 'fa' | 'en';
  minViews: number;
  totalResults?: number;
  sentSoFar?: number;
  remaining?: number;
  apifyDatasetId?: string;
  timestamp: string;
}

const MASTERMIND_API_URL = process.env.MASTERMIND_API_URL || 'http://localhost:5000';
const MASTERMIND_BOT_KEY = process.env.MASTERMIND_BOT_KEY || '';

/**
 * Send analytics event to MastermindOS Dashboard
 * 
 * This function is COMPLETELY NON-BLOCKING and FAIL-SAFE.
 * It never throws, never awaits in the calling context, and fails silently.
 */
export function sendEvent(payload: EventPayload): void {
  // If no API URL or key configured, silently skip
  if (!MASTERMIND_API_URL || !MASTERMIND_BOT_KEY) {
    return;
  }

  // Fire and forget - never await, never block
  fetch(`${MASTERMIND_API_URL}/api/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${MASTERMIND_BOT_KEY}`
    },
    body: JSON.stringify(payload)
  }).catch(() => {
    // Silently ignore all errors - analytics failures must never affect bot
  });
}

/**
 * Helper to create event payload with common fields
 */
export function createEventPayload(
  eventType: EventType,
  platform: 'instagram' | 'tiktok' | 'youtube',
  telegramId: number,
  username: string | undefined,
  keyword: string,
  language: 'fa' | 'en',
  minViews: number,
  additional: Partial<EventPayload> = {}
): EventPayload {
  return {
    source: 'vb-telegram',
    event_type: eventType,
    platform,
    telegram_id: telegramId,
    username,
    keyword,
    language,
    minViews,
    timestamp: new Date().toISOString(),
    ...additional
  };
}

