import 'dotenv/config';
import {buildBot} from './bot.js';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('TELEGRAM_BOT_TOKEN is required in the environment.');
  process.exit(1);
}

const bot = buildBot(token);
bot.launch()
  .then(() => console.log('Telegram bot is running.'))
  .catch((error: unknown) => {
    if (error instanceof Error) {
      console.error('Bot failed to start', error);
    } else {
      console.error('Bot failed to start', String(error));
    }
    process.exit(1);
  });

['SIGINT', 'SIGTERM'].forEach((signal) => {
  process.once(signal, () => bot.stop(signal));
});

import './server.js';
