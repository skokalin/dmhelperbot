import { Telegraf, Context, Markup } from "telegraf";
import { db } from "../config/db";
import {
  createHoursKeyboard,
  createMinutesKeyboard,
  createChatsKeyboard,
  createRemindersKeyboard,
} from "../keyboards/inline";

export function initActions(
  bot: Telegraf<Context>,
  userSessions: Record<number, any>,
) {
  bot.action(/^date:(.+)$/, async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId || !ctx.match) return;
    const selectedDate = ctx.match[1];

    if (userSessions[userId]) userSessions[userId].selectedDate = selectedDate;
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      `Выбрана дата: ${selectedDate}\n\nШаг 2/5: Выбери час (МСК):`,
      createHoursKeyboard(),
    );
  });

  bot.action(/^hour:(.+)$/, async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId || !ctx.match) return;
    const hour = ctx.match[1];

    await ctx.answerCbQuery();
    await ctx.editMessageText(
      `Выбран час: ${hour}:00\n\nШаг 2/5: Уточни минуты:`,
      createMinutesKeyboard(hour),
    );
  });

  bot.action(/^time:(.+):(.+)$/, async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId || !ctx.match) return;
    const hour = ctx.match[1];
    const minute = ctx.match[2];

    if (userSessions[userId]) {
      userSessions[userId].selectedTime = `${hour}:${minute}`;
      userSessions[userId].step = "awaiting_chats";
    }
    await ctx.answerCbQuery();

    const [chats]: [any[], any] = await db.execute(
      "SELECT chat_id, chat_title FROM chats",
    );
    await ctx.editMessageText(
      `Время зафиксировано: ${hour}:${minute} (МСК)\n\nШаг 3/5: Выберите чаты для дублирования напоминания:`,
      createChatsKeyboard(chats, userSessions[userId].selectedChats || []),
    );
  });

  bot.action(/^toggle_chat:(.+)$/, async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId || !ctx.match) return;
    const chatId = Number(ctx.match[1]);
    const session = userSessions[userId];

    if (session && session.selectedChats) {
      session.selectedChats = session.selectedChats.includes(chatId)
        ? session.selectedChats.filter((id: number) => id !== chatId)
        : [...session.selectedChats, chatId];

      await ctx.answerCbQuery();
      const [chats]: [any[], any] = await db.execute(
        "SELECT chat_id, chat_title FROM chats",
      );
      await ctx.editMessageReplyMarkup(
        createChatsKeyboard(chats, session.selectedChats).reply_markup,
      );
    }
  });

  bot.action("confirm_chats", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    if (userSessions[userId]) userSessions[userId].step = "awaiting_reminders";
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      `Шаг 4/5: Выберите конфигурацию напоминаний:`,
      createRemindersKeyboard(userSessions[userId].selectedReminders || []),
    );
  });

  bot.action(/^toggle_reminder:(.+)$/, async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId || !ctx.match) return;
    const reminderId = ctx.match[1];
    const session = userSessions[userId];

    if (session && session.selectedReminders) {
      session.selectedReminders = session.selectedReminders.includes(reminderId)
        ? session.selectedReminders.filter((id: string) => id !== reminderId)
        : [...session.selectedReminders, reminderId];

      await ctx.answerCbQuery();
      await ctx.editMessageReplyMarkup(
        createRemindersKeyboard(session.selectedReminders).reply_markup,
      );
    }
  });

  bot.action("confirm_reminders", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    if (userSessions[userId]) userSessions[userId].step = "awaiting_title";
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      `Настройки зафиксированы.\n\nШаг 5/5: Отправьте название события обычным текстовым сообщением.`,
    );
  });

  bot.action(/^delete:(.+)$/, async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId || !ctx.match) return;
    const eventId = ctx.match[1];

    try {
      const [result]: any = await db.execute(
        "DELETE FROM events WHERE id = ? AND user_id = ?",
        [eventId, userId],
      );
      await ctx.answerCbQuery("Событие удалено!");
      if (result.affectedRows > 0) await ctx.deleteMessage();
    } catch (error) {
      await ctx.answerCbQuery("Ошибка");
    }
  });

  bot.action("ignore", async (ctx) => await ctx.answerCbQuery());
}
