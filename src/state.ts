import {UserState, ViralPost} from './types.js';

const userStateStore = new Map<number, UserState>();

export const getUserState = (chatId: number): UserState | undefined => {
  return userStateStore.get(chatId);
};

export const upsertUserState = (
  chatId: number,
  patch: Partial<UserState>
): UserState => {
  const existing = userStateStore.get(chatId) ?? {chatId};
  const updated: UserState = { ...existing, ...patch, chatId };
  userStateStore.set(chatId, updated);
  return updated;
};

export const recordUserResults = (
  chatId: number,
  results: ViralPost[]
): UserState => {
  return upsertUserState(chatId, { lastResults: results });
};
