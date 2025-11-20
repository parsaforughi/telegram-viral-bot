const userStateStore = new Map();
export const getUserState = (chatId) => {
    return userStateStore.get(chatId);
};
export const upsertUserState = (chatId, patch) => {
    const existing = userStateStore.get(chatId) ?? { chatId };
    const updated = { ...existing, ...patch, chatId };
    userStateStore.set(chatId, updated);
    return updated;
};
export const recordUserResults = (chatId, results) => {
    return upsertUserState(chatId, { lastResults: results });
};
