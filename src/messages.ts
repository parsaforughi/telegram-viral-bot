import {Markup} from 'telegraf';
import type {ViralPost} from './types.js';

const categories = [
  'condom',
  'cream',
  'handbalm',
  'cosmetic',
  'serum',
  'toothpaste',
  'cleanser'
] as const;

type CategoryKey = typeof categories[number];

type LanguageCode = 'en' | 'fa';

const categoryLabels: Record<CategoryKey, string> = {
  condom: '🔥 کاندوم',
  cream: '🧴 کرم',
  handbalm: '👐 بالم دست',
  cosmetic: '💄 آرایشی',
  serum: '🧪 سرم صورت',
  toothpaste: '🦷 خمیر دندان',
  cleanser: '🧼 پاک‌کننده'
};

export const categoryKeyboard = () => {
  const buttons = [
    [
      Markup.button.callback(categoryLabels.condom, 'cat_condom'),
      Markup.button.callback(categoryLabels.cream, 'cat_cream')
    ],
    [
      Markup.button.callback(categoryLabels.handbalm, 'cat_handbalm'),
      Markup.button.callback(categoryLabels.cosmetic, 'cat_cosmetic')
    ],
    [
      Markup.button.callback(categoryLabels.serum, 'cat_serum'),
      Markup.button.callback(categoryLabels.toothpaste, 'cat_toothpaste')
    ],
    [Markup.button.callback(categoryLabels.cleanser, 'cat_cleanser')],
    [Markup.button.callback('✏️ دسته‌بندی دلخواه', 'custom_category')]
  ];
  return Markup.inlineKeyboard(buttons);
};

export const platformKeyboard = () => {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('📸 اینستاگرام', 'platform_instagram'),
      Markup.button.callback('🎵 تیک‌تاک', 'platform_tiktok')
    ],
    [Markup.button.callback('▶️ یوتیوب (Shorts)', 'platform_youtube')]
  ]);
};

export const languageKeyboard = () => {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🇮🇷 فارسی', 'lang_fa'),
      Markup.button.callback('🇬🇧 انگلیسی', 'lang_en')
    ]
  ]);
};

export const creamSubmenu = Markup.inlineKeyboard([
  [
    Markup.button.callback('🌼 کرم دست', 'sub_cream_hand'),
    Markup.button.callback('🦶 کرم پا', 'sub_cream_foot')
  ],
  [Markup.button.callback('🧴 لوسیون بدن', 'sub_cream_body')]
]);

export const cleanserSubmenu = Markup.inlineKeyboard([
  [
    Markup.button.callback('🧻 دستمال مرطوب', 'sub_cleanser_wetwipe'),
    Markup.button.callback('💧 میسلار واتر', 'sub_cleanser_micellar')
  ],
  [Markup.button.callback('🧼 فیس واش', 'sub_cleanser_facewash')]
]);

export const youtubeVideoTypeMenu = Markup.inlineKeyboard([
  [
    Markup.button.callback('▶️ ویدیو', 'youtube_video'),
    Markup.button.callback('📱 شورتز', 'youtube_shorts')
  ]
]);

type ViewKeyboardPayload = {
  reply_markup: {
    inline_keyboard: {text: string; callback_data: string}[][];
  };
};

export const viewKeyboard: ViewKeyboardPayload = {
  reply_markup: {
    inline_keyboard: [
      [
        {text: '🔵 +100K', callback_data: 'view_100k'},
        {text: '🟣 +300K', callback_data: 'view_300k'}
      ],
      [
        {text: '🟠 +500K', callback_data: 'view_500k'},
        {text: '🔴 +1M', callback_data: 'view_1m'}
      ],
      [{text: '⚫️ +5M', callback_data: 'view_5m'}]
    ]
  }
};

export const moreResultsKeyboard = () => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('بله ✅', 'more_yes')],
    [Markup.button.callback('نه ❌', 'more_no')]
  ]);
};

const escapeHtml = (text: string): string => {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

export function formatPostMessage(
  post: ViralPost,
  index: number,
  enNum: (x: number) => string
): string {
  return [
    `🔥 پست وایرال شماره ${index}`,
    '',
    `<a href="${post.url}">🔗 Open Post</a>`,
    '────────────────────',
    '',
    `👁 Views: ${enNum(post.views)}`,
    `❤️ Likes: ${enNum(post.likes)}`,
    `💬 Comments: ${enNum(post.comments ?? 0)}`,
    '',
    '────────────────────',
    '📝 <b>Caption:</b>',
    escapeHtml(post.caption)
  ].join('\n');
}

export const getPlatformLabel = (platform?: 'instagram' | 'tiktok' | 'youtube'): string => {
  switch (platform) {
    case 'instagram':
      return 'اینستاگرام';
    case 'tiktok':
      return 'تیک‌تاک';
    case 'youtube':
      return 'یوتیوب';
    default:
      return 'اینستاگرام';
  }
};

export const getPlatformEmoji = (platform?: 'instagram' | 'tiktok' | 'youtube'): string => {
  switch (platform) {
    case 'instagram':
      return '📸';
    case 'tiktok':
      return '🎵';
    case 'youtube':
      return '▶️';
    default:
      return '📸';
  }
};

export const texts = {
  askPlatform: '🎯 لطفاً پلتفرم مورد نظر را انتخاب کن',
  askCategory: '🌸 لطفاً دسته‌بندی مورد نظر را انتخاب کن',
  askCustomCategory: '✏️ لطفاً دسته‌بندی دلخواه خود را تایپ کن:',
  askLanguage: '🎯 زبان دلخواهت رو انتخاب کن',
  chooseCream: '🌿 لطفاً نوع کرم مورد نظر را انتخاب کن',
  chooseCleanser: '✨ کدام پاک‌کننده را مدنظر داری؟',
  askYoutubeType: '📹 نوع محتوای یوتیوب رو انتخاب کن',
  askMinViews: '👀 حداقل تعداد بازدید رو انتخاب کن',
  noPosts: 'هیچ ویدیوی وایرالی با این شرایط پیدا نشد. یه کلمه یا بازدید حداقلی دیگه امتحان کن ✨',
  noMorePosts: '✅ فعلاً پست جدیدی برای نمایش وجود ندارد.',
  closing: '🙏 ممنون که از ربات جستجوی ناب استفاده کردی.',
  showMorePrompt: '🔎 مایل هستی پست‌های بیشتر ببینی؟',
  batchNotice: '⬆️ دو پست ارسال شد، ادامه می‌دیم...',
  progressLabel: (percent: number) => `⏳ در حال آماده‌سازی نتایج... ${percent}%`,
  platformComingSoon: '🚧 این پلتفرم به‌زودی فعال می‌شود.',
  searchingProgress: (platform: string, percent: number) => `⏳ در حال جستجو در ${platform}… ${percent}%`,
  resultsReady: (platform: string) => `✔ نتایج وایرال از ${platform} آماده شد!`,
  paginationPrompt: (sent: number, total: number, platform: string, itemType: string = 'ویدیو') => 
    `${sent} از ${total} ${itemType} وایرال از ${platform} ارسال شد. ادامه بدم؟`
};
