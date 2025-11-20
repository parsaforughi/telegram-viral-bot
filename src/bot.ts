import type {Context} from 'telegraf';
import {Markup, Telegraf} from 'telegraf';
import {searchInstagramPosts} from './instagram.js';
import {
  categoryKeyboard,
  cleanserSubmenu,
  creamSubmenu,
  languageKeyboard,
  formatPostMessage,
  texts,
  viewKeyboard
} from './messages.js';
import {getUserState, recordUserResults, upsertUserState} from './state.js';
import type {ViralPost} from './types.js';

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

const keywordMap: Record<string, string> = {
  cat_condom: 'کاندوم',
  cat_cream: 'کرم',
  sub_cream_hand: 'کرم دست',
  sub_cream_foot: 'کرم پا',
  sub_cream_body: 'کرم بدن',
  cat_cleanser: 'پاک کننده آرایشی',
  sub_cleanser_wetwipe: 'دستمال مرطوب',
  sub_cleanser_micellar: 'میسلار',
  sub_cleanser_facewash: 'فیس واش',
  cat_serum: 'سرم صورت',
  cat_toothpaste: 'خمیر دندان',
  cat_cosmetic: 'لوازم آرایشی',
  cat_handbalm: 'بالم دست'
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

  bot.start(async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) {
      return;
    }

    upsertUserState(chatId, {});
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

    const state = upsertUserState(chatId, {minViews});
    await ctx.answerCbQuery();

    if (!state.category) {
      await ctx.reply(texts.askCategory, categoryKeyboard());
      return;
    }

    const progressMessage = await ctx.reply('⏳ در حال جستجو… 0%');
    const progressChatId = progressMessage.chat?.id ?? chatId;
    const progressMessageId = progressMessage.message_id;
    let stopProgress = false;
    const progressStages = [
      '⏳ در حال جستجو… 10%',
      '⏳ در حال جستجو… 25%',
      '⏳ در حال جستجو… 50%',
      '⏳ در حال جستجو… 75%',
      '⏳ آماده‌سازی نتایج… 90%'
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

    const query = state.category ?? 'instagram';
    const finalKeyword = keywordMap[state.category ?? ''] ?? query;
    console.log('🔵 [BOT] Category:', state.category);
    console.log('🔵 [BOT] Query (raw):', query);
    console.log('🔵 [BOT] Final keyword:', finalKeyword);
    console.log('🔵 [BOT] Language:', state.language);
    console.log('🔵 [BOT] minViews:', state.minViews ?? minViews);

    const results = await searchInstagramPosts({
      category: finalKeyword,
      language: state.language ?? DEFAULT_LANGUAGE,
      minViews
    });

    stopProgress = true;
    await progressUpdater.catch(() => {});
    try {
      await ctx.telegram.editMessageText(
        progressChatId,
        progressMessageId,
        undefined,
        '✔ نتایج آماده شد!'
      );
    } catch {
      // ignore
    }

    const filtered = results.filter((post) => post.views >= minViews);

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
      const promptText = `📦 تا الان ${enNum(initialSent)} تا از ${enNum(
        totalResults
      )} پست رو برات فرستادم.\nادامه بدم؟ 🔎`;
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

    if (newOffset < results.length) {
      const promptText = `📦 تا الان ${enNum(newSent)} تا از ${enNum(
        total
      )} پست رو برات فرستادم.\nادامه بدم؟ 🔎`;
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
