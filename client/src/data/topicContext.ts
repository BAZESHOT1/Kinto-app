/**
 * Текущий текстовый топик группы для отправки: экран чата выбирает топик, sendMessage кладёт его id в header
 * сообщения (topicId). Сообщения без topicId относятся к «Общему» (его лента показывает всё).
 */
const sendTopic = new Map<string, string | null>();

export function setSendTopic(chatId: string, topicId: string | null): void {
  if (topicId) sendTopic.set(chatId, topicId);
  else sendTopic.delete(chatId);
}

export function getSendTopic(chatId: string): string | null {
  return sendTopic.get(chatId) ?? null;
}
