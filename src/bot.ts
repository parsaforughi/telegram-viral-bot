import type {Context} from 'telegraf';
import {Markup, Telegraf} from 'telegraf';
import {searchInstagramPosts} from './instagram.js';
import {searchTikTokPosts} from './tiktok.js';
import {searchYouTubePosts} from './youtube.js';
import {
  categoryKeyboard,
  cleanserSubmenu,
  creamSubmenu,
  languageKeyboard,
  platformKeyboard,
  formatPostMessage,
  texts,
  viewKeyboard,
  getPlatformLabel,
  getPlatformEmoji
} from './messages.js';
import {getUserState, recordUserResults, upsertUserState} from './state.js';
import type {ViralPost} from './types.js';
import {trackSearchRequest} from './tracking.js';
import {broadcastLog} from './server.js';

const DEFAULT_LANGUAGE: 'en' | 'fa' = 'en';

const clearInlineKeyboard = async (ctx: Context): Promise<void> => {
  try {
    await ctx.editMessageReplyMarkup(undefined);
  } catch {
    // ignore when no keyboard is present
  }
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const viewMap: Record<string, number> = {
  view_100k: 100_000,
  view_300k: 300_000,
  view_500k: 500_000,
  view_1m: 1_000_000,
  view_5m: 5_000_000
};

const resolveCallbackData = (ctx: Context): string | undefined => {
  const callback = ctx.callbackQuery;
  if (callback && 'data' in callback) {
    return callback.data;
  }
  return undefined;
};

const keywordMapFA: Record<string, string> = {
  condom: 'کاندوم',
  toothpaste: 'خمیر دندان',
  cream: 'کرم',
  hand_cream: 'کرم دست',
  body_lotion: 'کرم بدن',
  makeup_remover: 'پاک کننده آرایشی',
  face_wash: 'فیس واش'
};

const keywordMapEN: Record<string, string> = {
  condom: 'condom',
  toothpaste: 'toothpaste',
  cream: 'cream',
  hand_cream: 'hand cream',
  body_lotion: 'body lotion',
  makeup_remover: 'makeup remover',
  face_wash: 'face wash'
};

const normalizeCategoryKey = (category?: string): string => {
  if (!category) {
    return 'instagram';
  }
  
  // Handle custom category
  if (category.startsWith('custom_')) {
    return category.replace('custom_', '');
  }
  
  const overrideMap: Record<string, string> = {
    sub_cream_hand: 'hand_cream',
    sub_cream_foot: 'hand_cream',
    sub_cream_body: 'body_lotion',
    cat_cleanser: 'makeup_remover',
    sub_cleanser_wetwipe: 'makeup_remover',
    sub_cleanser_micellar: 'makeup_remover',
    sub_cleanser_facewash: 'face_wash',
    cat_cosmetic: 'makeup_remover'
  };
  if (overrideMap[category]) {
    return overrideMap[category];
  }
  return category.replace(/^cat_/, '').replace(/^sub_/, '');
};

const BATCH_SIZE = 5;

const continueKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('بفرست', 'next_batch')],
  [Markup.button.callback('نه ممنون', 'stop')]
]);

const enNum = (x: number) => new Intl.NumberFormat('en-US').format(x);

export const buildBot = (token: string) => {
  if (!token) {
    throw new Error('Missing TELEGRAM_BOT_TOKEN');
  }

  const bot = new Telegraf(token);
  bot.catch((error) => {
    const response = (error as any).response;
    if (
      response?.error_code === 400 &&
      typeof response.description === 'string' &&
      response.description.includes('query is too old')
    ) {
      console.warn('⚠️ Ignored expired callback query');
      return;
    }
    throw error;
  });

  bot.start(async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) {
      return;
    }

    upsertUserState(chatId, {});
    await ctx.reply(texts.askPlatform, platformKeyboard());
  });

  // Handle custom category text input
  bot.on('text', async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) {
      return;
    }

    const state = getUserState(chatId);
    
    // Check if user is waiting for custom category input
    if (state?.waitingForCustomCategory && state?.platform) {
      const customCategory = ctx.message.text?.trim();
      
      if (!customCategory || customCategory.length === 0) {
        await ctx.reply('لطفاً یک دسته‌بندی معتبر وارد کن.');
        return;
      }

      // Store custom category (prefixed to distinguish from predefined)
      upsertUserState(chatId, {
        category: `custom_${customCategory}`,
        waitingForCustomCategory: false
      });

      // Continue to language selection
      await ctx.reply(texts.askLanguage, languageKeyboard());
      return;
    }
    
    // If not waiting for custom category, ignore the text (or handle other text commands)
  });

  bot.action(/^platform_(instagram|tiktok|youtube)$/, async (ctx) => {
    console.log('🟣 [BOT] Callback data:', resolveCallbackData(ctx));
    const chatId = ctx.chat?.id;
    if (!chatId) {
      return;
    }

    const callback = ctx.callbackQuery;
    const data = callback && 'data' in callback ? callback.data : '';
    if (!data.startsWith('platform_')) {
      return;
    }

    const platform = data.replace('platform_', '') as 'instagram' | 'tiktok' | 'youtube';
    upsertUserState(chatId, {platform});
    await clearInlineKeyboard(ctx);
    await ctx.answerCbQuery();

    // Continue with category selection for all platforms
    await ctx.reply(texts.askCategory, categoryKeyboard());
  });

  bot.action(/^cat_(.+)$/, async (ctx) => {
    console.log('🟣 [BOT] Callback data:', resolveCallbackData(ctx));
    const chatId = ctx.chat?.id;
    if (!chatId) {
      return;
    }

    const callbackData = resolveCallbackData(ctx);
    if (!callbackData) {
      return;
    }

    upsertUserState(chatId, {category: callbackData});
    await clearInlineKeyboard(ctx);
    await ctx.answerCbQuery();

    if (callbackData === 'cat_cream') {
      await ctx.reply(texts.chooseCream, creamSubmenu);
      return;
    }
    if (callbackData === 'cat_cleanser') {
      await ctx.reply(texts.chooseCleanser, cleanserSubmenu);
      return;
    }

    await ctx.reply(texts.askLanguage, languageKeyboard());
  });

  bot.action(/^sub_(.+)$/, async (ctx) => {
    console.log('🟣 [BOT] Callback data:', resolveCallbackData(ctx));
    const chatId = ctx.chat?.id;
    if (!chatId) {
      return;
    }

    const callback = ctx.callbackQuery;
    const data = callback && 'data' in callback ? callback.data : '';
    if (!data) {
      return;
    }

    upsertUserState(chatId, {category: data});
    await clearInlineKeyboard(ctx);
    await ctx.answerCbQuery();
    await ctx.reply(texts.askLanguage, languageKeyboard());
  });

  bot.action('custom_category', async (ctx) => {
    console.log('🟣 [BOT] Custom category selected');
    const chatId = ctx.chat?.id;
    if (!chatId) {
      return;
    }

    await clearInlineKeyboard(ctx);
    await ctx.answerCbQuery();
    
    upsertUserState(chatId, {waitingForCustomCategory: true});
    await ctx.reply(texts.askCustomCategory);
  });

  bot.action(/^(lang_fa|lang_en)$/, async (ctx) => {
    console.log('🟣 [BOT] Callback data:', resolveCallbackData(ctx));
    const chatId = ctx.chat?.id;
    if (!chatId) {
      return;
    }

    const match = ctx.match as RegExpMatchArray | undefined;
    const rawLang = match?.[1];
    const language = rawLang === 'lang_fa' ? 'fa' : 'en';
    upsertUserState(chatId, {language});
    await clearInlineKeyboard(ctx);
    await ctx.answerCbQuery();
    await ctx.reply(texts.askMinViews, viewKeyboard);
  });

  bot.action(/^view_(.+)$/, async (ctx) => {
    console.log('🟣 [BOT] Callback data:', resolveCallbackData(ctx));
    const chatId = ctx.chat?.id;
    if (!chatId) {
      return;
    }

    const callback = ctx.callbackQuery;
    const data = callback && 'data' in callback ? callback.data : '';
    if (!data.startsWith('view_')) {
      return;
    }

    const minViews = viewMap[data];
    if (!minViews) {
      await ctx.answerCbQuery();
      return;
    }

    const currentState = getUserState(chatId);
    // Ensure platform is set (default to instagram if not set)
    const platform = currentState?.platform ?? 'instagram';
    const state = upsertUserState(chatId, {minViews, platform});
    await ctx.answerCbQuery();

    if (!state.category) {
      await ctx.reply(texts.askCategory, categoryKeyboard());
      return;
    }

    const platformLabel = getPlatformLabel(platform);
    const progressMessage = await ctx.reply(texts.searchingProgress(platformLabel, 0));
    const progressChatId = progressMessage.chat?.id ?? chatId;
    const progressMessageId = progressMessage.message_id;
    let stopProgress = false;
    const progressStages = [
      texts.searchingProgress(platformLabel, 10),
      texts.searchingProgress(platformLabel, 25),
      texts.searchingProgress(platformLabel, 50),
      texts.searchingProgress(platformLabel, 75),
      `⏳ آماده‌سازی نتایج از ${platformLabel}… 90%`
    ];
    const progressUpdater = (async () => {
      for (const stage of progressStages) {
        if (stopProgress) {
          break;
        }
        await sleep(5000);
        if (stopProgress) {
          break;
        }
        try {
          await ctx.telegram.editMessageText(
            progressChatId,
            progressMessageId,
            undefined,
            stage
          );
        } catch {
          // ignore edit failures
        }
      }
    })();

    const categoryKey = normalizeCategoryKey(state.category);
    const query = state.category ?? 'instagram';
    const finalKeyword =
      state.language === 'fa'
        ? keywordMapFA[categoryKey] ?? categoryKey
        : keywordMapEN[categoryKey] ?? categoryKey;
    console.log('🔵 [BOT] Platform:', platform);
    console.log('🔵 [BOT] Category:', state.category);
    console.log('🔵 [BOT] Query (raw):', query);
    console.log('🔵 [BOT] Final keyword:', finalKeyword);
    console.log('🔵 [BOT] Language:', state.language);
    console.log('🔵 [BOT] minViews:', state.minViews ?? minViews);

    let results: ViralPost[] = [];
    if (platform === 'tiktok') {
      results = await searchTikTokPosts({
        category: finalKeyword,
        language: state.language ?? DEFAULT_LANGUAGE,
        minViews
      });
    } else if (platform === 'youtube') {
      results = await searchYouTubePosts({
        category: finalKeyword,
        language: state.language ?? DEFAULT_LANGUAGE,
        minViews,
        videoType: 'video' // Default to regular videos for now
      });
    } else {
      // Default to Instagram
      results = await searchInstagramPosts({
        category: finalKeyword,
        language: state.language ?? DEFAULT_LANGUAGE,
        minViews
      });
    }

    stopProgress = true;
    await progressUpdater.catch(() => {});
    try {
      await ctx.telegram.editMessageText(
        progressChatId,
        progressMessageId,
        undefined,
        texts.resultsReady(platformLabel)
      );
    } catch {
      // ignore
    }

    const filtered = results.filter((post) => post.views >= minViews);

    // Track the search request
    const searchRequest = trackSearchRequest({
      userId: chatId,
      platform,
      category: state.category || 'unknown',
      language: state.language ?? DEFAULT_LANGUAGE,
      minViews,
      resultsCount: filtered.length,
      status: filtered.length > 0 ? 'success' : 'no_results'
    });
    
    // Broadcast log to SSE clients
    broadcastLog({
      id: searchRequest.id,
      userId: chatId,
      platform,
      category: state.category?.replace(/^(cat_|sub_)/i, '').replace(/_/g, ' ') || 'unknown',
      language: state.language === 'fa' ? 'Persian' : 'English',
      minViews,
      resultsCount: filtered.length,
      timestamp: searchRequest.timestamp.toISOString(),
      status: searchRequest.status
    });

    if (filtered.length === 0) {
      await ctx.reply(texts.noPosts);
      return;
    }

    const totalResults = filtered.length;
    recordUserResults(chatId, filtered);
    const initialSent = Math.min(BATCH_SIZE, totalResults);
    upsertUserState(chatId, {
      offset: initialSent,
      batchSize: BATCH_SIZE,
      total: totalResults,
      sent: initialSent
    });

    const firstBatch = filtered.slice(0, initialSent);
    for (const [idx, post] of firstBatch.entries()) {
      const number = idx + 1;
      await ctx.replyWithHTML(formatPostMessage(post, number, enNum));
    }
    
    if (initialSent < totalResults) {
      const promptText = `${enNum(initialSent)} از ${enNum(
        totalResults
      )} ویدیو وایرال از ${platformLabel} ارسال شد. ادامه بدم؟`;
      await ctx.reply(promptText, continueKeyboard);
    } else {
      await ctx.reply('تمام شد! ✔️');
    }
  });

  bot.action('next_batch', async (ctx) => {
    console.log('🟣 [BOT] Callback data:', resolveCallbackData(ctx));
    const chatId = ctx.chat?.id;
    if (!chatId) {
      return;
    }

    await clearInlineKeyboard(ctx);
    await ctx.answerCbQuery();

    const state = getUserState(chatId);
    const results = state?.lastResults ?? [];
    const offset = state?.offset ?? 0;
    const batchSize = state?.batchSize ?? BATCH_SIZE;
    const total = state?.total ?? results.length;
    const alreadySent = state?.sent ?? offset;

    if (offset >= results.length) {
      await ctx.reply('تمام شد! ✔️');
      return;
    }

    const nextBatch = results.slice(offset, offset + batchSize);
    const startIndex = offset + 1;
    for (const [idx, post] of nextBatch.entries()) {
      await ctx.replyWithHTML(formatPostMessage(post, startIndex + idx, enNum));
    }

    const newOffset = offset + nextBatch.length;
    const newSent = alreadySent + nextBatch.length;
    upsertUserState(chatId, {offset: newOffset, sent: newSent});

    const platform = state?.platform ?? 'instagram';
    const platformLabel = getPlatformLabel(platform);
    
    if (newOffset < results.length) {
      const promptText = `${enNum(newSent)} از ${enNum(
        total
      )} ویدیو وایرال از ${platformLabel} ارسال شد. ادامه بدم؟`;
      await ctx.reply(promptText, continueKeyboard);
    } else {
      await ctx.reply('تمام شد! ✔️');
    }
  });

  bot.action('stop', async (ctx) => {
    console.log('🟣 [BOT] Callback data:', resolveCallbackData(ctx));
    await clearInlineKeyboard(ctx);
    await ctx.answerCbQuery();
    const firstName = ctx.from?.first_name ?? '';
    await ctx.reply(
      `${firstName}، امیدوارم چندتا ایدهٔ خوب گرفته باشی.\nهر وقت خواستی دوباره سراغ وایرال‌ها بری، من آماده‌ام. ⚡️`
    );
  });

  return bot;
};
