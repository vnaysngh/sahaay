import { TelegramApi, TelegramApiError } from "./api";
import type { FollowupNotifier } from "../../core/followup-worker";
export function telegramFollowupNotifier(api: TelegramApi): FollowupNotifier {
  return async (chatId, text) => {
    try {
      const result = await api.send(chatId, text);
      if (!Number.isSafeInteger(result.message_id))
        return { status: "unknown" };
      return { status: "delivered", messageId: result.message_id };
    } catch (error) {
      if (error instanceof TelegramApiError) {
        if (error.uncertain) return { status: "unknown" };
        if (error.code === 429)
          return { status: "retry", after: error.retryAfter };
        return { status: "failed" };
      }
      return { status: "unknown" };
    }
  };
}
